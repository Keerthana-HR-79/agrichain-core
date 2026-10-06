# Part 8 — Market-linked settlement (Agmarknet / data.gov.in)

> **Group A.** **Covers:** what a mandi / Agmarknet is · the government open-data API · "modal price" · scheduled jobs (cron) · caching · the 4-tier fallback chain · why settlement is tied to a live price.
> **Defends:** 🟢 **"final settlement linked to live mandi prices from the government's Agmarknet (data.gov.in) API"** in bullet 3.

---

## 8.1 🟢 The idea (say it first)

The agreed price is set *before* harvest, but the market moves. To be **fair at settlement**, AgriChain uses the **actual live mandi price** at settlement time (Part 7's `MAX(offered, market)`). So the farmer isn't underpaid if prices rose. This part is **where that live price comes from**.

> **Say it:** *"Settlement isn't frozen at the offer price — it's reconciled against the real government market price at harvest, so the farmer is paid fairly if the market moved up."*

---

## 8.2 🔵 LEARN DEEP — mandi, Agmarknet, modal price

- **Mandi** = a government-regulated agricultural wholesale market in India where crops are traded.
- **Agmarknet** = the Government of India portal that publishes **daily mandi commodity prices** across states/districts.
- **🔵 Modal price** = the **most frequently occurring** (most common) trade price for a commodity in a mandi that day — a robust "typical price," better than min or max for settlement. AgriChain uses **`modal_price`**.

> **Say it:** *"I use the modal price — the most common trade price in the mandi that day — from Agmarknet, because it's the representative market rate, not an outlier high or low."*

---

## 8.3 🔵 The data.gov.in API (firsthand)

Agmarknet data is exposed through **data.gov.in** as a REST endpoint returning JSON. AgriChain queries the Agmarknet **resource id `9ef84268-d588-465a-a308-a864a43d0070`**, filtering by commodity and location, and reads `modal_price` from the response.

- **API key:** the call needs an API key. The code has a **hardcoded fallback that is data.gov.in's *public sample* key** (documented in the code as a shared demo key — *not a secret*). For real use, each deployment sets its **own** `DATA_GOV_API_KEY` (the shared sample key is heavily throttled).

> **Say it:** *"It's a REST call to data.gov.in's Agmarknet resource, parsed for modal price. There's a public sample key as a fallback, but production should set its own key because the shared one is rate-limited."*

---

## 8.4 🔵 LEARN DEEP — scheduled jobs (cron) & caching

**Cron / scheduled job** = code that runs automatically on a schedule, not triggered by a user. AgriChain uses **`node-cron`** to **refresh prices daily at 06:00 IST**, so fresh prices are cached before the day's activity.

**Caching:** the latest fetched price is stored (cached) so that:
- settlement doesn't hit the external API on every request (speed + rate-limit safety), and
- if the API is down at settlement time, there's still a recent price to use.

**🔵 Why cache a price:** external APIs are slow and unreliable; a daily-refreshed cache gives fast, resilient reads. The cache is treated as valid for **< 25 hours** (just over a daily cycle, so one missed refresh doesn't immediately invalidate it).

> **Say it:** *"A node-cron job refreshes prices every morning at 6 IST and caches them, so settlement reads a fast local value and isn't at the mercy of the external API on the hot path."*

---

## 8.5 🔵 LEARN DEEP — the 4-tier fallback (the robustness story) 🟢

External data **will** sometimes be missing or down. AgriChain degrades gracefully through a **fallback chain**, and **labels the source** so you always know how trustworthy the number is:

```
1. CACHE  — if cached price is < 25h old            → use it            (source: data_gov_cached)
2. LIVE   — else fetch data.gov.in, trying narrow→broad:
              district price → state price → national price → use it    (source: data_gov)
3. LAST   — else fall back to the last known verified price             (last verified)
4. SIM    — else a simulated price (agreed price ± ~5%)                 (source: simulated)
```

- **Narrowing district→state→national** means "prefer the most *local* real price; if the district has no data today, widen the net" — you still get a real government number rather than nothing.
- **Source labels** (`data_gov`, `data_gov_cached`, `simulated`) are carried through so the UI/record is honest about whether the price is live, cached, or a last-resort estimate.

> **Say it (interview gold):** *"Prices come through a four-tier fallback: fresh cache, then a live data.gov.in call widening district→state→national, then the last verified price, then a simulated ±5% estimate — and every price is tagged with its source so the system is honest about how live the number is."*

---

## 8.6 How it ties into escrow settlement (Part 7)

At settlement, the escrow logic reads this market price and computes `MIN(MAX(offered, market) × quintals, total_locked)`. So **this part supplies the `market` input** to Part 7's settlement formula. The buffer (Part 7.3) exists precisely because this live number can exceed the agreed price.

---

## 8.7 What this part defends (green recap)

- 🟢 *"final settlement linked to live mandi prices"* → 8.1, 8.6 (settlement uses the live price).
- 🟢 *"government's Agmarknet (data.gov.in) API"* → 8.2, 8.3 (the real source + resource id + modal price).
- The depth that sells it: cron refresh (8.4) and the 4-tier labeled fallback (8.5).

---

## 8.8 Questions you'll get (with answers)

**Q: Where does the market price come from?**
> *"The government's Agmarknet data via the data.gov.in REST API — I read the modal price for the commodity and location."*

**Q: What's the modal price and why that one?**
> *"The most frequently occurring trade price that day — the representative rate, more robust than the min or max."*

**Q: What happens if the government API is down at settlement?**
> *"It degrades gracefully: fresh cache first, then a live call widening district→state→national, then the last verified price, then a simulated ±5% estimate — each tagged with its source so we know how live it is."*

**Q: Why cache prices? How long?**
> *"Speed and resilience — settlement reads a local value instead of calling a slow, rate-limited API on the hot path. The cache is treated as valid under 25 hours, just over a daily cycle."*

**Q: How are prices refreshed?**
> *"A node-cron job at 6 AM IST fetches and caches the day's prices before activity starts."*

**Q: Why try district then state then national?**
> *"Prefer the most local real price; if today's district data is missing, widen the search so you still get a genuine government figure rather than nothing."*

**Q: Is the API key in your code a secret?**
> *"No — that fallback is data.gov.in's public sample key, documented as a shared demo key. Production sets its own key because the shared one is throttled."*

**Q: How does this connect to escrow?**
> *"It supplies the live market price to the settlement formula — settlement pays the max of agreed and market price, capped at what's locked. The escrow buffer exists because this live price can be higher than agreed."*

**Q: Could you tie settlement to a price the client sends?** *(trap)*
> *"No — that would let a client inflate their own payout. The market price must be fetched server-side inside the settlement transaction. "* ⚠️ *(See honest limit below — be ready for the follow-up.)*

---

### ⚠️ HONEST LIMITS for this part
- **Server-authoritative price:** the market price must be resolved **server-side inside the settle transaction**, never trusted from the client — otherwise a user could inflate their payout. Flag this as the correct design and the thing to double-check in code.
- **Simulated tier is an estimate:** the ±5% simulated price is a last resort; it's labeled `simulated` precisely so it's never mistaken for a real market figure, but settlements that rely on it should arguably be flagged for review.

---

### Next: Part 9 — Deployment (Vercel, Render, Supabase, CORS, env vars, cold starts).
