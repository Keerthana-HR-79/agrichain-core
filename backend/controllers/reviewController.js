const pool = require("../config/db");

const createReview = async (req, res) => {
  try {
    const reviewer_id = req.user.id;
    const { contract_id, rating, comment } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: "Rating must be between 1 and 5" });
    }

    // Get contract to find reviewee
    const contractResult = await pool.query(
      `SELECT * FROM contracts WHERE id = $1`,
      [contract_id]
    );

    if (contractResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Contract not found" });
    }

    const contract = contractResult.rows[0];

    if (contract.status !== "completed") {
      return res.status(400).json({ success: false, message: "Can only review completed contracts" });
    }

    // Determine who is being reviewed
    const reviewee_id =
      reviewer_id === contract.buyer_id ? contract.farmer_id : contract.buyer_id;

    if (reviewer_id !== contract.buyer_id && reviewer_id !== contract.farmer_id) {
      return res.status(403).json({ success: false, message: "Not part of this contract" });
    }

    // Insert review
    const result = await pool.query(
      `INSERT INTO reviews (contract_id, reviewer_id, reviewee_id, rating, comment)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [contract_id, reviewer_id, reviewee_id, rating, comment || null]
    );

    // Update user avg rating
    const avgResult = await pool.query(
      `SELECT AVG(rating) as avg_rating, COUNT(*) as total
       FROM reviews WHERE reviewee_id = $1`,
      [reviewee_id]
    );

    await pool.query(
      `UPDATE users SET avg_rating = $1, total_reviews = $2 WHERE id = $3`,
      [
        parseFloat(avgResult.rows[0].avg_rating || 0).toFixed(2),
        parseInt(avgResult.rows[0].total || 0),
        reviewee_id,
      ]
    );

    // Notify reviewee
    const reviewerResult = await pool.query("SELECT name FROM users WHERE id = $1", [reviewer_id]);
    await pool.query(
      `INSERT INTO notifications (user_id, title, message, type, reference_id, reference_type)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        reviewee_id,
        "New Review Received ⭐",
        `${reviewerResult.rows[0]?.name} gave you a ${rating}-star rating!`,
        "system",
        contract_id,
        "contract",
      ]
    );

    res.status(201).json({ success: true, review: result.rows[0] });
  } catch (error) {
    console.error(error);
    if (error.code === "23505") {
      return res.status(409).json({ success: false, message: "You have already reviewed this contract" });
    }
    res.status(500).json({ success: false, message: "Error creating review" });
  }
};

const getUserReviews = async (req, res) => {
  try {
    const { user_id } = req.params;

    const result = await pool.query(
      `SELECT reviews.*, 
              users.name AS reviewer_name,
              users.role AS reviewer_role,
              listings.crop_name
       FROM reviews
       JOIN users ON reviews.reviewer_id = users.id
       JOIN contracts ON reviews.contract_id = contracts.id
       JOIN listings ON contracts.listing_id = listings.id
       WHERE reviews.reviewee_id = $1
       ORDER BY reviews.created_at DESC`,
      [user_id]
    );

    const statsResult = await pool.query(
      `SELECT AVG(rating) as avg, COUNT(*) as total,
              COUNT(CASE WHEN rating = 5 THEN 1 END) as five_star,
              COUNT(CASE WHEN rating = 4 THEN 1 END) as four_star,
              COUNT(CASE WHEN rating = 3 THEN 1 END) as three_star,
              COUNT(CASE WHEN rating = 2 THEN 1 END) as two_star,
              COUNT(CASE WHEN rating = 1 THEN 1 END) as one_star
       FROM reviews WHERE reviewee_id = $1`,
      [user_id]
    );

    res.status(200).json({
      success: true,
      reviews: result.rows,
      stats: statsResult.rows[0],
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Error fetching reviews" });
  }
};

module.exports = { createReview, getUserReviews };
