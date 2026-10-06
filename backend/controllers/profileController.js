const pool = require("../config/db");
const bcrypt = require("bcrypt");
const supabase = require("../config/supabase");

const getProfile = async (req, res) => {
  try {
    const { user_id } = req.params;

    const result = await pool.query(
      `SELECT id, name, email, role, phone_number, state, district,
              profile_image, bio, address, avg_rating, total_reviews, created_at
       FROM users WHERE id = $1 AND is_active = true`,
      [user_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const user = result.rows[0];

    // Fetch role-specific stats
    let stats = {};
    if (user.role === "farmer") {
      const s = await pool.query(
        `SELECT COUNT(*) as total_listings,
                COUNT(CASE WHEN farm_verified THEN 1 END) as verified_listings,
                COALESCE(SUM(COALESCE(NULLIF(farmer_expected_yield, 0), predicted_yield)), 0) as total_yield
         FROM listings WHERE farmer_id = $1`,
        [user_id]
      );
      const c = await pool.query(
        `SELECT COUNT(*) as total_contracts,
                COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed
         FROM contracts WHERE farmer_id = $1`,
        [user_id]
      );
      stats = { ...s.rows[0], ...c.rows[0] };
    } else if (user.role === "buyer") {
      const c = await pool.query(
        `SELECT COUNT(*) as total_contracts,
                COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
                COALESCE(SUM(CASE WHEN status = 'completed' THEN final_amount ELSE 0 END), 0) as total_spent
         FROM contracts WHERE buyer_id = $1`,
        [user_id]
      );
      stats = c.rows[0];
    }

    // Fetch reviews
    const reviews = await pool.query(
      `SELECT reviews.*, u.name AS reviewer_name, u.role AS reviewer_role
       FROM reviews
       JOIN users u ON reviews.reviewer_id = u.id
       WHERE reviews.reviewee_id = $1
       ORDER BY reviews.created_at DESC LIMIT 5`,
      [user_id]
    );

    res.status(200).json({
      success: true,
      user,
      stats,
      recent_reviews: reviews.rows,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Error fetching profile" });
  }
};

const updateProfile = async (req, res) => {
  try {
    const user_id = req.user.id;
    const { name, phone_number, state, district, bio, address } = req.body;

    let profile_image = null;

    // Handle profile image upload
    if (req.file) {
      const fileName = `profile-${user_id}-${Date.now()}.${req.file.mimetype.split("/")[1]}`;
      const { error } = await supabase.storage
        .from("listings")
        .upload(fileName, req.file.buffer, { contentType: req.file.mimetype });

      if (!error) {
        const { data } = supabase.storage.from("listings").getPublicUrl(fileName);
        profile_image = data.publicUrl;
      }
    }

    const updateFields = [];
    const values = [];
    let idx = 1;

    const addField = (field, value) => {
      if (value !== undefined && value !== null) {
        updateFields.push(`${field} = $${idx++}`);
        values.push(value);
      }
    };

    addField("name", name);
    addField("phone_number", phone_number);
    addField("state", state);
    addField("district", district);
    addField("bio", bio);
    addField("address", address);
    if (profile_image) addField("profile_image", profile_image);

    if (updateFields.length === 0) {
      return res.status(400).json({ success: false, message: "Nothing to update" });
    }

    values.push(user_id);
    const result = await pool.query(
      `UPDATE users SET ${updateFields.join(", ")} WHERE id = $${idx}
       RETURNING id, name, email, role, phone_number, state, district, profile_image, bio, address`,
      values
    );

    res.status(200).json({ success: true, user: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Error updating profile" });
  }
};

const changePassword = async (req, res) => {
  try {
    const user_id = req.user.id;
    const { current_password, new_password } = req.body;

    const userResult = await pool.query("SELECT password FROM users WHERE id = $1", [user_id]);
    const isMatch = await bcrypt.compare(current_password, userResult.rows[0].password);

    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Current password is incorrect" });
    }

    const hashed = await bcrypt.hash(new_password, 10);
    await pool.query("UPDATE users SET password = $1 WHERE id = $2", [hashed, user_id]);

    res.status(200).json({ success: true, message: "Password changed successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Error changing password" });
  }
};

module.exports = { getProfile, updateProfile, changePassword };
