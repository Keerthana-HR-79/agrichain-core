const pool = require("../config/db");

// ── FARMER ANALYTICS ────────────────────────────────────────────────────────
const getFarmerAnalytics = async (req, res) => {
  try {
    const farmer_id = req.user.id;

    const [listingsRes, contractsRes, stagesRes, yieldRes, revenueRes, monthlyRes] =
      await Promise.all([
        pool.query(
          `SELECT COUNT(*) as total,
                  COUNT(CASE WHEN farm_verified THEN 1 END) as verified,
                  COUNT(CASE WHEN status = 'active' THEN 1 END) as active
           FROM listings WHERE farmer_id = $1`,
          [farmer_id]
        ),
        pool.query(
          `SELECT COUNT(*) as total,
                  COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
                  COUNT(CASE WHEN status = 'accepted' THEN 1 END) as accepted,
                  COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed
           FROM contracts WHERE farmer_id = $1`,
          [farmer_id]
        ),
        pool.query(
          `SELECT COUNT(*) as total,
                  COUNT(CASE WHEN gps_verified THEN 1 END) as gps_verified
           FROM crop_stages cs
           JOIN listings l ON cs.listing_id = l.id
           WHERE l.farmer_id = $1`,
          [farmer_id]
        ),
        pool.query(
          `SELECT SUM(predicted_yield) as total_predicted,
                  AVG(predicted_yield) as avg_predicted
           FROM listings WHERE farmer_id = $1`,
          [farmer_id]
        ),
        pool.query(
          `SELECT SUM(final_amount) as total_earned,
                  AVG(offered_price) as avg_price_per_quintal
           FROM contracts WHERE farmer_id = $1 AND status = 'completed'`,
          [farmer_id]
        ),
        pool.query(
          `SELECT TO_CHAR(created_at, 'Mon YYYY') as month,
                  COUNT(*) as listings,
                  SUM(predicted_yield) as yield
           FROM listings WHERE farmer_id = $1
           GROUP BY TO_CHAR(created_at, 'Mon YYYY'), DATE_TRUNC('month', created_at)
           ORDER BY DATE_TRUNC('month', created_at) ASC
           LIMIT 12`,
          [farmer_id]
        ),
      ]);

    // Yield prediction accuracy (where we have both predicted and updated_yield)
    const accuracyRes = await pool.query(
      `SELECT AVG(ABS(cs.updated_yield - l.predicted_yield) / NULLIF(l.predicted_yield, 0) * 100) as avg_deviation
       FROM crop_stages cs
       JOIN listings l ON cs.listing_id = l.id
       WHERE l.farmer_id = $1 AND cs.updated_yield IS NOT NULL`,
      [farmer_id]
    );

    // Crop distribution
    const cropDistRes = await pool.query(
      `SELECT crop_name, COUNT(*) as count, SUM(predicted_yield) as total_yield
       FROM listings WHERE farmer_id = $1
       GROUP BY crop_name ORDER BY count DESC`,
      [farmer_id]
    );

    res.status(200).json({
      success: true,
      analytics: {
        listings: listingsRes.rows[0],
        contracts: contractsRes.rows[0],
        stages: stagesRes.rows[0],
        yield: yieldRes.rows[0],
        revenue: revenueRes.rows[0],
        monthly_trend: monthlyRes.rows,
        prediction_accuracy: accuracyRes.rows[0],
        crop_distribution: cropDistRes.rows,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Error fetching analytics" });
  }
};

// ── BUYER ANALYTICS ─────────────────────────────────────────────────────────
const getBuyerAnalytics = async (req, res) => {
  try {
    const buyer_id = req.user.id;

    const [contractsRes, investmentRes, cropRes, monthlyRes] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) as total,
                COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
                COUNT(CASE WHEN status = 'accepted' THEN 1 END) as active,
                COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
                COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected
         FROM contracts WHERE buyer_id = $1`,
        [buyer_id]
      ),
      pool.query(
        `SELECT SUM(c.quantity * c.offered_price * 10) as total_committed,
                SUM(CASE WHEN c.status = 'completed' THEN c.final_amount ELSE 0 END) as total_spent,
                SUM(CASE WHEN c.status IN ('accepted','pending') THEN c.quantity * c.offered_price * 10 ELSE 0 END) as active_value
         FROM contracts c WHERE c.buyer_id = $1`,
        [buyer_id]
      ),
      pool.query(
        `SELECT l.crop_name, COUNT(*) as contracts, SUM(c.quantity) as total_quantity
         FROM contracts c
         JOIN listings l ON c.listing_id = l.id
         WHERE c.buyer_id = $1
         GROUP BY l.crop_name ORDER BY contracts DESC`,
        [buyer_id]
      ),
      pool.query(
        `SELECT TO_CHAR(c.created_at, 'Mon YYYY') as month,
                COUNT(*) as contracts,
                SUM(c.quantity * c.offered_price * 10) as value
         FROM contracts c WHERE c.buyer_id = $1
         GROUP BY TO_CHAR(c.created_at, 'Mon YYYY'), DATE_TRUNC('month', c.created_at)
         ORDER BY DATE_TRUNC('month', c.created_at) ASC
         LIMIT 12`,
        [buyer_id]
      ),
    ]);

    // Top performing farmers
    const farmersRes = await pool.query(
      `SELECT u.name, u.avg_rating, COUNT(c.id) as contracts,
              SUM(c.quantity) as total_quantity
       FROM contracts c
       JOIN users u ON c.farmer_id = u.id
       WHERE c.buyer_id = $1
       GROUP BY u.name, u.avg_rating ORDER BY contracts DESC LIMIT 5`,
      [buyer_id]
    );

    res.status(200).json({
      success: true,
      analytics: {
        contracts: contractsRes.rows[0],
        investment: investmentRes.rows[0],
        crop_portfolio: cropRes.rows,
        monthly_trend: monthlyRes.rows,
        top_farmers: farmersRes.rows,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Error fetching analytics" });
  }
};

// ── PLATFORM ANALYTICS (admin) ───────────────────────────────────────────────
const getPlatformAnalytics = async (req, res) => {
  try {
    const [usersRes, listingsRes, contractsRes, yieldRes, regionalRes, cropRes] =
      await Promise.all([
        pool.query(
          `SELECT COUNT(*) as total,
                  COUNT(CASE WHEN role = 'farmer' THEN 1 END) as farmers,
                  COUNT(CASE WHEN role = 'buyer' THEN 1 END) as buyers,
                  COUNT(CASE WHEN created_at > NOW() - INTERVAL '30 days' THEN 1 END) as new_this_month
           FROM users WHERE role != 'admin'`
        ),
        pool.query(
          `SELECT COUNT(*) as total,
                  COUNT(CASE WHEN farm_verified THEN 1 END) as verified,
                  SUM(predicted_yield) as total_yield,
                  COUNT(CASE WHEN created_at > NOW() - INTERVAL '30 days' THEN 1 END) as new_this_month
           FROM listings`
        ),
        pool.query(
          `SELECT COUNT(*) as total,
                  COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
                  SUM(CASE WHEN status = 'completed' THEN final_amount ELSE 0 END) as total_volume
           FROM contracts`
        ),
        pool.query(
          `SELECT SUM(predicted_yield) as total FROM listings`
        ),
        pool.query(
          `SELECT district, COUNT(*) as listings, SUM(predicted_yield) as total_yield
           FROM listings
           GROUP BY district ORDER BY listings DESC LIMIT 10`
        ),
        pool.query(
          `SELECT crop_name, COUNT(*) as listings, SUM(predicted_yield) as total_yield,
                  AVG(predicted_yield) as avg_yield
           FROM listings
           GROUP BY crop_name ORDER BY listings DESC`
        ),
      ]);

    // Monthly growth
    const growthRes = await pool.query(
      `SELECT TO_CHAR(created_at, 'Mon YYYY') as month,
              COUNT(*) as users
       FROM users WHERE role != 'admin'
       GROUP BY TO_CHAR(created_at, 'Mon YYYY'), DATE_TRUNC('month', created_at)
       ORDER BY DATE_TRUNC('month', created_at) ASC
       LIMIT 12`
    );

    res.status(200).json({
      success: true,
      analytics: {
        users: usersRes.rows[0],
        listings: listingsRes.rows[0],
        contracts: contractsRes.rows[0],
        regional: regionalRes.rows,
        crop_breakdown: cropRes.rows,
        user_growth: growthRes.rows,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Error fetching platform analytics" });
  }
};

module.exports = { getFarmerAnalytics, getBuyerAnalytics, getPlatformAnalytics };
