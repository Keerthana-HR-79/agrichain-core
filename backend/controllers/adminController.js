const pool = require("../config/db");

// =====================
// DASHBOARD STATS
// =====================
const getDashboardStats = async (req, res) => {
  try {
    const [users, listings, contracts, farmers, buyers] = await Promise.all([
      pool.query("SELECT COUNT(*) FROM users WHERE role != 'admin'"),
      pool.query("SELECT COUNT(*) FROM listings"),
      pool.query("SELECT COUNT(*) FROM contracts"),
      pool.query("SELECT COUNT(*) FROM users WHERE role = 'farmer'"),
      pool.query("SELECT COUNT(*) FROM users WHERE role = 'buyer'"),
    ]);

    const pendingContracts = await pool.query(
      "SELECT COUNT(*) FROM contracts WHERE status = 'pending'"
    );
    const acceptedContracts = await pool.query(
      "SELECT COUNT(*) FROM contracts WHERE status = 'accepted'"
    );
    const verifiedFarms = await pool.query(
      "SELECT COUNT(*) FROM listings WHERE farm_verified = true"
    );
    const totalPredictedYield = await pool.query(
      "SELECT SUM(predicted_yield) FROM listings"
    );

    res.status(200).json({
      success: true,
      stats: {
        total_users: parseInt(users.rows[0].count),
        total_farmers: parseInt(farmers.rows[0].count),
        total_buyers: parseInt(buyers.rows[0].count),
        total_listings: parseInt(listings.rows[0].count),
        total_contracts: parseInt(contracts.rows[0].count),
        pending_contracts: parseInt(pendingContracts.rows[0].count),
        accepted_contracts: parseInt(acceptedContracts.rows[0].count),
        verified_farms: parseInt(verifiedFarms.rows[0].count),
        total_predicted_yield_tonnes: parseFloat(totalPredictedYield.rows[0].sum || 0).toFixed(2),
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Error fetching stats" });
  }
};

// =====================
// GET ALL USERS
// =====================
const getAllUsers = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, email, role, phone_number, state, district, is_active, created_at
       FROM users
       ORDER BY created_at DESC`
    );

    res.status(200).json({ success: true, users: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Error fetching users" });
  }
};

// =====================
// TOGGLE USER STATUS
// =====================
const toggleUserStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await pool.query("SELECT is_active FROM users WHERE id = $1", [id]);
    if (user.rows.length === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const newStatus = !user.rows[0].is_active;

    await pool.query("UPDATE users SET is_active = $1 WHERE id = $2", [newStatus, id]);

    res.status(200).json({
      success: true,
      message: `User ${newStatus ? "activated" : "deactivated"} successfully`,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Error updating user" });
  }
};

// =====================
// GET ALL LISTINGS
// =====================
const getAllListingsAdmin = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT listings.*, users.name AS farmer_name, users.email AS farmer_email
       FROM listings
       JOIN users ON listings.farmer_id = users.id
       ORDER BY listings.created_at DESC`
    );

    res.status(200).json({ success: true, listings: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Error fetching listings" });
  }
};

// =====================
// GET ALL CONTRACTS
// =====================
const getAllContractsAdmin = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
        contracts.*,
        f.name AS farmer_name,
        b.name AS buyer_name,
        listings.crop_name
       FROM contracts
       JOIN users f ON contracts.farmer_id = f.id
       JOIN users b ON contracts.buyer_id = b.id
       JOIN listings ON contracts.listing_id = listings.id
       ORDER BY contracts.created_at DESC`
    );

    res.status(200).json({ success: true, contracts: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Error fetching contracts" });
  }
};

// =====================
// BROADCAST NOTIFICATION
// =====================
const broadcastNotification = async (req, res) => {
  try {
    const { title, message, target_role } = req.body;

    let query = "SELECT id FROM users WHERE is_active = true";
    const params = [];

    if (target_role && target_role !== "all") {
      query += " AND role = $1";
      params.push(target_role);
    }

    const users = await pool.query(query, params);

    const insertPromises = users.rows.map((user) =>
      pool.query(
        `INSERT INTO notifications (user_id, title, message, type)
         VALUES ($1, $2, $3, 'system')`,
        [user.id, title, message]
      )
    );

    await Promise.all(insertPromises);

    res.status(200).json({
      success: true,
      message: `Notification sent to ${users.rows.length} users`,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Error broadcasting notification" });
  }
};

// =====================
// VERIFY FARM
// =====================
const verifyFarm = async (req, res) => {
  try {
    const { id } = req.params;

    await pool.query(
      "UPDATE listings SET farm_verified = true WHERE id = $1",
      [id]
    );

    // Notify farmer
    const listing = await pool.query(
      "SELECT farmer_id, crop_name FROM listings WHERE id = $1",
      [id]
    );

    if (listing.rows.length > 0) {
      await pool.query(
        `INSERT INTO notifications (user_id, title, message, type, reference_id, reference_type)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          listing.rows[0].farmer_id,
          "Farm Verified ✅",
          `Your ${listing.rows[0].crop_name} listing has been verified by AgriChain admin`,
          "system",
          id,
          "listing",
        ]
      );
    }

    res.status(200).json({ success: true, message: "Farm verified successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Error verifying farm" });
  }
};

module.exports = {
  getDashboardStats,
  getAllUsers,
  toggleUserStatus,
  getAllListingsAdmin,
  getAllContractsAdmin,
  broadcastNotification,
  verifyFarm,
};
