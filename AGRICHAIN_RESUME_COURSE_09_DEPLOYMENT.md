# Part 9 — Deployment (Vercel, Render, Supabase, CORS, env vars, cold starts)

> **Group A.** **Covers:** what "deploying" means · the three hosts and why each · environment variables (build-time vs runtime) · CORS in depth · cold starts · how the pieces find each other in production.
> **Defends:** 🟢 **"deployed"** in bullet 1 — the word that proves this is real, not a localhost demo.

"Deployed and live" is a big differentiator. Be able to explain the whole production topology.

---

## 9.1 🔵 LEARN DEEP — what "deploying" means

**Deploying** = putting your app on computers on the internet so anyone can use it, instead of only `localhost` on your machine. Each layer (frontend, backend, database) is hosted somewhere public, configured to find the others, with secrets supplied as environment variables rather than hardcoded.

---

## 9.2 The production topology (firsthand)

```
   User's browser
        │  HTTPS
        ▼
   ┌─────────────────┐     HTTPS / REST      ┌──────────────────────┐
   │  Vercel         │  ───────────────────▶ │  Render              │
   │  React frontend │  ◀─────────────────── │  Node/Express API    │
   │  (static build) │      JSON             │  (always-on service) │
   └─────────────────┘                       └──────────┬───────────┘
                                                        │ SQL / storage
                                                        ▼
                                             ┌──────────────────────┐
                                             │  Supabase (ap-south-1)│
                                             │  PostgreSQL + Storage │
                                             └──────────────────────┘
```

- **Frontend → Vercel.** React builds to **static files** (HTML/JS/CSS); Vercel serves them on a global CDN. Perfect for a built SPA — fast, cheap, no server needed for the frontend.
- **Backend → Render.** The Node/Express API is a **running server process**; Render hosts long-running web services. This is the only piece that needs an always-on process.
- **Database + file storage → Supabase**, in the **ap-south-1 (Mumbai)** region — close to Indian users for low latency, and it bundles managed **PostgreSQL** + **object Storage** (the crop photos, Part 4).

> **Say it:** *"Frontend's a static React build on Vercel's CDN, the Node API runs as a service on Render, and Postgres plus file storage is Supabase in the Mumbai region. Three hosts, each suited to its layer."*

---

## 9.3 🔵 LEARN DEEP — environment variables (build-time vs runtime)

**Environment variables** keep **config and secrets out of the code** — the same code runs in dev and prod, with values injected per environment. Two kinds, and the distinction is a great interview point:

- **Build-time (frontend):** React/Vite **bakes** `VITE_API_URL` into the static bundle **when it builds**. That's how the deployed frontend knows to call the Render backend URL instead of `localhost`. Because it's baked in at build, changing it needs a **rebuild/redeploy**. ⚠️ Anything in a `VITE_` var ships to the browser — so it's **never** for secrets, only the public API URL.
- **Runtime (backend):** the Node server reads secrets from the environment **when it runs** — `JWT_SECRET`, `DB_PASSWORD`, `SUPABASE_SERVICE_KEY`, `EMAIL_PASS`, `GROQ_API_KEY`, `DATA_GOV_API_KEY`. These live in Render's env settings, **never in git**.

> **Say it:** *"Frontend config like the API URL is a build-time Vite variable baked into the bundle — public by nature. Backend secrets are runtime env vars on Render, never in the repo. Keeping the API URL in an env var is exactly what lets the same code point at localhost in dev and Render in prod."*

🔒 **Security note (carry this discipline):** real secret *values* (DB password, service key, email password, JWT secret, Groq/data.gov keys) are **never** committed, screenshotted, pasted, or put in a résumé/report. Refer to them **by name only**; rotation is a manual action. (The data.gov sample key is the one documented public exception, Part 8.)

---

## 9.4 🔵 LEARN DEEP — CORS (the thing that bites every deploy)

**CORS = Cross-Origin Resource Sharing.** By default, browsers **block** a page on one **origin** (scheme+host+port, e.g. the Vercel URL) from calling an API on a **different** origin (the Render URL) — a security rule called the **same-origin policy**. The *server* must explicitly **opt in** by returning headers that say "this origin is allowed."

**In AgriChain (firsthand):** the Express backend has a **CORS allow-list** of the frontend's origin (the Vercel URL). Requests from that origin are allowed; others are blocked by the browser.

**🔵 Why it matters here:** frontend (Vercel) and backend (Render) are **deliberately different origins**, so CORS *must* be configured or every API call fails in the browser. A classic deploy bug is forgetting to add the production frontend URL to the allow-list.

> **Say it:** *"Frontend and backend are different origins, so I configure CORS on the backend to whitelist the Vercel URL. Without it the browser blocks every call — same-origin policy. It's server-side opt-in, and the common bug is forgetting the production origin."*

---

## 9.5 🔵 LEARN DEEP — cold starts (Render free tier)

On Render's **free tier**, an idle backend is **spun down**; the next request has to **wake it up**, so the **first request after idle is slow** (several seconds). That's a **cold start**.

- **Why it happens:** free hosting reclaims idle resources. After wake-up, it's fast again until it idles.
- **Visible symptom (firsthand):** the first login after the app's been quiet can be slow or appear to hang, then work normally — occasionally read as a "wrong password" flash when it's really the backend waking (plus any genuine 401).
- **Fixes:** a paid always-on tier, or a keep-alive ping; for a portfolio project the free-tier cold start is an accepted trade-off.

> **Say it:** *"On Render's free tier the backend sleeps when idle, so the first request cold-starts and is slow for a few seconds, then it's fine. For production I'd use an always-on tier or a keep-alive ping."*

---

## 9.6 One honorable mention — Python service version pin

The separate ML service (Group B / Part B1) is a **Python** app; its deploy **pins Python to 3.12.1** so the host doesn't pick an incompatible newer runtime that breaks dependencies. (Mentioned here because it's a deployment detail; the ML itself is Group B.)

---

## 9.7 What this part defends (green recap)

- 🟢 *"deployed"* → the whole live topology (9.2), configured with env vars (9.3), CORS (9.4), running on real hosts. You can name the hosts, the region, and the gotchas — that's what "actually deployed it" sounds like.

---

## 9.8 Questions you'll get (with answers)

**Q: Where and how is it deployed?**
> *"React static build on Vercel's CDN, Node/Express API as a service on Render, PostgreSQL and file storage on Supabase in the Mumbai region. The frontend calls the backend over HTTPS; the backend talks to Supabase."*

**Q: How does the deployed frontend know the backend's URL?**
> *"A build-time Vite env var, `VITE_API_URL`, baked into the bundle at build. Change it and you redeploy. That's also how the same code targets localhost in dev and Render in prod."*

**Q: Build-time vs runtime env vars?**
> *"Build-time Vite vars are compiled into the frontend bundle and are public — only for things like the API URL. Runtime vars are read by the Node server when it runs and hold secrets, kept in Render's settings, never in git."*

**Q: What is CORS and how did you handle it?**
> *"Browsers block cross-origin API calls unless the server opts in. My frontend and backend are different origins, so I whitelist the Vercel origin in the backend's CORS config; otherwise every call is blocked."*

**Q: Why is the first request sometimes slow?**
> *"Render's free tier sleeps idle services, so the first request cold-starts for a few seconds while it wakes, then it's fast. An always-on tier or keep-alive ping removes it."*

**Q: Why three different hosts instead of one?**
> *"Each layer has a best-fit host: a CDN for static frontend (Vercel), a long-running process host for the API (Render), and a managed Postgres + storage (Supabase). Separation also lets each scale independently."*

**Q: How do you keep secrets out of the codebase?**
> *"They're runtime environment variables on Render, never committed. Code references them by name; values live only in the host's env settings and are rotated manually if exposed."*

**Q: Why the Mumbai region for the database?**
> *"Latency — the users are in India, so hosting data in ap-south-1 keeps round-trips short."*

---

### ⚠️ HONEST LIMITS for this part
- **Free-tier cold starts** on the backend → always-on tier / keep-alive for production.
- **Single-region, single-instance** → no redundancy; real scale needs multiple instances (and then a shared rate-limiter and session-free design, which the JWT approach already supports).

---

### Next: Part 10 — Master Q&A, problems faced, "what I'd improve," glossary & numbers cheat-sheet.
