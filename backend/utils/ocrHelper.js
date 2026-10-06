const Tesseract = require("tesseract.js");

const extractText = async (buffer) => {

  try {

    const result =
      await Tesseract.recognize(
        buffer,
        "eng"
      );

    return result.data.text;

  } catch (error) {

    console.log(
      "OCR Error:",
      error
    );

    return null;

  }

};

module.exports = extractText;