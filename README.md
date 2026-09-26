# Govt. Shaheed Suhrawardy College IT Club — Member Registration

A full-stack member registration system: a mobile-first registration form for
students, and a password-protected admin panel to review, search, edit,
export, and manage submissions — all running on **Cloudflare Pages +
Functions + D1**, on a single origin, with no external backend.

## What's included

- **Public registration form** (`/`) — a 6-step mobile-friendly wizard
  collecting personal, academic, contact/guardian, and additional info, plus
  a profile photo and an ID card / birth certificate photo. Photos are
  resized and compressed in the browser before upload.
- **Admin panel** (`/admin.html`) — password-protected, with:
  - Dashboard stats (total members, new this week, department count, top
    interest)
  - A department breakdown chart
  - Search, department filter, and sorting
  - View, edit, and delete individual members
  - CSV export of all data
- **Backend** — Cloudflare Pages Functions under `/api/*`, same origin as the
  frontend, backed by a Cloudflare D1 (SQLite) database. No separate server,
  no third-party backend host.

## Tech stack

| Layer     | Choice                                             |
|-----------|-----------------------------------------------------|
| Frontend  | Vanilla HTML/CSS/JS (no framework, fast & simple)   |
| Backend   | Cloudflare Pages Functions (`/functions` directory) |
| Database  | Cloudflare D1 (SQLite)                              |
| Auth      | Signed HMAC session cookie (no external auth service) |
| Hosting   | Cloudflare Pages                                    |

## Project structure

```
├── public/                    Static frontend (served as-is)
│   ├── index.html              Registration form
│   ├── admin.html               Admin panel
│   ├── css/
│   │   ├── style.css            Shared design tokens & components
│   │   ├── form.css              Registration form styles
│   │   └── admin.css              Admin panel styles
│   └── js/
│       ├── form.js               Registration form logic
│       └── admin.js                Admin panel logic
├── functions/                 Cloudflare Pages Functions (the "backend")
│   ├── api/
│   │   ├── register.js          POST — public registration
│   │   └── admin/
│   │       ├── login.js           POST — admin login
│   │       ├── logout.js          POST — admin logout
│   │       ├── check.js           GET  — session check
│   │       ├── stats.js           GET  — dashboard stats
│   │       ├── export.js          GET  — CSV export
│   │       └── members/
│   │           ├── index.js       GET  — list/search/filter/sort
│   │           └── [id].js        GET/PUT/DELETE — single member
│   └── _utils/
│       └── auth.js               Shared session/auth helpers
├── schema.sql                 D1 database schema
├── wrangler.toml               Cloudflare configuration
└── package.json
```

## 1. Prerequisites

- A [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier is enough)
- [Node.js](https://nodejs.org/) 18+ installed
- The Wrangler CLI (installed automatically via `npx`, or `npm i -g wrangler`)

## 2. Install dependencies

```bash
cd gssc-it-club
npm install
npx wrangler login
```

This opens a browser window to authenticate Wrangler with your Cloudflare account.

## 3. Create the D1 database

```bash
npx wrangler d1 create gssc_it_club_db
```

This prints something like:

```
[[d1_databases]]
binding = "DB"
database_name = "gssc_it_club_db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

Copy the `database_id` value into `wrangler.toml`, replacing
`REPLACE_WITH_YOUR_DATABASE_ID`.

## 4. Initialize the database schema

```bash
# Creates the table in your remote (production) database
npx wrangler d1 execute gssc_it_club_db --remote --file=./schema.sql

# Also set up a local copy for `wrangler pages dev`
npx wrangler d1 execute gssc_it_club_db --local --file=./schema.sql
```

## 5. Set your admin secrets

Two secrets protect the admin panel:

- `ADMIN_PASSWORD` — the password you'll use to log in to `/admin.html`
- `SESSION_SECRET` — a random string used to sign login sessions (not a
  password you type in; just needs to be long and random)

Generate a random secret:

```bash
openssl rand -hex 32
```

Then set both secrets:

```bash
npx wrangler pages secret put ADMIN_PASSWORD
npx wrangler pages secret put SESSION_SECRET
```

Wrangler will prompt you to paste the value for each. **Do not commit these
to git or hardcode them anywhere** — they only live in Cloudflare's
encrypted secret storage.

## 6. Run it locally

```bash
npm run dev
```

This starts `wrangler pages dev`, serving the site with the D1 binding and
your functions, at `http://localhost:8788` by default. Note: local secrets
aren't picked up automatically by `wrangler pages dev` — pass them with a
`.dev.vars` file for local testing:

```
# .dev.vars (do not commit this file)
ADMIN_PASSWORD=your-local-test-password
SESSION_SECRET=any-long-random-string-for-local-testing
```

## 7. Deploy

### Option A — Deploy directly with Wrangler (simplest)

```bash
npm run deploy
```

This uploads `public/` and `functions/` straight to Cloudflare Pages, using
the D1 binding and secrets you've already configured.

### Option B — Connect a GitHub repo (auto-deploy on push)

1. Push this project to a GitHub repository.
2. In the Cloudflare dashboard: **Workers & Pages → Create → Pages → Connect
   to Git**, and select your repo.
3. Build settings:
   - Build command: *(leave empty)*
   - Build output directory: `public`
4. After the first deploy, go to your Pages project → **Settings →
   Functions → D1 database bindings**, and add a binding named `DB` pointing
   to `gssc_it_club_db`.
5. Go to **Settings → Environment variables**, and add `ADMIN_PASSWORD` and
   `SESSION_SECRET` as **encrypted** variables (for both Production and
   Preview environments, if you use previews).
6. Redeploy (push a commit, or hit "Retry deployment") so the new bindings
   and variables take effect.

Either way, your site will be live at `https://<project-name>.pages.dev`,
and you can attach a custom domain in the Pages dashboard.

## Using the admin panel

Go to `https://your-site.pages.dev/admin.html`, and log in with the
`ADMIN_PASSWORD` you set. From there you can:

- See live stats and a department breakdown chart
- Search by name, student ID, email, or phone
- Filter by department, and sort by name/date/department
- Click the eye icon to view full details (including both photos)
- Click the pencil icon to edit any field
- Click the trash icon to remove a registration
- Click **Export CSV** to download all data as a spreadsheet (photos are
  excluded from the CSV since they're large binary data — view them
  individually in the admin panel instead)

The admin session lasts 24 hours, then you'll need to log in again.

## Security notes

- The admin API routes all check a signed, expiring session cookie
  server-side — the password check happens in the Function, never in the
  browser, so it can't be bypassed by editing client-side JavaScript.
- The session cookie is `HttpOnly`, `Secure`, and `SameSite=Strict`.
- The registration form includes a hidden honeypot field to deter basic
  spam bots.
- Photos are stored as compressed base64 images directly in D1 — simple and
  needs no extra setup, but keep an eye on total registrations if you expect
  many thousands of members with photos (D1's free tier includes 5 GB of
  storage, which comfortably fits several thousand compressed photos).

## Customizing

- **Colors & fonts**: edit the CSS variables at the top of
  `public/css/style.css` (`--color-primary`, `--color-accent`, etc.) and the
  Google Fonts import at the top of the same file.
- **Form fields**: add/remove fields in `public/index.html`, mirror the
  change in `public/js/form.js` (`collectData()`), `functions/api/register.js`,
  and `schema.sql` (you'll need to re-run the schema against your database,
  or issue an `ALTER TABLE` migration if you already have data).
- **Departments list**: edit the `<select id="department">` options in
  `public/index.html`.
- **Club name / branding**: search for "Govt. Shaheed Suhrawardy College" in
  `public/index.html` and `public/admin.html` and update as needed.

## Troubleshooting

- **"Admin login isn't configured yet"** — you haven't set `ADMIN_PASSWORD`
  and `SESSION_SECRET` as secrets/environment variables yet (step 5, or the
  dashboard steps in Option B).
- **Registrations aren't saving** — check that the D1 binding name is
  exactly `DB` and that you ran `schema.sql` against the *remote* database
  (`--remote`, not just `--local`).
- **Changes to `wrangler.toml` D1 binding not applying on a Git-connected
  project** — Git-connected Pages projects manage bindings from the
  dashboard (Settings → Functions), not from `wrangler.toml`; set it there
  instead.
