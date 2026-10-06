# AgriChain End-to-End — Part E1: The Request → Response Lifecycle

> **What this part is.** One HTTP round trip, followed from the moment a React component asks for data to the moment the screen updates — every layer it passes through, in order, with the real file names, line numbers, and the *reason* each layer exists. This is the "how req is sent nd how response comes" part. Everything here is grounded in the actual code (axios instance, `server.js`, the middleware files, the controllers, the `pg` pool).
>
> Read **E0** first for the stack and the three services. Read this before **E2/E3** — once you understand the *spine*, the file-by-file parts are just "here is each organ in detail."

---

## E1.0 — The one-sentence spine

> A component calls `api.get(...)` → **axios** stamps on the JWT → the browser sends HTTPS to Render → **Express** runs a fixed stack of middleware (CORS → body-parse → rate-limit → **router** → **auth** → **role** → **validation**) → a **controller** runs parameterized SQL through the **pg pool** to Supabase Postgres → the rows become JSON → axios' **response interceptor** sees the status → the promise resolves → React `setState` → the DOM re-renders.

Every request in the whole app is a variation on that single line. The rest of E1 blows up each arrow.

```
 BROWSER (Vercel-served SPA)                      SERVER (Render, Node/Express)         DATA (Supabase)
 ┌───────────────────────────┐                   ┌──────────────────────────────┐     ┌──────────────┐
 │ React component            │                   │ 1. CORS                      │     │              │
 │   useEffect / onClick      │                   │ 2. express.json (10mb)       │     │  PostgreSQL  │
 │        │                   │   HTTPS request   │ 3. app.use("/api",apiLimiter)│     │  (pg pool)   │
 │        ▼                   │  ───────────────▶ │ 4. Router match (/api/x)     │     │              │
 │ api.post("/contracts", …)  │  Authorization:   │ 5. authMiddleware (JWT)      │ SQL │   + Storage  │
 │        │                   │  Bearer <JWT>     │ 6. roleMiddleware(...roles)  │ ──▶ │   buckets    │
 │        ▼                   │                   │ 7. validate* (body / :id)    │     │  listings,   │
 │ axios instance             │                   │ 8. CONTROLLER                │ ◀── │  stages      │
 │   • baseURL + /api         │   JSON response   │     pool.query($1,$2…)        │rows └──────────────┘
 │   • req interceptor: +JWT  │  ◀─────────────── │     res.json({...})          │
 │   • res interceptor: 401?  │  200 / 4xx / 5xx  │                              │     ┌──────────────┐
 │        │                   │                   │  (+ Supabase upload,         │HTTP │ Python ML    │
 │        ▼                   │                   │     AI /predict/dynamic,     │ ──▶ │ FastAPI      │
 │ setState → re-render       │                   │     SendGrid, data.gov.in)   │     │ (E6)         │
 └───────────────────────────┘                   └──────────────────────────────┘     └──────────────┘
```

---

## E1.1 — Layer 0: where a request is *born* (the React side)

A request always starts with one of two triggers inside a page component:

1. **On mount** — a `useEffect(() => { fetchData(); }, [])` that loads what the page needs. Example: `Marketplace.jsx` loading listings, `FarmerDashboard.jsx` loading `Promise.all([...])`.
2. **On interaction** — an `onClick` / `onSubmit` handler. Example: the buyer clicking **"Send Contract Offer"** in `ListingDetail.jsx`, or the farmer submitting `CreateListing.jsx`.

Both call a method on the shared **axios instance**, imported as `api` from `src/lib/api.js`:

```js
import { api } from "@/lib/api";
// a read:
const res = await api.get("/listings/all");
// a write:
const res = await api.post("/contracts", { listing_id, quantity, offered_price, message, expected_delivery_date, buffer_pct });
```

> **Key fact:** components **never** build URLs, never attach tokens, never set `Content-Type` by hand. They call `api.get("/contracts/buyer")` with a *relative* path. Everything else (base URL, auth header, error handling) is centralized in the axios instance. That centralization is the reason the whole app has exactly one place to change network behavior — and the reason E1 is short enough to hold in your head.

---

## E1.2 — Layer 1: the axios instance (`frontend/src/lib/api.js`)

This 48-line file is the **network + auth spine of the frontend**. Three things happen here.

### (a) Base URL — the `/api` prefix is bolted on once

```js
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
export const api = axios.create({ baseURL: `${API_URL}/api` });
```

- In production, `VITE_API_URL` is the Render backend origin (set at Vercel build time — it's baked into the bundle, not read at runtime).
- Locally it falls back to `http://localhost:5000`.
- The literal string `/api` is **always** appended. So `api.get("/listings/all")` → `GET <backend>/api/listings/all`. That is why every backend router is mounted under `/api/...` (see E1.5) — the two halves are designed to meet at `/api`.

> **⚠️ Honest limit:** there is **no `timeout`** set on the instance. A hung backend (or the ~30s market-price scrape, or a slow file upload) will keep a request pending indefinitely. This is a deliberate trade (uploads/scrape need the headroom) but it is a real robustness gap — a dropped connection never auto-aborts.

### (b) Request interceptor — the JWT is stamped on *automatically*

```js
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
```

Before **every** outbound request, axios reads the JWT from `localStorage["token"]` and sets the `Authorization: Bearer <jwt>` header. This is why a component can call a protected endpoint without thinking about auth — the token rides along invisibly. If there's no token (logged out), the header is simply omitted and the backend will answer 401.

### (c) Response interceptor — global 401 = "nuke the session"

```js
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "/login";   // hard redirect, full reload
    }
    return Promise.reject(error);         // callers' catch{} still runs
  }
);
```

On **any** 401 from the backend (expired/invalid token), the interceptor wipes `token` + `user` and does a **hard** `window.location.href = "/login"` (a full page load, not a React-Router navigate). The error is still re-rejected so the calling component's `catch` block also runs. This is the single, global session-expiry mechanism — there is no refresh-token dance; a dead token means "log in again."

> **Auth model in one line:** the frontend holds two `localStorage` keys — `"token"` (the raw JWT) and `"user"` (a JSON blob of `{id, name, role, …}`). There is **no React Context / Redux / auth provider**; helpers `getUser()`, `getToken()`, `logout()` read those keys synchronously. (E3 covers this in full — it's the most important structural fact about the frontend.)

---

## E1.3 — Layer 2: over the wire (CORS + the actual HTTP)

When axios fires, two things cross the public internet from the Vercel domain to the Render domain:

**(a) The CORS preflight (for non-simple requests).** Because the frontend origin (`agrichain-brown.vercel.app`) differs from the backend origin (`…onrender.com`), the browser first sends an `OPTIONS` preflight for any request with a JSON body, a custom header (`Authorization`, `X-Idempotency-Key`), etc. The backend's `cors()` middleware (E1.5) answers it with the allowed origin/methods/headers. Only then does the browser send the real request. This is why **CORS lives server-side** and why a misconfigured `CORS_ORIGINS` breaks the app with "blocked by CORS policy" even though the API itself is healthy.

**(b) The real request.** For the contract example it looks like:

```http
POST /api/contracts HTTP/1.1
Host: agrichain-backend-xxxx.onrender.com
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6…   ← stamped by the request interceptor
Content-Type: application/json
{ "listing_id": 42, "quantity": 5, "offered_price": 2200, "message": "…", "expected_delivery_date": "2026-12-01", "buffer_pct": 10 }
```

> **⚠️ Render cold-start reality:** on the free tier the backend sleeps after inactivity. The *first* request after a sleep waits ~30–50s while the dyno boots (and `pool.connect()` + crons run). The login "incorrect password" flash recorded in project memory is often this cold-start, not a real auth failure.

---

## E1.4 — Layer 3: Express entry — the global middleware stack (`backend/server.js`)

Every request that reaches the backend runs through a **fixed, ordered** stack before any route logic. Order is everything in Express — each `app.use(...)` runs in the sequence it was registered.

```
Request ─▶ cors() ─▶ express.json({limit:"10mb"}) ─▶ express.urlencoded(...) ─▶ app.use("/api", apiLimiter) ─▶ router
```

1. **`cors()`** — answers the preflight and sets `Access-Control-Allow-*`. Origin comes from the `CORS_ORIGINS` env (`*` in dev, tightened to the Vercel URL in prod).
2. **`express.json({ limit: "10mb" })`** — parses a JSON body into `req.body`. The 10 MB limit is generous on purpose (base64-ish payloads, long contract messages) but is the ceiling that stops a giant body from exhausting memory.
3. **`express.urlencoded(...)`** — parses form-encoded bodies. (Multipart/file bodies are *not* parsed here — those are handled per-route by **multer**, see E1.6.)
4. **`app.use("/api", apiLimiter)`** *(server.js:49)* — the **global rate limiter**, mounted on the whole `/api` tree **before any route**. `apiLimiter` = **60 requests / minute / IP** (`validationMiddleware.js`). Exceed it → `429 { success:false, message:"Too many requests. Please slow down.", retry_after_seconds }` with a `Retry-After` header.

> **⚠️ Honest limit (rate limiting):** the limiter is an **in-process `Map`** keyed by `req.ip`, swept every 10 min. Two consequences: (1) it **resets on restart** and does **not** coordinate across multiple Render instances; (2) Express `trust proxy` is **not** set, so behind Render's proxy `req.ip` can resolve to the *proxy's* IP — meaning all users may share one bucket. Fine for a demo/single dyno; it is not a production-grade distributed limiter.

**Boot sequence (why the server is "ready" at all).** `server.js` does `pool.connect()` first; **only on success** does it `app.listen(...)`. Inside the listen callback it fires `startAllCrons()` (the 06:00 IST market job + Sunday cleanup), `verifyEmailTransport()` (checks SendGrid env vars), and a fire-and-forget market self-heal refresh. If the DB connect fails, it `process.exit(1)` — the server refuses to serve without a database. (All detailed in E2.)

---

## E1.5 — Layer 4: routing (mounting + matching)

After the global stack, Express matches the path against the ~20 routers mounted in `server.js`, each under its own `/api/...` prefix:

| Prefix | Router | Area |
|---|---|---|
| `/api/auth` | authRoutes | signup, login, OTP, 2FA, profile-of-me |
| `/api/listings` | listingRoutes | crop listings + image upload + AI yield |
| `/api/stages` | cropStageRoutes | crop-stage timeline + GPS photos |
| `/api/updates` | updateRoutes | per-stage progress updates |
| `/api/contracts` | contractRoutes | offer → accept/reject → settle → dispute |
| `/api/escrow` | escrowRoutes | advance/milestone/settle money releases |
| `/api/market-prices` | marketPriceRoutes | mandi prices + history + admin scrape |
| `/api/watchlist` | watchlistRoutes | buyer favourites |
| `/api/notifications` | notificationRoutes | in-app bell |
| `/api/profile` | profileRoutes | public profile + edit-me |
| `/api/analytics` | analyticsRoutes | role dashboards |
| `/api/monitor` | modelMonitorRoutes | ML drift stats |
| `/api/chatbot` | ragRoutes | AgriBot chat (**note:** router file is `ragRoutes`, mounted at `/api/chatbot`) |
| `/api/agent` | agentRoutes | agentic negotiator + crop-health advisor |
| `/api/ai` | predictionRoutes | yield prediction proxy to Python |
| `/api/reviews` | reviewRoutes | post-contract ratings |
| `/api/admin` | adminRoutes | admin panel |
| `/api/location` | locationRoutes | state/district dropdown data |

> **Reconciliation note (carry this forward):** the older interview course's B2 mentioned `POST /api/rag/chat`. The **real** route is **`POST /api/chatbot/chat`** — the router *file* is named `ragRoutes.js` but it is **mounted at `/api/chatbot`**. Same code, correct prefix is `/api/chatbot`.

Inside a router, the method + sub-path selects the handler, e.g. `router.post("/", …, createContract)` under the `/api/contracts` mount = `POST /api/contracts`.

---

## E1.6 — Layer 5: the per-route middleware chain (the gates)

This is where "who are you / may you / is your input sane" is enforced. A protected route stacks middleware **left to right**, and the request only reaches the controller if every gate calls `next()`.

The canonical fully-gated chain (verified on `contractRoutes`):

```js
router.post("/",
  authMiddleware,            // 1. who are you?      → 401 if no/invalid token
  roleMiddleware("buyer"),   // 2. may you do this?  → 403 if wrong role
  validateContract,          // 3. is the body sane? → 400 if not
  createContract             // 4. the actual work
);
```

### Gate 1 — `authMiddleware.js` (authentication)

```js
const authHeader = req.header("Authorization");          // "Bearer eyJ…"
if (!authHeader) return res.status(401).json({ message: "Access denied. No token provided" });
const token = authHeader.split(" ")[1];                  // take the 2nd segment
const verified = jwt.verify(token, process.env.JWT_SECRET);
req.user = verified;                                     // { id, role, ... }
next();
```

- Reads the `Authorization` header, grabs the token after the space, verifies the signature with **`JWT_SECRET`**.
- On success, attaches the **decoded payload** to `req.user` (this is how every downstream layer knows `req.user.id` and `req.user.role`).
- On **any** failure (missing header, bad signature, malformed, **or expired**) → **`401 { message: "Invalid token" }`**. That 401 is exactly what the frontend's response interceptor catches to force a re-login.

> **⚠️ Honest limit:** expired and invalid tokens collapse into the *same* `401 "Invalid token"` — the client can't tell "your session timed out" from "your token is bogus." There's also no token revocation/blacklist (a stateless JWT is valid until it expires, 7 days). And it doesn't verify the scheme is literally `Bearer`; it just takes `split(" ")[1]`.

### Gate 2 — `roleMiddleware.js` (authorization)

```js
module.exports = (...allowedRoles) => (req, res, next) => {
  if (!allowedRoles.includes(req.user.role)) return res.status(403).json({ message: "Access forbidden" });
  next();
};
```

A **variadic factory**: `roleMiddleware("buyer")`, `roleMiddleware("farmer")`, `roleMiddleware("buyer","farmer")`, `roleMiddleware("admin")`. It reads `req.user.role` (set by Gate 1), so it **must** run *after* `authMiddleware`. Wrong role → **`403 "Access forbidden"`**.

> **⚠️ Honest limit:** if `roleMiddleware` is ever mounted *without* `authMiddleware` first, `req.user` is undefined and `req.user.role` throws → it returns **`500 "Server Error"`** instead of a clean 401. It relies on correct ordering rather than defensively checking `req.user` exists.

### Gate 3 — `validationMiddleware.js` (input sanity)

Two validators are actually wired:

- **`validateIdParam(...names)`** — rejects URL params that aren't positive integers *before* they hit Postgres. `/listings/undefined`, `/stages/abc`, `/contracts/0` → **`400 { message: "Invalid Id" }`**. Without it, Postgres would throw `invalid input syntax for type integer` (an ugly 500); this turns a class of bad requests into a clean 400. Used on `contractRoutes`, `listingRoutes`, `cropStageRoutes`.
- **`validateContract`** — checks `listing_id` (num ≥ 1), `quantity` (num ≥ 0.1), `offered_price` (num ≥ 1), `message` (optional ≤ 1000). First failure → **`400 { message: "<first error>", errors:[…] }`**.

> **⚠️ Honest limit:** `validateSignup`, `validateLogin`, `validateReview`, and `uploadLimiter` **exist but are never wired up**. So signup/login bodies get **no server-side schema validation** (only `authLimiter` = 10/15 min throttles them), and uploads get no dedicated throttle. The validators give a false sense of coverage — worth knowing honestly.

### The upload gate — `uploadMiddleware.js` (multer, for multipart routes)

File-upload routes (listing create, stage create, profile photo, updates) insert **multer** into the chain instead of relying on `express.json`:

```js
const upload = multer({ storage: multer.memoryStorage() });   // files land in RAM as req.file(s).buffer
// e.g.  router.post("/create", authMiddleware, upload.fields([{name:"image"},{name:"farm_registration_image"}]), createListing)
```

Multer parses `multipart/form-data`, puts text fields on `req.body` and files on `req.file`/`req.files` as in-memory **Buffers** — exactly what Supabase's `.upload(buffer)` and the EXIF/OCR helpers consume.

> **⚠️ Honest limit:** `memoryStorage()` has **no size limit and no MIME filter**. A large upload is held entirely in RAM — a real OOM/DoS risk on Render's 512 MB free tier.

---

## E1.7 — Layer 6: the controller (the actual work)

The controller is the first place "business logic" lives. It reads `req.user` (identity), `req.body`/`req.params`/`req.files` (input), does its work, and calls `res.json(...)` / `res.status(...).json(...)`. The single most important thing controllers do is talk to Postgres **safely**:

```js
const result = await pool.query(
  "INSERT INTO contracts (listing_id, buyer_id, quantity, offered_price, status) VALUES ($1,$2,$3,$4,'pending') RETURNING *",
  [listing_id, req.user.id, quantity, offered_price]
);
res.status(201).json({ success: true, contract: result.rows[0] });
```

- **Parameterized queries (`$1,$2,…`) everywhere** — values are sent to Postgres *separately* from the SQL text, so a malicious `quantity` can never become SQL. This is the project's SQL-injection defense and it is used consistently.
- `req.user.id` (from the JWT) is the trusted source of "who" — the controller never trusts a user id sent in the body.

Controllers also orchestrate the **external services** when needed (all detailed in E2/E6):
- **Supabase Storage** — `supabase.storage.from("listings"|"stages").upload(buffer).getPublicUrl()` for photos.
- **The Python ML service** — `axios.post(AI_SERVICE_URL + "/predict/dynamic", form)` during listing creation.
- **SendGrid** — `sendOTPEmail(...)` during auth flows.
- **data.gov.in** — via `marketScraper` for settlement prices.

---

## E1.8 — Layer 7: the database (`config/db.js` → Supabase Postgres)

Every `pool.query(...)` borrows a connection from the **single shared `pg.Pool`**:

```js
const pool = new Pool({
  user: process.env.DB_USER, host: process.env.DB_HOST,
  database: process.env.DB_NAME, password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
});
module.exports = pool;
```

- **One pool, imported everywhere.** It multiplexes many requests over a small set of TCP connections to Supabase Postgres (ap-south-1, Mumbai). Default `pg` sizing (`max: 10`) applies — no custom max or timeouts are set.
- **SSL is opt-in** via `DB_SSL=true`, and when on it uses `rejectUnauthorized:false` (accepts the managed provider's cert chain without validating it) — which is what lets it reach Supabase.
- The query runs, Postgres returns rows, and `result.rows` comes back to the controller.

> **⚠️ Honest limit:** no pool `max`/idle/statement timeouts means a few slow queries can exhaust the 10 default connections and stall the app; `rejectUnauthorized:false` disables MITM protection on the DB link.

The money paths add **ACID rigor** on top of the pool — `acceptContract` runs a `SERIALIZABLE` transaction with `pg_advisory_xact_lock` + `SELECT … FOR UPDATE` so two buyers can't accept the same listing into a double-escrow (full treatment in E2 + the escrow section).

---

## E1.9 — Layer 8: the response travels back

The controller calls `res.json(payload)` (optionally `res.status(code)` first). Express serializes it, CORS headers are already set, and the JSON flows back over HTTPS:

```http
HTTP/1.1 201 Created
Content-Type: application/json
{ "success": true, "contract": { "id": 128, "status": "pending", … } }
```

Status codes you'll see and what they mean in this app:
- **200/201** — success (201 on creates).
- **400** — bad input (validation, bad `:id`).
- **401** — not authenticated (→ frontend hard-logout).
- **403** — authenticated but wrong role.
- **404** — no such route / resource.
- **429** — rate-limited (60/min global, 10/15min auth, 20/min chat).
- **500** — server/DB error (and the `req.user`-missing edge case in roleMiddleware).

---

## E1.10 — Layer 9: back in the browser (axios → React)

1. **Response interceptor runs first.** If status is 401, the session is nuked and the page redirects to `/login` (E1.2c). Otherwise the response passes straight through.
2. **The promise resolves** in the component's `await`:
   ```js
   const res = await api.post("/contracts", payload);
   setStatusMsg("Offer sent!");            // setState
   ```
3. **`setState` triggers a re-render.** React diffs and patches the DOM — the user sees the success screen / the new row / the updated badge. For reads, the fetched array is dropped into `useState` and the list renders.

On the error branch, the component's `catch` shows the message (often `err.response?.data?.message`). For a 401 the redirect has usually already happened via the interceptor.

> **⚠️ Two HTTP styles (important nuance):** most calls use the `api` instance (with both interceptors). But the **offline layer** (`offlineApi.js` / `offlineQueue.js`, see E3) uses **raw `axios`** with a manually-attached auth header and **no 401 interceptor** — so an offline-queued mutation replayed with a stale token won't trigger the global logout. Deliberate, but a known seam.

---

## E1.11 — Three complete worked traces

### Trace A — a public read: `GET /api/listings/all` (Marketplace load)

```
Marketplace.jsx useEffect → fetchListingsOffline()           (offline wrapper; online path shown)
  → raw axios GET <backend>/api/listings/all                 (offline layer, no interceptors)
  → CORS → express.json → apiLimiter(60/min)                 global stack
  → listingRoutes → GET "/all" → listingController.getAllListings
  → pool.query("SELECT … FROM listings … ORDER BY created_at DESC")
  → res.json({ listings:[…] })
  → cached into IndexedDB (Dexie) for offline, returned {data:{listings, fromCache:false}}
  → setListings(...) → card grid renders
```
No auth needed — browsing is public. (That's a product choice; it also means `GET /api/listings/:id` exposes `farmer_phone` publicly — an honest privacy limit flagged in E2.)

### Trace B — an authenticated, role-gated, validated write: `POST /api/contracts` (buyer sends an offer)

```
ListingDetail.jsx handleContractSubmit
  → api.post("/contracts", { listing_id, quantity, offered_price, message, expected_delivery_date, buffer_pct })
  → REQUEST INTERCEPTOR adds Authorization: Bearer <jwt>
  → CORS → express.json(10mb) → apiLimiter
  → contractRoutes POST "/"
      → authMiddleware        ✔ verifies JWT, sets req.user={id,role:"buyer"}
      → roleMiddleware("buyer") ✔ role is buyer
      → validateContract      ✔ listing_id/quantity/offered_price/message OK
      → createContract        → pool.query(INSERT … status 'pending' RETURNING *)   [buyer_id = req.user.id]
  → res.status(201).json({ success:true, contract })
  → RESPONSE INTERCEPTOR: 201, not 401 → pass through
  → component shows "Offer sent"; farmer later sees it in FarmerContracts
```
Note: **no money moves yet.** The contract is created `pending`; escrow is created only when the **farmer accepts** (Trace in E2 — the `SERIALIZABLE` transaction).

### Trace C — a multipart upload with the GPS + AI pipeline: `POST /api/listings/create` (farmer creates a listing)

```
CreateListing.jsx → builds FormData(image, farm_registration_image, crop, qty, price, lat, lng, …)
  → api.post("/listings/create", formData)   (Content-Type multipart set by the browser)
  → REQUEST INTERCEPTOR adds Bearer <jwt>
  → CORS → (multipart skips express.json) → apiLimiter
  → listingRoutes POST "/create"
      → authMiddleware ✔ req.user = {id, role:"farmer"}
      → upload.fields([image, farm_registration_image])  → multer puts Buffers on req.files
      → listingController.createListing:
          1. OCR the farm_registration_image (tesseract) → parseGPSData → farm lat/lng  (E6/E2)
          2. upload both images to Supabase bucket "listings" → getPublicUrl()
          3. axios.post(AI_SERVICE_URL + "/predict/dynamic", form, {timeout:15s})
                → Python returns { total_tonnes, confidence_band }   (E6)
          4. pool.query(INSERT INTO listings (… predicted_yield, confidence_lower/upper, farm lat/lng, image urls …))
  → res.json({ success:true, listing, prediction })
  → component shows the AI-prediction result screen (predicted vs farmer-expected yield)
```
If the AI call fails, the controller sets `predicted_yield = 0` and **still creates the listing** — graceful degradation lives in the *controller*, not in `aiService` (which has no timeout and re-throws). This is the honest nuance from E6.

---

## E1.12 — Why the lifecycle is built this way (the reasons)

| Design choice | Why | Why not the alternative |
|---|---|---|
| **One axios instance + interceptors** | Auth + 401 handling in exactly one place; components stay dumb | Per-call token wiring = 100 copies of the same bug |
| **JWT in `localStorage`, `Bearer` header** | Stateless — any Render instance can verify without shared session store | Server sessions need sticky sessions / a session DB; harder to scale free-tier |
| **Fixed global middleware order** | Predictable: CORS → parse → throttle → route → auth → role → validate | Scattered per-route parsing/throttling drifts and leaks |
| **Rate-limit before routing** | Cheapest possible rejection of a flood — no route/DB work done | Limiting inside controllers wastes the work you're trying to shed |
| **Parameterized SQL only** | Injection-proof by construction | String-built SQL is the classic critical vuln |
| **Single shared `pg.Pool`** | Reuses TCP connections; one place to configure | A pool-per-request exhausts Postgres instantly |
| **Graceful AI/market degradation in controllers** | A down ML/price service must not block core commerce | Hard dependency = one service's outage takes down listings |
| **Server-side CORS** | The browser enforces origin; server declares the allowlist | Client can't be trusted to self-restrict |

---

## E1.13 — The honest seams (so you're never caught out)

- **No request timeout** on the axios instance — hung requests never auto-abort.
- **Rate limiter is in-memory, per-process, `req.ip`-keyed, no `trust proxy`** — weak behind Render's proxy and across replicas; resets on restart.
- **Auth 401 can't distinguish expired vs invalid**; no refresh token, no revocation list.
- **`roleMiddleware` returns 500 (not 401)** if it ever runs without `authMiddleware` ahead of it.
- **Signup/login bodies are not schema-validated server-side** (validators exist but aren't wired); only `authLimiter` protects them.
- **Multer has no size/MIME limit** — large uploads sit in 512 MB RAM.
- **Some routes lack auth/ownership checks** (e.g. `/api/updates/*`, crop-stage create/delete) and some reads expose PII (`farmer_phone`, profile email/phone) — catalogued honestly in E2.
- **The offline layer bypasses the interceptors** — stale-token replays won't trigger the global logout.

None of these break the happy path; all of them are the "what would you improve?" answers that read as senior.

---

### Next: **E2 — the backend, file by file** (server.js, config, middleware, every controller + route, services, utils) — expands each "organ" this spine passed through. Then **E3 (frontend file-by-file)**, **E4 (database — already delivered)**, **E5 (the complete user journey)**, **E6 (the AI service & its integration points)**.
