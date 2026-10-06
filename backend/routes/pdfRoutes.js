const express = require("express");
const router  = express.Router();
const auth    = require("../middleware/authMiddleware");
const { generateContractPDF } = require("../controllers/pdfController");

router.get("/contract/:contract_id", auth, generateContractPDF);

module.exports = router;
