// Yield display helper.
//
// This build shows the FARMER's own expected yield as the single "Expected Yield"
// figure. If the farmer didn't provide one, we render "—" rather than a number.
// (The old AI predicted_yield column is no longer used by the UI.)
//
// The value arrives as a PostgreSQL NUMERIC (string) or a number; parseFloat
// handles either. A farmer estimate of 0 or blank is treated as "not provided".

export function expectedYield(listing) {
  const farmer = parseFloat(listing?.farmer_expected_yield);
  if (farmer > 0) return { tonnes: farmer, isFarmer: true };
  return { tonnes: null, isFarmer: false };
}

export function formatYield(listing, decimals = 2) {
  const { tonnes } = expectedYield(listing);
  return tonnes == null ? "—" : `${tonnes.toFixed(decimals)} T`;
}
