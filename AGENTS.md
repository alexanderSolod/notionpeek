# NotionPeek Agent Handoff

This file is for future coding agents picking up the NotionPeek backend from a fresh session.

## Project Location

The NotionPeek backend lives at:

```text
/Users/asolod/work/fun-projects/open-venta/notionpeek
```

The parent repo may contain unrelated modified files. Do not touch or revert those unless the user explicitly asks. The NotionPeek work is isolated under `notionpeek/`.

## Current State

This is a from-scratch Cloudflare Worker TypeScript backend for the NotionPeek PRD.

Implemented:

- `POST /api/lookup`
- `GET /api/lookup?url=...` for local/debug usage
- `GET /api/health`
- Notion URL page ID extraction
- Calls to Notion internal v3 endpoints:
  - `https://www.notion.so/api/v3/loadPageChunk`
  - `https://www.notion.so/api/v3/syncRecordValuesMain`
- User ID extraction from:
  - `recordMap.notion_user` keys
  - nested `user_permission` objects
- Profile parsing from Notion's double-nested `value.value` shape
- Lightweight job-focused enrichment:
  - company/domain inference from email
  - work email detection
  - contact priority
  - LinkedIn search query string
  - hiring/contact search query string
- Optional Cloudflare KV cache
- Optional KV-backed per-IP rate limiting
- Basic Origin/Referer guard
- Unit tests
- README deployment docs

Not implemented yet:

- Google Programmable Search / LinkedIn enrichment endpoint
- Frontend UI
- Cloudflare production KV namespace IDs
- Custom domain setup

## Files To Know

```text
src/index.ts       Worker request routing, CORS/origin checks, cache, rate limits
src/notion.ts      Notion API calls, page ID extraction, user/profile parsing
src/domain.ts      Email domain parsing and job-focused enrichment
src/types.ts       Shared response types
tests/notion.test.ts
wrangler.toml
README.md
package.json
```

## Commands

Run from `notionpeek/`.

```bash
npm install
npm test
npm run typecheck
npm run deploy -- --dry-run
npm run dev -- --port 8787
```

In the Codex sandbox, Wrangler dev may need escalation because it binds to localhost. If Wrangler tries to write logs outside the writable root, setting `HOME` to the project directory helps:

```bash
HOME=/Users/asolod/work/fun-projects/open-venta/notionpeek npm run dev -- --port 8787
```

## API Shape

Lookup request:

```http
POST /api/lookup
Content-Type: application/json

{
  "url": "https://www.notion.so/workspace/Page-Title-04f306fbf59a413fae15f42e2a1ab029"
}
```

Lookup response:

```json
{
  "pageId": "04f306fb-f59a-413f-ae15-f42e2a1ab029",
  "collaborators": [
    {
      "id": "310af75a-0000-4000-8000-000000000001",
      "name": "Emma Example",
      "email": "emma@makenotion.com",
      "profilePhoto": "https://example.com/emma.png",
      "role": "editor",
      "company": "Notion",
      "companyDomain": "makenotion.com",
      "isWorkEmail": true,
      "jobSignals": {
        "contactPriority": "high",
        "reason": "Work email at Notion; page role is editor.",
        "linkedinQuery": "\"Emma Example\" \"Notion\" site:linkedin.com/in/",
        "hiringQuery": "\"Emma Example\" \"Notion\" (hiring OR recruiter OR \"engineering manager\" OR \"talent\")"
      }
    }
  ],
  "cached": false,
  "timestamp": "2026-04-19T18:00:00.000Z"
}
```

Error response:

```json
{
  "error": {
    "code": "invalid_url",
    "message": "That doesn't look like a Notion link."
  }
}
```

Main error codes:

- `invalid_url`
- `missing_url`
- `private_or_missing`
- `no_collaborators`
- `rate_limited`
- `forbidden`
- `internal_error`

## Important Implementation Notes

Page ID extraction must not strip dashes from the whole slug before matching. Hex letters in the page title can bleed into the ID. Current implementation checks dashed UUIDs first, then dashless 32-hex IDs with non-hex boundaries.

Notion profile data is nested like:

```text
recordMap.notion_user.{id}.value.value
```

The role can appear at:

```text
recordMap.notion_user.{id}.value.role
```

Permission roles can also appear in nested objects shaped like:

```json
{
  "type": "user_permission",
  "user_id": "310af75a-...",
  "role": "editor"
}
```

The backend ranks roles when duplicate user permission objects appear:

```text
owner > editor > commenter > reader > unknown
```

Collaborators are sorted by job contact priority first, then by display name/email/id.

## Cloudflare Deployment

Create KV namespaces:

```bash
npx wrangler kv namespace create CACHE
npx wrangler kv namespace create RATE_LIMIT
```

Add the generated IDs to `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "CACHE"
id = "<cache-kv-namespace-id>"

[[kv_namespaces]]
binding = "RATE_LIMIT"
id = "<rate-limit-kv-namespace-id>"

[vars]
ALLOWED_ORIGINS = "https://your-frontend-domain.com,http://localhost:3000"
REQUIRE_APP_REFERER = "true"
```

Deploy:

```bash
npm run deploy
```

## Local Testing

Start the Worker:

```bash
HOME=/Users/asolod/work/fun-projects/open-venta/notionpeek npm run dev -- --port 8787
```

Health check:

```bash
curl -s http://localhost:8787/api/health
```

Expected:

```json
{"ok":true,"service":"notionpeek"}
```

Invalid URL check:

```bash
curl -s -X POST http://localhost:8787/api/lookup \
  -H 'Content-Type: application/json' \
  -H 'Origin: http://localhost:3000' \
  -d '{"url":"https://example.com/not-notion"}'
```

Expected:

```json
{"error":{"code":"invalid_url","message":"That doesn't look like a Notion link."}}
```

## Origin Guard

By default, the Worker rejects requests that do not come from an allowed app origin or referer.

Localhost is allowed for development. Production frontend domains should be listed in `ALLOWED_ORIGINS`.

For private testing only, set:

```toml
[vars]
REQUIRE_APP_REFERER = "false"
```

Do not leave that disabled for public deployment unless the user explicitly wants an open API.

## Known Verification Results

At handoff, these passed:

```bash
npm test
npm run typecheck
npm run deploy -- --dry-run
```

`wrangler deploy --dry-run` completed bundling and reported a successful dry-run upload. In the Codex sandbox it may also print warnings about being unable to write Wrangler logs outside the sandbox; that is not a code failure.

## Product Direction

The user is designing the frontend separately and asked to focus on a simple API usable for any public Notion link, targeted toward jobs.

Keep the backend API small and frontend-friendly. Avoid adding accounts, analytics, paid enrichment, or browser extension work unless the user asks.

Good next backend steps:

- Add an optional `/api/enrich` endpoint for Google CSE if the user wants LinkedIn role lookup.
- Add integration tests with mocked Notion responses for `lookupPage`.
- Add production KV IDs after the user creates namespaces.
- Add a small `allowedOrigins` deployment note once the frontend domain is known.
