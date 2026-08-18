# Repo-driven Ghost blog

Content lives here, in markdown, under version control. Ghost (hosted — Ghost(Pro)
or any managed Ghost host) is the distribution layer: website, newsletter, members.
Two GitHub workflows keep them in sync, one-way, repo → Ghost.

```
content/posts/*.md     your writing (frontmatter + markdown)
content/images/        local images, uploaded to Ghost's CDN on sync
theme/                 "Marginalia" — the custom Ghost theme
scripts/sync.js        markdown → Admin API upsert
scripts/deploy-theme.js  zips + uploads + activates the theme
.github/workflows/     runs both on push to main
```

## Setup (once)

1. **Plan requirement:** the Admin API is not available on Ghost(Pro) Starter.
   You need Publisher or above (or a third-party managed Ghost host, where the
   full API is available on any plan).
2. In Ghost Admin → **Settings → Integrations → Add custom integration**.
   Name it `repo-sync`. Copy the **Admin API Key** and the **API URL**.
3. In the GitHub repo → **Settings → Secrets and variables → Actions**, add:
   - `GHOST_URL` — e.g. `https://yoursite.ghost.io`
   - `GHOST_ADMIN_API_KEY` — the key from step 2
4. Push to `main`. Content changes trigger `sync-content.yml`; theme changes
   trigger `deploy-theme.yml` (which runs gscan validation first).

To run locally instead: `GHOST_URL=... GHOST_ADMIN_API_KEY=... npm run sync`

## How publishing works

- **The repo owns post bodies.** Edits made to synced posts in Ghost Admin will
  be overwritten on the next sync. Ghost Admin remains the system of record for
  members, newsletters, design settings, and analytics.
- Every synced post carries the internal tag `#repo`. The script only ever
  touches posts in that namespace — posts created by hand in Ghost are invisible
  to it.
- **Drafts and review:** open a PR with `status: draft`, merge it, and the post
  is created as a draft in Ghost (grab the preview link from Admin). Flip to
  `status: published` in a follow-up commit to go live.
- **Email:** publishing via the API never sends a newsletter unless the post's
  frontmatter asks for it with `email:`. The send happens only on the
  draft → published transition, and Ghost will never re-send a post that has
  already gone out.
- **Deleting:** removing a markdown file does nothing by default. Run the
  workflow manually with the *prune* input enabled (or `npm run sync:prune`)
  to delete `#repo` posts that no longer exist in the repo.
- **Images:** local paths in markdown and in `feature_image` are uploaded once
  per content-hash and rewritten to Ghost CDN URLs. The upload map is kept in
  `.sync-cache.json`, which the workflow commits back automatically.

## Frontmatter reference

| Key | Type | Notes |
| --- | --- | --- |
| `title` | string | **required** |
| `slug` | string | defaults to the filename; this is the stable key between repo and Ghost — don't change it after publishing |
| `status` | `draft` \| `published` \| `scheduled` | defaults to `draft`; `scheduled` needs a future `published_at` |
| `published_at` | ISO date | optional; backdate or schedule |
| `tags` | string[] | `#repo` is appended automatically |
| `excerpt` | string | becomes Ghost's custom excerpt (used by the theme and meta tags) |
| `visibility` | `public` \| `members` \| `paid` | defaults to `public` |
| `feature_image` | path or URL | local paths are uploaded |
| `feature_image_alt` / `feature_image_caption` | string | optional |
| `meta_title` / `meta_description` / `canonical_url` | string | optional SEO overrides |
| `featured` | bool | Ghost's featured flag |
| `email` | newsletter slug or `true` | send as newsletter on first publish (`true` = `default-newsletter`) |
| `email_segment` | string | e.g. `all`, `status:free`, `status:-free` |

## The theme

`theme/` contains **Marginalia**, a Ghost 5/6 theme. Its signature: all metadata
(dates, tags, reading time) is set as monospace annotations in a true margin
column beside the text. Cool chalk-paper palette with dark mode, Fraunces for
display type, Newsreader for body text, and full support for Koenig cards
including wide/full-width breakouts. The accent color is whatever you set in
Ghost Admin → Design (it flows in via `--ghost-accent-color`), and there's a
theme setting to force light/dark or follow the system.

Validate after editing: `npm run theme:check`. Deploys happen automatically on
push, or manually with `npm run theme:deploy`.

## Later: self-hosting

Nothing here is Ghost(Pro)-specific. Point `GHOST_URL` at any Ghost instance —
including one you self-host later — re-run both workflows, and the entire
publication (content + theme) reconstructs itself. Members export as CSV from
Ghost Admin. The repo is the publication; hosting is a pointer.
