/**
 * AgriChain — Escrow money-math invariants
 * ========================================
 * Pure-arithmetic replica of the escrow flow in controllers/escrowController.js
 * (accept → small staged advances → market settlement on delivered quantity).
 * No DB required.
 *
 * It proves the financial core is SOUND across every scenario:
 *   • settlement = live market price × the quantity ACTUALLY delivered,
 *   • payout is capped at the buyer's locked 110% (the 10% buffer),
 *   • the buyer never pays for crop that wasn't delivered (shortfall → refund),
 *   • money is conserved: released_to_farmer + refunded_to_buyer == total_locked,
 *   • only a catastrophic harvest (delivered value < the ~30% advanced) leaves the
 *     farmer "over-advanced" — flagged, never clawed back.
 *
 * NOTE: unlike the old design, the farmer has NO price floor — a fair,
 * market-neutral settlement. These formulas MUST stay in lock-step with
 * escrowController.js.
 *
 * Run:  node tests/escrow_math.test.js
 */

// ── Constants mirrored from escrowController.js ───────────────────────────────
const BUFFER_FACTOR = 1.10; // total_locked = 110% of contract value
const MILESTONE_SCHEDULE = [
  { order: 1, kind: "advance",  pct: 5 },
  { order: 2, kind: "progress", pct: 5 },
  { order: 3, kind: "progress", pct: 5 },
  { order: 4, kind: "progress", pct: 5 },
  { order: 5, kind: "progress", pct: 10 },
]; // 30% advanced progressively; ~70% settled at harvest

const EPS = 1e-6;
let passed = 0, failed = 0;
const approx = (a, b) => Math.abs(a - b) < EPS;
function check(name, cond, detail = "") {
  if (cond) { passed++; }
  else { failed++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
}

/**
 * Simulate one full contract lifecycle.
 * @param quantity          tonnes contracted
 * @param offeredPrice      ₹/quintal (contracted — used only for the locked amount)
 * @param marketPrice       ₹/quintal (live mandi at settlement)
 * @param releaseUpTo       how many milestones (by order) are advanced before settle
 * @param deliveredQuantity tonnes actually delivered (defaults to the full quantity)
 */
function runContract({ quantity, offeredPrice, marketPrice, releaseUpTo, deliveredQuantity }) {
  // ── At accept (createEscrowOnAccept) ────────────────────────────────────────
  const contract_value = quantity * offeredPrice * 10;       // 10 quintals / tonne
  const total_locked   = contract_value * BUFFER_FACTOR;
  const buffer_amount  = contract_value * 0.10;
  // Two-tranche funding: tranche 1 (30%) locked at accept funds the milestones;
  // tranche 2 (70% + buffer) locked before harvest. They sum to total_locked.
  const buffer_frac    = BUFFER_FACTOR - 1;                  // 0.10
  const tranche1       = contract_value * 0.30;
  const tranche2       = contract_value * (0.70 + buffer_frac);
  const milestones = MILESTONE_SCHEDULE.map((m) => ({
    ...m, amount: contract_value * (m.pct / 100), status: "locked",
  }));

  // ── Progressive advances (releaseAdvance + releaseMilestone) ────────────────
  let released_to_farmer = 0;
  for (const m of milestones) {
    if (m.order <= releaseUpTo) { m.status = "released"; released_to_farmer += m.amount; }
  }

  // ── Market settlement (settleEscrow): market price × delivered quantity ─────
  const agreed_quantity    = quantity;
  const delivered_tonnes   = Math.max(0, Math.min(
    deliveredQuantity != null ? deliveredQuantity : agreed_quantity, agreed_quantity));
  const delivered_quintals = delivered_tonnes * 10;

  const crop_value      = delivered_quintals * marketPrice;              // pure market × delivered
  const gross_payment   = Math.min(crop_value, total_locked);           // capped at locked
  const buffer_capped   = crop_value > total_locked;
  const effective_price = delivered_quintals > 0 ? gross_payment / delivered_quintals : 0;

  const already_paid    = released_to_farmer;
  const balance_due     = Math.max(0, gross_payment - already_paid);
  const over_advance    = Math.max(0, already_paid - gross_payment);
  const refund_to_buyer = Math.max(0, total_locked - Math.max(gross_payment, already_paid));

  released_to_farmer += balance_due; // escrow.released_to_farmer after settle

  return {
    contract_value, total_locked, buffer_amount, agreed_quantity, delivered_tonnes,
    tranche1, tranche2,
    crop_value, gross_payment, effective_price, buffer_capped,
    already_paid, balance_due, over_advance, refund_to_buyer, released_to_farmer,
  };
}

// ── Invariants asserted for EVERY scenario ────────────────────────────────────
function assertInvariants(label, inp, r) {
  // 1. Money conservation — nothing created or destroyed.
  check(`[${label}] conservation`,
    approx(r.released_to_farmer + r.refund_to_buyer, r.total_locked),
    `released ${r.released_to_farmer.toFixed(2)} + refund ${r.refund_to_buyer.toFixed(2)} != locked ${r.total_locked.toFixed(2)}`);

  // 2. Soundness — never pay out more than was locked.
  check(`[${label}] payout ≤ locked`,
    r.gross_payment <= r.total_locked + EPS && r.released_to_farmer <= r.total_locked + EPS,
    `gross ${r.gross_payment.toFixed(2)} / released ${r.released_to_farmer.toFixed(2)} > locked ${r.total_locked.toFixed(2)}`);

  // 3. No negative money anywhere.
  check(`[${label}] non-negative`,
    r.balance_due >= -EPS && r.refund_to_buyer >= -EPS && r.over_advance >= -EPS && r.gross_payment >= -EPS);

  // 4. Settlement = market price × delivered quantity, capped at the 110% ceiling.
  check(`[${label}] gross == min(market×delivered, locked)`,
    approx(r.gross_payment, Math.min(inp.marketPrice * r.delivered_tonnes * 10, r.total_locked)));

  // 4b. Two-tranche funding: the two locks sum to the eventual total, and
  // tranche 1 exactly covers the milestone advances (the 30% released in growth).
  check(`[${label}] tranche1 + tranche2 == total_locked`,
    approx(r.tranche1 + r.tranche2, r.total_locked));
  const msSum = MILESTONE_SCHEDULE.reduce((s, m) => s + m.pct, 0) / 100 * r.contract_value;
  check(`[${label}] tranche1 == sum of milestone %s`, approx(r.tranche1, msSum));

  if (r.over_advance <= EPS) {
    // 5. Normal case — farmer is paid exactly the (capped) market value delivered.
    check(`[${label}] farmer paid == gross (no over-advance)`,
      approx(r.released_to_farmer, r.gross_payment),
      `released ${r.released_to_farmer.toFixed(2)} != gross ${r.gross_payment.toFixed(2)}`);
    // 6. Buyer's net cost == what they got; the rest comes back.
    check(`[${label}] buyer refund == locked − gross`,
      approx(r.refund_to_buyer, r.total_locked - r.gross_payment));
  } else {
    // Catastrophic harvest: farmer keeps the advances (can't claw back), buyer
    // refunded everything not already paid out.
    check(`[${label}] over-advance: farmer keeps advances`,
      approx(r.released_to_farmer, r.already_paid));
    check(`[${label}] over-advance: refund == locked − advances`,
      approx(r.refund_to_buyer, r.total_locked - r.already_paid));
  }
}

// ── Scenarios ─────────────────────────────────────────────────────────────────
console.log("AgriChain escrow money-math invariants (market × delivered)\n");

const base = { quantity: 10, offeredPrice: 2000 }; // 10t @ ₹2000/Q → CV ₹2,00,000, locked ₹2,20,000

const scenarios = [
  // Full delivery, varying market price
  { label: "full, market == offered",        ...base, marketPrice: 2000, releaseUpTo: 5 },
  { label: "full, market falls 25%",         ...base, marketPrice: 1500, releaseUpTo: 5 },
  { label: "full, market +5% (within buffer)",...base, marketPrice: 2100, releaseUpTo: 5 },
  { label: "full, market +10% (boundary)",    ...base, marketPrice: 2200, releaseUpTo: 5 },
  { label: "full, market +25% (cap binds)",   ...base, marketPrice: 2500, releaseUpTo: 5 },
  // Quantity shortfall (the buyer-protection case)
  { label: "shortfall 6/10t, market stable",  ...base, marketPrice: 2000, releaseUpTo: 5, deliveredQuantity: 6 },
  { label: "shortfall 3/10t, market stable",  ...base, marketPrice: 2000, releaseUpTo: 3, deliveredQuantity: 3 },
  // Catastrophic harvest — advances exceed delivered value
  { label: "catastrophe 2/10t (over-advanced)", ...base, marketPrice: 2000, releaseUpTo: 5, deliveredQuantity: 2 },
  { label: "total crop failure 0t",           ...base, marketPrice: 2000, releaseUpTo: 5, deliveredQuantity: 0 },
];

for (const s of scenarios) {
  assertInvariants(s.label, s, runContract(s));
}

// ── Targeted expectations on the key cases ────────────────────────────────────
{
  // Price falls → farmer gets the LOWER market value (no floor); buyer pays real worth.
  const r = runContract({ ...base, marketPrice: 1500, releaseUpTo: 5 });
  check("fall: farmer == market value delivered", approx(r.released_to_farmer, 1500 * 10 * 10));
  check("fall: farmer BELOW contract value (no floor)", r.released_to_farmer < r.contract_value - EPS);
  check("fall: no over-advance", approx(r.over_advance, 0));
}
{
  // Price spikes past the buffer → farmer capped at 110%, zero refund.
  const r = runContract({ ...base, marketPrice: 2500, releaseUpTo: 5 });
  check("spike: cap triggered", r.buffer_capped === true);
  check("spike: farmer == total_locked (110%)", approx(r.released_to_farmer, r.total_locked));
  check("spike: refund == 0", approx(r.refund_to_buyer, 0));
  check("spike: effective price == 110% of offered", approx(r.effective_price, base.offeredPrice * BUFFER_FACTOR));
}
{
  // Shortfall → buyer pays ONLY for what was delivered; refund exceeds the buffer.
  const r = runContract({ ...base, marketPrice: 2000, releaseUpTo: 5, deliveredQuantity: 6 });
  check("shortfall: buyer pays delivered value only", approx(r.released_to_farmer, 2000 * 6 * 10));
  check("shortfall: refund > buffer (undelivered returned)", r.refund_to_buyer > r.buffer_amount + EPS);
  check("shortfall: no over-advance at 6/10t", approx(r.over_advance, 0));
}
{
  // Catastrophe → farmer over-advanced, flagged; conservation still holds.
  const r = runContract({ ...base, marketPrice: 2000, releaseUpTo: 5, deliveredQuantity: 2 });
  check("catastrophe: over-advance flagged", r.over_advance > EPS);
  check("catastrophe: over-advance == advances − crop value", approx(r.over_advance, 60000 - 40000));
  check("catastrophe: conservation holds", approx(r.released_to_farmer + r.refund_to_buyer, r.total_locked));
}
// Path-independence: with no over-advance, settlement lands identically no matter
// how many advances were released beforehand.
{
  const a = runContract({ ...base, marketPrice: 2100, releaseUpTo: 1 });
  const b = runContract({ ...base, marketPrice: 2100, releaseUpTo: 5 });
  check("path-independence: same farmer payout", approx(a.released_to_farmer, b.released_to_farmer));
  check("path-independence: same refund", approx(a.refund_to_buyer, b.refund_to_buyer));
}

// ── Result ────────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
