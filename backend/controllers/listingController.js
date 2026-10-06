const pool = require("../config/db");
const axios = require("axios");
const FormData = require("form-data");
const extractText = require("../utils/ocrHelper");
const parseGPSData = require("../utils/gpsParser");
const supabase = require("../config/supabase");

const createListing = async (req, res) => {
  try {
    let image_url = null;
    let farm_registration_image = null;
    let farm_latitude = null;
    let farm_longitude = null;
    let farm_village = null;
    let farm_registration_date = null;
    let farm_verified = false;

    // Upload crop image to Supabase
    if (req.files?.image?.[0]) {
      const cropFile = req.files.image[0];
      const fileName = `${Date.now()}-${cropFile.originalname}`;

      const { error } = await supabase.storage
        .from("listings")
        .upload(fileName, cropFile.buffer, { contentType: cropFile.mimetype });

      if (error) throw error;

      const { data } = supabase.storage.from("listings").getPublicUrl(fileName);
      image_url = data.publicUrl;
    }

    // Upload farm registration image
    if (req.files?.farm_registration_image?.[0]) {
      const farmFile = req.files.farm_registration_image[0];
      const farmFileName = `farm-${Date.now()}-${farmFile.originalname}`;

      const { error } = await supabase.storage
        .from("listings")
        .upload(farmFileName, farmFile.buffer, { contentType: farmFile.mimetype });

      if (error) throw error;

      const { data } = supabase.storage.from("listings").getPublicUrl(farmFileName);
      farm_registration_image = data.publicUrl;

      const ocrText = await extractText(farmFile.buffer);
      const gpsData = parseGPSData(ocrText || "");

      farm_latitude = gpsData.latitude;
      farm_longitude = gpsData.longitude;
      farm_village = gpsData.village;
      farm_registration_date = new Date();
      farm_verified = !!(farm_latitude && farm_longitude);
    }

    const farmer_id = req.user.id;

    const {
      crop_name, land_size, rainfall, temperature,
      soil_type, location, farmer_expected_yield, status,
      season, irrigation_method, state, district, taluka,
      village, full_address, phone_number, latitude, longitude,
      harvest_date,
    } = req.body;

    // Season mapping for AI
    const seasonMap = { Monsoon: "Kharif", Winter: "Rabi", Summer: "Zaid", "Whole Year": "Zaid" };
    const aiSeason = seasonMap[season] || season || "Kharif";

    // AI yield prediction removed in this build. Listings are created without a
    // model estimate — the farmer's own expected yield is the figure shown in the UI.
    const predicted_yield = 0;
    const confidence_lower = 0;
    const confidence_upper = 0;

    const newListing = await pool.query(
      `INSERT INTO listings (
        farmer_id, crop_name, land_size, rainfall, temperature,
        soil_type, location, predicted_yield, confidence_lower, confidence_upper,
        farmer_expected_yield,
        image_url, state, district, taluka, village, full_address,
        phone_number, season, irrigation_method, status,
        latitude, longitude,
        farm_latitude, farm_longitude, farm_village,
        farm_registration_image, farm_registration_date, farm_verified,
        harvest_date
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
        $11,$12,$13,$14,$15,$16,$17,
        $18,$19,$20,$21,
        $22,$23,$24,$25,$26,$27,$28,$29,$30
      ) RETURNING *`,
      [
        farmer_id, crop_name, Number(land_size) || 0, Number(rainfall) || 0,
        Number(temperature) || 0, soil_type, location,
        predicted_yield, confidence_lower, confidence_upper,
        farmer_expected_yield,
        image_url, state, district, taluka, village, full_address,
        phone_number, season, irrigation_method, status || "active",
        latitude || null, longitude || null,
        farm_latitude, farm_longitude, farm_village,
        farm_registration_image, farm_registration_date, farm_verified,
        harvest_date || null,
      ]
    );

    // Notify farmer
    await pool.query(
      `INSERT INTO notifications (user_id, title, message, type, reference_id, reference_type)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        farmer_id,
        "Listing Created 🌾",
        `Your ${crop_name} listing was created successfully.`,
        "system",
        newListing.rows[0].id,
        "listing",
      ]
    );

    res.status(201).json({ success: true, listing: newListing.rows[0] });
  } catch (error) {
    console.error("Create listing error:", error.response?.data || error.message);
    res.status(500).json({ success: false, message: "Error Creating Listing" });
  }
};

const getAllListings = async (req, res) => {
  try {
    const { crop, state, district, taluka, min_yield, max_yield } = req.query;

    let query = `
      SELECT listings.*, users.name AS farmer_name
      FROM listings
      JOIN users ON listings.farmer_id = users.id
      WHERE listings.status = 'active'
    `;
    const params = [];

    if (crop) {
      params.push(`%${crop}%`);
      query += ` AND LOWER(listings.crop_name) LIKE LOWER($${params.length})`;
    }
    if (state) {
      params.push(state);
      query += ` AND listings.state = $${params.length}`;
    }
    if (district) {
      params.push(district);
      query += ` AND listings.district = $${params.length}`;
    }
    if (taluka) {
      params.push(taluka);
      query += ` AND listings.taluka = $${params.length}`;
    }
    if (min_yield) {
      params.push(Number(min_yield));
      query += ` AND listings.predicted_yield >= $${params.length}`;
    }
    if (max_yield) {
      params.push(Number(max_yield));
      query += ` AND listings.predicted_yield <= $${params.length}`;
    }

    query += " ORDER BY listings.id DESC";

    const result = await pool.query(query, params);

    res.status(200).json({ success: true, listings: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Error fetching listings" });
  }
};

const getListingById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT listings.*, users.name AS farmer_name, users.phone_number AS farmer_phone
       FROM listings
       JOIN users ON listings.farmer_id = users.id
       WHERE listings.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Listing not found" });
    }

    // Fetch prediction history
    const predHistory = await pool.query(
      `SELECT prediction_history.*, crop_stages.stage_name
       FROM prediction_history
       LEFT JOIN crop_stages ON prediction_history.stage_id = crop_stages.id
       WHERE prediction_history.listing_id = $1
       ORDER BY prediction_history.created_at ASC`,
      [id]
    );

    res.status(200).json({
      success: true,
      listing: result.rows[0],
      prediction_history: predHistory.rows,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

const getMyListings = async (req, res) => {
  try {
    const farmer_id = req.user.id;

    const result = await pool.query(
      `SELECT listings.*,
        (SELECT COUNT(*) FROM crop_stages WHERE listing_id = listings.id) AS stage_count,
        (SELECT COUNT(*) FROM contracts WHERE listing_id = listings.id) AS contract_count
       FROM listings
       WHERE farmer_id = $1
       ORDER BY id DESC`,
      [farmer_id]
    );

    res.status(200).json({ success: true, listings: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Error fetching listings" });
  }
};

const deleteListing = async (req, res) => {
  try {
    const { id } = req.params;
    const farmer_id = req.user.id;

    const check = await pool.query(
      "SELECT id FROM listings WHERE id = $1 AND farmer_id = $2",
      [id, farmer_id]
    );

    if (check.rows.length === 0) {
      return res.status(403).json({ success: false, message: "Not authorized" });
    }

    await pool.query("DELETE FROM listings WHERE id = $1", [id]);

    res.status(200).json({ success: true, message: "Listing deleted" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Error deleting listing" });
  }
};

const updateListing = async (req, res) => {
  try {
    const { id } = req.params;
    const farmer_id = req.user.id;

    // Verify ownership
    const check = await pool.query(
      "SELECT id FROM listings WHERE id = $1 AND farmer_id = $2",
      [id, farmer_id]
    );
    if (check.rows.length === 0) {
      return res.status(403).json({ success: false, message: "Not authorized" });
    }

    const {
      crop_name, land_size, rainfall, temperature, soil_type,
      irrigation_method, season, location, farmer_expected_yield,
      state, district, taluka, village, full_address, phone_number,
      harvest_date, status,
    } = req.body;

    const result = await pool.query(
      `UPDATE listings SET
        crop_name = COALESCE($1, crop_name),
        land_size = COALESCE($2, land_size),
        rainfall = COALESCE($3, rainfall),
        temperature = COALESCE($4, temperature),
        soil_type = COALESCE($5, soil_type),
        irrigation_method = COALESCE($6, irrigation_method),
        season = COALESCE($7, season),
        location = COALESCE($8, location),
        farmer_expected_yield = COALESCE($9, farmer_expected_yield),
        state = COALESCE($10, state),
        district = COALESCE($11, district),
        taluka = COALESCE($12, taluka),
        village = COALESCE($13, village),
        full_address = COALESCE($14, full_address),
        phone_number = COALESCE($15, phone_number),
        harvest_date = COALESCE($16, harvest_date),
        status = COALESCE($17, status)
       WHERE id = $18
       RETURNING *`,
      [
        crop_name, land_size ? Number(land_size) : null,
        rainfall ? Number(rainfall) : null,
        temperature ? Number(temperature) : null,
        soil_type, irrigation_method, season, location,
        farmer_expected_yield ? Number(farmer_expected_yield) : null,
        state, district, taluka, village, full_address, phone_number,
        harvest_date || null, status,
        id,
      ]
    );

    res.status(200).json({ success: true, listing: result.rows[0] });
  // } catch (error) {
  //   console.error(error);
  //   res.status(500).json({ success: false, message: "Error updating listing" });
  // }
  } catch (error) {
  console.error("========== CREATE LISTING ERROR ==========");
  console.error("Message:", error.message);
  console.error("Name:", error.name);
  console.error("Stack:", error.stack);
  console.error("Response:", error.response?.data);
  console.error("Status:", error.response?.status);
  console.error("==========================================");

  res.status(500).json({
    success: false,
    message: "Error Creating Listing",
    error: error.message,
  });
}
};

module.exports = { createListing, getMyListings, getAllListings, getListingById, deleteListing, updateListing };
