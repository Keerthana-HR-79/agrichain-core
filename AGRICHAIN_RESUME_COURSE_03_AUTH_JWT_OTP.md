# Part 3 — Authentication: JWT + email-OTP (from basics)

> **Group A.** **Covers:** authentication vs authorization · password hashing (bcrypt, salt, cost) · JWT structure, signing & verification · the signup + email-OTP flow · login + optional 2FA · anti-enumeration forgot-password · token storage.
> **Defends:** 🟢 **"JWT authentication"** and 🟢 **"email-OTP signup"** in bullet 1.

---

## 3.1 🔵 LEARN DEEP — authentication vs authorization

Two different questions, often confused:
- **Authentication (authn) = "who are you?"** — proving identity (login, token).
- **Authorization (authz) = "what are you allowed to do?"** — permissions (roles).

AgriChain does **authn** with JWT + password (this part) and **authz** with role middleware (Part 4). Saying this distinction cleanly instantly signals you understand security.

---

## 3.2 🔵 LEARN DEEP — password hashing (bcrypt)

**Never store passwords as plain text.** If the database leaks, every account is exposed. Instead, store a **hash**.

- **Hashing vs encryption:** encryption is *reversible* (you can decrypt). Hashing is **one-way** — you can't get the password back from the hash. At login you hash the entered password and compare hashes.
- **🔵 Salt:** a random value mixed into each password before hashing, so two users with the same password get *different* hashes, and precomputed "rainbow table" attacks don't work. bcrypt generates and stores the salt inside the hash string automatically.
- **🔵 Cost factor (work factor):** bcrypt is **deliberately slow**, and the cost factor sets *how* slow (each +1 doubles the work). Slow is good here — it makes brute-forcing stolen hashes expensive. AgriChain uses **cost 10**.

**In AgriChain (firsthand):** `bcrypt.hash(password, 10)` at signup/reset; `bcrypt.compare(entered, stored)` at login. The raw password is never stored.

> **Say it:** *"Passwords are bcrypt-hashed at cost 10 — one-way, salted, and deliberately slow so stolen hashes are expensive to crack. I compare hashes at login, never store plain text."*

---

## 3.3 🔵 LEARN DEEP — JWT, from basics (the core of this bullet)

**JWT = JSON Web Token.** After you log in, the server gives you a **signed token** that proves who you are. You send it with every later request; the server checks the signature instead of asking for your password again.

**🔵 Structure — three parts separated by dots:** `header.payload.signature`
1. **Header** — says it's a JWT and which algorithm signs it.
2. **Payload (claims)** — the data. AgriChain's payload is **`{ id, role }`** plus an expiry. ⚠️ The payload is only **base64-encoded, not encrypted** — anyone can read it. So you put *identifiers* there, never secrets like a password.
3. **Signature** — the header+payload signed with a **secret key** only the server knows (`JWT_SECRET`), using HMAC.

**🔵 Why it's tamper-proof:** if an attacker edits the payload (say, changes `role` to `admin`), the signature no longer matches, and `jwt.verify` rejects it — because they don't have the secret to re-sign. So the server *trusts* the role in the token **only because the signature proves the server itself issued it**.

**🔵 Why "stateless":** the server stores **nothing** about the session — all the needed info is inside the signed token. Any server instance can verify it with the secret. (Contrast: old-style sessions store a session record server-side and look it up each request.)

**🔵 Expiry:** AgriChain tokens expire in **7 days** (`expiresIn: "7d"`), limiting the damage window if a token is stolen.

**In AgriChain (firsthand):**
- **Issue** (on successful login/verify): `jwt.sign({ id, role }, JWT_SECRET, { expiresIn: "7d" })`.
- **Send:** the client attaches it as `Authorization: Bearer <token>` (via the axios interceptor, Part 2).
- **Verify** (`authMiddleware`): `jwt.verify(token, JWT_SECRET)` → sets `req.user = { id, role }`; on missing/invalid token → **401**.

> **Say it:** *"On login I sign a JWT carrying the user's id and role with a 7-day expiry. The client sends it as a Bearer token and the server verifies the signature on every request — stateless, no session store. The signature is why I can trust the role in the token: if anyone tampers with it, verification fails."*

---

## 3.4 The signup + email-OTP flow (firsthand) 🟢

🟢 **ON RESUME:** *"email-OTP signup."* **OTP = One-Time Password** — a short code you prove you received, confirming you own the email.

**Step by step:**
1. **`POST /api/auth/signup`** — validate inputs: name, email, password (**≥ 6 chars**), role must be **`farmer` or `buyer`**. Hash the password (bcrypt 10). Generate a **6-digit OTP** = `Math.floor(100000 + Math.random()*900000)`, with a **10-minute expiry**. Insert the user with **`is_verified = false`**. Email the OTP. Respond with `step: "verify_otp"`.
2. **`POST /api/auth/verify-otp`** — check the submitted code **matches** and **hasn't expired** → set **`is_verified = true`**, clear the OTP, and **auto-log-in** by issuing the JWT right there (so the user doesn't log in again).
3. **Login while still unverified** → the server re-sends a fresh OTP and returns **403** with a "verify your email" step, so a half-finished signup can always be completed.

**Why do this at all:** it proves the email is real and owned by the signer — stops fake/typo accounts and gives a channel for OTP/reset later.

> **Say it:** *"Signup sends a 6-digit OTP that expires in 10 minutes; the account stays `is_verified = false` until the code is confirmed, then it auto-logs the user in with a JWT."*

---

## 3.5 Login + optional 2FA (firsthand)

**`POST /api/auth/login`:**
1. Find the user by email; check the account is active.
2. `bcrypt.compare` the password → wrong → **401 "Incorrect password"**.
3. If **not verified** → **403**, resend OTP (finish signup first).
4. If **two-factor is enabled** → send a **login OTP** and require `verify-login-otp` before issuing the JWT.
5. Otherwise → issue the JWT immediately.

**🔵 2FA (two-factor authentication):** an optional *second* factor beyond the password — here a one-time email code at login. "Something you know" (password) + "something you have" (access to the inbox). Optional per user in AgriChain.

---

## 3.6 Anti-enumeration forgot-password (firsthand) — a senior detail

**`POST /api/auth/forgot-password`** always returns the **same** response — *"If an account exists for that email, a reset code has been sent."* — **whether or not** the email exists.

**🔵 Why:** if it said "no such user" for unknown emails but "code sent" for real ones, an attacker could **enumerate** which emails are registered by probing. Same response either way = no leak. (This is "anti-enumeration.")

> **Say it:** *"Forgot-password returns the same message whether or not the account exists, so an attacker can't harvest valid emails by probing — anti-enumeration."*

---

## 3.7 Token storage & the Bearer scheme ⚠️

- The token is sent as `Authorization: Bearer <token>` — "Bearer" means "whoever holds this token is granted access," so protecting it matters.
- AgriChain stores it in the browser's **`localStorage`**.

⚠️ **HONEST LIMIT (volunteer this):** *"localStorage is readable by JavaScript, so the relevant risk is XSS — if someone injected a script, they could read the token. The hardening step is an **HttpOnly cookie** (JS can't read it) plus a **Content-Security-Policy**. I made localStorage a conscious, known trade-off for simplicity, not an oversight."* Knowing the weakness is the win.

---

## 3.8 What this part defends (green recap)

- 🟢 *"JWT authentication"* → 3.3 + 3.5 (sign on login, verify every request, stateless, `{id, role}`, 7-day).
- 🟢 *"email-OTP signup"* → 3.4 (6-digit, 10-min, verify → auto-login).

---

## 3.9 Questions you'll get (with answers)

**Q: What is a JWT and how does it work?**
> *"A signed token carrying the user's id and role. On login I sign it with a server secret; the client sends it as a Bearer token; the server verifies the signature on every request and reads the id/role. Stateless — no session store."*

**Q: Where's the JWT stored, and what's the risk?**
> *"localStorage. The risk is XSS, since JS can read it. The fix is an HttpOnly cookie plus CSP — a known trade-off I made for simplicity."*

**Q: What stops a user editing their token to become an admin?**
> *"The signature. The payload is readable but not re-signable without the secret, so any edit makes `jwt.verify` fail. The server trusts the role only because the signature proves it issued the token."*

**Q: Is the JWT payload encrypted?**
> *"No — it's base64-encoded, readable by anyone. That's why I only put an id and role in it, never secrets. Integrity comes from the signature, not secrecy."*

**Q: Why hash passwords? Why bcrypt specifically? What's the cost factor?**
> *"So a DB leak doesn't expose passwords — hashing is one-way. bcrypt salts each password and is deliberately slow; the cost factor (10 here) sets how slow, making brute force expensive."*

**Q: What's a salt and why does it matter?**
> *"A random value mixed in before hashing so identical passwords get different hashes and rainbow-table attacks fail. bcrypt stores the salt inside the hash."*

**Q: Difference between authentication and authorization?**
> *"Authentication is who you are — the JWT and password. Authorization is what you're allowed to do — my role middleware. Different questions, handled separately."*

**Q: How does OTP signup work and why have it?**
> *"A 6-digit code, 10-minute expiry, emailed at signup; the account is unverified until it's confirmed, then auto-login. It proves the email is real and owned by the signer."*

**Q: What happens if the OTP expires?**
> *"Verification fails on the expiry check; logging in while unverified resends a fresh code, so signup can always be completed."*

**Q: Stateless JWT vs server sessions — trade-offs?**
> *"JWT scales horizontally — any instance verifies with the secret, no shared session store — but you can't instantly revoke a token before it expires. Sessions revoke easily but need a shared store. I chose JWT with a 7-day expiry for simplicity and scale."*

**Q: How would you revoke/log someone out with JWT?**
> *"Client-side I delete the token. True server-side revocation needs a denylist of token ids or short-lived access tokens plus refresh tokens — a reasonable next step; I kept it simple with expiry."*

**Q: How do you prevent email enumeration on forgot-password?**
> *"Same response whether or not the account exists, so probing reveals nothing."*

**Q: What's 2FA and do you have it?**
> *"A second factor beyond the password — here an optional email OTP at login: something you know plus something you have."*

---

## 3.10 Problem faced & solved (auth) — keep this ready

**P — OTP emails silently failing.**
- *Symptom:* signup OTPs sometimes never arrived, with no visible error.
- *Causes:* (1) the Gmail App Password was stored **with its display spaces**, which SMTP auth rejected; (2) the host (Render free tier) **blocks outbound SMTP ports**, so Gmail SMTP couldn't connect.
- *Fix:* stripped the spaces, then switched delivery to **SendGrid's HTTPS API** (not port-blocked), and added a **boot-time verification** so a bad email config fails **loudly in the logs** instead of silently for users.
- *Lesson:* *"Make external-dependency failures loud and early, and don't assume a host allows raw SMTP."*

---

### ⚠️ HONEST LIMITS recap for this part
- Token in localStorage (XSS) → HttpOnly cookie + CSP.
- No server-side token revocation → denylist or refresh-token rotation.

---

### Next: Part 4 — Crop listings & role-based dashboards (RBAC).
