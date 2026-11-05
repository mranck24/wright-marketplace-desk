# Wright Marketplace Desk 3.0 — Free hosting edition

This is the vehicle listing dashboard with a **free Render web service + Supabase cloud database** deployment option. Its features include vehicle organization, photo selection, CSV imports, on-demand dealership website import attempts, Facebook listing preparation, manual posted tracking, and JSON backup/import. Facebook posting is **not automatic**.

## Getting your website online for $0/month (within free-tier limits)

1. **Make a backup:** In your previous dashboard, use **Data & Backups → Export**. Keep this file private.
2. **Create a free Supabase project** at https://supabase.com/dashboard. Inside its SQL Editor, paste and run `supabase-setup.sql` from this folder.
3. In Supabase **Project Settings → API / API Keys**, copy the **Project URL** and the secret **service_role** key (sometimes shown under legacy keys). Do **not** share the key, paste it into source code, or place it in a public repository.
4. Upload the project to a **private GitHub repository**, keeping `data/`, `.env`, and backups out of Git. One approach: create an empty private repository on GitHub, then in the extracted folder use `git init`, `git add .`, `git commit -m "Initial dashboard"`, `git branch -M main`, `git remote add origin <repository URL>`, `git push -u origin main`.
5. Sign in at https://dashboard.render.com/. Choose **New → Blueprint** and connect that GitHub repository. Render will use the included `render.yaml` to create a **Free** web service.
6. Render prompts for these environment variables: `APP_PASSWORD` (create a unique password **at least 16 characters**); `SUPABASE_URL` (your Supabase Project URL); `SUPABASE_SERVICE_ROLE_KEY` (your Supabase secret role key). Keep all three private. `NODE_ENV=production` and `HOST=0.0.0.0` are already configured.
7. Deploy. Render supplies a public `https://...onrender.com` address. Open it on Mac, iPhone, or iPad. The browser requests a username and password: **any username** works, but enter the `APP_PASSWORD` you chose.
8. Use the new dashboard's legacy backup import to restore your existing data. Export JSON backups regularly: Supabase Free has no automatic project backups.

## Free-tier limitations

- Render's free server **sleeps after 15 minutes idle**, and the next visitor may wait about a minute for startup. Usage and bandwidth limits apply.
- Free Render servers have **ephemeral disks**: never use local file storage for hosted data. This edition writes dashboard records directly to Supabase instead.
- Supabase Free currently includes a **500 MB Postgres database**, and projects can be **paused after a week of inactivity**. Free database automatic backups are not included.
- This uses shared Basic Authentication for a **single user**. It is a hobby/small personal admin-tool deployment, not an audited production platform. Improve authentication and access controls before storing sensitive customer data or sharing the app with other employees.
- Dealership website import is best-effort. Blocked/dynamic inventory pages may require CSV fallback. No reliable automatic sync is implemented.

## Local development

Install Node.js 20+. Run `npm start` and visit `http://localhost:3000`. Without Supabase environment variables, local development uses `data/state.json`. For cloud storage locally, set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` environment variables. **Never push service keys to Git.**

## Files

- `server.js`: Node HTTP server, cloud-state backend and import parser.
- `public/`: dashboard frontend.
- `render.yaml`: free hosting service configuration.
- `supabase-setup.sql`: database table and restricted browser-access settings.

MIT license. No required third-party npm dependencies.
