const pool = require("../config/db");
const supabase = require("../config/supabase");

const extractText =
  require("../utils/ocrHelper");

const parseGPSData =
  require("../utils/gpsParser");

const calculateDistance =
  require("../utils/distanceHelper");

// ==========================
// CREATE UPDATE
// ==========================

const createUpdate = async (req, res) => {
  try {

    let image_url = null;

    let image_latitude = null;
    let image_longitude = null;

    let gps_verified = false;
    let distance_from_farm = null;

    if (req.file) {

      const ocrText =
        await extractText(
          req.file.buffer
        );

      const gpsData =
        parseGPSData(
          ocrText || ""
        );

      image_latitude =
        gpsData.latitude;

      image_longitude =
        gpsData.longitude;

      const fileName =
        `update-${Date.now()}-${req.file.originalname}`;

      const { error } =
        await supabase.storage
          .from("stages")
          .upload(
            fileName,
            req.file.buffer,
            {
              contentType:
                req.file.mimetype,
            }
          );

      if (error) throw error;

      const { data } =
        supabase.storage
          .from("stages")
          .getPublicUrl(
            fileName
          );

      image_url =
        data.publicUrl;
    }

    const {
      stage_id,
      notes,
    } = req.body;

    // ==========================
    // FIND FARM GPS
    // ==========================

    const farmResult =
      await pool.query(
        `
        SELECT
          l.farm_latitude,
          l.farm_longitude

        FROM crop_stages cs

        JOIN listings l
        ON cs.listing_id = l.id

        WHERE cs.id = $1
        `,
        [stage_id]
      );

    const farm =
      farmResult.rows[0];

    if (
      farm &&
      image_latitude &&
      image_longitude
    ) {

      distance_from_farm =
        calculateDistance(
          Number(
            farm.farm_latitude
          ),
          Number(
            farm.farm_longitude
          ),
          Number(
            image_latitude
          ),
          Number(
            image_longitude
          )
        );

      gps_verified =
        distance_from_farm <= 500;
    }

    // ==========================
    // SAVE UPDATE
    // ==========================

    const result =
      await pool.query(
        `
        INSERT INTO crop_updates
        (
          stage_id,

          image_url,

          image_latitude,
          image_longitude,

          gps_verified,
          distance_from_farm,

          notes
        )

        VALUES
        (
          $1,$2,$3,$4,
          $5,$6,$7
        )

        RETURNING *
        `,
        [
          stage_id,

          image_url,

          image_latitude,
          image_longitude,

          gps_verified,
          distance_from_farm,

          notes,
        ]
      );

    res.status(201).json({
      success: true,
      update:
        result.rows[0],
    });

  } catch (error) {

    console.log("UPDATE ERROR:");
console.log(error);

res.status(500).json({
  success: false,
  message: error.message,
});
  }
};

// ==========================
// GET UPDATES
// ==========================

const getUpdatesByStage =
  async (req, res) => {

    try {

      const {
        stageId
      } = req.params;

      const result =
        await pool.query(
          `
          SELECT *
          FROM crop_updates
          WHERE stage_id = $1
          ORDER BY created_at DESC
          `,
          [stageId]
        );

      res.status(200).json({
        success: true,
        updates:
          result.rows,
      });

    } catch (error) {

      console.log(error);

      res.status(500).json({
        success: false,
        message:
          "Error fetching updates",
      });

    }

  };

module.exports = {
  createUpdate,
  getUpdatesByStage,
};