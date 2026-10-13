# AgriChain — Escrow & Settlement, Explained Part by Part

A from-basics, interview-ready deep dive on the money engine in `agrichain-core`.
Everything here is grounded in `backend/controllers/escrowController.js`,
`contractController.js`, `pdfController.js`, and `tests/escrow_math.test.js`.

Read it top to bottom once; after that, Parts 5–7 are the ones to memorize.

---

## PART 1 — What escrow is, and why AgriChain needs it

**Escrow** = a neutral third party holds the money until agreed conditions are met.

The core problem AgriChain solves is a **trust gap**: a buyer and a farmer agree on a
crop *months before harvest*. The buyer won't pay a stranger up front and hope the crop
arrives; the farmer won't grow it and hope the buyer pays. Neither trusts the other.

**AgriChain is the neutral party.** When a deal is struck it **locks the buyer's money**,
**releases it in small stages** as the farmer proves real GPS-verified progress, and
**settles the balance at harvest** against the live market price. Nobody has to trust the
other person — they both trust the platform's rules.

> **Say it:** *"The platform escrows the buyer's money so neither side has to trust the
> other — locked at acceptance, released in stages against GPS-verified proof, settled at
> the market rate on delivery."*

---

## PART 2 — The money lifecycle at a glance

```
 OFFER            ACCEPT                DURING GROWTH                 HARVEST
 (buyer)          (farmer)              (buyer releases)              (settle)
   │                 │                       │                           │
   │   buyer picks   │  lock 110% of value   │  5% advance (on accept)   │  pay market × delivered
   │   qty, price,   │  seed 5 milestones    │  +5% Sowing  (GPS photo)  │  cap at locked
   │   buffer %      │  ledger: buffer_locked│  +5% Vegetative           │  refund the rest
   │                 │                       │  +5% Flowering            │  flag over-advance
   ▼                 ▼                       │  +10% Pre-Harvest         ▼
 contracts        escrow + escrow_milestones │  = 30% advanced          escrow 'completed'
 (pending)        (status 'pending')         ▼  (ledger each release)   ledger: balance/refund
```

Three money phases: **lock (110%) → stage advances (30%) → settle (~70% at market).**
Every rupee movement writes one **append-only ledger row** (an audit trail).

---

## PART 3 — Accept-time: locking the 110% buffer

When the farmer accepts, `createEscrowOnAccept` runs **inside the same SERIALIZABLE
transaction as the accept** (so you can never end up accepted-but-no-escrow).

**The numbers:**
```
contract_value = quantity(tonnes) × offered_price(₹/quintal) × 10   // 1 tonne = 10 quintals
buffer_frac    = clamp(buffer_pct/100, 0.05, 0.25)                  // buyer chose it; default 0.10
total_locked   = contract_value × (1 + buffer_frac)                 // e.g. 110% of value
buffer_amount  = contract_value × buffer_frac                       // the 10% head-room
advance_amount = contract_value × 0.05                              // the 5% day-one advance
```

**Worked example** — 5 t of wheat @ ₹2,200/quintal, 10% buffer:
- `contract_value = 5 × 2200 × 10 =` **₹1,10,000**
- `total_locked   = 1,10,000 × 1.10 =` **₹1,21,000**  ← the buyer locks this
- `buffer_amount  =` **₹11,000** (the price-rise head-room)

**Why 110%?** The extra 10% is a cushion so that if the market *rises* by harvest, there's
locked money to pay the farmer the higher price — without asking the buyer for more. It's
the ceiling on how much the deal can move in the farmer's favour.

**Also at accept:** the code seeds 5 `escrow_milestones` rows (the release schedule, each a
% of contract value) and writes the first ledger entry `buffer_locked` for `total_locked`.

> **Say it:** *"At acceptance I lock 110% of the contract value in a single SERIALIZABLE
> transaction and seed the milestone schedule. The 10% buffer is pre-funded head-room for a
> price rise, capped so the payout can never exceed what the buyer locked."*

---

## PART 4 — During growth: the staged advances (30%)

Money trickles out to the farmer as **working capital**, each slice gated on a
**GPS-verified crop-stage photo** taken within 500 m of the registered farm.

| Milestone | % of value | Amount (on ₹1,10,000) | Gate |
|---|---|---|---|
| Cultivation Advance | 5% | ₹5,500 | farm GPS-verified + buyer clicks |
| Sowing | 5% | ₹5,500 | "Sowing" GPS photo |
| Vegetative Growth | 5% | ₹5,500 | "Vegetative Growth" GPS photo |
| Flowering | 5% | ₹5,500 | "Flowering" GPS photo |
| Pre-Harvest | 10% | ₹11,000 | "Pre Harvest" GPS photo |
| **Total advanced** | **30%** | **₹33,000** | |

Two functions do this:
- **`releaseAdvance`** — the 5%. Guards: farm **must be GPS-verified** (fraud gate), advance
  not already released (idempotent), contract accepted, no open dispute.
- **`releaseMilestone`** — the stage %s. Guards: **ordered** (the previous milestone must be
  released first), **stage-gated** (a matching `crop_stages` row must exist, and its
  `gps_verified` flag is recorded), idempotent, no open dispute.

Each release bumps `escrow.released_to_farmer` (the single cumulative source of truth) and
writes a ledger row.

**Why only 30% (it used to be 80%)?** Because the *remaining 70% is the buyer's protection*:
most of the money is still in escrow at harvest, so settlement can truly be fair. If a
farmer took 80% up front and then under-delivered, there'd be nothing left to true up.

> **Say it:** *"Advances are small and GPS-gated — the farmer physically proves work at the
> registered farm to unlock each slice. Keeping 70% for settlement is what lets me pay fairly
> on actual delivery."*

---

## PART 5 — Harvest: the settlement rework (the heart of it)

### 5.1 The old logic, and the two bugs
The original `settleEscrow` computed:
```
desired_price = max(offered_price, market_price)        // farmer floor
gross_payment = min(desired_price × AGREED_quintals, total_locked)
```
Two problems:
1. **One-sided price risk** — `max(offered, market)` gave the farmer a *guaranteed floor*.
   If the market **fell**, the buyer still paid the (higher) contracted price → buyer loss.
2. **Quantity risk on the buyer** — it multiplied by the **agreed** quantity. If the farmer
   delivered **less**, the buyer had still paid for the full amount → buyer loss.

### 5.2 The new inputs
Settlement now takes **two** things from the buyer:
- `market_price_per_quintal` — the live mandi rate (auto-filled from data.gov.in, editable)
- `delivered_quantity` — the tonnes the farmer **actually delivered**

### 5.3 The new formulas, line by line
```
market_price       = the live rate
agreed_quantity    = contract.quantity                               // tonnes contracted
delivered_tonnes   = max(0, min(delivered_quantity, agreed_quantity))// never more than agreed
delivered_quintals = delivered_tonnes × 10
total_locked       = what the buyer locked (110%)

crop_value      = delivered_quintals × market_price   // ← pure market × actual delivery
gross_payment   = min(crop_value, total_locked)       // ← cap: never pay beyond what's locked
buffer_capped   = crop_value > total_locked           // true only on a big price spike
effective_price = gross_payment / delivered_quintals  // the ₹/Q actually honoured

already_paid    = escrow.released_to_farmer           // the ~30% advanced in Part 4
balance_due     = max(0, gross_payment − already_paid)         // top the farmer up to crop value
over_advance    = max(0, already_paid − gross_payment)         // crop-failure flag
refund_to_buyer = max(0, total_locked − max(gross_payment, already_paid))  // everything unused back
```

**Reading each line in plain English:**
- `crop_value` — the real worth of what was delivered, at today's market.
- `gross_payment` — that, but never more than the buyer locked (the 110% cap keeps escrow solvent).
- `balance_due` — the farmer already got the advances; pay the difference up to the crop's value.
- `over_advance` — if advances *exceeded* the crop's value (bad harvest), this is the shortfall;
  it can't be clawed back, so it's **flagged** in the ledger and routed to dispute.
- `refund_to_buyer` — all locked money not owed to the farmer goes back to the buyer.

Then the code marks the contract/escrow `completed`, stores `market_price_at_settlement`,
`harvest_actual_yield = delivered_tonnes`, increments `released_to_farmer` by `balance_due`,
sets `refunded_to_buyer`, flips remaining milestones to `released`, and writes ledger rows:
`balance_released`, `over_advance` (if any), `refund` (if any).

> **Say it:** *"Settlement is market price × the quantity actually delivered, capped at the
> buyer's 110% lock, with everything unused refunded. No price floor, and the buyer never
> pays for crop that didn't arrive."*

---

## PART 6 — Worked examples (every scenario)

Base for all: **5 t @ ₹2,200/Q, 10% buffer** → `contract_value ₹1,10,000`,
`total_locked ₹1,21,000`, advances already paid `₹33,000` (the full 30%).

| # | Scenario | crop_value | gross (cap 1,21,000) | balance_due | refund_to_buyer | farmer total | notes |
|---|---|---|---|---|---|---|---|
| A | market = ₹2,200, 5 t | 1,10,000 | 1,10,000 | 77,000 | 11,000 | 1,10,000 | buffer returned |
| B | market **falls** ₹1,800, 5 t | 90,000 | 90,000 | 57,000 | 31,000 | 90,000 | **farmer below contract — no floor** |
| C | market rises ₹2,100, 5 t | 1,05,000 | 1,05,000 | 72,000 | 16,000 | 1,05,000 | farmer gains, partial refund |
| D | market = ₹2,420 (=+10%), 5 t | 1,21,000 | 1,21,000 | 88,000 | 0 | 1,21,000 | exactly the ceiling |
| E | market **spikes** ₹2,600, 5 t | 1,30,000 | 1,21,000 | 88,000 | 0 | 1,21,000 | **capped at +10%** |
| F | **shortfall** 3 t @ ₹2,200 | 66,000 | 66,000 | 33,000 | 55,000 | 66,000 | buyer pays for 3 t only |
| G | **catastrophe** 1 t @ ₹2,200 | 22,000 | 22,000 | 0 | 88,000 | 33,000 | **over_advance ₹11,000 flagged** |

Walk through the two that matter most:
- **B (price fall):** crop is worth 50 × ₹1,800 = ₹90,000. Farmer gets ₹90,000 (below the
  ₹1,10,000 contract value — this is the floor you *gave up*). Buyer pays real worth; ₹31,000
  (the undelivered-value + buffer) refunds. **No buyer loss.**
- **G (crop failure):** crop worth only ₹22,000 but ₹33,000 was already advanced.
  `balance_due = 0`, `over_advance = ₹11,000` (flagged, not clawed back), `refund = ₹88,000`.
  Conservation still holds: `released 33,000 + refund 88,000 = 1,21,000`. The buyer's only
  real loss is the ₹11,000 over-advance on a near-total failure → dispute path.

---

## PART 7 — The money invariant and the proof test

The reason you can *trust* this code is a single invariant that must hold in **every**
scenario:

```
released_to_farmer + refunded_to_buyer == total_locked      // money is conserved
```
plus `gross_payment ≤ total_locked` (never pay beyond locked) and no negative amounts.

`backend/tests/escrow_math.test.js` is a **pure-arithmetic replica** of the flow (no DB) that
runs **69 assertions** across price fall/equal/rise/boundary/spike, quantity shortfall, and
total crop failure — all pass. It's deliberately a *separate* re-implementation of the maths,
so it catches any drift in the controller's formulas.

> **Say it:** *"I prove the engine is sound with a conservation invariant —
> `released + refunded == locked` — checked by 69 scenario assertions. Money is never created
> or destroyed, and payout can never exceed what was locked."*

---

## PART 8 — The safety rails around settlement (ACID / concurrency)

Money breaks under concurrency, so every escrow operation runs with:
- **SERIALIZABLE isolation** — concurrent transactions behave as if run one after another.
- **`pg_advisory_xact_lock(contract_id)`** — an app-level mutex: only one escrow op per
  contract at a time, even across multiple Node processes.
- **`SELECT … FOR UPDATE`** — row locks the escrow/contract so a read-modify-write can't race.
- **Idempotency keys** (`X-Idempotency-Key`) — a repeated request returns the cached result;
  a double-click or retry can't double-pay.
- **Append-only ledger** — every movement is one INSERT with a running balance (never an
  UPDATE) → immutable audit trail, like double-entry bookkeeping.
- **Dispute freeze** — if a dispute is open, no funds move (settle/release throw 423).
- **`NUMERIC(15,2)`** for all money — never floating point.

> **Say it:** *"A double-click on 'release' blocks on the advisory lock, re-reads the state,
> and the idempotency key returns the cached result — so it can't double-pay."*

---

## PART 9 — Design decisions & trade-offs (own these)

1. **Removed the farmer price floor (`max(offered, market)` → pure market).**
   - *Why:* it was unfair to the buyer and economically one-sided.
   - *Trade-off:* the farmer loses downside protection. The contract is now a **committed,
     GPS-tracked, escrow-financed spot purchase**, not a price lock. I chose fairness/
     market-neutrality consciously.
2. **Kept the 110% cap.** Bounds the deal to ±10% so *neither* side wins or loses big, and
   guarantees payout ≤ locked (escrow stays solvent).
3. **Advances cut 80% → 30%.** Shrinks the buyer's at-risk exposure while still giving the
   farmer working capital; 70% stays for a fair settlement.
4. **Delivered quantity capped at agreed.** The buyer only contracted to buy that much.
5. **Residual risk = crop failure (over-advance).** Can't be solved by software alone; flagged
   and routed to dispute/admin. (Real-world answer: crop insurance.)

---

## PART 10 — Settlement interview Q&A

- **Q: Walk me through what happens when a contract settles.**
  → Buyer enters the live market price + delivered quantity. I compute crop_value = delivered
  quintals × market price, cap it at the locked 110%, pay the farmer the balance over what was
  advanced, and refund everything unused to the buyer — all in a SERIALIZABLE transaction with
  an append-only ledger.
- **Q: Market falls at harvest — who absorbs it?** → The farmer (no floor); the buyer pays the
  real market worth. Previously the buyer over-paid — that was the bug I fixed.
- **Q: Farmer delivers less than agreed?** → Buyer pays only for the delivered quantity; the
  rest refunds. The old code paid on agreed quantity — buyer loss.
- **Q: Market spikes 50% — does the buyer owe more?** → No. Payout is capped at the 110% they
  locked; the farmer gets the ceiling, not the full spike.
- **Q: How is the money provably correct?** → Conservation invariant + 69-assertion test.
- **Q: Double-release / race condition?** → SERIALIZABLE + advisory lock + FOR UPDATE +
  idempotency keys.
- **Q: What's the catch / trade-off?** → The farmer gives up a price floor, so it's a financed
  spot purchase; and a catastrophic harvest can leave an un-clawable over-advance, which I flag
  and send to dispute. Payments are also mocked (no live gateway).

---

### One-paragraph summary (say this if asked "explain your escrow")
> *"At acceptance I lock 110% of the contract value in a SERIALIZABLE transaction and seed a
> GPS-gated milestone schedule. During growth the farmer unlocks small advances (30% total) by
> proving each crop stage with a geo-tagged photo. At harvest I settle the balance at the live
> market price on the quantity actually delivered, capped at the locked amount, and refund the
> rest to the buyer. Every movement is an append-only ledger entry, and a conservation
> invariant — released + refunded == locked — is proven by 69 test assertions. The deliberate
> trade-off is that the farmer has no price floor, so the contract behaves like a committed,
> escrow-financed spot purchase."*
