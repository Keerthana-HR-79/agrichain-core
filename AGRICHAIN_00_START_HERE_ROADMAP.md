# 📍 AGRICHAIN — START HERE (Reading Roadmap)

> **What this is.** You have 39 AgriChain docs on disk, written across several sessions. They fall into **4 sets**. Two are the current, complete, authoritative sets — read those. Two are older drafts kept only for archive. This file is the map: **read the files in the numbered order below, top to bottom.**

---

## 🗺️ The big picture — two tracks make the whole story

```
TRACK 1 — THE COURSE  (learn each idea from basics, one concept at a time)
          COURSE_00 → 10  (core)   +   B1 → B4  (AI / offline extras)
                                   │
                                   ▼
TRACK 2 — THE END-TO-END SERIES  (now see it all run as ONE live machine)
          END_TO_END_00 → 06  (overview, lifecycle, every file, DB, journey, AI)
                                   │
                                   ▼
          END_TO_END_07  (the coverage PROOF: every file accounted for)
```

**Read Track 1 first (understand the pieces), then Track 2 (see them work together).**
The course teaches concepts gently from scratch; the end-to-end series is denser and assumes you know the concepts, so it lands much better second.

---

## ✅ THE READING ORDER (just follow 1 → 23)

### Track 1 — The Course (concept by concept, from basics)

**Group A — the core project (defend these deeply):**
1. `AGRICHAIN_RESUME_COURSE_00_INDEX.md` — how the course is organized + how to use it
2. `AGRICHAIN_RESUME_COURSE_01_FOUNDATIONS.md` — what AgriChain is, the real problem, who the actors are
3. `AGRICHAIN_RESUME_COURSE_02_REST_API_LAYER.md` — REST + Express: how an API call is shaped
4. `AGRICHAIN_RESUME_COURSE_03_AUTH_JWT_OTP.md` — signup/login, password hashing, JWT, email OTP, 2FA
5. `AGRICHAIN_RESUME_COURSE_04_LISTINGS_AND_RBAC.md` — crop listings + role-based access (farmer/buyer/admin)
6. `AGRICHAIN_RESUME_COURSE_05_CONTRACT_MANAGEMENT.md` — offers, accept/reject, the contract lifecycle
7. `AGRICHAIN_RESUME_COURSE_06_GPS_VERIFICATION.md` — EXIF + OCR, Haversine distance, the 500 m rule
8. `AGRICHAIN_RESUME_COURSE_07_MILESTONE_ESCROW.md` — locking money, milestones, the ledger, idempotency
9. `AGRICHAIN_RESUME_COURSE_08_MARKET_SETTLEMENT.md` — live mandi prices, settlement, the buffer
10. `AGRICHAIN_RESUME_COURSE_09_DEPLOYMENT.md` — Vercel + Render + Supabase, env vars, cold start
11. `AGRICHAIN_RESUME_COURSE_10_QA_PROBLEMS_GLOSSARY.md` — interview Q&A, problems solved, glossary

**Group B — the AI / offline extras (know the gist, don't over-claim):**
12. `AGRICHAIN_RESUME_COURSE_B1_ML_YIELD_PREDICTION.md` — the XGBoost yield model (honest R²/MAPE)
13. `AGRICHAIN_RESUME_COURSE_B2_AI_CHATBOT_RAG.md` — the chatbot (keyword-RAG) + negotiator
14. `AGRICHAIN_RESUME_COURSE_B3_OFFLINE_PWA.md` — offline queue, IndexedDB, installable PWA
15. `AGRICHAIN_RESUME_COURSE_B4_EXTRAS_AND_QA.md` — remaining extras + more Q&A

### Track 2 — The End-to-End Series (the whole system as one running machine)
16. `AGRICHAIN_END_TO_END_00_OVERVIEW_AND_STACK.md` — the 3 services + every tech choice and *why that one*
17. `AGRICHAIN_END_TO_END_01_REQUEST_RESPONSE_LIFECYCLE.md` — one HTTP round trip through all 9 layers
18. `AGRICHAIN_END_TO_END_02_BACKEND_FILE_BY_FILE.md` — every backend file (server, controllers, services, utils)
19. `AGRICHAIN_END_TO_END_03_FRONTEND_FILE_BY_FILE.md` — every `src/` file (axios, gates, offline, pages)
20. `AGRICHAIN_END_TO_END_04_DATABASE.md` — all 20 tables + the money columns + the escrow ledger
21. `AGRICHAIN_END_TO_END_06_AI_SERVICE_AND_INTEGRATION.md` — the Python ML service + Groq, and where they plug in
22. `AGRICHAIN_END_TO_END_05_COMPLETE_USER_JOURNEY.md` — **capstone:** farmer + buyer walked end to end, tying E1–E6 together
23. `AGRICHAIN_END_TO_END_07_COVERAGE_MAP_AND_GAP_CLOSERS.md` — **read last:** the audit that proves every file is covered + closes the last two gaps (the AI *training* pipeline, and the `Watchlist`/`Notifications` pages)

> **Why 06 before 05 here:** E5 is the *capstone* that weaves in everything **including** the AI (E6), so it reads best **last**. (If you'd rather follow the file numbers and read 05 then 06, that's fine too — E5 cross-references E6 either way.)
>
> **Why E7 is dead last:** it's the *coverage proof*, not new teaching. Once you've read everything, E7 is the checklist that confirms **nothing was missed** — and it writes out the few files the other docs only mentioned in passing. Finish here and you're at 100%.

---

## ⚡ Short on time? The 30-minute express lane
If you just need the shape of the whole thing fast, read these four in order:
1. `AGRICHAIN_END_TO_END_00_OVERVIEW_AND_STACK.md` (the big picture)
2. `AGRICHAIN_RESUME_COURSE_01_FOUNDATIONS.md` (the problem + idea)
3. `AGRICHAIN_END_TO_END_05_COMPLETE_USER_JOURNEY.md` (the whole flow as a story)
4. `AGRICHAIN_RESUME_COURSE_10_QA_PROBLEMS_GLOSSARY.md` (likely interview questions)

---

## 🗄️ Archive — older drafts (you can SKIP these)
These were earlier attempts that the two current sets above **replace**. They're kept only as history. **Don't read them for study** — they predate two corrections baked into the current docs (see note below), so they can contradict.

**Older "MASTER" series (an earlier all-in-one guide):**
- `AGRICHAIN_MASTER_INDEX.md`, `AGRICHAIN_MASTER_PART1_FOUNDATIONS_AND_CONCEPTS.md`, `..._PART2_TECHSTACK_AND_ARCHITECTURE.md`, `..._PART3_BACKEND.md`, `..._PART4_FRONTEND_AND_ML.md`, `..._PART5_ENDTOEND_FLOWS.md`, `..._PART6_DEEPDIVES_AND_PROBLEMS.md`, `..._PART7_INTERVIEW_QA_AND_GLOSSARY.md`

**Earliest single-file notes/variants:**
- `AGRICHAIN_PROJECT_KNOWLEDGE.md`, `AGRICHAIN_MASTER_GUIDE.md`, `AGRICHAIN_COMPLETE_BIBLE.md`, `AGRICHAIN_PROBLEMS_SOLVED.md`, `AGRICHAIN_RESUME.md`, `AGRICHAIN_INTERVIEW_SCRIPT.md`, `AGRICHAIN_RESUME_SCOPED_PREP.md`

> **⚠️ Two facts the current docs get right and some older ones don't:**
> 1. The chatbot route is **`POST /api/chatbot/chat`** (not `/api/rag/chat`).
> 2. A GPS-verified stage sets an **advisory flag only** — the **buyer then manually releases** that milestone's money (it is *not* an automatic release).
> If an older file says otherwise, trust the current Course + End-to-End series.

---

## How to use this map
- Open files **1 → 23** in order. Each current-series file ends by pointing at the next, so you won't lose your place. **File 23 (E7) is the proof you've covered everything** — finish there.
- Track 1 = "understand it." Track 2 = "see it run." Finish Track 1 before starting Track 2.
- The two tracks overlap on purpose (e.g. escrow: Course #8 introduces it, End-to-End #18/#20/#22 show it running) — that repetition is what makes it stick.
