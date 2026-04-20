import type { ContactPriority, JobSignals } from "./types";

const KNOWN_COMPANIES: Record<string, string> = {
  "adobe.com": "Adobe",
  "airbnb.com": "Airbnb",
  "amazon.com": "Amazon",
  "anthropic.com": "Anthropic",
  "apple.com": "Apple",
  "asana.com": "Asana",
  "atlassian.com": "Atlassian",
  "canva.com": "Canva",
  "datadoghq.com": "Datadog",
  "doordash.com": "DoorDash",
  "dropbox.com": "Dropbox",
  "figma.com": "Figma",
  "github.com": "GitHub",
  "google.com": "Google",
  "hubspot.com": "HubSpot",
  "linear.app": "Linear",
  "linkedin.com": "LinkedIn",
  "makenotion.com": "Notion",
  "meta.com": "Meta",
  "microsoft.com": "Microsoft",
  "netflix.com": "Netflix",
  "openai.com": "OpenAI",
  "palantir.com": "Palantir",
  "replit.com": "Replit",
  "salesforce.com": "Salesforce",
  "shopify.com": "Shopify",
  "slack.com": "Slack",
  "stripe.com": "Stripe",
  "uber.com": "Uber",
  "vercel.com": "Vercel",
  "ycombinator.com": "Y Combinator",
  "zapier.com": "Zapier"
};

const PERSONAL_EMAIL_DOMAINS = new Set([
  "aol.com",
  "fastmail.com",
  "gmail.com",
  "hey.com",
  "hotmail.com",
  "icloud.com",
  "live.com",
  "me.com",
  "msn.com",
  "outlook.com",
  "pm.me",
  "proton.me",
  "protonmail.com",
  "yahoo.com"
]);

const MULTI_PART_TLDS = new Set([
  "co.uk",
  "com.au",
  "com.br",
  "com.mx",
  "com.sg",
  "co.jp",
  "co.nz",
  "co.in",
  "com.tr"
]);

const MAX_EMAIL_LENGTH = 320;
const MAX_SEARCH_TERM_LENGTH = 120;

export function getEmailDomain(email: string | null | undefined): string | null {
  if (!email) {
    return null;
  }

  const trimmedEmail = email.trim();
  if (!trimmedEmail || trimmedEmail.length > MAX_EMAIL_LENGTH || /[\x00-\x1F\x7F]/.test(trimmedEmail)) {
    return null;
  }

  const atIndex = trimmedEmail.lastIndexOf("@");
  if (atIndex <= 0 || atIndex === trimmedEmail.length - 1) {
    return null;
  }

  return normalizeDomain(trimmedEmail.slice(atIndex + 1));
}

export function isPersonalEmailDomain(domain: string | null): boolean {
  const normalizedDomain = domain ? normalizeDomain(domain) : null;
  return normalizedDomain ? PERSONAL_EMAIL_DOMAINS.has(normalizedDomain) : false;
}

export function companyFromDomain(domain: string | null): string | null {
  const normalizedDomain = domain ? normalizeDomain(domain) : null;
  if (!normalizedDomain || isPersonalEmailDomain(normalizedDomain)) {
    return null;
  }

  const known = KNOWN_COMPANIES[normalizedDomain];
  if (known) {
    return known;
  }

  const parts = normalizedDomain.split(".").filter(Boolean);
  if (parts.length < 2) {
    return titleCase(parts[0] ?? "");
  }

  const lastTwo = parts.slice(-2).join(".");
  const base = MULTI_PART_TLDS.has(lastTwo) && parts.length >= 3 ? parts.at(-3) : parts.at(-2);
  return base ? titleCase(base.replace(/[-_]+/g, " ")) : null;
}

export function buildJobSignals(params: {
  name: string | null;
  email: string | null;
  role: string;
  company: string | null;
  companyDomain: string | null;
}): JobSignals {
  const isWorkEmail = Boolean(params.companyDomain);
  const role = params.role.toLowerCase();

  const contactPriority: ContactPriority = !isWorkEmail
    ? "low"
    : role === "owner" || role === "editor"
      ? "high"
      : "medium";

  const reason = getPriorityReason(contactPriority, params.role, params.company);
  const quotedName = params.name ? quoteSearch(params.name) : null;
  const quotedCompany = params.company ? quoteSearch(params.company) : null;
  const hasNameAndCompany = Boolean(quotedName && quotedCompany);

  return {
    contactPriority,
    reason,
    linkedinQuery: hasNameAndCompany ? `${quotedName} ${quotedCompany} site:linkedin.com/in/` : null,
    hiringQuery: hasNameAndCompany
      ? `${quotedName} ${quotedCompany} (hiring OR recruiter OR "engineering manager" OR "talent")`
      : null
  };
}

function getPriorityReason(priority: ContactPriority, role: string, company: string | null): string {
  if (priority === "high") {
    return `Work email at ${company}; page role is ${role}.`;
  }

  if (priority === "medium") {
    return `Work email at ${company}; likely connected to the page or workspace.`;
  }

  return "No company email domain was found, so job-targeting confidence is low.";
}

function normalizeDomain(value: string): string | null {
  const domain = value.trim().toLowerCase().replace(/\.$/, "");
  if (domain.length < 3 || domain.length > 253 || domain.includes("..")) {
    return null;
  }

  const labels = domain.split(".");
  if (labels.length < 2) {
    return null;
  }

  const isValid = labels.every((label) => {
    if (label.length < 1 || label.length > 63) {
      return false;
    }

    return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label);
  });

  return isValid ? domain : null;
}

function quoteSearch(value: string): string | null {
  const sanitized = value
    .replace(/["\x00-\x1F\x7F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_SEARCH_TERM_LENGTH);

  return sanitized ? `"${sanitized}"` : null;
}

function titleCase(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}
