const express = require("express");
const router  = express.Router();
const {
  createListing, getMyListings, getAllListings,
  getListingById, deleteListing, updateListing,
} = require("../controllers/listingController");
const authMiddleware = require("../middleware/authMiddleware");
const upload         = require("../middleware/uploadMiddleware");
const { validateIdParam } = require("../middleware/validationMiddleware");

router.post("/create", authMiddleware,
  upload.fields([{ name: "image", maxCount: 1 }, { name: "farm_registration_image", maxCount: 1 }]),
  createListing
);
router.get("/my-listings", authMiddleware, getMyListings);
router.get("/all",         getAllListings);
router.get("/:id",         validateIdParam("id"), getListingById);
router.put("/:id",         validateIdParam("id"), authMiddleware, updateListing);
router.delete("/:id",      validateIdParam("id"), authMiddleware, deleteListing);

module.exports = router;
