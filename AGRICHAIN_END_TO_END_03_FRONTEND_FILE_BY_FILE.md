# AgriChain End-to-End — Part E3: The Frontend, File by File

> **What this part is.** Every file in `frontend/src/` — the React SPA that runs in the browser (served by Vercel). Same format as E2: what each file is, how it works, what it connects to, honest limits. E1 showed how a request leaves the frontend; E3 is the reference for the whole client.
>
> **Stack recap (from E0):** React 18.3 + Vite 5, `react-router-dom` v6, axios, Recharts, React-Leaflet, Dexie (IndexedDB), `vite-plugin-pwa`. **Plain hand-written CSS** (no Tailwind runtime — PostCSS only runs autoprefixer).

> ## The one headline — read this first
> **There is no React Context, no Redux, no auth provider.** Auth state lives entirely in **`localStorage`** and is read synchronously via helpers in `src/lib/api.js`. Routes are **not** wrapped in a `ProtectedRoute` — every route in `App.jsx` is public at the router level, and **each page enforces its own auth/role gate inside a `useEffect`** (imperative `navigate("/login")`). That single fact explains the shape of everything below.

> **Layout:**
> ```
> frontend/
>   index.html              ← SPA shell + PWA manifest link
>   src/
>     main.jsx              ← React mount
>     App.jsx               ← the flat route table
>     lib/        api.js (axios spine), db.js, offlineQueue.js, offlineApi.js, useOnlineStatus.js, yield.js
>     components/ Navbar, SyncStatusBar, WatchlistButton, StageMap, InstallPrompt, CropHealthAdvisor, ReviewModal
>     pages/      Home, Login, Signup, ForgotPassword, Marketplace, ListingDetail, CreateListing, dashboards, Escrow, contracts, MarketPrices, Analytics, Chatbot, ModelMonitor, Profile…
>     data/       indiaLocations.js (static state→district)
>   vite.config.js, vercel.json, postcss.config.cjs, package.json
> ```

---

## E3.1 — The boot chain

### `index.html`
Single-page shell: `<div id="root">` + `<script type="module" src="/src/main.jsx">`. Links the hand-shipped PWA `manifest.json` (theme `#16a34a` green), Apple touch icons, title "AgriChain — AI-Powered Crop Marketplace". **Why:** Vite serves this one HTML file; React takes over `#root`; the manifest makes it installable.

### `src/main.jsx`
`ReactDOM.createRoot(#root).render(<React.StrictMode><App/></React.StrictMode>)`. Global CSS imports: `leaflet/dist/leaflet.css` then `./index.css`. **Note:** StrictMode **double-invokes effects in dev** — the many fetch-on-mount `useEffect`s run twice locally (dev-only; harmless, but explains "why did it fetch twice").

### `src/App.jsx`
Declares **all routes**. The only provider is `<BrowserRouter>` — **no context, no layout wrapper, no error boundary, no Suspense/lazy** (the whole app is one eager bundle). All pages imported via the `@/` alias. The route table is **flat and unguarded** (~30 routes: `/`, `/login`, `/signup`, `/marketplace`, `/farmer-dashboard`, `/listing/:id`, `/escrow`, `/admin-dashboard`, …, `*` → inline `NotFound`). Protection is added **per page**, not here.

---

## E3.2 — `src/lib/api.js` — the axios spine (the most load-bearing file)

*(Full behavior in E1.2 — the reference here.)* 48 lines:
- **`baseURL`** = `${VITE_API_URL || "http://localhost:5000"}/api`. **No timeout** ⚠️.
- **Request interceptor** — attaches `Authorization: Bearer <localStorage.token>` to every call.
- **Response interceptor** — on **any 401**: clear `token`+`user`, hard `window.location.href="/login"`, re-reject.
- **Helpers:** `getUser()` (`JSON.parse(localStorage.user)`), `getToken()`, `logout()` (clears both keys, no redirect). Two keys app-wide: **`"token"`** (raw JWT), **`"user"`** (JSON blob `{id,name,role,…}`).

---

## E3.3 — Auth state (localStorage only)

No `src/context/`. The model:
- **Login** (`Login.jsx` `finishLogin`): `setItem("token", res.data.token)` + `setItem("user", JSON.stringify(res.data.user))` → role-route (farmer→`/farmer-dashboard`, buyer→`/buyer-dashboard`, admin→`/admin-dashboard`).
- **Signup** (`Signup.jsx`, after OTP verify): same two `setItem`s.
- **Logout** (`Navbar`): `logout()` → `navigate("/login")`.
- **Read:** each component calls `getUser()` once in a mount `useEffect` into local `useState`; role branching via `user?.role === "farmer"|"buyer"|"admin"`.
- **Rehydrate on refresh:** purely from localStorage — the cached `user` is **never re-validated against the server** on load (the *token* is what the backend actually checks). One deliberate exception: `ProfileEdit.jsx` fetches `/auth/profile` for the real `two_factor_enabled` instead of trusting the cached copy.

---

## E3.4 — Route protection (the per-page gate pattern)

No gate component exists. The repeated idiom in each protected page's first `useEffect`:
```js
const u = getUser();
if (!u || u.role !== "farmer") { navigate("/login"); return; }
setUser(u); fetchData();
```
- **Farmer-only:** FarmerDashboard, FarmerContracts, CreateListing, StageAddUpdate.
- **Buyer-only:** BuyerDashboard.
- **Admin-only:** AdminDashboard, ModelMonitor.
- **Any-logged-in:** Escrow, Chatbot, Analytics (then branches endpoint by role), ProfileEdit.
- **Public / optional-user:** Home, Marketplace, ListingDetail, StageDetail, MarketPrices, ProfileView — read `getUser()` but **don't** redirect; they render for anonymous users and conditionally show role widgets.

> **⚠️ Honest limit:** this protection is **client-side and cosmetic.** Real enforcement is the backend rejecting the JWT (→401→interceptor logout). The gate runs *after* first render, so protected pages can **flash** before redirecting. Role gates trust the localStorage `user.role`, which is editable in devtools to *reveal UI* — but the backend still blocks the actual data calls. **The security is server-side; the client gate is UX.**

---

## E3.5 — `src/components/Navbar.jsx` — role-switching navigation

Rendered manually at the top of nearly every page (no shared layout). State: `user`, `notifications`, `unreadCount`, three dropdown toggles. Mount effect: `setUser(getUser())`, fetch notifications if logged in, outside-click listener; re-runs on `pathname` change. **Polls `GET /notifications` every 30 s.** Mutations: `PUT /notifications/:id/read`, `PUT /notifications/read-all`. **Role-based links:** farmer → Dashboard/New Listing/My Listings/Contracts; buyer → Dashboard/My Contracts/Watchlist; admin → Admin Panel; a "More" dropdown (Analytics, AgriBot, Market Prices, Escrow [hidden for admin], Profile; Model Monitor for admin). Renders `<SyncStatusBar/>` + the notification bell + `<InstallPrompt/>` when logged in, else Login/Sign Up.

---

## E3.6 — The offline / PWA subsystem (a major subsystem)

This is the resilience story — the app works offline and syncs on reconnect.

- **`src/lib/db.js`** — Dexie DB `"AgriChainOfflineDB"` v1. Stores: `pendingMutations` (queued writes), `cachedListings`, `cachedStages`, `cachedUser` (declared, unused).
- **`src/lib/offlineQueue.js`** — `queueMutation({type,url,method,data,headers})` inserts a `pending` row; `syncQueue(onProgress)` replays each pending mutation **in order** with raw `axios`, re-injecting a fresh `Authorization` header from localStorage; success → `"synced"`, failure → increment retries, **after 3 retries → `"failed"`.** `cacheListings`/`cacheStages` + `clearSyncedMutations()`. **Photo uploads are never queued** (a `File` can't be reliably serialized into IndexedDB) — only text mutations.
- **`src/lib/offlineApi.js`** — drop-in offline-aware wrappers using **raw axios** (its own `getAuthHeader()`, **no 401 interceptor** ⚠️): `fetchListings` (offline→cache; online→`GET /listings/all`+cache; error→cache fallback, `fromCache` flag), `fetchStages`, `addStageUpdate` (offline→queue `POST /updates/create`, return optimistic `offline-<ts>` id; online→real post), `updateListingNotes` (offline-queues `PUT /listings/:id`).
- **`src/lib/useOnlineStatus.js`** — hook: listens to `online`/`offline`; on reconnect auto-syncs after a **1500 ms** stabilization delay; polls pending count every 10 s; guards against concurrent syncs.
- **`src/components/SyncStatusBar.jsx`** — the Navbar pill (online/syncing/offline/pending) + a detail popover with a manual "Sync Now" button.

**Consumers:** `Marketplace.jsx` reads via the offline wrapper (shows offline/cache banners); `StageAddUpdate.jsx` writes via the offline queue. Most other pages use the plain online `api` instance.

> **⚠️ Honest limit:** the offline layer uses **raw axios without the 401 interceptor**, so a stale-token replay won't trigger the global logout. `StageMap` depends on **external CDNs** for marker icons (breaks offline) — an ironic seam in the otherwise strong offline story.

---

## E3.7 — Pages (grouped)

### Auth — `Login.jsx`, `Signup.jsx`, `ForgotPassword.jsx`
Two/three-step flows with a **6-box OTP widget** (per-digit focus advance, backspace, paste-to-fill) duplicated across all three.
- **Login:** `POST /auth/login` → if token, `finishLogin`; if 2FA/not-verified, switch to OTP step → `POST /auth/login/verify-otp`. `resendOTP` with a 30 s timer.
- **Signup:** `{name,email,password,role,phone_number}`, role via two buttons (**farmer/buyer only — no admin self-signup**) → `POST /auth/signup` → OTP → `POST /auth/signup/verify-otp`.
- **ForgotPassword:** `POST /auth/forgot-password` → `POST /auth/reset-password {email,otp,new_password}` (client checks OTP len 6, password ≥6).

### Marketplace & listings
- **`Marketplace.jsx`** — loads via the offline wrapper (`GET /listings/all`), tracks `fromCache`; client-side filters (crop search, cascading state/district/taluka, `verifiedOnly`); skeleton loaders; card grid → `/listing/:id`; buyers see `<WatchlistButton>` per card. Yield via `formatYield(listing)`.
- **`ListingDetail.jsx`** — `Promise.all([GET /listings/:id, GET /stages/:id])`; computes `isFarmer`(owner) / `isBuyer`; farmer can `DELETE /stages/:id`; **buyer's contract form → `POST /contracts {listing_id, quantity, offered_price, message, expected_delivery_date, buffer_pct}`** with a configurable escrow buffer (5/10/15/20%, default 10) and a live locked-value estimate (`qty × price × 10`); 5-stage timeline + per-stage GPS badge + `<StageMap>`.
- **`CreateListing.jsx`** — farmer gate; **browser geolocation** auto-capture into `form.lat/lng`; cascading state→district (static dataset); builds `FormData` (fields + `image` + `farm_registration_image`) → `POST /listings/create` multipart → shows the AI-prediction result (predicted vs farmer-expected yield).
- **`StageAddUpdate.jsx`** — farmer gate; **the key offline-write page**: offline → `addStageUpdate` (queues text, blocks photo, "Saved Offline" screen); online → `FormData` → `POST /updates/create`.
- **`StageDetail.jsx`** — `GET /stages/stage-details/:id` + `GET /updates/:id` (+ `GET /listings/:id` if present); renders GPS status (verified/mismatch/no-data), notes, updates, `<StageMap>`, `<CropHealthAdvisor>`.
- **`ListingEdit`** (`GET`/`PUT /listings/:id`), **`ListingAddStage`** (`POST /stages/create` multipart), **`MyListings`** (`GET /listings/my-listings`, `DELETE /listings/:id`).

### Dashboards
- **`FarmerDashboard.jsx`** — `Promise.all([GET /listings/my-listings, GET /contracts/farmer])`; stat tiles (listings, summed tonnes, verified farms, pending contracts), recent-5 lists.
- **`BuyerDashboard.jsx`** — `Promise.all([GET /contracts/buyer, GET /market-prices])`; `totalInvested` from accepted/completed; **honest price-source subtitle** distinguishing live (`data_gov`) vs reference (`default`) vs `simulated` — directly addressing the "stuck simulated" concern.
- **`AdminDashboard.jsx`** — tabs (overview/users/listings/contracts/disputes/broadcast); `Promise.all` of admin stats/users/listings/contracts/open-disputes; market control (`GET /market-prices/scrape-log`, `POST /market-prices/scrape` with a 35 s UI timer); dispute resolution; `PUT /admin/users/:id/toggle`, `PUT /admin/listings/:id/verify`; broadcast `POST /admin/notify`.

### Escrow & contracts
- **`Escrow.jsx`** — `GET /escrow/my`; **all mutations send `X-Idempotency-Key`**: `releaseAdvance` (`PUT /escrow/contract/:id/release-advance`), `releaseMilestone` (`…/milestone/:mId/release`), `settle` (`…/settle {market_price_per_quintal}`), `autofillPrice` (`GET /market-prices/crop/:crop`). Rich financial breakdown (value, buffer margin = `buffer_pct − 100`, milestone schedule, settlement summary).
- **`FarmerContracts.jsx`** — `GET /contracts/farmer`; `respond(id, accept|reject)` → `PUT /contracts/:id/accept|reject`; `raiseDispute` → `PUT /contracts/:id/dispute`.
- **`BuyerContracts.jsx`** — `GET /contracts/buyer`, `PUT /contracts/:id/settle`, `PUT /contracts/:id/dispute`.

### Market, analytics, AI, profile, home
- **`MarketPrices.jsx`** — public; `GET /market-prices` (polled every 5 min) + `GET /market-prices/history/:crop` (30-day Recharts line); `SOURCE_BADGE` map labels each row's provenance; header text honestly adapts to live/seed/simulated.
- **`Analytics.jsx`** — role-selected endpoint `GET /analytics/{farmer|buyer|platform}`; Recharts bar/line/pie.
- **`Chatbot.jsx`** — `GET /chatbot/history`, `POST /chatbot/chat {message}`, `DELETE /chatbot/history`. **⚠️ renders bot messages with `dangerouslySetInnerHTML`** after a naive `**bold**`/newline transform — an XSS surface if the backend ever echoes unsanitized content.
- **`ModelMonitor.jsx`** — admin gate; `GET /monitor/stats`; drift alert + monthly MAPE line + error-distribution pie + per-crop table (Recharts).
- **`ProfileEdit.jsx`** — `GET /auth/profile` (real 2FA) + `GET /profile/:id`; `PUT /profile/me/update` (multipart, merges into localStorage user), `PUT /profile/me/password`, 2FA toggle `POST /auth/two-factor`.
- **`ProfileView.jsx`** — `GET /profile/:id` (public). **`Home.jsx`** — public landing; only reads `getUser()` to swap the hero CTA; no API calls.

---

## E3.8 — Shared components
- **`WatchlistButton.jsx`** — `GET /watchlist/check/:id` on mount; toggle `POST /watchlist` / `DELETE /watchlist/:id`; `e.stopPropagation()` so it works inside a card `<Link>`.
- **`StageMap.jsx`** — React-Leaflet map comparing **registered-farm coords vs photo coords**, a connecting `Polyline`, and a "same location" special case. **⚠️ monkey-patches Leaflet's marker icons to unpkg + GitHub-raw CDN URLs** — external dependency that breaks offline.
- **`InstallPrompt.jsx`** — captures `beforeinstallprompt`, shows an install banner, remembers dismissal in localStorage.
- **`CropHealthAdvisor.jsx`** — on-demand `GET /agent/health/:listingId/:stageName` → tips (severity/category) + climate tiles (used in StageDetail).
- **`ReviewModal.jsx`** — star rating + comment → `POST /reviews {contract_id, rating, comment}`.

---

## E3.9 — Data & helpers
- **`src/data/indiaLocations.js`** — static State→District map (28 states + 8 UTs), `INDIA_STATES` + `getDistricts(state)`. **Deliberately static** for offline create-listing *and because the backend location provider (`locationService`) points at a dev endpoint* (E2.5). Talukas/villages are free text.
- **`src/lib/yield.js`** — `expectedYield(listing)` prefers `farmer_expected_yield` (>0) over AI `predicted_yield` (0/blank = "not provided"); `formatYield(listing)` renders `"— "` or `"X.XX T"`. **Centralizes the "farmer estimate is primary, AI is fallback" rule** used across Marketplace/ListingDetail/dashboards.

---

## E3.10 — Build & deploy config
- **`vite.config.js`** — `@vitejs/plugin-react` + `VitePWA` (`registerType:"autoUpdate"`, `manifest:false` [ships its own], precaches js/css/html/images, `navigateFallback:"/index.html"` for SPA offline routing, **SW off in dev**); alias `@ → ./src`; dev server port **3000**; **no proxy** (talks to the backend by absolute `VITE_API_URL`, so CORS must be server-side).
- **`vercel.json`** — `framework:"vite"`, `outputDirectory:"dist"`, SPA rewrite `/(.*) → /index.html` (deep links work). This is the production host.
- **`postcss.config.cjs`** — **only autoprefixer** (no Tailwind). All styling is hand-written co-located CSS (`auth.css`, `dashboard.css`, `escrow.css`, …) with BEM-ish prefixes (`mkt-`, `esc-`, `anl-`, `ld-`, `ct-`, `dash-`).
- **`package.json`** — deps & why: `react`/`react-dom` 18.3 (UI), `react-router-dom` 6 (SPA routing), `axios` (HTTP + interceptors), `dexie` (offline queue/cache), `leaflet`+`react-leaflet` (GPS map), `recharts` (all charts). Dev: `vite`, `@vitejs/plugin-react`, `vite-plugin-pwa`, `autoprefixer`, `postcss`.

---

## E3.11 — Consolidated honest limitations
- **No axios timeout** anywhere; **two parallel HTTP styles** (`api` instance with interceptors vs raw axios in the offline layer with **no 401 interceptor**).
- **Auth is localStorage-trust on the client**; role gates/`user` blob are spoofable for UI only (backend is the real guard); **401 = hard `window.location` redirect** (loses SPA state).
- **Quintal↔tonne `×10`** hardcoded in many value calcs (not centralized) — a change risk.
- **`dangerouslySetInnerHTML` in Chatbot** = the notable XSS surface.
- **StageMap depends on external CDNs** (fragile offline).
- **No tests, no TypeScript, no error boundary, no code-splitting** — single eager bundle; StrictMode double-fires mount fetches in dev.
- Price-source honesty logic is **duplicated in three places** (BuyerDashboard, MarketPrices, AdminDashboard).

---

## E3.12 — Why the frontend is structured this way

| Choice | Why | The honest trade |
|---|---|---|
| **localStorage auth, no Context** | dead simple; survives refresh with zero wiring; any component reads `getUser()` | no reactivity (a login elsewhere doesn't auto-update open tabs); spoofable client-side |
| **Flat routes + per-page gate** | no gate-component indirection; each page owns its rule | repetition; a brief pre-redirect flash |
| **One axios instance + interceptors** | token + 401 in one place (E1) | the offline layer had to opt out, creating two styles |
| **Offline queue (Dexie) + optimistic UI** | farmers in low-connectivity fields can still record progress | photos can't be queued; replay can race a stale token |
| **Plain CSS, no Tailwind** | zero runtime, full control, small bundle | more hand-written CSS to maintain |
| **Static `indiaLocations`** | works offline; avoids the dev-only backend location API | must be updated by hand |
| **Recharts + Leaflet** | batteries-included charts + the map the résumé's GPS clause needs | heavier bundle (no code-splitting) |

---

### Next: **E5 — the complete user journey** (farmer and buyer walked end to end: signup → listing → contract → escrow → GPS-verified stages → settlement → dispute — tying E1–E4 + E6 together). Then **E6 — the AI service & integration points**. **E1, E2, E4** are delivered; this is **E3**.
