# AgriChain — Master Guide, Part 4: Frontend & the ML Service

> **What's in it:** the **React frontend** end to end — how the single-page app boots, how routing works, the **one file that attaches your JWT to every request** (`lib/api.js`), the pages and components, the interactive **Leaflet map**, and the **offline/PWA** story (Dexie + a replay queue). Then the **Python ML service** file by file — the FastAPI app, the exact inference path, and the real model numbers — all read firsthand from the code, not guessed.
>
> Legend: **✅ ON RÉSUMÉ** · **ℹ️ OFF RÉSUMÉ** · **🎒 BACK POCKET**

---

# SECTION A — THE FRONTEND (React 18 + Vite)

## 1. How the single-page app boots

A React app is **one HTML page** (`index.html`) that loads one JavaScript bundle. That bundle mounts the whole UI into a single `<div id="root">`. From then on, navigation happens **in the browser** (no full page reloads) — that's what "SPA" (single-page application) means.

The boot chain:
```
index.html  ─loads─►  src/main.jsx  ─renders─►  <App/>  (src/App.jsx)  ─routes─►  the right page
```
- **`main.jsx`** is the entry point Vite is pointed at. It calls `ReactDOM.createRoot(...).render(<App/>)` and pulls in global CSS. (It also registers the PWA service worker — see §6.)
- **`App.jsx`** is the router — it decides *which page* renders for the current URL.

> **Interview line:** *"It's a single-page app. `index.html` loads one bundle, `main.jsx` mounts `<App/>` into the root div, and after that all navigation is client-side through React Router — no page reloads, which is what makes it feel instant."*

---

## 2. Routing — `App.jsx` ✅

`App.jsx` uses **`react-router-dom`** (`BrowserRouter > Routes > Route`). There are **~30 routes**. A representative slice:

| Path | Page | Who it's for |
|---|---|---|
| `/` | Home | everyone |
| `/login`, `/signup`, `/forgot-password` | auth pages | logged-out |
| `/marketplace` | Marketplace (all active listings) | everyone |
| `/market-prices`, `/watchlist`, `/notifications` | market + user utility | logged-in |
| `/farmer-dashboard` | FarmerDashboard | farmer |
| `/buyer-dashboard` | BuyerDashboard | buyer |
| `/admin-dashboard` | AdminDashboard | admin |
| `/create-listing`, `/my-listings` | listing management | farmer |
| `/listing/:id`, `/listing/:id/edit`, `/listing/:id/add-stage` | one listing + edit + add a growth stage | farmer/viewer |
| `/stage/:id`, `/stage/:id/add-update` | one crop stage + updates | farmer/viewer |
| `/farmer-contracts`, `/buyer-contracts`, `/escrow` | the deal + money screens | farmer/buyer |
| `/analytics`, `/model-monitor`, `/chatbot` | insights + ML monitor + assistant | logged-in |
| `/profile/:id`, `/profile/:id/edit` | profile view/edit | owner |
| `*` | NotFound | fallback |

**Two things to know about the routing (and defend honestly):**

1. **Routes are declared *flat* — there is no `<ProtectedRoute>` wrapper in `App.jsx`.** Access control is **page-level**, not router-level: each protected page reads the user/token from `localStorage` (via `getUser()`/`getToken()` from `lib/api.js`) and redirects to `/login` if it's missing or the role is wrong. The **real** enforcement is on the **server** (`authMiddleware` + `roleMiddleware`) — the frontend guard is only for UX (don't show a farmer the buyer dashboard). This is the correct security posture: *"the client guard is cosmetic; the server is the source of truth."*
2. **`:id` params** (e.g. `/listing/:id`) are how a single-record page knows which record to fetch — the page reads `useParams()` and calls `GET /api/listings/:id`.
3. **Migration note:** a comment in `App.jsx` shows the frontend was **migrated from Next.js to Vite + React** (reset-password / verify-OTP that were once their own routes are now handled inline inside Login/Signup). If asked "why Vite not Next?" — see Part 2 (faster dev server, no need for SSR here, first-class PWA plugin).

> **Interview line:** *"Routing is React Router with about thirty routes, including param routes like `/listing/:id`. I don't wrap them in a router-level guard — pages check the token/role from localStorage for UX and redirect, but the actual authorization is enforced server-side in middleware. The client can't grant itself access."*

---

## 3. The API layer — `lib/api.js` ✅ (the single most important frontend file)

**Every** call to the backend goes through one configured axios instance. This is where the JWT is attached and where a dead session is detected. It's small enough to know cold:

```js
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
export const api = axios.create({ baseURL: `${API_URL}/api` });

// 1) REQUEST interceptor — attach the JWT to every outgoing call
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// 2) RESPONSE interceptor — auto-logout on 401
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);
```

Four things this file does, each worth a sentence:

1. **API base URL from an env var** — `import.meta.env.VITE_API_URL`. In development it falls back to `http://localhost:5000`; in production Vercel injects the Render backend URL at **build time**. (Vite only exposes vars prefixed `VITE_`.) The base is `${API_URL}/api`, so a call to `api.post("/auth/login")` hits `<backend>/api/auth/login`.
2. **Request interceptor attaches the JWT** — reads the token from `localStorage` and sets `Authorization: Bearer <token>` on **every** request automatically. No page has to remember to add it. This is the client half of the auth handshake whose server half is `authMiddleware`.
3. **Response interceptor auto-logs-out on 401** — if the server ever says "unauthorized" (expired/invalid token), it clears the stored token+user and hard-redirects to `/login`. That's why an expired session cleanly bounces you to login instead of showing broken pages.
4. **Helpers** — `getUser()` (parses the cached user JSON), `getToken()`, `logout()` (clears both keys). Pages use `getUser()?.role` to decide what to render.

> **Interview line (say this slowly — it ties client to server):** *"All API calls go through one axios instance. A request interceptor pulls the JWT from localStorage and sets the Authorization header on every call, so auth is automatic. A response interceptor watches for 401s and, if the token's expired, clears storage and redirects to login. The backend URL comes from a `VITE_` env var baked in at build time — that's the one wiring fact that makes the deployed frontend talk to the deployed backend."*

**Honest caveat to keep ready:** the JWT lives in `localStorage`, which is readable by JavaScript, so the relevant risk is **XSS**. Hardening you'd mention: move the token to an **HttpOnly cookie** and add a **Content-Security-Policy**. (Same caveat as Part 6's auth deep dive.)

---

## 4. The pages (`src/pages/`)

There are ~26 page components. Grouped by job:

**Auth & entry**
- **Home** — landing page.
- **Login** — email/password; handles the **2FA OTP** step inline (if the server responds `twoFactorRequired`); stores token+user on success.
- **Signup** — creates the account (farmer/buyer only), then shows the **OTP verify** step inline.
- **ForgotPassword** — the anti-enumeration reset flow (identical response whether or not the email exists).

**Marketplace & listings**
- **Marketplace** — the public grid of all **active** listings (crop, farmer, predicted yield, price). This *is* the "place where everything is listed and buyers can browse" the user asked about.
- **CreateListing** — farmer form: crop, land, soil, irrigation, season, location + **two image uploads** (crop photo + farm-registration doc). On submit the backend OCRs the reg doc for GPS and calls the ML service for a yield estimate.
- **MyListings** — the farmer's own listings.
- **ListingDetail** / **ListingEdit** — one listing (with its stages + any contracts) / edit form.
- **ListingAddStage** — upload a growth-stage photo (feeds the GPS-verification flow, Part 5 Flow 6).

**Crop stages**
- **StageDetail** — one growth stage, its photo, GPS badge, and the **StageMap** (see §5).
- **StageAddUpdate** — add a progress update/notes to a stage.

**Contracts & money**
- **BuyerContracts** / **FarmerContracts** — the deal pipeline from each side (offer → accepted → in-progress → completed).
- **Escrow** — the money screen: locked total, the **5 milestones**, release buttons (stage-gated + idempotent), settlement. This is the UI over Part 5 Flows 5/7/8.

**Dashboards & insights**
- **FarmerDashboard** / **BuyerDashboard** / **AdminDashboard** — role landing pages (each guarded page-level as in §2).
- **Analytics** — charts (via `recharts`).
- **MarketPrices** — live mandi prices with the **source label** (live / cached / simulated) from the 4-tier fallback (Part 6 Deep Dive 3).
- **Watchlist** / **Notifications** — user utilities.
- **ModelMonitor** — surfaces the ML service's health/metrics (calls the Python service's `GET /` and `/model/info`).
- **Chatbot** — the Groq-backed assistant (ℹ️ off résumé).

*(I read `App.jsx` and `lib/api.js` firsthand; the individual page internals all follow the same pattern — call `api.*`, read `getUser()` for role, render. If asked about a specific page I'd open it, but the pattern is uniform.)*

---

## 5. The components (`src/components/`)

| Component | What it does | Notes |
|---|---|---|
| **StageMap** | The interactive **Leaflet** map: plots the registered farm vs the photo's GPS | ✅ **on résumé** — detail below |
| **Navbar** | Top navigation; shows/hides links by role (`getUser()`) | cosmetic role-gating |
| **WatchlistButton** | Add/remove a listing from the watchlist | small, reusable |
| **InstallPrompt** | The "Add to Home Screen" PWA install prompt | part of the PWA story |
| **SyncStatusBar** | Shows online/offline + pending-sync count | reads the offline queue |
| **ReviewModal** | Leave a rating/review after a completed deal | |
| **CropHealthAdvisor** | Surfaces crop-health tips/advice | |

### StageMap — the interactive map ✅ (read firsthand)

This is the résumé-worthy "interactive map" feature. It uses **`react-leaflet`** (React bindings for Leaflet) over free **OpenStreetMap** tiles — no paid map API.

What it does, exactly:
- **Props:** `farmLat, farmLng, imageLat, imageLng`. If any is missing it renders **nothing** (`return null`) — a clean guard.
- **Two custom markers:** a **green** marker for the registered farm, a **red** marker for the photo's GPS (color-marker PNGs; it also fixes Leaflet's well-known default-icon path bug by re-pointing `L.Icon.Default` at unpkg URLs).
- **Same-location collapse:** if farm and photo are within ~0.0001° of each other it shows **one** "🎯 Exact Farm Match" marker; otherwise it shows **both** markers **plus a `Polyline`** connecting them — so the buyer literally *sees* the distance between where the farm is registered and where the photo was taken.
- **Tooltips/Popups** label each point; a legend below the map explains the colors.

> **Interview line:** *"The stage photo's GPS and the farm's registered GPS are both plotted on a Leaflet map over OpenStreetMap tiles — green for the farm, red for the photo, with a line between them. If they're basically identical it collapses to a single 'exact match' marker. It makes the GPS verification from Part 6 visible instead of just a number."*

---

## 6. Offline + PWA — Dexie replay queue ℹ️ (read firsthand)

AgriChain is a **PWA (Progressive Web App)** — installable, works offline — because a farmer in a field may have poor connectivity. Three pieces:

**(a) `vite-plugin-pwa`** turns the build into an installable app with a service worker (caches the app shell so it opens offline). **InstallPrompt** is the UI that offers "install to home screen." **`useOnlineStatus`** is a small hook that tracks `navigator.onLine`.

**(b) `lib/db.js` — the offline database (Dexie over IndexedDB).** Four object stores:
```js
db.version(1).stores({
  pendingMutations: "++id, type, url, method, createdAt, status", // the write queue
  cachedListings:   "id, updatedAt",   // marketplace, for offline reading
  cachedStages:     "id, listing_id, updatedAt",
  cachedUser:       "id",
});
```

**(c) `lib/offlineQueue.js` — the queue + replay logic.** The pattern:
- **`queueMutation({type,url,method,data,headers})`** — when a write happens offline, instead of failing, the request is **saved to IndexedDB** with `status:"pending"`, `retries:0`, and a timestamp.
- **`syncQueue()`** — when the connection returns, it pulls all pending mutations **sorted by `createdAt`** and **replays them in order** against the real API (re-attaching the current JWT). Each success is marked `synced`; each failure increments `retries` and **gives up after 3 tries** (marks `failed`). Returns `{synced, failed}` so **SyncStatusBar** can show progress.
- **`cacheListings()` / `cacheStages()`** — store fetched data so the marketplace/stages are **readable offline**.
- **`clearSyncedMutations()`** — housekeeping.

**Honest limitation to volunteer:** the queue replays **text mutations** (notes, updates). **Photo uploads still require a live connection** at upload time — `FormData`/file buffers can't be serialized into IndexedDB the way JSON can. The code comments say exactly this. So the honest framing is: *"offline-first for reads and text writes, with a deterministic replay queue; photo uploads need connectivity."*

> **Interview line:** *"It's a PWA with an offline write queue. If a farmer adds a stage note with no signal, the mutation is stored in IndexedDB via Dexie with a timestamp; when they're back online I replay the queue in order against the API, with up to three retries per item. Reads are cached too. The one honest limit is photo uploads — those need a live connection because you can't serialize a file buffer into the queue the way you can JSON."*

---

## 7. How the frontend connects to the backend (one paragraph)

The React app is a **static build on Vercel**. It knows the backend's address from the `VITE_API_URL` env var baked in at build time. Every call goes through the **one axios instance** in `lib/api.js`, which attaches the **JWT** from `localStorage` on the way out and **logs you out on a 401** on the way back. Data comes back as JSON and renders into React components; images come back as **Supabase public URLs** (the bytes never pass through the API). Offline, writes queue in **IndexedDB** and replay on reconnect. The backend, in turn, is the only thing that touches Postgres, the ML service, storage, email, and the price API (Part 2's "hub" rule).

---

# SECTION B — THE PYTHON ML SERVICE (crop-yield prediction) ℹ️

> All of this section was read firsthand from `ai-service/src/` — `app.py`, `inference.py`, `climate_service_v2.py`, `feature_template.py`, and `models/model_metadata.json`. Tagged **ℹ️** because on your résumé the ML is a supporting feature, not the headline — but you should know the gist cold, because "you have an ML service" invites questions.

## 8. What it is and why it's a separate service

A standalone **FastAPI** app ("AgriChain AI Engine", v2.0.0) that predicts **crop yield (kg/ha)** from farm inputs (crop, state, district, season, soil, irrigation, land size), using a trained **XGBoost** regression model. It's isolated from the Node backend because the ML libraries (XGBoost, pandas, scikit-learn) are heavy and Python-only — and isolating it means the **listing flow degrades gracefully** if the model is down (Part 2 §7). It's deployed as its own service on Render, **Python pinned to 3.12.1** (Part 6 Problem 5).

## 9. `app.py` — the FastAPI surface (read firsthand)

- **CORS** open (`allow_origins=["*"]`).
- **Pydantic `PredictRequest`** validates JSON input: `crop, state, district, season, soil_type, irrigation_method, land_acres (>0), year (default 2024)`. FastAPI auto-rejects bad input with a 422 — validation for free.
- **Fail-hard startup** (same philosophy as the Node DB gate): on startup it calls `_load_model()`, and if the model artifacts are missing it **raises `RuntimeError` and refuses to start**, printing the exact fix command. *"I'd rather the ML service refuse to boot than serve garbage predictions from a missing model."*

**Endpoints:**
| Method + path | Purpose |
|---|---|
| `GET /` | health + live metrics (r2, mae, mape) from `model_metadata.json` |
| `GET /model/info` | full metadata + **top 15 features** + per-crop metrics |
| `GET /predict/crop-list` | supported crops + their yield bands |
| `GET /climate/{state}/{district}` | the climate lookup (below) |
| `POST /predict/json` | predict from a JSON body (`PredictRequest`) |
| `POST /predict/dynamic` | **predict from form-data — this is the one the Node backend calls** |

**The Node↔Python contract:** `POST /predict/dynamic` takes form fields (`state, district, crop, season, land, soil_type, irrigation_method, year`, optional `image`) and returns a **backward-compatible shape** the `listingController` expects: `{ status, predicted_yield_kg_ha, total_tonnes, confidence_band, climate, market_estimate, inputs }`. That's why the Node `aiService` posts form-data, not JSON.

## 10. `inference.py` — how one prediction is actually made (read firsthand)

This is the part worth understanding, because it shows you know how a model is *served*, not just trained.

1. **Load once** (`_load_model`): `joblib.load` the model (`xgboost_yield_model.pkl`) and the **exact training column list** (`model_columns.pkl`). It also builds **per-crop yield bands** (5th/95th percentile of yield from the training CSV) for confidence intervals.
2. **Build one feature row that matches training exactly** (`_build_feature_row`): start a dict with **every training column set to 0.0**, then fill it:
   - **Numerics:** `area` (converted **acres → hectares**, ×0.4046856422), plus climate values (`annual_rainfall, t2m_max, t2m_min, rh2m, ws2m`), `year`/`crop_year`, and an engineered **`rainfall_temp_interaction` = rainfall / (t2m_max + 1)**.
   - **Categoricals** (`state, district, crop, season, soil_type, irrigation_method`): **one-hot** — `_set_categorical` finds the column named `field_value` (case-insensitive) and sets it to `1.0`. An **unseen category** (not in training) just leaves that group all-zero — the model treats it as a baseline, so a new district never crashes the prediction.
3. **Predict + inverse-transform:** the model was trained on **log-transformed yield** (to tame the heavy skew — some crops yield vastly more kg/ha than others), so inference does `y_log = model.predict(X)` then **`yield_kg_ha = expm1(y_log)`** (the inverse of `log1p`), clamped to ≥ 0. **This is the single most impressive detail to mention** — it shows you understand target transformation, not just `.predict()`.
4. **Scale to the farm + attach a confidence band:** `total_tonnes = yield_kg_ha × area_ha / 1000`; the confidence band is the crop's 5th–95th percentile (fallback ±15% if the crop wasn't in training), expressed in both kg/ha and tonnes.
5. **`market_estimate` is deliberately `None`** — pricing is the job of the **live market-prices feature** (Part 6 Deep Dive 3), not the model. Clean separation of concerns you can point to.

## 11. `climate_service_v2.py` — where "climate" comes from (read firsthand — important nuance)

An interviewer might assume the model calls a live weather API. **It doesn't, at inference time.** `get_climate_data(state, district)` looks up **average** `annual_rainfall / t2m_max / t2m_min / rh2m / ws2m` **from the training dataset** (`agrichain_feature_matrix.csv`), for that state+district, falling back to **state average → national defaults** if there's no exact match — and it **never raises** (same graceful-degradation pattern). The column names (`T2M_MAX`, `RH2M`, `WS2M`) are **NASA POWER's** variable convention, so those climate values were originally sourced from **NASA POWER** during dataset preparation — but serving uses the **historical averages** baked into the matrix, not live weather. Honest framing: *"climate features are historical averages per district from the training data, not a live forecast — a fair improvement would be to pull live/seasonal climate at prediction time."*

## 12. The model itself — exact numbers (from `model_metadata.json`, read firsthand)

| Metric | Value | What it means |
|---|---|---|
| **Algorithm** | XGBoost Regressor | gradient-boosted trees, ideal for tabular data |
| **Features** | **643** | after one-hot expanding state + **district** + crop + season + soil + irrigation, plus the numerics |
| **Test R²** | **0.8742** | explains ~87% of yield variance |
| **Test MAPE** | **29.79%** | avg ~30% off — the honest, interpretable error |
| **Test MAE** | 25,061 kg/ha | large in absolute terms because yields span a huge range across crops |
| **Train / test rows** | **210,085 / 37,074** | a real, sizeable dataset (~247k rows) |
| **Trained** | 2026-07-28 | — |
| **Versions** | scikit-learn 1.4.2, XGBoost 2.0.3 | pinned for reproducibility |

**Tuned hyperparameters** (from a search, in the metadata): `n_estimators=713, max_depth=7, learning_rate≈0.148, subsample≈0.71, colsample_bytree≈0.71, gamma≈0.14, min_child_weight=9, reg_alpha≈0.98, reg_lambda≈0.93`. You don't need to memorise these — just know **the model was hyperparameter-tuned, not default**, and regularised (`reg_alpha`/`reg_lambda`/`gamma`) to avoid overfitting.

> **The 30-second ML answer:** *"It's an XGBoost regressor on about 643 one-hot + numeric features — crop, state, district, season, soil, irrigation, plus per-district climate averages. I trained on ~210k rows and it lands at R² 0.87, MAPE ~30% on the test set. I trained on log-yield to handle the skew and invert with expm1 at inference, and I attach a per-crop percentile confidence band. It runs as its own FastAPI service, and if it's down, listings still save with a blank prediction."*

**Honest imperfections to own (only if pushed):**
- The feature template lists `Fertilizer`/`Pesticide` as inputs, but the **serving path leaves them at 0** (they're not collected at listing time) — the model just uses its learned baseline. A cleaner version would either collect them or drop them from the schema.
- Climate is historical-average, not live (§11).
- MAPE ~30% is "useful estimate," not "precise" — you present it as a **guidance band**, which is exactly why the UI shows a confidence range, not a single hard number.

## 13. How Node uses it + graceful degradation (the connection)

When a farmer creates a listing, the Node `listingController` (via `aiService`) does `POST <ML_URL>/predict/dynamic` with the farm inputs as form-data, **wrapped in try/catch**. On success it stores `predicted_yield` + confidence bounds on the listing; **on failure it saves the listing anyway** with a blank prediction. That try/catch is the graceful-degradation seam — the model is an *enhancement*, never a *gate*, on the core "create a listing" action.

---

## 14. Frontend + ML: the one-breath summary

> *"The frontend is a React 18 SPA built by Vite, deployed static on Vercel. Every API call goes through one axios instance that attaches the JWT and auto-logs-out on 401, with the backend URL from a build-time env var. It's a PWA with a Dexie-backed offline queue that replays text mutations on reconnect, and it uses Leaflet to plot farm-vs-photo GPS. The yield prediction is a separate FastAPI + XGBoost service — 643 features, R² 0.87, trained on log-yield and inverted with expm1 — that the Node backend calls when a listing is created, degrading gracefully if it's down."*

---

### End of Part 4

**Next:** Part 7 — anticipated **interview Q&A** across every topic, a **numbers cheat-sheet** (all the figures in one place), an honest **"what I'd improve"** list, and a **glossary** of every term used in this guide.
