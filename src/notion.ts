import { buildJobSignals, companyFromDomain, getEmailDomain, isPersonalEmailDomain } from "./domain";
import type { Collaborator, LookupResponse, UserReferences } from "./types";

const NOTION_LOAD_PAGE_CHUNK_URL = "https://www.notion.so/api/v3/loadPageChunk";
const NOTION_SYNC_RECORD_VALUES_URL = "https://www.notion.so/api/v3/syncRecordValuesMain";
const COMPACT_UUID_PATTERN = /^[0-9a-f]{32}$/i;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JSON_WALK_NODE_LIMIT = 50_000;
const NOTION_FETCH_TIMEOUT_MS = 8_000;
const USER_BATCH_SIZE = 100;

export class LookupError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "LookupError";
    this.status = status;
    this.code = code;
  }
}

export function extractPageId(input: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return null;
  }

  if (!isNotionHost(parsed.hostname)) {
    return null;
  }

  const searchable = `${parsed.pathname}${parsed.search}`;
  const dashedMatches = [
    ...searchable.matchAll(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g)
  ];
  const dashedPageId = dashedMatches.at(-1)?.[0];
  if (dashedPageId) {
    return normalizeUuid(dashedPageId);
  }

  const compactMatches = [...searchable.matchAll(/(?:^|[^0-9a-fA-F])([0-9a-fA-F]{32})(?=$|[^0-9a-fA-F])/g)];
  const compactPageId = compactMatches.at(-1)?.[1];
  return compactPageId ? normalizeUuid(compactPageId) : null;
}

export async function lookupPage(rawUrl: string, fetcher: typeof fetch = fetch): Promise<LookupResponse> {
  const pageId = extractPageId(rawUrl);
  if (!pageId) {
    throw new LookupError(400, "invalid_url", "That doesn't look like a Notion link.");
  }

  const pageChunk = await postNotionJson(
    fetcher,
    NOTION_LOAD_PAGE_CHUNK_URL,
    {
      pageId,
      limit: 100,
      cursor: { stack: [] },
      chunkNumber: 0,
      verticalColumns: false
    },
    pageId
  );

  const { userIds, rolesByUserId } = extractUserReferences(pageChunk);
  if (userIds.size === 0) {
    throw new LookupError(404, "no_collaborators", "No collaborator data found for this page.");
  }

  const userRecords = await fetchUserRecords([...userIds], fetcher, pageId);
  const collaborators = parseProfiles(userRecords, rolesByUserId);

  if (collaborators.length === 0) {
    throw new LookupError(404, "no_collaborators", "No collaborator data found for this page.");
  }

  return {
    pageId,
    collaborators,
    cached: false,
    timestamp: new Date().toISOString()
  };
}

export function extractUserReferences(input: unknown): UserReferences {
  const userIds = new Set<string>();
  const rolesByUserId = new Map<string, string>();

  const recordMapUsers = getNestedRecord(input, ["recordMap", "notion_user"]);
  if (recordMapUsers && typeof recordMapUsers === "object") {
    for (const id of Object.keys(recordMapUsers)) {
      const userId = normalizeUuid(id);
      if (userId) {
        userIds.add(userId);
      }
    }
  }

  walkJson(input, (value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return;
    }

    const record = value as Record<string, unknown>;
    if (record.type !== "user_permission" || typeof record.user_id !== "string") {
      return;
    }

    const userId = normalizeUuid(record.user_id);
    if (!userId) {
      return;
    }

    userIds.add(userId);
    if (typeof record.role === "string") {
      setBestRole(rolesByUserId, userId, record.role);
    }
  });

  return { userIds, rolesByUserId };
}

export function parseProfiles(response: unknown, rolesByUserId: Map<string, string> = new Map()): Collaborator[] {
  const notionUsers = getNestedRecord(response, ["recordMap", "notion_user"]);
  if (!notionUsers || typeof notionUsers !== "object") {
    return [];
  }

  return Object.entries(notionUsers)
    .map(([id, record]) => parseProfile(id, record, rolesByUserId))
    .filter((profile): profile is Collaborator => Boolean(profile))
    .sort(compareCollaborators);
}

async function fetchUserRecords(userIds: string[], fetcher: typeof fetch, pageId: string): Promise<unknown> {
  const chunks: Record<string, unknown> = {};

  for (let index = 0; index < userIds.length; index += USER_BATCH_SIZE) {
    const batch = userIds.slice(index, index + USER_BATCH_SIZE);
    const response = await postNotionJson(
      fetcher,
      NOTION_SYNC_RECORD_VALUES_URL,
      {
        requests: batch.map((id) => ({
          pointer: { table: "notion_user", id },
          version: -1
        }))
      },
      pageId
    );

    const notionUsers = getNestedRecord(response, ["recordMap", "notion_user"]);
    if (notionUsers && typeof notionUsers === "object") {
      Object.assign(chunks, notionUsers);
    }
  }

  return { recordMap: { notion_user: chunks } };
}

async function postNotionJson(
  fetcher: typeof fetch,
  url: string,
  body: unknown,
  pageId: string
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(url, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(NOTION_FETCH_TIMEOUT_MS)
    });
  } catch {
    throw new LookupError(502, "notion_unavailable", "Notion did not respond. Try again in a minute.");
  }

  if (response.status === 429) {
    throw new LookupError(429, "rate_limited", "Too many requests. Try again in a minute.");
  }

  if (!response.ok) {
    throw new LookupError(404, "private_or_missing", "This page is private or doesn't exist.");
  }

  const payload = await response.json().catch(() => null);
  if (!payload || hasNotionError(payload)) {
    throw new LookupError(404, "private_or_missing", "This page is private or doesn't exist.");
  }

  const pageIdEcho = getNestedValue(payload, ["recordMap", "block", pageId, "value", "id"]);
  if (url === NOTION_LOAD_PAGE_CHUNK_URL && typeof pageIdEcho === "string" && !normalizeUuid(pageIdEcho)) {
    throw new LookupError(404, "private_or_missing", "This page is private or doesn't exist.");
  }

  return payload;
}

function parseProfile(id: string, record: unknown, rolesByUserId: Map<string, string>): Collaborator | null {
  const userId = normalizeUuid(id);
  if (!userId) {
    return null;
  }

  if (!record || typeof record !== "object") {
    return null;
  }

  const outerValue = (record as Record<string, unknown>).value;
  if (!outerValue || typeof outerValue !== "object") {
    return null;
  }

  const profile = (outerValue as Record<string, unknown>).value;
  if (!profile || typeof profile !== "object") {
    return null;
  }

  const profileRecord = profile as Record<string, unknown>;
  const roleFromRecord = (outerValue as Record<string, unknown>).role;
  const role = rolesByUserId.get(userId) ?? (typeof roleFromRecord === "string" ? roleFromRecord : "reader");
  const name = typeof profileRecord.name === "string" ? profileRecord.name : null;
  const email = typeof profileRecord.email === "string" ? profileRecord.email : null;
  const profilePhoto = typeof profileRecord.profile_photo === "string" ? profileRecord.profile_photo : null;
  const emailDomain = getEmailDomain(email);
  const companyDomain = emailDomain && !isPersonalEmailDomain(emailDomain) ? emailDomain : null;
  const company = companyFromDomain(companyDomain);

  return {
    id: userId,
    name,
    email,
    profilePhoto,
    role,
    company,
    companyDomain,
    isWorkEmail: Boolean(companyDomain),
    jobSignals: buildJobSignals({ name, email, role, company, companyDomain })
  };
}

function compareCollaborators(left: Collaborator, right: Collaborator): number {
  const priorityScore = { high: 0, medium: 1, low: 2 };
  const priorityDelta =
    priorityScore[left.jobSignals.contactPriority] - priorityScore[right.jobSignals.contactPriority];

  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  return (left.name ?? left.email ?? left.id).localeCompare(right.name ?? right.email ?? right.id);
}

function isNotionHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "notion.so" || host.endsWith(".notion.so") || host === "notion.site" || host.endsWith(".notion.site");
}

function formatUuid(compact: string): string {
  const normalized = compact.toLowerCase();
  return [
    normalized.slice(0, 8),
    normalized.slice(8, 12),
    normalized.slice(12, 16),
    normalized.slice(16, 20),
    normalized.slice(20, 32)
  ].join("-");
}

function normalizeUuid(value: string): string | null {
  if (UUID_PATTERN.test(value)) {
    return formatUuid(value.replace(/-/g, ""));
  }

  if (COMPACT_UUID_PATTERN.test(value)) {
    return formatUuid(value);
  }

  return null;
}

function setBestRole(rolesByUserId: Map<string, string>, userId: string, role: string): void {
  const currentRole = rolesByUserId.get(userId);
  if (!currentRole || roleRank(role) > roleRank(currentRole)) {
    rolesByUserId.set(userId, role);
  }
}

function roleRank(role: string): number {
  switch (role.toLowerCase()) {
    case "owner":
      return 5;
    case "editor":
      return 4;
    case "commenter":
      return 3;
    case "reader":
      return 2;
    default:
      return 1;
  }
}

function getNestedRecord(input: unknown, path: string[]): Record<string, unknown> | null {
  const value = getNestedValue(input, path);
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function getNestedValue(input: unknown, path: string[]): unknown {
  let cursor = input;
  for (const segment of path) {
    if (!cursor || typeof cursor !== "object") {
      return null;
    }

    cursor = (cursor as Record<string, unknown>)[segment];
  }

  return cursor;
}

function walkJson(input: unknown, visitor: (value: unknown) => void): void {
  const stack = [input];
  const seen = new WeakSet<object>();
  let visitedNodes = 0;

  while (stack.length > 0 && visitedNodes < JSON_WALK_NODE_LIMIT) {
    const value = stack.pop();
    visitedNodes += 1;
    visitor(value);

    if (!value || typeof value !== "object") {
      continue;
    }

    if (seen.has(value)) {
      continue;
    }
    seen.add(value);

    const children = Array.isArray(value) ? value : Object.values(value);
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push(children[index]);
    }
  }
}

function hasNotionError(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") {
    return true;
  }

  const record = payload as Record<string, unknown>;
  return Boolean(record.errorId || record.error || record.name === "ValidationError");
}
