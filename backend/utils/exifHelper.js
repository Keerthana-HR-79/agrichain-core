const exifr = require("exifr");

const extractGPS = async (buffer) => {

  try {

    const data =
      await exifr.parse(buffer);

    return {
      latitude:
        data?.latitude || null,

      longitude:
        data?.longitude || null,

      timestamp:
        data?.DateTimeOriginal || null,
    };

  } catch (error) {

    console.log(
      "EXIF Error:",
      error
    );

    return null;

  }

};

module.exports = extractGPS;