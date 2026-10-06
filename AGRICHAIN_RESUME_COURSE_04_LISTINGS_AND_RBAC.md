# Part 4 — Crop listings & role-based dashboards (RBAC)

> **Group A.** **Covers:** what a listing is (the marketplace primitive) · image upload to object storage · what the farm coordinates are *for* · RBAC from basics · how farmer vs buyer dashboards differ · server-side role enforcement.
> **Defends:** 🟢 **"supporting crop listings"** and 🟢 **"role-based dashboards for farmers and buyers"** in bullets 1–2.

---

## 4.1 🟢 Crop listings — the marketplace primitive

A **listing** is a farmer's advertisement of a crop they will grow/sell: crop name, quantity, expected price, location (state/district), a photo, and the **farm's GPS coordinates**. It is the atom of the marketplace — buyers browse listings and make offers against them.

**In AgriChain (firsthand):**
- **`POST /api/listings`** (farmer only) — create a listing.
- **`GET /api/listings`** — browse (buyers see available crops).
- Each listing stores the **farm's latitude/longitude** — this is not decoration: it is the **anchor** the GPS crop-stage verification later measures against (Part 6). Register the farm's location once, at listing time; every progress photo is checked against it.

> **Say it:** *"A listing is the core marketplace object — crop, quantity, price, location, photo, and the farm's coordinates. Those coordinates are the reference point I later use to verify progress photos were actually taken at the farm."*

---

## 4.2 🔵 LEARN DEEP — image upload & object storage

Photos don't belong *in* the database — storing big binary files in PostgreSQL bloats it and slows it down. Instead:

- The image goes to **object storage** — **Supabase Storage** (a file store, like an S3 bucket) — and the database stores only the **URL** pointing to it.
- **🔵 Why separate storage:** databases are for structured, queryable data; blob stores are for large files served directly over HTTP/CDN. Keeping the DB lean keeps queries fast.

> **Say it:** *"Images go to Supabase Storage and I keep just the URL in Postgres — you don't put binaries in a relational DB; it bloats it and slows queries."*

---

## 4.3 🔵 LEARN DEEP — RBAC (Role-Based Access Control) from basics

**RBAC** = permissions are attached to **roles**, and users are given roles — instead of setting permissions per individual user. AgriChain has two roles: **`farmer`** and **`buyer`** (plus an admin capability for dispute resolution).

**The golden rule — enforce on the server, never the client:**
- The frontend *also* hides buttons by role (a buyer never sees "Create Listing") — but that's only **UX convenience**. Anyone can bypass the UI and call the API directly.
- So the **real** gate is **server-side role middleware**. This is the single most important security point in this part.

**In AgriChain (firsthand):**
- The role lives **inside the JWT** (`{ id, role }`, Part 3), so the server knows the role from the verified token — it can't be faked (tampering breaks the signature).
- **`roleMiddleware(...allowedRoles)`** runs after `authMiddleware`: it checks `req.user.role` is in the allowed set, else returns **403 Forbidden**.
- Example: `POST /api/listings` is wrapped with `roleMiddleware("farmer")`; a buyer calling it gets 403 even if they craft the request by hand.

> **Say it (interview gold):** *"Roles are enforced server-side in middleware, reading the role from the signed JWT. The frontend hiding buttons is just UX — the real authorization is a 403 from the role middleware, because anyone can bypass the UI and hit the API directly."*

---

## 4.4 🟢 Role-based dashboards (firsthand)

Same app, two different experiences driven by role:

| | **Farmer dashboard** | **Buyer dashboard** |
|---|---|---|
| Listings | create & manage own listings | browse all listings |
| Contracts | see offers received; accept/reject | make offers; track them |
| Crop stages | upload progress photos (GPS-verified) | view verified progress |
| Escrow | see staged releases as they earn | see money locked & released |

The **data** is scoped by role too: a farmer's dashboard queries *their* listings/contracts; a buyer's queries *theirs*. Role decides both **what you can do** (RBAC) and **what you see**.

> **Say it:** *"The dashboards are role-driven — farmers create listings and accept offers and upload progress; buyers browse, make offers, and watch verified progress and escrow. Role controls both the actions allowed and the data shown."*

---

## 4.5 What this part defends (green recap)

- 🟢 *"supporting crop listings"* → 4.1 (the listing object + its coordinates).
- 🟢 *"role-based dashboards for farmers and buyers"* → 4.3 + 4.4 (RBAC enforced server-side; two role-scoped dashboards).

---

## 4.6 Questions you'll get (with answers)

**Q: What is RBAC?**
> *"Role-based access control — permissions attached to roles, not individuals. I have farmer and buyer roles; each role can do a defined set of actions, enforced server-side."*

**Q: Where do you enforce roles — frontend or backend? Why?**
> *"Backend, in role middleware, reading the role from the signed JWT. The frontend hides buttons for UX, but that's not security — anyone can call the API directly, so the real gate is a 403 from the server."*

**Q: How does the server know a user's role?**
> *"It's a claim in the JWT. Auth middleware verifies the token and sets `req.user`, so the role is trustworthy — tampering with it breaks the signature."*

**Q: What stops a buyer from creating a listing by calling your API directly?**
> *"`roleMiddleware("farmer")` on that route. A buyer's token has role buyer, so the check fails and returns 403 before the controller runs."*

**Q: Why not store the crop photo in the database?**
> *"Binaries bloat a relational DB and slow queries. I put the image in Supabase object storage and keep just the URL in Postgres."*

**Q: Why store the farm's coordinates on the listing?**
> *"They're the reference point for GPS verification later — every crop-stage photo's location is measured against the registered farm coordinates."*

**Q: 401 vs 403 again, in this context?**
> *"401 = not authenticated (auth middleware, bad/missing token). 403 = authenticated but not authorized for this role (role middleware)."*

**Q: How would you add a third role, say an inspector?**
> *"Add the role to the enum, issue it in the JWT, and list it in the `roleMiddleware(...)` of the routes it may use. The pattern scales because authorization is centralized in middleware."*

---

### ⚠️ HONEST LIMIT for this part
*"My roles are coarse — two roles plus an admin action. For a bigger system I'd move toward permissions/scopes (e.g. `listing:create`) rather than hardcoding role names in each route, so access rules are data, not code."*

---

### Next: Part 5 — Contract management (the deal lifecycle).
