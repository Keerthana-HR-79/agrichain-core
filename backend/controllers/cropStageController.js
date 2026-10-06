const pool = require("../config/db");
const supabase = require("../config/supabase");
const extractText = require("../utils/ocrHelper");
const parseGPSData = require("../utils/gpsParser");
const extractGPS = require("../utils/exifHelper");
const calculateDistance = require("../utils/distanceHelper");

const createStage = async (req, res) => {
  try {
    let image_url = null;
    let image_latitude = null;
    let image_longitude = null;
    let image_timestamp = null;
    let gps_source = null;

    const {
      listing_id, stage_name, latitude, longitude,
      notes, updated_yield, yield_update_reason,
    } = req.body;

    if (req.file) {
      // GPS extraction — try real EXIF metadata first (works with normal phone
      // photos), then fall back to OCR of burned-in overlay text (GPS Map Camera
      // watermark), then finally the coordinates the client sent with the form.
      const exif = await extractGPS(req.file.buffer);
      if (exif && exif.latitude != null && exif.longitude != null) {
        image_latitude = exif.latitude;
        image_longitude = exif.longitude;
        image_timestamp = exif.timestamp ? new Date(exif.timestamp) : new Date();
        gps_source = "exif";
      } else {
        const ocrText = await extractText(req.file.buffer);
        const gpsData = parseGPSData(ocrText || "");
        if (gpsData.latitude != null && gpsData.longitude != null) {
          image_latitude = gpsData.latitude;
          image_longitude = gpsData.longitude;
          gps_source = "ocr";
        }
        image_timestamp = new Date();
      }

      // Last resort: coordinates captured by the browser/device at upload time.
      if ((image_latitude == null || image_longitude == null) && latitude && longitude) {
        image_latitude = Number(latitude);
        image_longitude = Number(longitude);
        gps_source = "client";
      }

      const fileName = `${Date.now()}-${req.file.originalname}`;

      const { error } = await supabase.storage
        .from("stages")
        .upload(fileName, req.file.buffer, { contentType: req.file.mimetype });

      if (error) throw error;

      const { data: publicUrlData } = supabase.storage.from("stages").getPublicUrl(fileName);
      image_url = publicUrlData.publicUrl;

      console.log(
        `Stage GPS: source=${gps_source || "none"} lat=${image_latitude} lng=${image_longitude}`
      );
    }

    // Get farm GPS
    const farmResult = await pool.query(
      "SELECT farm_latitude, farm_longitude, farmer_id FROM listings WHERE id = $1",
      [listing_id]
    );

    if (farmResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Listing not found" });
    }

    const farm = farmResult.rows[0];
    let distance_from_farm = null;
    let gps_verified = false;

    if (farm && image_latitude && image_longitude) {
      distance_from_farm = calculateDistance(
        Number(farm.farm_latitude), Number(farm.farm_longitude),
        Number(image_latitude), Number(image_longitude)
      );
      gps_verified = distance_from_farm <= 500;
    }

    const stageOrderMap = {
      Sowing: 1, "Early Growth": 2, "Vegetative Growth": 3,
      Flowering: 4, "Pre Harvest": 5,
    };
    const stage_order = stageOrderMap[stage_name] || 1;

    // Check duplicate
    const existing = await pool.query(
      "SELECT id FROM crop_stages WHERE listing_id = $1 AND stage_name = $2",
      [listing_id, stage_name]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: "This crop stage has already been uploaded",
      });
    }

    const result = await pool.query(
      `INSERT INTO crop_stages
        (listing_id, stage_name, stage_order, image_url,
         latitude, longitude, image_latitude, image_longitude, image_timestamp,
         gps_verified, distance_from_farm, notes, updated_yield, yield_update_reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [
        listing_id, stage_name, stage_order, image_url,
        latitude || null, longitude || null,
        image_latitude, image_longitude, image_timestamp,
        gps_verified, distance_from_farm,
        notes,
        updated_yield ? Number(updated_yield) : null,
        yield_update_reason,
      ]
    );

    const stage = result.rows[0];

    // Update prediction history
    const listingResult = await pool.query(
      "SELECT predicted_yield FROM listings WHERE id = $1",
      [listing_id]
    );
    const predictedYield = listingResult.rows[0]?.predicted_yield || 0;

    await pool.query(
      `INSERT INTO prediction_history (listing_id, stage_id, predicted_yield)
       VALUES ($1, $2, $3)`,
      [listing_id, stage.id, predictedYield]
    );

    // Notify buyers who have active contracts for this listing
    const buyerContracts = await pool.query(
      `SELECT DISTINCT buyer_id FROM contracts
       WHERE listing_id = $1 AND status IN ('pending', 'accepted')`,
      [listing_id]
    );

    const listingInfo = await pool.query(
      "SELECT crop_name FROM listings WHERE id = $1",
      [listing_id]
    );
    const crop_name = listingInfo.rows[0]?.crop_name;

    const notifyPromises = buyerContracts.rows.map((row) =>
      pool.query(
        `INSERT INTO notifications (user_id, title, message, type, reference_id, reference_type)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          row.buyer_id,
          `New Crop Update 🌱`,
          `${crop_name} has reached the "${stage_name}" stage. ${
            gps_verified ? "GPS Verified ✅" : "GPS pending verification"
          }`,
          "stage_uploaded",
          listing_id,
          "listing",
        ]
      )
    );
    await Promise.all(notifyPromises);

    res.status(201).json({ success: true, stage });
  } catch (error) {
    console.error("Create stage error:", error);
    res.status(500).json({ success: false, message: "Error creating stage" });
  }
};

const getStagesByListing = async (req, res) => {
  try {
    const { listingId } = req.params;

    const result = await pool.query(
      "SELECT * FROM crop_stages WHERE listing_id = $1 ORDER BY stage_order ASC",
      [listingId]
    );

    res.status(200).json({ success: true, stages: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Error fetching stages" });
  }
};

const getStageById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query("SELECT * FROM crop_stages WHERE id = $1", [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Stage not found" });
    }

    res.status(200).json({ success: true, stage: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Error fetching stage" });
  }
};

const deleteStage = async (req, res) => {
  try {
    const { id } = req.params;

    await pool.query("DELETE FROM crop_updates WHERE stage_id = $1", [id]);
    await pool.query("DELETE FROM prediction_history WHERE stage_id = $1", [id]);
    await pool.query("DELETE FROM crop_stages WHERE id = $1", [id]);

    res.status(200).json({ success: true, message: "Stage deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Error deleting stage" });
  }
};

module.exports = { createStage, getStagesByListing, getStageById, deleteStage };
