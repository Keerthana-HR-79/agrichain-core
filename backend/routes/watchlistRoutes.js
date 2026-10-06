// watchlistRoutes.js
const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const { addToWatchlist, removeFromWatchlist, getWatchlist, checkWatchlist } =
  require("../controllers/watchlistController");

router.post("/", authMiddleware, addToWatchlist);
router.delete("/:listing_id", authMiddleware, removeFromWatchlist);
router.get("/", authMiddleware, getWatchlist);
router.get("/check/:listing_id", authMiddleware, checkWatchlist);

module.exports = router;
