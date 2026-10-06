const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");
const {
  getDashboardStats,
  getAllUsers,
  toggleUserStatus,
  getAllListingsAdmin,
  getAllContractsAdmin,
  broadcastNotification,
  verifyFarm,
} = require("../controllers/adminController");

router.use(authMiddleware, roleMiddleware("admin"));

router.get("/stats", getDashboardStats);
router.get("/users", getAllUsers);
router.put("/users/:id/toggle", toggleUserStatus);
router.get("/listings", getAllListingsAdmin);
router.get("/contracts", getAllContractsAdmin);
router.post("/notify", broadcastNotification);
router.put("/listings/:id/verify", verifyFarm);

module.exports = router;
