const pool = require("../config/db");
const { createEscrowOnAccept, settleEscrow } = require("./escrowController");

// =====================
// BUYER: Create Contract Request
// =====================
const createContract = async (req, res) => {
  try {
    const buyer_id = req.user?.id;
    if (!buyer_id) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    const {
      listing_id,
      quantity,
      offered_price,
      message,
      expected_delivery_date,
      buffer_pct,
    } = req.body;

    if (!listing_id || !quantity || !offered_price) {
      return res.status(400).json({ success: false, message: "listing_id, quantity, and offered_price are required" });
    }

    // Buffer % is the buyer's safety margin locked on top of contract value.
    // Default 10% (→110% locked). Clamp to a sane 5–25% range so a typo can't
    // lock an absurd amount or leave no market headroom at all.
    let buffer = parseFloat(buffer_pct);
    if (isNaN(buffer)) buffer = 10;
    buffer = Math.min(25, Math.max(5, buffer));

    // Get farmer from listing
    const listingResult = await pool.query(
      `SELECT farmer_id, crop_name FROM listings WHERE id = $1`,
      [listing_id]
    );

    if (listingResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Listing not found" });
    }

    const { farmer_id, crop_name } = listingResult.rows[0];

    // Get buyer name
    const buyerResult = await pool.query("SELECT name FROM users WHERE id = $1", [buyer_id]);
    const buyer_name = buyerResult.rows[0]?.name || "A buyer";

    const result = await pool.query(
      `INSERT INTO contracts
        (listing_id, buyer_id, farmer_id, quantity, offered_price, message, expected_delivery_date, buffer_pct, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
       RETURNING *`,
      [listing_id, buyer_id, farmer_id, quantity, offered_price, message || null, expected_delivery_date || null, buffer]
    );

    const contract = result.rows[0];

    // Notify farmer
    await pool.query(
      `INSERT INTO notifications (user_id, title, message, type, reference_id, reference_type)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        farmer_id,
        "New Contract Request 📋",
        `${buyer_name} wants to buy ${quantity} tons of ${crop_name} at ₹${offered_price}/quintal`,
        "contract_request",
        contract.id,
        "contract",
      ]
    );

    res.status(201).json({ success: true, contract });
  } catch (error) {
    console.error("Create contract error:", error);
    res.status(500).json({ success: false, message: "Error creating contract" });
  }
};

// =====================
// FARMER: Accept Contract
// =====================
const acceptContract = async (req, res) => {
  const client = await pool.connect();
  try {
    const farmer_id = req.user.id;
    const { id } = req.params;
    const { farmer_response_message } = req.body;

    await client.query("BEGIN");
    await client.query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");

    // pg_advisory_xact_lock: only one accept per contract at a time
    await client.query("SELECT pg_advisory_xact_lock($1)", [parseInt(id)]);

    // SELECT FOR UPDATE: lock contract row, prevent concurrent accepts
    const contractResult = await client.query(
      "SELECT * FROM contracts WHERE id = $1 AND farmer_id = $2 FOR UPDATE",
      [id, farmer_id]
    );

    if (contractResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "Contract not found" });
    }

    const contract = contractResult.rows[0];

    if (contract.status !== "pending") {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: `Contract already ${contract.status} — duplicate request blocked`
      });
    }

    // Update contract status
    const updated = await client.query(
      `UPDATE contracts
       SET status = 'accepted', farmer_response_message = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [farmer_response_message || null, id]
    );

    // Create escrow with the buyer's chosen buffer (ACID — same transaction)
    const { escrow, contract_value, advance_amount, total_locked, buffer_amount, locked_pct } =
      await createEscrowOnAccept(client, { contract_id: id, farmer_id });

    // Notify buyer (still inside transaction — if this fails, whole thing rolls back)
    const listingResult = await client.query(
      "SELECT crop_name FROM listings WHERE id = $1", [contract.listing_id]
    );
    const crop_name = listingResult.rows[0]?.crop_name;

    await client.query(
      `INSERT INTO notifications (user_id, title, message, type, reference_id, reference_type)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        contract.buyer_id,
        "Contract Accepted ✅",
        `Your contract for ${crop_name} has been accepted! ` +
        `₹${total_locked.toLocaleString("en-IN")} (${Math.round(locked_pct)}% buffer) is now locked in escrow.`,
        "contract_accepted", id, "contract",
      ]
    );

    await client.query("COMMIT");

    res.status(200).json({
      success: true,
      contract: updated.rows[0],
      escrow: {
        id:             escrow.id,
        contract_value: contract_value,
        advance_amount: advance_amount,
        buffer_amount:  buffer_amount,
        total_locked:   total_locked,
        status:         "pending",
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Accept contract error:", error);
    res.status(error.status || 500).json({ success: false, message: error.message || "Error accepting contract" });
  } finally {
    client.release();
  }
};

// =====================
// FARMER: Reject Contract
// =====================
const rejectContract = async (req, res) => {
  try {
    const farmer_id = req.user.id;
    const { id } = req.params;
    const { farmer_response_message } = req.body;

    const contractResult = await pool.query(
      "SELECT * FROM contracts WHERE id = $1 AND farmer_id = $2",
      [id, farmer_id]
    );

    if (contractResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Contract not found" });
    }

    const contract = contractResult.rows[0];

    if (contract.status !== "pending") {
      return res.status(400).json({ success: false, message: "Contract already processed" });
    }

    const updated = await pool.query(
      `UPDATE contracts
       SET status = 'rejected', farmer_response_message = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [farmer_response_message || null, id]
    );

    const listingResult = await pool.query("SELECT crop_name FROM listings WHERE id = $1", [contract.listing_id]);
    const crop_name = listingResult.rows[0]?.crop_name;

    // Notify buyer
    await pool.query(
      `INSERT INTO notifications (user_id, title, message, type, reference_id, reference_type)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        contract.buyer_id,
        "Contract Rejected ❌",
        `Your contract request for ${crop_name} was not accepted by the farmer.`,
        "contract_rejected",
        id,
        "contract",
      ]
    );

    res.status(200).json({ success: true, contract: updated.rows[0] });
  } catch (error) {
    console.error("Reject contract error:", error);
    res.status(500).json({ success: false, message: "Error rejecting contract" });
  }
};

// =====================
// FARMER: Get My Contracts
// =====================
const getFarmerContracts = async (req, res) => {
  try {
    const farmerId = req.user.id;

    const result = await pool.query(
      `SELECT
        contracts.*,
        users.name AS buyer_name,
        users.email AS buyer_email,
        listings.crop_name,
        listings.land_size,
        listings.predicted_yield
       FROM contracts
       JOIN users ON contracts.buyer_id = users.id
       JOIN listings ON contracts.listing_id = listings.id
       WHERE contracts.farmer_id = $1
       ORDER BY contracts.created_at DESC`,
      [farmerId]
    );

    res.status(200).json({ success: true, contracts: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Error fetching contracts" });
  }
};

// =====================
// BUYER: Get My Contracts
// =====================
const getBuyerContracts = async (req, res) => {
  try {
    const buyerId = req.user.id;

    const result = await pool.query(
      `SELECT
        contracts.*,
        users.name AS farmer_name,
        users.email AS farmer_email,
        listings.crop_name,
        listings.land_size,
        listings.predicted_yield,
        listings.image_url,
        listings.state,
        listings.district
       FROM contracts
       JOIN users ON contracts.farmer_id = users.id
       JOIN listings ON contracts.listing_id = listings.id
       WHERE contracts.buyer_id = $1
       ORDER BY contracts.created_at DESC`,
      [buyerId]
    );

    res.status(200).json({ success: true, contracts: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Error fetching contracts" });
  }
};

// =====================
// SETTLEMENT: Market Price Based
// =====================
// NOTE: This used to be a separate, non-transactional implementation that
// duplicated escrowController.settleEscrow but skipped the ACID transaction,
// the idempotency check, the escrow_ledger entries, and — critically — the
// 110% buffer refund / already-paid-advance math. Two different frontend
// pages (buyer-contracts and escrow) both trigger a "settle" action, so both
// must run the exact same correct logic. This now delegates to
// escrowController.settleEscrow instead of re-implementing it.
const settleContract = async (req, res) => {
  req.params.contract_id = req.params.id;
  return settleEscrow(req, res);
};

// =====================
// DISPUTE PATH
// =====================
// Either party (the contract's buyer OR farmer) can raise a dispute on an
// accepted/completed contract — e.g. crop quality, quantity, or a payment
// disagreement. An admin then resolves or rejects it. This is intentionally
// lightweight: one open dispute per contract, tracked with columns on the
// contracts row rather than a separate table.

// BUYER or FARMER: raise a dispute
const raiseDispute = async (req, res) => {
  try {
    const user_id = req.user.id;
    const { id }  = req.params;
    const { reason } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, message: "A dispute reason is required" });
    }

    // Only a party to the contract can dispute it, and only once it's live.
    const cRes = await pool.query(
      `SELECT * FROM contracts
       WHERE id = $1 AND (buyer_id = $2 OR farmer_id = $2)`,
      [id, user_id]
    );
    if (cRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Contract not found" });
    }
    const contract = cRes.rows[0];

    if (!["accepted", "completed"].includes(contract.status)) {
      return res.status(400).json({ success: false, message: "Only accepted or completed contracts can be disputed" });
    }
    if (contract.dispute_status === "open") {
      return res.status(409).json({ success: false, message: "A dispute is already open for this contract" });
    }

    const updated = await pool.query(
      `UPDATE contracts
       SET dispute_status = 'open',
           dispute_reason = $1,
           dispute_raised_by = $2,
           dispute_raised_at = NOW(),
           dispute_resolution = NULL,
           dispute_resolved_at = NULL,
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [reason.trim(), user_id, id]
    );

    const raiser_role = contract.buyer_id === user_id ? "buyer" : "farmer";
    const other_party = raiser_role === "buyer" ? contract.farmer_id : contract.buyer_id;

    // Notify the other party
    await pool.query(
      `INSERT INTO notifications (user_id, title, message, type, reference_id, reference_type)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        other_party,
        "Dispute Raised ⚠️",
        `The ${raiser_role} has raised a dispute on your contract. An admin will review it.`,
        "dispute", id, "contract",
      ]
    );

    // Notify all admins so someone can act
    await pool.query(
      `INSERT INTO notifications (user_id, title, message, type, reference_id, reference_type)
       SELECT id, $1, $2, $3, $4, $5 FROM users WHERE role = 'admin'`,
      [
        "New Contract Dispute ⚠️",
        `A ${raiser_role} raised a dispute: "${reason.trim().slice(0, 120)}"`,
        "dispute", id, "contract",
      ]
    );

    res.status(200).json({ success: true, contract: updated.rows[0] });
  } catch (error) {
    console.error("Raise dispute error:", error);
    res.status(500).json({ success: false, message: "Error raising dispute" });
  }
};

// ADMIN: list all open disputes
const getDisputes = async (req, res) => {
  try {
    const status = req.query.status || "open";
    const result = await pool.query(
      `SELECT contracts.*,
              b.name AS buyer_name, f.name AS farmer_name,
              r.name AS raised_by_name,
              listings.crop_name
       FROM contracts
       JOIN users b       ON contracts.buyer_id  = b.id
       JOIN users f       ON contracts.farmer_id = f.id
       LEFT JOIN users r  ON contracts.dispute_raised_by = r.id
       JOIN listings      ON contracts.listing_id = listings.id
       WHERE contracts.dispute_status = $1
       ORDER BY contracts.dispute_raised_at DESC`,
      [status]
    );
    res.status(200).json({ success: true, disputes: result.rows });
  } catch (error) {
    console.error("Get disputes error:", error);
    res.status(500).json({ success: false, message: "Error fetching disputes" });
  }
};

// ADMIN: resolve or reject a dispute
const resolveDispute = async (req, res) => {
  try {
    const { id } = req.params;
    const { resolution, outcome } = req.body; // outcome: 'resolved' | 'rejected'

    if (!["resolved", "rejected"].includes(outcome)) {
      return res.status(400).json({ success: false, message: "outcome must be 'resolved' or 'rejected'" });
    }
    if (!resolution || !resolution.trim()) {
      return res.status(400).json({ success: false, message: "A resolution note is required" });
    }

    const cRes = await pool.query("SELECT * FROM contracts WHERE id = $1", [id]);
    if (cRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Contract not found" });
    }
    if (cRes.rows[0].dispute_status !== "open") {
      return res.status(400).json({ success: false, message: "No open dispute on this contract" });
    }
    const contract = cRes.rows[0];

    const updated = await pool.query(
      `UPDATE contracts
       SET dispute_status = $1,
           dispute_resolution = $2,
           dispute_resolved_at = NOW(),
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [outcome, resolution.trim(), id]
    );

    // Notify both parties of the admin's decision
    const verb = outcome === "resolved" ? "resolved" : "reviewed and closed";
    for (const uid of [contract.buyer_id, contract.farmer_id]) {
      await pool.query(
        `INSERT INTO notifications (user_id, title, message, type, reference_id, reference_type)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          uid,
          `Dispute ${outcome === "resolved" ? "Resolved ✅" : "Closed"}`,
          `An admin has ${verb} the dispute: "${resolution.trim().slice(0, 120)}"`,
          "dispute", id, "contract",
        ]
      );
    }

    res.status(200).json({ success: true, contract: updated.rows[0] });
  } catch (error) {
    console.error("Resolve dispute error:", error);
    res.status(500).json({ success: false, message: "Error resolving dispute" });
  }
};

module.exports = {
  createContract,
  acceptContract,
  rejectContract,
  getFarmerContracts,
  getBuyerContracts,
  settleContract,
  raiseDispute,
  getDisputes,
  resolveDispute,
};
