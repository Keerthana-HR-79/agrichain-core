# AgriChain — Core Build (trimmed)

This folder (`agrichain-core`) is a **copy** of the full AgriChain project with three
feature areas removed, kept for a focused résumé/interview version. The **original is
untouched** at `D:\claude\agrichain` and remains the live-deployed project.

## What was removed
- **AI / ML yield prediction** — the entire `ai-service/` Python service, plus
  `predictionController` / `modelMonitorController` / `aiService` and their routes, the
  `ModelMonitor` page, and the `/predict/dynamic` call inside `listingController`
  (listings now save with no model estimate).
- **Chatbot / RAG + negotiator** — `ragController` + `agentController` and routes, the
  `Chatbot` page, and the `CropHealthAdvisor` component (it called the AI agent).
- **Offline / PWA** — Dexie `db.js`, `offlineQueue`, `offlineApi`, `useOnlineStatus`,
  `SyncStatusBar`, `InstallPrompt`, the `manifest.json`, and the `vite-plugin-pwa` setup.
  Marketplace and the stage-update page now call the API directly (online-only).

## What was kept (the core)
Auth (JWT + email-OTP + 2FA) · role dashboards (farmer / buyer / admin) · crop listings ·
GPS crop-stage verification (EXIF + distance-to-farm + Leaflet map) · contracts ·
milestone escrow (SERIALIZABLE accept, idempotent releases, ledger) · live-mandi
settlement · notifications · reviews · watchlist · analytics · admin + disputes · PDF.

## How to run locally
Backend:
```bash
cd backend
npm install
node server.js
```
Frontend (in a second terminal):
```bash
cd frontend
npm install
npm run dev
```
Both read their existing `.env` files (already present in this copy).

## Caveats / notes
- **Shared database:** this copy's `.env` points at the **same Supabase DB** as the
  original. Listings created before the trim may still have old `predicted_yield` values
  in the DB, but the UI no longer displays them (`yield.js` shows only the farmer's own
  expected yield).
- **`render.yaml`** still describes the old 3-service deploy (including the AI service).
  Adjust it before deploying this trimmed build separately.
- The `AGRICHAIN_*.md` study docs copied into this folder describe the **full** project
  (including the removed features) — they're reference notes, not a description of this
  build.
- The DB schema still defines a few now-unused tables (`chatbot_messages`,
  `rag_documents`, `negotiation_log`, `prediction_log`) — harmless, just inert.
- **Verified working:** frontend `npm run build` passes (975 modules, 0 errors);
  backend boots, connects to Postgres, mounts all routes, and starts crons.

## Local email & market prices
- **Email** now auto-selects a transport (`services/emailService.js`): **SendGrid**
  when `SENDGRID_API_KEY` is set (used on Render, which blocks SMTP), otherwise **Gmail
  SMTP** via `nodemailer` using `EMAIL_USER` + `EMAIL_PASS` (a Gmail App Password) for
  local dev. To turn on OTP email locally, set **one** of:
  - `EMAIL_PASS` = a *valid* Gmail App Password for `EMAIL_USER` — needs 2-Step
    Verification ON; create at https://myaccount.google.com/apppasswords. The password
    currently in `.env` is rejected by Google (`535-5.7.8`), so it must be refreshed.
  - `SENDGRID_API_KEY` = your SendGrid key (the same value as on Render).

  Then restart the backend — boot prints `✅ Email ready …`.
- **Market prices:** `DATA_GOV_API_KEY` is set and the code is correct, but
  `api.data.gov.in` is **unreachable from this machine** (connection times out). Live
  prices work from the Render deploy; this is a local network-reachability limit, not a
  bug. **Resilience fix applied (2026-10-05):** `marketScraper.scrapeAndUpdatePrices` no
  longer overwrites a good government price with a simulated one — on a failed fetch it
  carries forward the last genuine `data_gov` price (≤30 days, labelled
  `data_gov_cached`), and only simulates when no real price exists. Takes effect on the
  next scrape (boot / 6 AM cron / admin Refresh). NOTE: this fix is in `agrichain-core`
  only — the live Render deploy still runs the original code.
