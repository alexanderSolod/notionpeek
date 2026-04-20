# NotionPeek

See who's behind any public Notion page.

Paste a link, get every collaborator's name, email, role, and company. No login, no API key. It's the same data Notion's public page endpoint already returns to your browser — NotionPeek just pulls it out and makes it readable.

- **Live:** [notionpeek.com](https://notionpeek.com)
- **Repo:** [github.com/alexanderSolod/notionpeek](https://github.com/alexanderSolod/notionpeek)

## Why

Public Notion pages (hiring pages, open roadmaps, team wikis, docs) ship a payload that includes the real people attached to them. Most of the time you never see any of it — the page UI only shows what the owner wanted you to see.

Handy when:

- You're job hunting and want the hiring manager's actual name, not a `careers@` inbox.
- You want to know who owns a public doc before you reach out.
- You want a CSV of contacts tied to a specific page or workspace.

## How it works

1. A Cloudflare Worker pulls the page ID out of the URL and hits Notion's own public page endpoint.
2. The response is normalized into a collaborator list with inferred signals: work email vs personal, a priority rank, and pre-built Google search queries for LinkedIn and hiring context.
3. The frontend shows the list, lets you copy emails, export CSV, or one-click into LinkedIn / hiring searches.
4. Private pages return nothing — the public endpoint simply doesn't include collaborator data for them.

Nothing is stored. Cached lookups (when KV is bound) live for an hour and only cache the normalized response, not anything else.

## Agent skill

Hit the "Download skill.md" button on the site to grab a markdown skill file. Drop it into Claude Code, Cursor, or any agent that reads markdown skills, and the agent can run the same lookup itself.

## Local development

```bash
npm install
npm run frontend:dev       # Vite dev server with HMR (http://127.0.0.1:5173)
npm run dev                # Worker + built frontend on a single origin
npm test                   # Vitest suite
npm run typecheck          # tsc --noEmit
```

The Vite dev server proxies `/api` to `http://127.0.0.1:8787`, so you can run `wrangler dev` in one terminal and `npm run frontend:dev` in another for the tightest loop.

## Deploying

```bash
npm run deploy
```

Runs typecheck, Vite build, then `wrangler deploy`. Before the first deploy:

- `wrangler login`
- (Optional) Create KV namespaces for caching and rate-limiting, wire them into `wrangler.toml`:

  ```bash
  wrangler kv namespace create CACHE
  wrangler kv namespace create RATE_LIMIT
  ```

- Set `ALLOWED_ORIGINS` in `wrangler.toml` to the domain you're serving from.

## API

### `POST /api/lookup`

```json
{ "url": "https://www.notion.so/workspace/Page-Title-04f306fb..." }
```

Returns:

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

Error codes: `invalid_url`, `missing_url`, `private_or_missing`, `no_collaborators`, `rate_limited`, `forbidden`.

`GET /api/lookup?url=...` also works and is useful for local debugging.

## Limits

- Cache TTL: 1 hour (when `CACHE` is bound).
- Rate limit: 10 lookups / minute and 50 / hour per IP (when `RATE_LIMIT` or `CACHE` is bound).
- Requests without a valid app `Origin` / `Referer` are rejected unless `REQUIRE_APP_REFERER=false`.
- Request bodies capped at 4 KB.

## Credits

Inspired by [this tweet from @weezerOSINT](https://x.com/weezerOSINT/status/2045849358462222720). Built by [gpt.alex](https://x.com/gpt_alex).
