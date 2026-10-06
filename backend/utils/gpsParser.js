const parseGPSData = (text) => {

let latitude = null;

// Case 1:
// Lat 13.677329

const normalLatMatch =
  text.match(
    /Lat\s+([0-9]+\.[0-9]+)/i
  );

if (normalLatMatch) {

  latitude =
    parseFloat(
      normalLatMatch[1]
    );

}

// Case 2:
// Lat13677329

else {

  const brokenLatMatch =
    text.match(
      /Lat(\d{8,})/i
    );

  if (brokenLatMatch) {

    const raw =
      brokenLatMatch[1];

    latitude =
      parseFloat(
        raw.substring(0, 2) +
        "." +
        raw.substring(2)
      );

  }

}

const longMatch =
  text.match(
    /Long[^0-9]*([0-9]+\.[0-9]+)/i
  );

  const dateMatch =
    text.match(
      /\b(\d{1,2}[\/-]\d{1,2}[\/-]\d{4})\b/
    );

  const timeMatch =
    text.match(
      /\b(\d{1,2}:\d{2}\s?(AM|PM))\b/i
    );

  let village = null;

  const lines = text
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);

  for (const line of lines) {

    const cleaned = line.trim();

    if (
      cleaned.includes("India") &&
      cleaned.includes(",")
    ) {

      const parts =
        cleaned.split(",");

      const rawVillage =
        parts[0];

      const match =
        rawVillage.match(
          /[A-Z][a-zA-Z]+$/
        );

      village =
        match
          ? match[0]
          : rawVillage
              .replace(
                /[^a-zA-Z\s]/g,
                ""
              )
              .trim();

      break;
    }
  }

  return {

    latitude,

    longitude:
      longMatch
        ? parseFloat(longMatch[1])
        : null,

    village,

    date:
      dateMatch
        ? dateMatch[1]
        : null,

    time:
      timeMatch
        ? timeMatch[1]
        : null,
  };
};

module.exports = parseGPSData;