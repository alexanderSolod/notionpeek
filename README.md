# NotionPeek Backend

Cloudflare Worker API and React frontend for looking up collaborator profiles behind public Notion pages.

## Frontend

The usable website is a Vite React app under `src/ui/`. It is built into `dist/` and served by the Worker through the Cloudflare Assets binding. The frontend calls the backend through same-origin `POST /api/lookup`.

The bottom "Add this functionality to your agent" section downloads `/notion_peek.md`. During `npm run frontend:build`, `scripts/sync-skills-file.mjs` copies a root `notion_peek.md` into `public/notion_peek.md` when present.

Run the combined frontend and Worker locally:

```bash
npm run dev -- --port 8787
```

For frontend-only development, start the Worker separately and run:

```bash
npm run frontend:dev
```

The Vite dev server proxies `/api` to `http://127.0.0.1:8787`.

## Endpoints

### `POST /api/lookup`

```json
{
  "url": "https://www.notion.so/workspace/Page-Title-04f306fbf59a413fae15f42e2a1ab029"
}
```

Response:

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

`GET /api/lookup?url=...` is also available for local debugging.

## Error Responses

```json
{
  "error": {
    "code": "invalid_url",
    "message": "That doesn't look like a Notion link."
  }
}
```

Main codes:

- `invalid_url`
- `missing_url`
- `private_or_missing`
- `no_collaborators`
- `rate_limited`
- `forbidden`

## Job Targeting Fields

The backend adds lightweight, free enrichment:

- `company` and `companyDomain` from work email domains.
- `isWorkEmail` to separate company contacts from personal addresses.
- `jobSignals.contactPriority`, sorted high to low.
- Ready-to-use `linkedinQuery` and `hiringQuery` strings for optional frontend enrichment.

No web search or paid enrichment is performed in v1.

## Cloudflare Setup

Run locally:

```bash
npm install
npm run dev
```

Optional KV bindings:

```bash
wrangler kv namespace create CACHE
wrangler kv namespace create RATE_LIMIT
```

Then add the generated IDs to `wrangler.toml`.

Environment variables:

- `ALLOWED_ORIGINS`: comma-separated frontend origins, for example `https://notionpeek.example.com,http://localhost:3000`.
- `ALLOW_LOCAL_ORIGINS`: set to `true` only if the deployed API should accept browser requests from localhost origins. Local `wrangler dev` requests allow localhost automatically.
- `REQUIRE_APP_REFERER`: defaults to referer/origin protection. Set to `false` only for private testing.

Deploy:

```bash
npm run deploy
```

`npm run deploy` runs TypeScript checks and a Vite production build before publishing.

## Limits

- Cache TTL: 1 hour when `CACHE` is bound.
- Rate limit: 10 lookups per minute and 50 per hour per IP when `RATE_LIMIT` or `CACHE` is bound.
- Requests without a valid app `Origin` or `Referer` are rejected unless `REQUIRE_APP_REFERER=false`.
- Lookup request bodies are capped at 4 KB.
