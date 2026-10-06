/**
 * AgriChain — Escrow money-math invariants
 * ========================================
 * Pure-arithmetic replica of the escrow flow in controllers/escrowController.js
 * (accept → advance → stage milestones → market settlement). No DB required.
 *
 * It proves the financial core is SOUND across every market scenario:
 *   • farmer is paid the higher of contracted vs live mandi price,
 *   • the payout is capped at the buyer's locked 110% (the 10% buffer),
 *   • nothing is ever released beyond what was locked,
 *   • money is conserved: released_to_farmer + refunded_to_buyer == total_locked.
 *
 * Run:  node tests/escrow_math.test.js
 * These formulas MUST stay in lock-step with escrowController.js.
 */

// ── Constants mirrored from escrowController.js ───────────────────────────────
const BUFFER_FACTOR = 1.10; // total_locked = 110% of contract value
const MILESTONE_SCHEDULE = [
  { order: 1, kind: "advance",  pct: 15 },
  { order: 2, kind: "progress", pct: 15 },
  { order: 3, kind: "progress", pct: 20 },
  { order: 4, kind: "progress", pct: 20 },
  { order: 5, kind: "progress", pct: 10 },
];

const EPS = 1e-6;
let passed = 0, failed = 0;
const approx = (a, b) => Math.abs(a - b) < EPS;
function check(name, cond, detail = "") {
  if (cond) { passed++; }
  else { failed++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
}

/**
 * Simulate one full contract lifecycle.
 * @param quantity      tonnes
 * @param offeredPrice  ₹/quintal (contracted)
 * @param marketPrice   ₹/quintal (live mandi at settlement)
 * @param releaseUpTo   how many milestones (by order) are released before settle
 *                      (1 = advance only; 5 = advance + all 4 progress stages)
 */
function runContract({ quantity, offeredPrice, marketPrice, releaseUpTo }) {
  // ── At accept (createEscrowOnAccept) ────────────────────────────────────────
  const contract_value = quantity * offeredPrice * 10;       // 10 quintals / tonne
  const total_locked   = contract_value * BUFFER_FACTOR;
  const buffer_amount  = contract_value * 0.10;
  const milestones = MILESTONE_SCHEDULE.map((m) => ({
    ...m, amount: contract_value * (m.pct / 100), status: "locked",
  }));

  // ── Progressive releases (releaseAdvance + releaseMilestone) ────────────────
  let released_to_farmer = 0;
  for (const m of milestones) {
    if (m.order <= releaseUpTo) { m.status = "released"; released_to_farmer += m.amount; }
  }

  // ── Market settlement (settleEscrow) — capped at the buffer ceiling ─────────
  const quantity_quintals = quantity * 10;
  const desired_price     = Math.max(offeredPrice, marketPrice);
  const gross_payment     = Math.min(desired_price * quantity_quintals, total_locked);
  const buffer_capped     = desired_price * quantity_quintals > total_locked;
  const effective_price   = gross_payment / quantity_quintals;
  const already_paid      = released_to_farmer;
  const balance_due       = Math.max(0, gross_payment - already_paid);
  const refund_to_buyer   = Math.max(0, total_locked - gross_payment);
  const market_adjustment = Math.max(0, gross_payment - contract_value);

  released_to_farmer += balance_due; // escrow.released_to_farmer after settle

  return {
    contract_value, total_locked, buffer_amount, gross_payment, effective_price,
    buffer_capped, already_paid, balance_due, refund_to_buyer, market_adjustment,
    released_to_farmer,
  };
}

// ── Invariants asserted for EVERY scenario ────────────────────────────────────
function assertInvariants(label, inp, r) {
  const desired = Math.max(inp.offeredPrice, inp.marketPrice) * inp.quantity * 10;

  // 1. Money conservation — nothing created or destroyed.
  check(`[${label}] conservation`,
    approx(r.released_to_farmer + r.refund_to_buyer, r.total_locked),
    `released ${r.released_to_farmer.toFixed(2)} + refund ${r.refund_to_buyer.toFixed(2)} != locked ${r.total_locked.toFixed(2)}`);

  // 2. Soundness — never release more than was locked.
  check(`[${label}] payout ≤ locked`,
    r.gross_payment <= r.total_locked + EPS,
    `gross ${r.gross_payment.toFixed(2)} > locked ${r.total_locked.toFixed(2)}`);

  // 3. Farmer receives exactly the settled gross (all milestones + balance).
  check(`[${label}] farmer paid == gross`,
    approx(r.released_to_farmer, r.gross_payment),
    `released ${r.released_to_farmer.toFixed(2)} != gross ${r.gross_payment.toFixed(2)}`);

  // 4. Farmer gets the higher of offered/market, capped at the 110% ceiling.
  check(`[${label}] higher-of price, capped`,
    approx(r.gross_payment, Math.min(desired, r.total_locked)));

  // 5. No negative money anywhere.
  check(`[${label}] non-negative`,
    r.balance_due >= -EPS && r.refund_to_buyer >= -EPS && r.market_adjustment >= -EPS);

  // 6. Farmer never worse off than the contracted value.
  check(`[${label}] farmer ≥ contract value`,
    r.released_to_farmer >= r.contract_value - EPS,
    `got ${r.released_to_farmer.toFixed(2)} < contract ${r.contract_value.toFixed(2)}`);
}

// ── Scenarios ─────────────────────────────────────────────────────────────────
console.log("AgriChain escrow money-math invariants\n");

const base = { quantity: 10, offeredPrice: 2000 }; // 10t @ ₹2000/Q → CV ₹2,00,000

const scenarios = [
  // market BELOW contracted → farmer keeps contracted price, full 10% refunded
  { label: "market < offered (advance only)",  ...base, marketPrice: 1500, releaseUpTo: 1 },
  { label: "market < offered (all stages)",    ...base, marketPrice: 1500, releaseUpTo: 5 },
  // market EQUAL → contracted price, full buffer refunded
  { label: "market == offered",                ...base, marketPrice: 2000, releaseUpTo: 3 },
  // market ABOVE but WITHIN the 10% buffer → farmer gains, partial refund
  { label: "market +5% (within buffer)",       ...base, marketPrice: 2100, releaseUpTo: 5 },
  // market EXACTLY at the buffer ceiling → farmer gets 110%, zero refund
  { label: "market +10% (buffer boundary)",    ...base, marketPrice: 2200, releaseUpTo: 5 },
  // market ABOVE the buffer → capped at 110%, cap flag set, zero refund
  { label: "market +25% (cap binds)",          ...base, marketPrice: 2500, releaseUpTo: 5 },
  { label: "market +100% (hard cap)",          ...base, marketPrice: 4000, releaseUpTo: 2 },
];

for (const s of scenarios) {
  const r = runContract(s);
  assertInvariants(s.label, s, r);
}

// ── Targeted expectations on the boundary cases ───────────────────────────────
{
  const r = runContract({ ...base, marketPrice: 1500, releaseUpTo: 1 });
  check("below-market: refund == full buffer (10%)",
    approx(r.refund_to_buyer, r.buffer_amount));
  check("below-market: cap NOT triggered", r.buffer_capped === false);
  check("below-market: farmer == contract value",
    approx(r.released_to_farmer, r.contract_value));
}
{
  const r = runContract({ ...base, marketPrice: 2500, releaseUpTo: 5 });
  check("above-buffer: cap IS triggered", r.buffer_capped === true);
  check("above-buffer: farmer == total_locked (110%)",
    approx(r.released_to_farmer, r.total_locked));
  check("above-buffer: refund == 0", approx(r.refund_to_buyer, 0));
  check("above-buffer: effective price == 110% of offered",
    approx(r.effective_price, base.offeredPrice * BUFFER_FACTOR));
}
{
  const r = runContract({ ...base, marketPrice: 2100, releaseUpTo: 5 });
  check("within-buffer: farmer == market gross",
    approx(r.released_to_farmer, 2100 * base.quantity * 10));
  check("within-buffer: partial refund remains",
    r.refund_to_buyer > 0 && r.refund_to_buyer < r.buffer_amount);
}
// Independence of the release path: settlement lands identically no matter how
// many milestones were released beforehand (proves the already_paid fix).
{
  const a = runContract({ ...base, marketPrice: 2100, releaseUpTo: 1 });
  const b = runContract({ ...base, marketPrice: 2100, releaseUpTo: 5 });
  check("path-independence: same farmer payout",
    approx(a.released_to_farmer, b.released_to_farmer));
  check("path-independence: same refund",
    approx(a.refund_to_buyer, b.refund_to_buyer));
}

// ── Result ────────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
