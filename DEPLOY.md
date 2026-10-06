# AgriChain (Core Build) — Deployment Guide

This build deploys as **two services** on top of one managed backend:

| Piece | Host | Role |
|---|---|---|
| Frontend (React + Vite) | **Vercel** | static single-page app |
| Backend (Node + Express) | **Render** | REST API |
| Database + Storage | **Supabase** | Postgres (20 tables) + image buckets |

> **No AI service in this build.** The Python `ai-service/` (yield prediction), the
> chatbot/RAG + negotiator, and the offline/PWA layer were removed. So `render.yaml`
> defines **only the backend** — there is no second (Python) service to deploy.

---

## 0. Prerequisites
- A GitHub account (to host this repo)
- Free accounts: **Supabase**, **Render**, **Vercel**
- Git installed

---

## 1. Create the database + image storage (Supabase)
1. Create a **new** Supabase project (region **ap-south-1 / Mumbai** for low India latency).
2. Open the **SQL Editor** and run these three files from `backend/` **in this order**:
   - `schema.sql` → 19 base tables + seed crops + the admin account (`admin@agrichain.com` / `Admin@123`)
   - `market_schema.sql` → adds `market_scrape_log` + market-price columns (→ 20 tables)
   - `escrow_schema.sql` → the escrow milestone upgrade
3. **Storage** → create **two public buckets**: `listings` and `stages`. (Without these, image uploads fail.)
4. **Project Settings → Database → Connection pooling → Session** → copy the connection details for `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`/`DB_NAME`.
   ⚠️ Use **Session** mode, **not** Transaction mode (port 6543) — escrow relies on advisory locks + SERIALIZABLE transactions that need a stable session.
5. **Project Settings → API** → copy `SUPABASE_URL` and the **`service_role`** key.

---

## 2. Push this repo to GitHub
From the project root (`agrichain-core`):
```bash
git init
git add .
git commit -m "AgriChain core build"
git branch -M main
git remote add origin https://github.com/<your-user>/<your-repo>.git
git push -u origin main
```
`.gitignore` already excludes every `.env` — no secrets are committed.

---

## 3. Deploy the backend (Render)
1. **New → Blueprint** → connect the repo → Render reads `render.yaml`.
   *(Or **New → Web Service**: Root Directory `backend`, Build `npm install`, Start `node server.js`.)*
2. Fill the `sync: false` env vars in the dashboard:
   - `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` — from the Supabase **session** pooler
   - `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`
   - `FRONTEND_URL` — leave blank for now (set in step 5)
   - `EMAIL_USER` (e.g. `hrkeer79@gmail.com`) + `SENDGRID_API_KEY`
   - `DATA_GOV_API_KEY` — free key from data.gov.in
   - `JWT_SECRET` is generated automatically by Render
3. Deploy → copy the backend URL (e.g. `https://agrichain-core-backend.onrender.com`).
4. Verify: open `<backend-url>/` → it should return **`AgriChain Backend ✅`**.

---

## 4. Deploy the frontend (Vercel)
1. **Add New → Project** → import the repo.
2. Root Directory: **`frontend`**. Vercel auto-detects **Vite** (build `npm run build`, output `dist`).
3. Environment variable: `VITE_API_URL` = your **Render backend URL** — origin only, no `/api`, no trailing slash.
4. Deploy → copy the Vercel URL.

---

## 5. Wire CORS
- Render → the backend service → **Environment** → set `FRONTEND_URL` = your **Vercel URL** → **redeploy**.

---

## 6. Verify end-to-end
- Open the Vercel URL → log in as `admin@agrichain.com` / `Admin@123`.
- Sign up a farmer (needs OTP email configured) → create a listing with an image (tests Supabase Storage).
- Check the **Market Prices** page loads.

---

## Notes / troubleshooting
- **Cold starts:** free Render sleeps when idle → the first request can take ~30–50s.
- **Images fail:** the `listings` and `stages` buckets must exist and be **public**.
- **Escrow errors / locks hanging:** make sure the DB uses the **session-mode** pooler.
- **No OTP email:** `SENDGRID_API_KEY` must be set with a verified single sender (`EMAIL_USER`).
- **data.gov.in flaky:** live prices fall back to the last real price (`data_gov_cached`), then to a labelled simulated rate — expected behaviour.
