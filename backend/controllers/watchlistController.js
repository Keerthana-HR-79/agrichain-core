const pool = require("../config/db");

const addToWatchlist = async (req, res) => {
  try {
    const buyer_id = req.user.id;
    const { listing_id } = req.body;

    await pool.query(
      `INSERT INTO watchlist (buyer_id, listing_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [buyer_id, listing_id]
    );

    res.status(201).json({ success: true, message: "Added to watchlist" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Error adding to watchlist" });
  }
};

const removeFromWatchlist = async (req, res) => {
  try {
    const buyer_id = req.user.id;
    const { listing_id } = req.params;

    await pool.query(
      `DELETE FROM watchlist WHERE buyer_id = $1 AND listing_id = $2`,
      [buyer_id, listing_id]
    );

    res.status(200).json({ success: true, message: "Removed from watchlist" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Error removing from watchlist" });
  }
};

const getWatchlist = async (req, res) => {
  try {
    const buyer_id = req.user.id;

    const result = await pool.query(
      `SELECT watchlist.id, watchlist.created_at,
              listings.*, users.name AS farmer_name
       FROM watchlist
       JOIN listings ON watchlist.listing_id = listings.id
       JOIN users ON listings.farmer_id = users.id
       WHERE watchlist.buyer_id = $1
       ORDER BY watchlist.created_at DESC`,
      [buyer_id]
    );

    res.status(200).json({ success: true, watchlist: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Error fetching watchlist" });
  }
};

const checkWatchlist = async (req, res) => {
  try {
    const buyer_id = req.user.id;
    const { listing_id } = req.params;

    const result = await pool.query(
      `SELECT id FROM watchlist WHERE buyer_id = $1 AND listing_id = $2`,
      [buyer_id, listing_id]
    );

    res.status(200).json({ success: true, saved: result.rows.length > 0 });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Error checking watchlist" });
  }
};

module.exports = { addToWatchlist, removeFromWatchlist, getWatchlist, checkWatchlist };
