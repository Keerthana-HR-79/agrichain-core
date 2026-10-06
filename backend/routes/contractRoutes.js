const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");
const { validateContract, validateIdParam } = require("../middleware/validationMiddleware");
const {
  createContract,
  acceptContract,
  rejectContract,
  getFarmerContracts,
  getBuyerContracts,
  settleContract,
  raiseDispute,
  getDisputes,
  resolveDispute,
} = require("../controllers/contractController");

router.post("/", authMiddleware, roleMiddleware("buyer"), validateContract, createContract);
router.get("/farmer", authMiddleware, roleMiddleware("farmer"), getFarmerContracts);
router.get("/buyer", authMiddleware, roleMiddleware("buyer"), getBuyerContracts);
router.put("/:id/accept", validateIdParam("id"), authMiddleware, roleMiddleware("farmer"), acceptContract);
router.put("/:id/reject", validateIdParam("id"), authMiddleware, roleMiddleware("farmer"), rejectContract);
router.put("/:id/settle", validateIdParam("id"), authMiddleware, roleMiddleware("buyer"), settleContract);

// Dispute path — either party raises; admin lists & resolves
router.put("/:id/dispute", validateIdParam("id"), authMiddleware, roleMiddleware("buyer", "farmer"), raiseDispute);
router.get("/disputes", authMiddleware, roleMiddleware("admin"), getDisputes);
router.put("/:id/dispute/resolve", validateIdParam("id"), authMiddleware, roleMiddleware("admin"), resolveDispute);

module.exports = router;
