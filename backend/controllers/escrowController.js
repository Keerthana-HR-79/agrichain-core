/**
 * AgriChain Escrow Controller — Phase 2 (ACID)
 * ==============================================
 *
 * Engineering decisions for SDE interviews:
 *
 * 1. SERIALIZABLE + SELECT FOR UPDATE
 *    Every escrow operation runs inside a SERIALIZABLE transaction.
 *    SELECT FOR UPDATE locks the row so concurrent requests queue up
 *    instead of racing. A double-click on "release advance" means the
 *    second request blocks, reads advance_released=true, returns 409.
 *
 * 2. 110% Buffer
 *    Buyer commits 110% of contract value at acceptance:
 *      - ~30% released as small GPS-verified advances during growth
 *      - the rest held until harvest
 *      - Extra 10% buffer covers the market price rising above the contracted price
 *    At settlement the deal is priced at the live market rate on the quantity
 *    actually delivered, and all unused locked funds are refunded to the buyer.
 *
 * 3. Append-only escrow_ledger
 *    Every money movement = one INSERT, never an UPDATE.
 *    This gives a complete audit trail identical to double-entry
 *    bookkeeping in fintech. Immutable by design.
 *
 * 4. Idempotency keys
 *    Client sends X-Idempotency-Key header. If we've seen the key before,
 *    we return the cached result. Prevents duplicate payments on retries.
 *
 * 5. pg_advisory_xact_lock
 *    Application-level mutex on contract_id. Only one escrow operation
 *    runs per contract at a time, even across multiple Node.js processes
 *    connected to the same PostgreSQL instance.
 */

const pool = require("../config/db");

// ─────────────────────────────────────────────────────────────────────────────
// STAGE-BASED RELEASE SCHEDULE (Phase 4)
// ─────────────────────────────────────────────────────────────────────────────
// The buyer's 110% buffer is locked at accept-time. Only a SMALL advance (~30%)
// trickles out as working capital while the crop grows — each slice unlocked by a
// GPS-tagged stage photo. Percentages are of the CONTRACT value.
//
//   order 1  Cultivation Advance    5%  — released up-front (funds the sowing)
//   order 2  Sowing Verified        5%  — needs a "Sowing" crop-stage photo
//   order 3  Vegetative Growth      5%  — needs a "Vegetative Growth" photo
//   order 4  Flowering Verified     5%  — needs a "Flowering" photo
//   order 5  Pre-Harvest Verified  10%  — needs a "Pre Harvest" photo
//                                  ───
//                                   30%  advanced progressively
//
// The remaining ~70% is settled at harvest by settleEscrow at the LIVE market
// price on the quantity ACTUALLY delivered — fair to both sides (no price floor,
// and the buyer never pays for crop that wasn't delivered). Unused locked funds
// are refunded to the buyer. stage_name must match crop_stages.stage_name.
const MILESTONE_SCHEDULE = [
  { order: 1, kind: "advance",  stage_name: null,                label: "Cultivation Advance",  pct: 5 },
  { order: 2, kind: "progress", stage_name: "Sowing",            label: "Sowing Verified",      pct: 5 },
  { order: 3, kind: "progress", stage_name: "Vegetative Growth", label: "Vegetative Growth",    pct: 5 },
  { order: 4, kind: "progress", stage_name: "Flowering",         label: "Flowering Verified",   pct: 5 },
  { order: 5, kind: "progress", stage_name: "Pre Harvest",       label: "Pre-Harvest Verified", pct: 10 },
];

/**
 * Simulate a payment-gateway transaction. No real gateway is wired up — this
 * mints a deterministic-looking reference so every money movement in the ledger
 * has a traceable id, exactly as it would with Razorpay/UPI in production.
 */
function mockPayment() {
  const ref = `MOCK-${Date.now().toString(36).toUpperCase()}-${Math.random()
    .toString(36).slice(2, 6).toUpperCase()}`;
  return { payment_ref: ref, status: "SUCCESS", method: "UPI (mock)", processed_at: new Date().toISOString() };
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run fn(client) inside a SERIALIZABLE transaction.
 * Auto-rollback on any error, auto-release connection.
 */
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Append one immutable entry to the escrow ledger.
 * Never called with UPDATE — insert only.
 */
async function ledgerInsert(client, {
  escrow_id, contract_id, entry_type,
  amount, running_balance, actor_id, actor_role, note, payment_ref,
}) {
  await client.query(
    `INSERT INTO escrow_ledger
       (escrow_id, contract_id, entry_type, amount,
        running_balance, actor_id, actor_role, reference_note, payment_ref)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [escrow_id, contract_id, entry_type, amount,
     running_balance, actor_id, actor_role, note || null, payment_ref || null]
  );
}

/**
 * Check idempotency key. Returns cached result if seen before.
 * Reserves the key on first call (result saved after success).
 */
async function checkIdempotency(client, key, user_id, operation) {
  if (!key) return null;
  const existing = await client.query(
    `SELECT result FROM idempotency_keys WHERE key = $1 AND user_id = $2`,
    [key, user_id]
  );
  if (existing.rows.length > 0 && existing.rows[0].result) {
    return existing.rows[0].result; // already processed — return cached
  }
  await client.query(
    `INSERT INTO idempotency_keys (key, user_id, operation)
     VALUES ($1,$2,$3) ON CONFLICT (key) DO NOTHING`,
    [key, user_id, operation]
  );
  return null;
}

async function saveIdempotencyResult(client, key, user_id, result) {
  if (!key) return;
  await client.query(
    `UPDATE idempotency_keys SET result = $1 WHERE key = $2 AND user_id = $3`,
    [JSON.stringify(result), key, user_id]
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. ACCEPT CONTRACT + CREATE ESCROW (110% buffer)
// Called from contractController.acceptContract
// ─────────────────────────────────────────────────────────────────────────────
const createEscrowOnAccept = async (client, { contract_id, farmer_id }) => {
  // Advisory lock: only one escrow creation per contract
  await client.query("SELECT pg_advisory_xact_lock($1)", [parseInt(contract_id)]);

  // Lock the contract row — prevents concurrent accepts
  const contractRes = await client.query(
    `SELECT * FROM contracts WHERE id = $1 AND farmer_id = $2 FOR UPDATE`,
    [contract_id, farmer_id]
  );
  if (contractRes.rows.length === 0) {
    throw Object.assign(new Error("Contract not found"), { status: 404 });
  }
  const contract = contractRes.rows[0];

  // Prevent duplicate escrow
  const existingEscrow = await client.query(
    `SELECT id FROM escrow WHERE contract_id = $1 FOR UPDATE`,
    [contract_id]
  );
  if (existingEscrow.rows.length > 0) {
    throw Object.assign(new Error("Escrow already exists for this contract"), { status: 409 });
  }

  // ── Configurable buffer calculation ───────────────────────────────────────
  // contract_value = quantity(tonnes) × price(₹/quintal) × 10 quintals/tonne.
  // The buyer chooses the buffer % at request time (default 10%, clamped 5–25%
  // in contractController). buffer_frac is that margin; total_locked adds it on
  // top of the contract value. The advance is now just 5% of contract value.
  const buffer_frac     = Math.min(0.25, Math.max(0.05,
                            (parseFloat(contract.buffer_pct) || 10) / 100));
  const locked_pct      = 100 * (1 + buffer_frac);   // e.g. 110 for a 10% buffer
  const contract_value  = parseFloat(contract.quantity) * parseFloat(contract.offered_price) * 10;
  const total_locked    = contract_value * (1 + buffer_frac); // contract + buffer
  const advance_amount  = contract_value * 0.05;   // 5% cultivation advance to farmer now
  const buffer_amount   = contract_value * buffer_frac; // safety margin
  const pending_amount  = contract_value - advance_amount; // balance at harvest

  // ── Create escrow record ──────────────────────────────────────────────────
  const escrowRes = await client.query(
    `INSERT INTO escrow
       (contract_id, buyer_id, farmer_id,
        advance_amount, pending_amount, final_amount,
        buffer_amount, buffer_pct, total_locked,
        status, locked_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',NOW())
     RETURNING *`,
    [
      contract_id, contract.buyer_id, farmer_id,
      advance_amount, pending_amount, contract_value,
      buffer_amount, locked_pct, total_locked,
    ]
  );
  const escrow = escrowRes.rows[0];

  // ── First ledger entry: buffer locked ─────────────────────────────────────
  await ledgerInsert(client, {
    escrow_id:       escrow.id,
    contract_id,
    entry_type:      "buffer_locked",
    amount:          total_locked,
    running_balance: total_locked,
    actor_id:        contract.buyer_id,
    actor_role:      "buyer",
    note: `${locked_pct.toFixed(0)}% buffer locked. Contract value: ₹${contract_value.toFixed(0)}, Buffer (${(buffer_frac * 100).toFixed(0)}%): ₹${buffer_amount.toFixed(0)}`,
  });

  // ── Seed the stage-based release schedule ─────────────────────────────────
  // One row per milestone; amounts are a fixed % of the contract value.
  // Idempotent via UNIQUE(contract_id, milestone_order).
  for (const ms of MILESTONE_SCHEDULE) {
    await client.query(
      `INSERT INTO escrow_milestones
         (escrow_id, contract_id, milestone_order, kind, stage_name, label, release_pct, amount, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'locked')
       ON CONFLICT (contract_id, milestone_order) DO NOTHING`,
      [escrow.id, contract_id, ms.order, ms.kind, ms.stage_name, ms.label, ms.pct,
       contract_value * (ms.pct / 100)]
    );
  }

  return { escrow, contract_value, advance_amount, total_locked, buffer_amount, locked_pct };
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. RELEASE ADVANCE (idempotent, locked)
// ─────────────────────────────────────────────────────────────────────────────
const releaseAdvance = async (req, res) => {
  try {
    const buyer_id       = req.user.id;
    const { contract_id } = req.params;
    const idem_key       = req.headers["x-idempotency-key"] ||
                           `advance-${contract_id}-${buyer_id}`;

    const result = await withTransaction(async (client) => {
      // Check idempotency first
      const cached = await checkIdempotency(client, idem_key, buyer_id, "release_advance");
      if (cached) return cached;

      // Advisory lock
      await client.query("SELECT pg_advisory_xact_lock($1)", [parseInt(contract_id)]);

      // Lock escrow + contract row together
      const escrowRes = await client.query(
        `SELECT escrow.*, contracts.status AS contract_status,
                contracts.dispute_status,
                contracts.farmer_id, contracts.listing_id
         FROM escrow
         JOIN contracts ON escrow.contract_id = contracts.id
         WHERE escrow.contract_id = $1 AND escrow.buyer_id = $2
         FOR UPDATE`,
        [contract_id, buyer_id]
      );

      if (escrowRes.rows.length === 0) {
        throw Object.assign(new Error("Escrow not found"), { status: 404 });
      }
      const escrow = escrowRes.rows[0];

      // Guard: already released?
      if (escrow.advance_released) {
        throw Object.assign(
          new Error("Advance already released — duplicate request blocked"),
          { status: 409 }
        );
      }

      if (escrow.contract_status !== "accepted") {
        throw Object.assign(
          new Error("Contract must be accepted before releasing advance"),
          { status: 400 }
        );
      }

      // Dispute freeze: no funds move while a dispute is open
      if (escrow.dispute_status === "open") {
        throw Object.assign(
          new Error("Funds are frozen — this contract has an open dispute awaiting admin review"),
          { status: 423 }
        );
      }

      const advance         = parseFloat(escrow.advance_amount);
      const new_balance     = parseFloat(escrow.total_locked) - advance;
      const payment         = mockPayment();

      // ── Update escrow (single atomic write) ──────────────────────────────
      await client.query(
        `UPDATE escrow
         SET status = 'advance_released',
             advance_released = true,
             advance_released_at = NOW(),
             released_to_farmer = released_to_farmer + $1,
             updated_at = NOW()
         WHERE id = $2`,
        [advance, escrow.id]
      );

      // Update contract advance_paid
      await client.query(
        `UPDATE contracts SET advance_paid = $1, updated_at = NOW() WHERE id = $2`,
        [advance, contract_id]
      );

      // Mark the advance milestone released (if the schedule exists)
      await client.query(
        `UPDATE escrow_milestones
         SET status = 'released', payment_ref = $1, released_at = NOW(), released_by = $2
         WHERE contract_id = $3 AND kind = 'advance' AND status = 'locked'`,
        [payment.payment_ref, buyer_id, contract_id]
      );

      // ── Ledger entry ──────────────────────────────────────────────────────
      await ledgerInsert(client, {
        escrow_id:       escrow.id,
        contract_id,
        entry_type:      "advance_released",
        amount:          advance,
        running_balance: new_balance,
        actor_id:        buyer_id,
        actor_role:      "buyer",
        note:            `5% cultivation advance released to farmer. Ref ${payment.payment_ref}`,
        payment_ref:     payment.payment_ref,
      });

      // Notify farmer
      const listingRes = await client.query(
        `SELECT listings.crop_name FROM listings
         JOIN contracts ON listings.id = contracts.listing_id
         WHERE contracts.id = $1`,
        [contract_id]
      );
      await client.query(
        `INSERT INTO notifications (user_id, title, message, type, reference_id, reference_type)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          escrow.farmer_id,
          "Advance Payment Released 💰",
          `₹${advance.toLocaleString("en-IN")} cultivation advance for ${listingRes.rows[0]?.crop_name} has been released!`,
          "payment_released", contract_id, "contract",
        ]
      );

      const outcome = {
        success:          true,
        advance_released: advance,
        remaining_locked: new_balance,
        payment_ref:      payment.payment_ref,
        escrow_status:    "advance_released",
      };

      await saveIdempotencyResult(client, idem_key, buyer_id, outcome);
      return outcome;
    });

    res.status(200).json(result);
  } catch (err) {
    console.error("Release advance error:", err);
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 2b. RELEASE A STAGE MILESTONE (idempotent, locked, ordered, stage-gated)
// Buyer releases the next progress milestone once the farmer has proven the
// matching crop stage with a GPS-tagged photo. Mock payment — no gateway.
// ─────────────────────────────────────────────────────────────────────────────
const releaseMilestone = async (req, res) => {
  try {
    const buyer_id = req.user.id;
    const { contract_id, milestone_id } = req.params;
    const idem_key = req.headers["x-idempotency-key"] ||
                     `milestone-${milestone_id}-${buyer_id}`;

    const result = await withTransaction(async (client) => {
      const cached = await checkIdempotency(client, idem_key, buyer_id, "release_milestone");
      if (cached) return cached;

      await client.query("SELECT pg_advisory_xact_lock($1)", [parseInt(contract_id)]);

      // Lock the milestone + its escrow together
      const mRes = await client.query(
        `SELECT m.*, e.status AS escrow_status, e.released_to_farmer,
                e.total_locked, c.status AS contract_status,
                c.dispute_status,
                c.farmer_id, c.listing_id
         FROM escrow_milestones m
         JOIN escrow e     ON m.escrow_id = e.id
         JOIN contracts c  ON m.contract_id = c.id
         WHERE m.id = $1 AND m.contract_id = $2 AND e.buyer_id = $3
         FOR UPDATE OF m, e`,
        [milestone_id, contract_id, buyer_id]
      );
      if (mRes.rows.length === 0) {
        throw Object.assign(new Error("Milestone not found"), { status: 404 });
      }
      const m = mRes.rows[0];

      if (m.contract_status !== "accepted") {
        throw Object.assign(new Error("Contract must be accepted before releasing payments"), { status: 400 });
      }
      // Dispute freeze: no funds move while a dispute is open
      if (m.dispute_status === "open") {
        throw Object.assign(
          new Error("Funds are frozen — this contract has an open dispute awaiting admin review"),
          { status: 423 }
        );
      }
      if (m.status === "released") {
        throw Object.assign(new Error("Milestone already released — duplicate request blocked"), { status: 409 });
      }
      if (m.kind === "advance") {
        throw Object.assign(new Error('Use "Release Advance" for the cultivation advance'), { status: 400 });
      }

      // Enforce order: every earlier milestone must already be released
      const prev = await client.query(
        `SELECT label, status FROM escrow_milestones
         WHERE contract_id = $1 AND milestone_order < $2
         ORDER BY milestone_order DESC LIMIT 1`,
        [contract_id, m.milestone_order]
      );
      if (prev.rows.length > 0 && prev.rows[0].status !== "released") {
        throw Object.assign(
          new Error(`Release "${prev.rows[0].label}" first`),
          { status: 400 }
        );
      }

      // Stage gate: the farmer must have uploaded the matching crop stage
      let gps_verified = false;
      if (m.stage_name) {
        const st = await client.query(
          `SELECT gps_verified FROM crop_stages
           WHERE listing_id = $1 AND stage_name = $2
           ORDER BY gps_verified DESC LIMIT 1`,
          [m.listing_id, m.stage_name]
        );
        if (st.rows.length === 0) {
          throw Object.assign(
            new Error(`Farmer hasn't uploaded the "${m.stage_name}" stage yet`),
            { status: 400 }
          );
        }
        gps_verified = st.rows[0].gps_verified;
      }

      const amount       = parseFloat(m.amount);
      const payment      = mockPayment();
      const new_released = parseFloat(m.released_to_farmer || 0) + amount;
      const new_balance  = parseFloat(m.total_locked) - new_released;

      // Mark milestone released
      await client.query(
        `UPDATE escrow_milestones
         SET status = 'released', payment_ref = $1, released_at = NOW(), released_by = $2
         WHERE id = $3`,
        [payment.payment_ref, buyer_id, m.id]
      );

      // Escrow: bump cumulative released, move into 'in_progress'
      await client.query(
        `UPDATE escrow
         SET released_to_farmer = released_to_farmer + $1,
             status = 'in_progress',
             updated_at = NOW()
         WHERE id = $2`,
        [amount, m.escrow_id]
      );

      // Keep contract.advance_paid in sync with total released (used at settlement)
      await client.query(
        `UPDATE contracts SET advance_paid = $1, updated_at = NOW() WHERE id = $2`,
        [new_released, contract_id]
      );

      await ledgerInsert(client, {
        escrow_id:       m.escrow_id,
        contract_id,
        entry_type:      "milestone_released",
        amount,
        running_balance: new_balance,
        actor_id:        buyer_id,
        actor_role:      "buyer",
        note: `${m.label} (${m.release_pct}%) released on verified ${m.stage_name} stage${
          gps_verified ? " ✅ GPS" : ""}. Ref ${payment.payment_ref}`,
        payment_ref:     payment.payment_ref,
      });

      // Notify farmer
      const crop = await client.query(
        "SELECT crop_name FROM listings WHERE id = $1", [m.listing_id]
      );
      await client.query(
        `INSERT INTO notifications (user_id, title, message, type, reference_id, reference_type)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          m.farmer_id,
          "Stage Payment Released 💰",
          `₹${amount.toLocaleString("en-IN")} released for ${crop.rows[0]?.crop_name} — ${m.label}.`,
          "payment_released", contract_id, "contract",
        ]
      );

      const outcome = {
        success:            true,
        milestone:          m.label,
        amount,
        payment_ref:        payment.payment_ref,
        gps_verified,
        released_to_farmer: new_released,
        remaining_locked:   new_balance,
        escrow_status:      "in_progress",
      };
      await saveIdempotencyResult(client, idem_key, buyer_id, outcome);
      return outcome;
    });

    res.status(200).json(result);
  } catch (err) {
    console.error("Release milestone error:", err);
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. MARKET-BASED FINAL SETTLEMENT
// ─────────────────────────────────────────────────────────────────────────────
const settleEscrow = async (req, res) => {
  try {
    const buyer_id              = req.user.id;
    const { contract_id }       = req.params;
    const { market_price_per_quintal, delivered_quantity } = req.body;
    const idem_key              = req.headers["x-idempotency-key"] ||
                                  `settle-${contract_id}-${buyer_id}`;

    if (!market_price_per_quintal || isNaN(market_price_per_quintal)) {
      return res.status(400).json({ success: false, message: "market_price_per_quintal is required" });
    }

    const result = await withTransaction(async (client) => {
      const cached = await checkIdempotency(client, idem_key, buyer_id, "settle_escrow");
      if (cached) return cached;

      await client.query("SELECT pg_advisory_xact_lock($1)", [parseInt(contract_id)]);

      // Lock contract + escrow
      const contractRes = await client.query(
        `SELECT contracts.*, escrow.id AS escrow_id,
                escrow.advance_amount, escrow.total_locked,
                escrow.released_to_farmer, escrow.advance_released,
                escrow.status AS escrow_status
         FROM contracts
         JOIN escrow ON escrow.contract_id = contracts.id
         WHERE contracts.id = $1 AND contracts.buyer_id = $2
         FOR UPDATE`,
        [contract_id, buyer_id]
      );

      if (contractRes.rows.length === 0) {
        throw Object.assign(new Error("Contract not found"), { status: 404 });
      }
      const c = contractRes.rows[0];

      if (c.status !== "accepted") {
        throw Object.assign(new Error(`Cannot settle: contract is ${c.status}`), { status: 400 });
      }
      if (c.escrow_status === "completed") {
        throw Object.assign(new Error("Escrow already settled"), { status: 409 });
      }
      // Dispute freeze: settlement is blocked while a dispute is open
      if (c.dispute_status === "open") {
        throw Object.assign(
          new Error("Cannot settle — this contract has an open dispute awaiting admin review"),
          { status: 423 }
        );
      }

      // ── Market settlement logic (fair: market price × delivered quantity) ──
      // The deal settles at the LIVE market price on the quantity ACTUALLY
      // delivered — not the contracted price, not the agreed quantity. The buyer
      // pays the real worth of what they received; the farmer is paid the real
      // worth of what they grew. Two guards keep the escrow sound:
      //   • payout is capped at total_locked (the buyer never owes more than the
      //     110% they locked — that buffer is the price-rise headroom), and
      //   • delivered quantity is capped at the agreed quantity (that's all the
      //     buyer contracted to buy).
      // The ~30% already advanced over the stages is reconciled against this and
      // the rest of the locked funds is refunded. If a catastrophic harvest means
      // the advances exceeded the crop's value, the excess can't be clawed back —
      // it's flagged (over_advance) and resolved via dispute.
      const market_price       = parseFloat(market_price_per_quintal);
      const agreed_quantity    = parseFloat(c.quantity);                        // tonnes contracted
      const dq_raw             = (delivered_quantity != null && delivered_quantity !== "" && !isNaN(delivered_quantity))
                                   ? parseFloat(delivered_quantity) : agreed_quantity;
      const delivered_tonnes   = Math.max(0, Math.min(dq_raw, agreed_quantity)); // never more than contracted
      const delivered_quintals = delivered_tonnes * 10;
      const total_locked       = parseFloat(c.total_locked);

      const crop_value         = delivered_quintals * market_price;             // pure market × delivered
      const gross_payment      = Math.min(crop_value, total_locked);            // capped at locked funds
      const buffer_capped      = crop_value > total_locked;                     // price spiked past the buffer
      const effective_price    = delivered_quintals > 0 ? gross_payment / delivered_quintals : 0;

      // already_paid = everything released so far (advance + stage milestones),
      // from escrow.released_to_farmer — the single cumulative source of truth.
      const already_paid       = parseFloat(c.released_to_farmer || 0);
      const balance_due        = Math.max(0, gross_payment - already_paid);     // top the farmer up to crop value
      const over_advance       = Math.max(0, already_paid - gross_payment);     // advanced > crop value (crop failure)
      const refund_to_buyer    = Math.max(0, total_locked - Math.max(gross_payment, already_paid));
      const payment            = mockPayment();

      // Update contract — record the market rate used + the actual delivered yield
      await client.query(
        `UPDATE contracts
         SET status = 'completed',
             market_price_at_settlement = $1,
             final_amount = $2,
             harvest_actual_yield = $3,
             updated_at = NOW()
         WHERE id = $4`,
        [market_price, gross_payment, delivered_tonnes, contract_id]
      );

      // Update escrow — increment (not overwrite) released_to_farmer by the
      // remaining balance so it lands exactly on the gross payment.
      await client.query(
        `UPDATE escrow
         SET status = 'completed',
             final_amount = $1,
             released_to_farmer = released_to_farmer + $2,
             refunded_to_buyer = $3,
             market_price_used = $4,
             settled_at = NOW(),
             updated_at = NOW()
         WHERE id = $5`,
        [gross_payment, balance_due, refund_to_buyer, effective_price, c.escrow_id]
      );

      // Any milestones not individually released are covered by this final
      // balance — mark them settled so the schedule reads as fully resolved.
      await client.query(
        `UPDATE escrow_milestones
         SET status = 'released', payment_ref = $1, released_at = NOW(), released_by = $2
         WHERE contract_id = $3 AND status = 'locked'`,
        [payment.payment_ref, buyer_id, contract_id]
      );

      // Ledger: balance_released
      await ledgerInsert(client, {
        escrow_id:       c.escrow_id,
        contract_id,
        entry_type:      "balance_released",
        amount:          balance_due,
        running_balance: refund_to_buyer,
        actor_id:        buyer_id,
        actor_role:      "buyer",
        note: `Final settlement: ${delivered_tonnes}t delivered at ₹${effective_price.toFixed(0)}/Q${
          buffer_capped ? " (capped at the 110% buffer ceiling)" : ""
        }. Crop value ₹${gross_payment.toFixed(0)}, balance paid ₹${balance_due.toFixed(0)}. Ref ${payment.payment_ref}`,
        payment_ref:     payment.payment_ref,
      });

      // Ledger: over-advance flag (catastrophic harvest — advances > crop value)
      if (over_advance > 0) {
        await ledgerInsert(client, {
          escrow_id:       c.escrow_id,
          contract_id,
          entry_type:      "over_advance",
          amount:          over_advance,
          running_balance: refund_to_buyer,
          actor_id:        null,
          actor_role:      "system",
          note: `⚠️ Advances (₹${already_paid.toFixed(0)}) exceeded delivered crop value (₹${gross_payment.toFixed(0)}) by ₹${over_advance.toFixed(0)} — short/low harvest. Not clawed back; raise a dispute if contested.`,
        });
      }

      // Ledger: refund of all unused locked funds to the buyer
      if (refund_to_buyer > 0) {
        await ledgerInsert(client, {
          escrow_id:       c.escrow_id,
          contract_id,
          entry_type:      "refund",
          amount:          refund_to_buyer,
          running_balance: 0,
          actor_id:        buyer_id,
          actor_role:      "buyer",
          note: `Unused escrow refunded to buyer: ₹${refund_to_buyer.toFixed(0)} (locked ₹${total_locked.toFixed(0)} − crop value ₹${gross_payment.toFixed(0)})`,
        });
      }

      // Notify farmer
      const listingRes = await client.query(
        "SELECT crop_name FROM listings WHERE id = $1", [c.listing_id]
      );
      const crop_name = listingRes.rows[0]?.crop_name;

      await client.query(
        `INSERT INTO notifications (user_id, title, message, type, reference_id, reference_type)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          c.farmer_id,
          "Final Payment Settled 💰",
          `${crop_name}: ${delivered_tonnes}t delivered, settled at the ₹${effective_price.toFixed(0)}/Q market rate. You received ₹${gross_payment.toLocaleString("en-IN")} in total.`,
          "payment_released", contract_id, "contract",
        ]
      );

      // Notify buyer if refund
      if (refund_to_buyer > 0) {
        await client.query(
          `INSERT INTO notifications (user_id, title, message, type, reference_id, reference_type)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [
            buyer_id,
            "Escrow Refund Processed 💸",
            `₹${refund_to_buyer.toLocaleString("en-IN")} of unused locked funds has been refunded to you.`,
            "payment_released", contract_id, "contract",
          ]
        );
      }

      const outcome = {
        success:           true,
        effective_price,
        delivered_tonnes,
        agreed_quantity,
        crop_value,
        gross_payment,
        already_paid,
        balance_due,
        over_advance,
        refund_to_buyer,
        buffer_capped,
        payment_ref:       payment.payment_ref,
        settlement_type:   "market_on_delivered",
      };

      await saveIdempotencyResult(client, idem_key, buyer_id, outcome);
      return outcome;
    });

    res.status(200).json(result);
  } catch (err) {
    console.error("Settlement error:", err);
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. GET ESCROW DETAILS + LEDGER
// ─────────────────────────────────────────────────────────────────────────────
const getEscrowByContract = async (req, res) => {
  try {
    const { contract_id } = req.params;
    const user_id         = req.user.id;

    const result = await pool.query(
      `SELECT escrow.*,
              f.name AS farmer_name, b.name AS buyer_name,
              listings.crop_name, listings.id AS listing_id,
              contracts.quantity, contracts.offered_price,
              contracts.status AS contract_status,
              contracts.advance_paid, contracts.final_amount,
              contracts.market_price_at_settlement,
              COALESCE((
                SELECT json_agg(mm) FROM (
                  SELECT m.id, m.milestone_order, m.kind, m.stage_name, m.label,
                         m.release_pct, m.amount, m.status, m.payment_ref, m.released_at,
                         (m.stage_name IS NULL OR EXISTS (
                            SELECT 1 FROM crop_stages cs
                            WHERE cs.listing_id = contracts.listing_id
                              AND cs.stage_name = m.stage_name
                         )) AS stage_ready
                  FROM escrow_milestones m
                  WHERE m.escrow_id = escrow.id
                  ORDER BY m.milestone_order
                ) mm
              ), '[]'::json) AS milestones
       FROM escrow
       JOIN users f    ON escrow.farmer_id  = f.id
       JOIN users b    ON escrow.buyer_id   = b.id
       JOIN contracts  ON escrow.contract_id = contracts.id
       JOIN listings   ON contracts.listing_id = listings.id
       WHERE escrow.contract_id = $1
       AND (escrow.farmer_id = $2 OR escrow.buyer_id = $2)`,
      [contract_id, user_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Escrow not found" });
    }

    // Fetch full ledger
    const ledger = await pool.query(
      `SELECT * FROM escrow_ledger
       WHERE contract_id = $1 ORDER BY created_at ASC`,
      [contract_id]
    );

    res.status(200).json({
      success: true,
      escrow:  result.rows[0],
      ledger:  ledger.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Error fetching escrow" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. GET MY ESCROWS (list)
// ─────────────────────────────────────────────────────────────────────────────
const getMyEscrows = async (req, res) => {
  try {
    const user_id = req.user.id;
    const role    = req.user.role;
    const where   = role === "buyer" ? "escrow.buyer_id = $1" : "escrow.farmer_id = $1";

    const result = await pool.query(
      `SELECT escrow.*,
              f.name AS farmer_name, b.name AS buyer_name,
              listings.crop_name, listings.id AS listing_id,
              contracts.quantity, contracts.offered_price,
              contracts.status AS contract_status,
              contracts.id AS contract_id,
              COALESCE((
                SELECT json_agg(mm) FROM (
                  SELECT m.id, m.milestone_order, m.kind, m.stage_name, m.label,
                         m.release_pct, m.amount, m.status, m.payment_ref, m.released_at,
                         (m.stage_name IS NULL OR EXISTS (
                            SELECT 1 FROM crop_stages cs
                            WHERE cs.listing_id = contracts.listing_id
                              AND cs.stage_name = m.stage_name
                         )) AS stage_ready
                  FROM escrow_milestones m
                  WHERE m.escrow_id = escrow.id
                  ORDER BY m.milestone_order
                ) mm
              ), '[]'::json) AS milestones
       FROM escrow
       JOIN users f    ON escrow.farmer_id  = f.id
       JOIN users b    ON escrow.buyer_id   = b.id
       JOIN contracts  ON escrow.contract_id = contracts.id
       JOIN listings   ON contracts.listing_id = listings.id
       WHERE ${where}
       ORDER BY escrow.created_at DESC`,
      [user_id]
    );

    res.status(200).json({ success: true, escrows: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Error fetching escrows" });
  }
};

module.exports = {
  createEscrowOnAccept,
  releaseAdvance,
  releaseMilestone,
  settleEscrow,
  getEscrowByContract,
  getMyEscrows,
};
