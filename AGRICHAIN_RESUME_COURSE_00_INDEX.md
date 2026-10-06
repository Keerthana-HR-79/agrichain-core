# AgriChain — Complete Project Deep-Dive Course (Index)

> **This is the hub.** It teaches the **complete AgriChain project** from basics — not just the résumé slice — but it **weights importance by your résumé**, because that's what you must defend first. Content is split into two groups.

---

## The legend (used in every part)

- 🟢 **ON RESUME** — the exact claim in your bullet. **Memorise and defend word-for-word.** Highest priority.
- 🔵 **LEARN DEEP** — the concept *underneath* a résumé word, taught from basics. Core project; understand it well so you survive "how?"/"why?" follow-ups.
- 🟡 **SET ASIDE** — a real part of the full project that is **not on your résumé** (ML, chatbot/RAG, offline/PWA). Know the gist so you're never caught out — but study it *after* Groups 🟢/🔵.
- ⚠️ **HONEST LIMIT** — a real weakness. Volunteer these calmly; it reads as senior.

**Priority order for your time:** 🟢 → 🔵 → ⚠️ → 🟡.

---

## Your résumé entry (what Group A defends)

**AgriChain – Full-Stack Agricultural Marketplace Platform  |  JavaScript, React, Node.js, Express, PostgreSQL**
- Developed and deployed a full-stack agricultural marketplace with REST APIs, JWT authentication, and email-OTP signup, supporting crop listings.
- Built role-based dashboards for farmers and buyers with contract management and GPS-based crop-stage verification — reading the photo's location from EXIF with an OCR fallback, validating distance to the registered farm, and plotting it on an interactive map.
- Built a milestone-based escrow system for staged contract payments, with final settlement linked to live mandi prices from the government's Agmarknet (data.gov.in) API.

---

## GROUP A — The core project (résumé-weighted) · learn this deeply

| Part | File | Covers | Defends |
|---|---|---|---|
| **0** | this file | Legend, groups, study plan, mental model | all |
| **1** | `..._01_FOUNDATIONS` | The problem · "full-stack" from basics · architecture · the stack (JS/React/Node/Express/PostgreSQL) and *why each* | header + "full-stack" |
| **2** | `..._02_REST_API_LAYER` | HTTP · REST · JSON · APIs from basics · AgriChain routes, axios, middleware chain | "REST APIs" |
| **3** | `..._03_AUTH_JWT_OTP` | Hashing/bcrypt · JWT structure & signing · email-OTP · 2FA — from basics | "JWT authentication", "email-OTP signup" |
| **4** | `..._04_LISTINGS_AND_RBAC` | Crop listings + image upload · RBAC from basics · farmer/buyer dashboards | "crop listings", "role-based dashboards" |
| **5** | `..._05_CONTRACT_MANAGEMENT` | Forward contracts · lifecycle offer→accept→settle→dispute | "contract management" |
| **6** | `..._06_GPS_VERIFICATION` | GPS · EXIF · OCR · Haversine formula · Leaflet maps — from basics | the whole GPS clause |
| **7** | `..._07_MILESTONE_ESCROW` | Escrow from basics · money math · concurrency/ACID/locks/idempotency/ledger | "milestone-based escrow", "staged payments" |
| **8** | `..._08_MARKET_SETTLEMENT` | Mandi/Agmarknet · data.gov.in API · 4-tier fallback · cron | "settlement linked to Agmarknet" |
| **9** | `..._09_DEPLOYMENT` | Hosting from basics · Vercel/Render/Supabase · CORS, env vars, cold starts | "deployed" |
| **10** | `..._10_QA_PROBLEMS_GLOSSARY` | Master Q&A bank · problems faced & solved · "what I'd improve" · glossary · numbers cheat-sheet | all |

## GROUP B — Topics set aside (NOT on résumé) · know the gist

| Part | File | Covers | Why it's Group B |
|---|---|---|---|
| **B1** | `..._B1_ML_YIELD_PREDICTION` | The XGBoost yield-prediction service (FastAPI, ~643 features, R²/MAPE read honestly, log-transform+expm1, empirical confidence band, graceful degradation) | Not on your résumé; a separate Python service |
| **B2** | `..._B2_AI_CHATBOT_RAG` | AgriBot chatbot + **RAG** (honestly keyword-retrieval, *not* embeddings) on Groq's LLM · the **agentic tool-calling negotiator** · crop-health advisor with rule-based fallback | Not on your résumé; optional AI add-on |
| **B3** | `..._B3_OFFLINE_PWA` | PWA (manifest/service worker/Workbox) · offline write-queue (Dexie/IndexedDB) + optimistic UI · sync-on-reconnect replay · install prompt | Not on your résumé; resilience add-on |
| **B4** | `..._B4_EXTRAS_AND_QA` | Notifications · reviews & ratings · watchlist · admin panel + dispute resolution · **model-monitoring / drift detection** · analytics dashboards · PDF contracts · **consolidated Group-B Q&A + how to talk about Group B without over-claiming** | Supporting/extra features |

> **Why two groups:** everything can't go on a résumé, and interviewers may still ask "what else does it do?" Group A is what you *sell and defend*; Group B is what lets you say *"yes, it also does X"* confidently without over-claiming. If asked about a Group B topic you can always say: *"I kept that out of my résumé to stay focused, but yes — here's how it works…"*

---

## How to study (realistic plan)

**Pass 1 — understand Group A (read 1→10 in order).** Just *get* each concept; for every 🔵 make sure you could explain the idea in one sentence.
**Pass 2 — lock the 🟢 lines.** Re-read every green box; say the claim + one backing detail.
**Pass 3 — drill Part 10 Q&A** out loud. Do escrow (7) and GPS (6) twice — that's where they dig.
**Pass 4 — skim Group B** (B1–B4) so you can speak to the gist of ML / chatbot / offline / extras if asked, and read **B4.10** on how to talk about Group B without over-claiming.

**Night before:** Part 10 (Q&A + cheat-sheet). **Morning of:** the numbers cheat-sheet.

---

## The one mental model (holds the whole project together)

> A buyer and a farmer don't trust each other, so the **platform holds the money**. Cash is **locked in escrow** when the deal is accepted, **released in stages** as the farmer **proves real progress with location-tagged photos**, and the **final price is the live government market rate** at harvest.

Résumé pieces map onto that sentence: *listings/dashboards/contracts* = making the deal · *JWT/OTP/roles* = who may do what · *GPS verification* = proving progress · *escrow + Agmarknet* = moving money safely and fairly. Group B (ML yield estimate, chatbot, offline) are *enhancements* around that spine.

---

### Start here: Part 1 — Foundations (the problem, "full-stack," the stack). Group A runs 1→10; Group B is B1→B4.
