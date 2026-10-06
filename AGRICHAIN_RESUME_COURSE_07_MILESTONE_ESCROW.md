# Part 7 — Milestone-based escrow (the money engine)

> **Group A — the hardest and most impressive part.** **Covers:** what escrow is · why staged/milestone payments · the money math (buffer, schedule, settlement) · ACID & transactions from basics · race conditions · SERIALIZABLE isolation · row locks (`SELECT FOR UPDATE`) · advisory locks · idempotency keys · the append-only ledger · the money invariant.
> **Defends:** 🟢 **"milestone-based escrow system for staged contract payments"** in bullet 3.

If you can explain this part well, you look senior. It's where interviewers dig hardest, because it's **concurrency + money** — the two things that are genuinely hard in software.

---

## 7.1 🔵 LEARN DEEP — what escrow is (from basics)

**Escrow** = a trusted third party holds money until agreed conditions are met. Neither side has to trust the other — they trust the holder's rules.

In AgriChain, **the platform is the escrow holder**. When a contract is accepted, the buyer's money is **locked** (held by the platform), and it's **released to the farmer in stages** as progress is proven. If things go wrong, the remainder can be **refunded**. No cash is handed over on blind trust.

> **Say it:** *"Escrow means the platform holds the buyer's money and releases it to the farmer only as conditions are met — so neither party has to trust the other, just the rules."*

---

## 7.2 🟢 Why *milestone-based* (staged) payments

Paying 100% upfront risks the buyer (farmer might not deliver); paying 100% at the end risks the farmer (buyer might not pay, and the farmer funded all the work). **Milestones split the risk**: money releases in chunks as the crop progresses, each chunk gated by a **GPS-verified crop-stage photo** (Part 6).

**The milestone schedule (firsthand):** 5 stages — **15% / 15% / 20% / 20% / 10%** released across the crop lifecycle, with the remainder settled at the end.

> **Say it:** *"Instead of one risky lump sum, payment is released across five milestones — 15, 15, 20, 20, 10 percent — each unlocked by a verified progress photo, so risk is shared over the season."*

---

## 7.3 🔵 The money math (know these numbers cold)

**Contract value** (from Part 5):
```
contract_value = quantity(tonnes) × price(₹/quintal) × 10      (1 tonne = 10 quintals)
```

**The 110% buffer (firsthand):** the platform locks a little **more** than the contract value — a **buffer** (default ~10%, so ~110% locked), **clamped between 5% and 25%**. 

**🔵 Why a buffer:** the *final* price is the live market price at settlement (Part 8), which can rise above the agreed price. The buffer pre-locks enough to cover a reasonable price rise so settlement doesn't fail for lack of funds. Clamping 5–25% keeps the buffer sane — never trivially small, never locking absurdly much of the buyer's cash.

**Settlement amount (firsthand):**
```
settlement = MIN( MAX(offered_price, market_price) × quintals , total_locked )
```
- **`MAX(offered, market)`** → the farmer gets at least the agreed price, and benefits if the market went up (fairness to the farmer).
- **`MIN(… , total_locked)`** → never pay out more than was actually locked (safety for the buyer / the system). The buffer is what makes the `MAX` branch usually fit under the cap.
- Anything locked but not released/paid is **refunded** to the buyer.

> **Say it:** *"I lock about 110% — a 5-to-25% buffer — because final settlement uses the live market price, which can exceed the agreed price. Settlement pays the max of agreed and market price, capped at what's locked; the rest is refunded."*

---

## 7.4 🔵 LEARN DEEP — ACID & transactions (the foundation)

Moving money is multiple steps — *decrease locked, increase released, write a ledger row, update the contract*. If the server crashes **between** steps, money could vanish or double. **Transactions** prevent that.

**ACID** (PostgreSQL guarantees it):
- **A — Atomicity:** all steps happen, or **none** do. A half-done transfer is impossible — it rolls back.
- **C — Consistency:** the DB moves from one valid state to another (constraints hold).
- **I — Isolation:** concurrent transactions don't see each other's half-finished work.
- **D — Durability:** once committed, it survives a crash/power loss.

**In AgriChain (firsthand):** every money operation runs inside `withTransaction(...)` — begin, do all steps, commit; on any error, **roll back** so nothing partial persists.

> **Say it:** *"Every money move is one ACID transaction — atomic, so it either fully happens or fully rolls back. There's no state where money left one place but didn't arrive in another."*

---

## 7.5 🔵 LEARN DEEP — the race condition (why isolation matters)

**The danger — double release.** Imagine the farmer (or a laggy network) triggers "release milestone 3" **twice at the same time**. Two requests run concurrently; both read "milestone 3 not yet released," both proceed, and the farmer is paid **twice**. That's a **race condition**.

AgriChain defends against this with **three layers**:

### (a) SERIALIZABLE isolation (firsthand)
The transactions run at PostgreSQL's **strictest isolation level, SERIALIZABLE** — the DB behaves as if concurrent transactions ran **one after another**, not interleaved. If two would conflict, one is aborted and must retry. This is the strongest correctness guarantee the DB offers.

### (b) `SELECT ... FOR UPDATE` — row locks (firsthand)
When a transaction reads the escrow/contract row, it uses **`SELECT FOR UPDATE`**, which **locks that row** so no other transaction can modify it until this one commits. The second concurrent release **waits** for the first to finish, then sees the updated state (milestone already released) and correctly refuses.

### (c) `pg_advisory_xact_lock` — advisory lock (firsthand)
An **advisory lock** is an application-defined lock keyed on, say, the contract id. Taking `pg_advisory_xact_lock(contract_id)` at the start **serializes all operations on one contract** — only one money operation per contract runs at a time, and the lock auto-releases at transaction end (`xact`). Belt-and-suspenders on top of row locks.

> **Say it (interview gold):** *"The real risk is a double release under concurrency. I defend in depth: SERIALIZABLE isolation so transactions can't interleave incorrectly, `SELECT FOR UPDATE` to lock the escrow row, and a per-contract advisory lock so only one money operation runs on a contract at a time."*

---

## 7.6 🔵 LEARN DEEP — idempotency keys (firsthand)

**Idempotent** = doing it **twice has the same effect as doing it once**. Money endpoints must be idempotent so a retry (user double-clicks, network retries) doesn't pay twice.

**In AgriChain:** release endpoints accept an **`X-Idempotency-Key`** header. The first request with a given key does the work and records the key + result; a repeat with the **same key** returns the **stored result** without doing the work again.

**🔵 Locks vs idempotency — different problems:** locks stop *simultaneous* double-spend; idempotency stops *sequential retries* of the same intended action. You want both.

> **Say it:** *"Each release carries an idempotency key, so a retried or double-submitted request returns the original result instead of paying again — locks handle concurrent duplicates, idempotency keys handle retried ones."*

---

## 7.7 🔵 LEARN DEEP — the append-only ledger (firsthand)

Rather than only keeping a running balance, AgriChain writes an **append-only ledger**: every money event (lock, each release, refund, settlement) is a **new immutable row**. You never edit or delete ledger rows.

**🔵 Why append-only:** it's an **audit trail** — you can reconstruct exactly what happened and when, which is essential for money. Editing balances in place hides history; appending events preserves it. (This is how real accounting works — double-entry, immutable journal.)

> **Say it:** *"Money movements are an append-only ledger — every lock, release, and refund is an immutable row. The balance is derived from events, so there's a full audit trail and nothing is silently overwritten."*

---

## 7.8 🟢 The money invariant (the proof it's correct)

The system guarantees, at all times:
```
total_locked == released + refunded        (+ still-held)
```
i.e. **money is conserved** — every rupee locked is accounted for as released, refunded, or still held. None created, none lost.

**Tested (firsthand):** a **53-assertion test** drives the escrow through its lifecycle and asserts this invariant holds at each step. That test is your evidence the money logic is correct.

> **Say it:** *"My core invariant is conservation of money — total locked always equals released plus refunded plus held. I have a 53-assertion test that walks the full lifecycle and checks that invariant at every step."*

---

## 7.9 The release flow, end to end (one story)

```
Farmer's verified crop-stage photo (Part 6) unlocks milestone N
        │
        ▼
POST /api/escrow/:contract_id/release-milestone   (X-Idempotency-Key: …)
        │
        ▼  withTransaction(SERIALIZABLE):
   1. pg_advisory_xact_lock(contract_id)         — only one op per contract
   2. check idempotency key                      — seen before? return stored result
   3. SELECT escrow row FOR UPDATE               — lock the row
   4. validate: contract ACTIVE, not frozen, milestone N not already released
        │  (already released → 409 · frozen by dispute → 423)
   5. compute this milestone's amount (schedule %)
   6. decrease held, increase released           — update balances
   7. INSERT ledger row (immutable)              — audit
   8. mockPayment()                              — simulate payout
   9. record idempotency key + result
        │
        ▼  COMMIT  (advisory + row locks auto-release)
Return success; buyer & farmer dashboards show the release
```

---

## 7.10 ⚠️ HONEST LIMIT — `mockPayment()` (volunteer this)

There is **no real payment gateway**. `mockPayment()` **simulates** the money moving — the escrow *accounting* is real (balances, ledger, locks, invariant), but no actual bank/UPI transfer happens.

> **Say it (confident, not apologetic):** *"The escrow engine — locking, staged release, refund, the ledger, the concurrency safety — is all real and tested. What's mocked is the actual bank transfer: `mockPayment()` stands in for a gateway like Razorpay or Stripe. I built the hard part — safe money accounting under concurrency — and left the gateway integration as a clearly-marked boundary."*

That's a **strong** answer: it shows you know exactly what's real vs simulated, and that you prioritized the genuinely hard problem.

---

## 7.11 What this part defends (green recap)

- 🟢 *"milestone-based escrow system"* → 7.1, 7.2 (escrow + 5-stage schedule).
- 🟢 *"staged contract payments"* → 7.2, 7.9 (per-milestone releases gated by verification).
- The depth that sells it: ACID (7.4), concurrency defense (7.5), idempotency (7.6), ledger (7.7), invariant + test (7.8).

---

## 7.12 Questions you'll get (with answers)

**Q: What is escrow and why did your app need it?**
> *"A trusted third party holding money until conditions are met. The app needed it because a buyer and farmer don't trust each other across a pre-harvest deal — the platform holds funds and releases them as progress is proven."*

**Q: Why milestone payments instead of one payment?**
> *"Upfront risks the buyer, end-payment risks the farmer. Five milestones — 15/15/20/20/10 — gated by verified progress share the risk across the season."*

**Q: What's the hardest correctness problem here?**
> *"Concurrency on money — a double release if the same milestone is triggered twice at once. I defend with SERIALIZABLE isolation, `SELECT FOR UPDATE` row locks, and a per-contract advisory lock."*

**Q: Explain ACID.**
> *"Atomicity — all or nothing; Consistency — constraints always hold; Isolation — concurrent transactions don't corrupt each other; Durability — committed data survives crashes. Postgres gives me all four, and every money op is one transaction."*

**Q: What's a race condition and how do you prevent a double-spend?**
> *"Two concurrent requests both reading 'not yet released' and both paying. Row-level `FOR UPDATE` locks make the second wait and then see the updated state; SERIALIZABLE and the advisory lock back that up."*

**Q: What's the difference between your locks and idempotency keys?**
> *"Locks stop simultaneous duplicates; idempotency keys stop sequential retries of the same request. A double-click in the same instant is the lock's job; a network retry a second later is the key's job."*

**Q: What is an idempotency key, concretely?**
> *"A client-supplied `X-Idempotency-Key`. First time, I do the work and store the result against the key; a repeat with the same key returns the stored result without re-paying."*

**Q: Why an append-only ledger?**
> *"Audit. Every money event is an immutable row, so I can reconstruct exactly what happened; the balance is derived from events rather than overwritten in place."*

**Q: How do you know the money logic is correct?**
> *"An invariant — total locked equals released plus refunded plus held — and a 53-assertion test that drives the full lifecycle and checks it at every step."*

**Q: What's the buffer for?**
> *"Settlement uses the live market price, which can exceed the agreed price, so I lock ~110% — a 5-to-25% clamped buffer — so a price rise doesn't leave settlement short. Unused buffer is refunded."*

**Q: How is the final settlement computed?**
> *"Max of agreed and market price times quintals, capped at the total locked — the farmer gets at least the agreed price and gains if the market rose, but payout never exceeds what was locked. Remainder refunds to the buyer."*

**Q: Is real money moving?** *(the honest one)*
> *"No — `mockPayment()` simulates the transfer. The accounting, locking, and ledger are real and tested; the bank-gateway integration is the one clearly-marked boundary I didn't build."*

**Q: SERIALIZABLE can abort transactions — how do you handle that?**
> *"A serialization failure means retry the transaction. Because the operations are idempotent and guarded by the idempotency key, a retry is safe and converges to one effect."*

**Q: What does a dispute do to escrow?**
> *"It freezes the contract — release attempts return 423 Locked — until an admin resolves, so funds can't move while contested."*

---

### ⚠️ HONEST LIMITS recap for this part
- **`mockPayment()`** — no real gateway; accounting is real, transfer is simulated.
- **In-process retries** on SERIALIZABLE aborts are simple; a high-volume system would need a more deliberate retry/queue strategy.

---

### Next: Part 8 — Market-linked settlement (Agmarknet / data.gov.in).
