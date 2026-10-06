# Part 5 — Contract management (the deal lifecycle)

> **Group A.** **Covers:** what a forward contract is · the full state machine (offer → accept/reject → active → settle → dispute/freeze → resolve) · how contract value is calculated · why a state machine matters · how escrow and GPS hang off the contract.
> **Defends:** 🟢 **"contract management"** in bullet 2.

---

## 5.1 🟢 What a "contract" is here

A **contract** is the agreement between one buyer and one farmer to trade a specific crop at a specific price and quantity, created **before** harvest (a **forward contract**). It's the spine of the app: escrow money, GPS progress photos, milestones, and final settlement all **hang off a contract**.

A contract links three things: a **listing** (the crop), a **buyer**, and a **farmer**.

---

## 5.2 🔵 LEARN DEEP — the contract lifecycle as a state machine

A **state machine** means the contract is always in exactly **one named state**, and only **specific transitions** are allowed. This matters because it makes illegal actions impossible — you can't settle a contract that was never accepted, you can't accept one twice.

**The states & transitions (firsthand):**

```
         buyer makes offer
               │
               ▼
        ┌──────────────┐   farmer rejects   ┌──────────┐
        │   PENDING    │ ─────────────────▶ │ REJECTED │ (end)
        │ (offer sent) │                     └──────────┘
        └──────┬───────┘
               │ farmer accepts  → escrow is funded (Part 7)
               ▼
        ┌──────────────┐
        │    ACTIVE    │  ← farmer uploads GPS-verified stages (Part 6)
        │ (in progress)│  ← milestones release in stages (Part 7)
        └──────┬───────┘
               │ all milestones done → final settlement (Part 8)
               ▼
        ┌──────────────┐        dispute raised        ┌───────────┐
        │   SETTLED    │ ◀───── admin resolves ─────── │ DISPUTED  │
        │    (end)     │                                │ (frozen)  │
        └──────────────┘                                └───────────┘
```

- **PENDING** — buyer has made an offer; waiting on the farmer.
- **ACCEPTED/ACTIVE** — farmer accepted; **escrow is funded** at this moment (the buyer's money is locked). Progress and milestone releases happen here.
- **REJECTED** — farmer declined; nothing locked; end.
- **DISPUTED/FROZEN** — either party raised a dispute; funds are **frozen** (further releases return **423 Locked**) until an **admin resolves** it.
- **SETTLED** — all milestones released and final amount settled against the market price; end.

> **Say it:** *"A contract is a state machine — pending, active, settled, with reject and dispute branches. Accepting an offer is the trigger that funds escrow; settling happens only after milestones complete; a dispute freezes funds until an admin resolves. Modeling it as explicit states makes illegal transitions impossible."*

---

## 5.3 🔵 Contract value — the money math (firsthand)

The contract's total value is computed from quantity and price, with a unit-conversion that's worth knowing cold because interviewers probe numbers:

```
contract_value = quantity (tonnes) × price (₹/quintal) × 10
```

**Why ×10:** quantity is in **tonnes** but price is per **quintal**, and **1 tonne = 10 quintals**. So multiplying by 10 converts tonnes→quintals to match the price unit. (Full settlement math is in Part 8; escrow buffer math in Part 7.)

> **Say it:** *"Value is quantity in tonnes times price per quintal times ten, because a tonne is ten quintals — the ×10 reconciles the units."*

---

## 5.4 Who can do what (ties back to RBAC)

- Only a **buyer** can create a contract (make an offer) → `roleMiddleware("buyer")`.
- Only the **farmer** on that contract can accept/reject it — and the controller checks it's *their* contract, not just any farmer's (**ownership check**, not only role check).
- Only an **admin** can resolve a dispute.

**🔵 Role check vs ownership check (important nuance):** role middleware says "you're a farmer"; the controller *additionally* verifies "you're the farmer *on this specific contract*." Both are needed — otherwise farmer A could accept farmer B's contract.

> **Say it:** *"I check role in middleware and ownership in the controller — being a farmer isn't enough; you must be the farmer on that contract."*

---

## 5.5 How everything hangs off the contract

- **Escrow** (Part 7) is created when the contract goes ACTIVE and tracks money per contract.
- **Crop-stage photos** (Part 6) are uploaded against the contract and gate milestone releases.
- **Settlement** (Part 8) closes the contract using the live market price.

The contract is the **hub**; the rest are spokes.

---

## 5.6 What this part defends (green recap)

- 🟢 *"contract management"* → the whole lifecycle/state machine (5.2), value math (5.3), and role+ownership control (5.4).

---

## 5.7 Questions you'll get (with answers)

**Q: What does "contract management" mean in your project?**
> *"Managing the full lifecycle of a forward agreement between a buyer and farmer — creating an offer, accepting or rejecting, running it as active while progress and milestone payments happen, settling it, and handling disputes that freeze funds for admin resolution."*

**Q: Why model it as a state machine?**
> *"So only valid transitions are possible. You can't settle an unaccepted contract or accept one twice. The state is the single source of truth for what's allowed next."*

**Q: What happens when a farmer accepts an offer?**
> *"The contract becomes active and escrow is funded — the buyer's money is locked at that moment, which is what makes the rest of the deal trustworthy."*

**Q: What's a dispute and what does it do to the money?**
> *"Either party can raise one; it freezes the escrow so no further releases happen — attempts return 423 Locked — until an admin resolves it."*

**Q: How is the contract value calculated?**
> *"Quantity in tonnes times price per quintal times ten, because one tonne is ten quintals."*

**Q: How do you stop one farmer from accepting another farmer's contract?**
> *"Role middleware confirms they're a farmer; then the controller confirms they're the farmer on that specific contract — an ownership check on top of the role check."*

**Q: Can a buyer cancel after the farmer accepted?**
> *"Once accepted, funds are locked and progress can begin, so cancellation goes through the dispute path and admin resolution rather than a unilateral cancel — that protects the farmer who's started work."*

**Q: Where is the contract state stored?**
> *"As a status column on the contract row in PostgreSQL; transitions are writes guarded by the controller and, for money-moving ones, transactions (Part 7)."*

---

### ⚠️ HONEST LIMIT for this part
*"Dispute resolution is admin-manual — an admin decides and the system executes. For scale I'd add evidence attachments, a resolution audit trail, and clearer SLA states; the state machine is there, the tooling around disputes is minimal."*

---

### Next: Part 6 — GPS-based crop-stage verification (EXIF, OCR, Haversine, maps).
