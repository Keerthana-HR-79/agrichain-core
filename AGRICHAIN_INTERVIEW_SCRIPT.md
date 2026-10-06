# AgriChain — Interview Script (spoken)

> How to use it: **start with the Overview and stop.** Let them ask "tell me more" or "walk me through it." Then go into the Detailed walkthrough — in order, but pause between chunks so they can steer. Don't recite; these are your words to internalize.

---

## 1. THE OVERVIEW  (~45 seconds — say this first)

> "AgriChain is a platform that lets farmers and buyers agree crop deals in advance, with the payment held safely until the crop is actually delivered.
>
> The way it works: a farmer lists a crop, a buyer makes an offer, and when the farmer accepts, the buyer's money gets locked in escrow. Instead of paying all at once, the money is released in stages as the farmer proves progress with location-tagged photos of the growing crop, and the final amount is settled against the live market price at harvest.
>
> I built the whole thing end to end — the website, the backend, the database, and a small machine-learning service that predicts expected yield — and it's **deployed live**."

**Then stop.** That's your cue for them to ask a follow-up.

---

## 2. THE DETAILED WALKTHROUGH  (when they say "go deeper")

Deliver these as six short beats. Pause after each — they'll often jump in, which is good.

**Beat 1 — the problem (10 sec)**
> "The core problem is trust. A buyer doesn't want to pay upfront and hope the crop arrives; a farmer doesn't want to grow it and hope they get paid. So I built the platform around escrow — a neutral middle that holds the money and releases it fairly."

**Beat 2 — the main flow (30 sec)**
> "A farmer creates a listing for a crop. A buyer browses the marketplace and sends a contract offer — quantity, price, delivery date. When the farmer accepts, the system locks the buyer's funds in escrow, actually a bit more than the price as a buffer, and it splits the payment into five milestones. As the crop grows, the farmer uploads progress photos, and each milestone's money is released when that stage is verified. At harvest it settles up and any leftover buffer goes back to the buyer."

**Beat 3 — the hard part, escrow safety (30 sec — this is your flex)**
> "The part I'm most proud of is making the money safe under real conditions. If someone double-clicks 'release', or the network retries, you can't pay twice. So every money operation runs as one strict database transaction, I lock the specific contract so two actions on it can't overlap even across servers, and every request carries a one-time key so a repeat just replays the first result instead of paying again. Every movement is written to an append-only ledger, like a bank statement, and I wrote a test suite that proves the total locked always equals what's paid out plus what's refunded — money can't be created or lost."

**Beat 4 — proof of progress, the location check (25 sec)**
> "For the milestones to mean anything, progress has to be real. So each photo carries a location. I read it from the photo's metadata, and if that's missing I read it off the timestamp-and-GPS watermark some camera apps stamp on the image, and as a last resort the device location. Then I measure the distance from the farm's registered spot and only mark it verified if it's within about half a kilometre — and I show both points on a map so the buyer can see it. It's an honest 'verification with a tolerance', not something I'd claim is unspoofable."

**Beat 5 — the supporting pieces (25 sec)**
> "A couple of things support that loop. The settlement price comes from live government market data, with a fallback chain so if that feed is down the app still works and never shows a fake price as if it were live. There's a small machine-learning service that estimates expected yield when a farmer lists a crop — and if it's ever down, the listing still saves, it just skips the estimate. And on the security side, passwords are hashed, login is token-based with an email OTP step, and every sensitive action is re-checked on the server, not just hidden in the UI."

**Beat 6 — stack and deployment (20 sec)**
> "I kept the whole web side in one language — a React front end and a Node backend — and used a proper relational database specifically because it's money and I needed real transactions and locking. The machine-learning part is separate because those libraries are Python. It's all **deployed live** across a few hosting services, each doing what it's best at."

**Closing line (optional):**
> "So end to end: list, offer, accept, funds locked, released stage by stage on verified progress, settled at market price — with the money guaranteed safe the whole way through."

---

## 3. RÉSUMÉ POINTS  (simple, keeps the keywords that signal skill)

- Developed and deployed a full-stack agricultural marketplace (React, Node.js, Express, PostgreSQL) with REST APIs, JWT authentication, and email-OTP signup, supporting crop listings.
- Built role-based dashboards for farmers and buyers with contract management and GPS-based crop-stage verification — reading the photo's location from EXIF metadata with an OCR fallback, validating the distance against the registered farm, and plotting it on an interactive map.
- Built a milestone-based escrow system for staged contract payments, with final settlement linked to live mandi prices from the government's Agmarknet (data.gov.in) API.

> These keep the valuable keywords (full-stack, the stack, REST APIs, JWT, role-based, GPS/EXIF, interactive map, escrow, government API, deployed). Only the wordy bits were trimmed — the platform list after "deployed", "crop lifecycle management", and "market-linked settlement". If you paste into an ATS form, you can add a trailing line: *"Tech: React, Node.js, Express, PostgreSQL, Python."*

---

## Delivery reminders
- **Overview first, then silence.** The pause invites the question you want.
- **Lead the deep-dive with escrow** if they ask "what was hard" — it's your strongest 30 seconds.
- **Volunteer one honest limit** (the location check is a soft gate) — it reads as senior, not weak.
- **Say "deployed live" out loud** — it separates you from people with only local projects.
