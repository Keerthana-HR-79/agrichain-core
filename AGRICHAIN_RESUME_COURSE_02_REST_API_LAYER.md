# Part 2 — The REST API layer: how the frontend and backend talk

> **Covers:** what HTTP is (from basics) · what an API and REST are · JSON · how AgriChain's frontend calls the backend (axios, one instance, interceptors) · the middleware chain every request passes through.
> **Defends:** 🟢 **"REST APIs"** in bullet 1.

---

## 2.1 🔵 LEARN DEEP — HTTP, from basics

**HTTP** is the language browsers and servers use to talk over the internet. Every interaction is a **request** (browser asks) and a **response** (server answers).

**A request has four parts:**
1. **Method (verb)** — what you want to do.
2. **URL / path** — what you want to do it to (e.g. `/api/listings`).
3. **Headers** — metadata (who you are, what format you're sending).
4. **Body** — the data you're sending (for creates/updates).

**The methods you use (and AgriChain examples):**
| Method | Means | AgriChain example |
|---|---|---|
| `GET` | read, change nothing | `GET /api/listings` — browse crops |
| `POST` | create something | `POST /api/contracts` — buyer makes an offer |
| `PUT` / `PATCH` | update something | `PUT /api/contracts/:id/accept` — farmer accepts |
| `DELETE` | remove something | (used where a resource is removed) |

**🔵 Status codes** — the server's one-glance verdict. Memorise these; they come up constantly:
- **2xx = success:** `200 OK`, `201 Created`.
- **4xx = *you* (the client) did something wrong:** `400` bad input, `401` not logged in, `403` logged in but not allowed, `404` not found, `409` conflict (already done), `423` locked, `429` too many requests.
- **5xx = *the server* broke:** `500` internal error.

AgriChain deliberately uses the precise ones: **401** (no/you bad token), **403** (wrong role), **409** (milestone already released), **423** (funds frozen by a dispute), **429** (rate limit). Knowing *why* each is used is a great interview signal.

**🔵 "Stateless":** each HTTP request is independent — the server doesn't remember the last one. That's *why* every request must carry the JWT to prove who you are (Part 3). There's no server-side "logged-in session" being remembered.

---

## 2.2 🔵 LEARN DEEP — what an API and REST are

**API (Application Programming Interface):** a defined set of operations one program offers to another. Your backend's API is the list of URLs + methods the frontend is allowed to call. It's a **contract**: "call this URL this way, get this JSON back."

**REST (REpresentational State Transfer):** a *style* for designing that API around **resources** (nouns) and **HTTP verbs**:
- The noun is in the URL: `/listings`, `/contracts`, `/escrow`.
- The verb is the HTTP method: `GET` to read, `POST` to create, etc.
- So `GET /api/listings` = "read the listings", `POST /api/contracts` = "create a contract". You **don't** put the verb in the URL (not `/getListings`).

**🔵 JSON (JavaScript Object Notation):** the text format the data travels in — human-readable key/value pairs:
```json
{ "crop": "Tomato", "quantity": 5, "price": 2000, "state": "Karnataka" }
```
Both React and Node speak JSON natively, which is another reason the one-language stack is convenient.

🟢 **ON RESUME:** *"REST APIs"* = exactly this: resource-based URLs, HTTP verbs, JSON in and out.

---

## 2.3 How AgriChain's API is organised (firsthand)

The backend groups routes by resource:
- `POST /api/auth/signup`, `POST /api/auth/verify-otp`, `POST /api/auth/login` — accounts (Part 3)
- `GET /api/listings`, `POST /api/listings` — crop listings (Part 4)
- `POST /api/contracts`, `PUT /api/contracts/:id/accept`, `PUT /api/contracts/:id/reject` — contracts (Part 5)
- `POST /api/stages` — upload a crop-stage photo (Part 6)
- `POST /api/escrow/:contract_id/release-advance`, `/release-milestone`, `/settle` — money (Part 7)
- market-price endpoints backed by the Agmarknet service (Part 8)

`:id` / `:contract_id` are **route parameters** — placeholders filled by the real id, so one route handles any contract.

---

## 2.4 How the frontend calls it — one axios instance (firsthand)

The React app uses **axios** (an HTTP client) configured **once** in a single file, and every page imports that one instance. Two smart pieces:

1. **A base URL:** `baseURL = <backend URL>/api`, so pages call `api.get("/listings")` and the host is filled in automatically. The backend URL comes from a **build-time environment variable** (`VITE_API_URL`) — that's how the same code points at localhost in dev and at Render in production (Part 9).

2. **Interceptors** (code that runs on *every* request/response automatically):
   - **Request interceptor:** reads the JWT from the browser's `localStorage` and attaches it as `Authorization: Bearer <token>` — so **no page has to remember** to send the token.
   - **Response interceptor:** if any response is `401`, it logs the user out and bounces them to login — so an expired token is handled in **one place**.

> **Interview gold:** *"I centralised auth in one axios instance — a request interceptor attaches the token and a response interceptor auto-logs-out on 401 — so individual pages never deal with auth plumbing."*

---

## 2.5 🔵 LEARN DEEP — the middleware chain (the heart of Express)

**Middleware** = functions that run **in order** on every request before the final handler. Think of it as a security checkpoint line; each station can pass the request on (`next()`) or reject it. For a protected AgriChain route the order is:

```
Request
  │
  ├─▶ CORS            → is this frontend origin allowed to call me?      (Part 9)
  ├─▶ JSON body parse → turn the raw JSON body into a usable object
  ├─▶ Rate limiter    → too many requests from this IP? → 429
  ├─▶ authMiddleware  → verify the JWT; set req.user = {id, role}; else 401   (Part 3)
  ├─▶ roleMiddleware  → is req.user.role allowed here? else 403          (Part 4)
  ├─▶ controller      → the actual logic: read/write DB, return JSON
  │
  └─▶ Response (JSON)
```

The beauty: **auth and role checks are reusable middleware**, so every protected route gets the same guarantees without repeating code. The controller only runs if every checkpoint passed.

---

## 2.6 One full request, end to end (tell it as a story)

*"A buyer clicks 'Make Offer'. React's axios instance sends `POST /api/contracts` with the offer in the JSON body and the JWT attached automatically. On the server: CORS allows the origin, the body is parsed, the rate limiter is fine, `authMiddleware` verifies the token and sets `req.user`, `roleMiddleware` confirms the user is a buyer, and the controller writes a new `pending` contract to PostgreSQL and returns `201` with the created contract as JSON. React gets the JSON and updates the buyer's dashboard — no page reload."*

If you can tell that story, you own "REST APIs."

---

## 2.7 Questions you'll get (with answers)

**Q: What is REST?**
> *"An API style built around resources as URLs and HTTP verbs for actions — GET to read, POST to create — with JSON as the data format, and each request stateless and self-contained."*

**Q: What's the difference between 401 and 403?**
> *"401 means you're not authenticated — no or bad token. 403 means you *are* authenticated but not *authorised* — you're logged in but your role can't do this. I use 401 in auth middleware and 403 in role middleware."*

**Q: What does 'stateless' mean and why does it matter here?**
> *"The server doesn't remember past requests, so every request must prove who it is by carrying the JWT. That's exactly why auth is token-based rather than a server-side session."*

**Q: What is middleware?**
> *"Functions that run in order on every request before the handler — CORS, body parsing, rate limiting, auth, role check. Each can pass the request on or reject it. It lets me apply the same guarantees across routes without repeating code."*

**Q: How does the JWT get onto every request without you adding it each time?**
> *"One axios instance with a request interceptor that reads the token from localStorage and sets the Authorization header automatically, plus a response interceptor that logs out on a 401."*

**Q: What's a route parameter?**
> *"A placeholder in the URL like `/contracts/:id` that's filled with the real id at call time, so one route handles any contract."*

**Q: Is your API RESTful or REST-ish? (curveball)**
> *"It's resource-and-verb based with proper status codes, which is the core of REST. I'm pragmatic — a few action-style endpoints like `/escrow/:id/release-milestone` are verbs because they model a state transition, not a CRUD resource. I'd call that a reasonable, readable trade-off."*

**Q: How do you send data on a POST?**
> *"In the request body as JSON; Express's JSON middleware parses it into `req.body` for the controller."*

**Q: What's CORS?** *(brief here, full in Part 9)*
> *"Browsers block a page on one origin from calling an API on another origin unless the server opts in. So my backend whitelists the frontend's origin; otherwise the browser blocks the calls."*

---

### ⚠️ HONEST LIMIT for this part
*"My rate limiter is in-memory, so it's per-server-instance. If I ran multiple backend instances, the limit wouldn't be shared — I'd move it to Redis so the count is global."*

---

### Next: Part 3 — Authentication (JWT + email-OTP), from basics.
