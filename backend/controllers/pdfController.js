const pool = require("../config/db");

// We generate PDF as HTML then return it — frontend prints/saves as PDF.
// This avoids heavy PDF libraries while giving full styling control.

const generateContractPDF = async (req, res) => {
  try {
    const { contract_id } = req.params;
    const user_id = req.user.id;

    const result = await pool.query(
      `SELECT
        contracts.*,
        f.name AS farmer_name, f.email AS farmer_email, f.phone_number AS farmer_phone,
        f.state AS farmer_state, f.district AS farmer_district,
        b.name AS buyer_name,  b.email AS buyer_email,  b.phone_number AS buyer_phone,
        b.state AS buyer_state, b.district AS buyer_district, b.address AS buyer_address,
        listings.crop_name, listings.land_size, listings.predicted_yield,
        listings.farmer_expected_yield,
        listings.soil_type, listings.season, listings.irrigation_method,
        listings.state AS listing_state, listings.district AS listing_district,
        listings.village AS listing_village, listings.taluka AS listing_taluka,
        listings.confidence_lower, listings.confidence_upper,
        e.total_locked, e.buffer_amount, e.advance_amount AS escrow_advance,
        e.released_to_farmer, e.refunded_to_buyer, e.market_price_used,
        e.status AS escrow_status,
        (SELECT mp.price_per_quintal FROM market_prices mp
          WHERE LOWER(mp.crop_name) = LOWER(listings.crop_name)
          ORDER BY mp.recorded_date DESC NULLS LAST, mp.id DESC LIMIT 1) AS current_market_price
       FROM contracts
       JOIN users f   ON contracts.farmer_id  = f.id
       JOIN users b   ON contracts.buyer_id   = b.id
       JOIN listings  ON contracts.listing_id = listings.id
       LEFT JOIN escrow e ON e.contract_id = contracts.id
       WHERE contracts.id = $1
       AND (contracts.farmer_id = $2 OR contracts.buyer_id = $2)`,
      [contract_id, user_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Contract not found" });
    }

    const c = result.rows[0];

    // ── Contract value + escrow schedule (mirrors escrowController.js) ─────────
    const qty        = parseFloat(c.quantity || 0);
    const price      = parseFloat(c.offered_price || 0);
    const totalValue = qty * price * 10;           // quantity(t) × price(₹/Q) × 10 Q/t
    const advance    = totalValue * 0.15;          // milestone 1  — cultivation advance
    const stageRel   = totalValue * 0.65;          // milestones 2-5 — GPS-verified stages
    const finalBal   = totalValue * 0.20;          // paid at harvest (market-adjusted)
    const buffer     = totalValue * 0.10;          // 10% market-upside headroom
    const totalLock  = totalValue * 1.10;          // buyer locks 110%

    // ── Settlement record (populated once the escrow is completed) ─────────────
    const isSettled     = c.status === "completed" || c.escrow_status === "completed";
    const settlePrice   = parseFloat(c.market_price_used || c.market_price_at_settlement || 0);
    const farmerReceived = parseFloat(c.released_to_farmer || c.final_amount || 0);
    const buyerRefunded  = parseFloat(c.refunded_to_buyer || 0);
    const liveMarket    = parseFloat(c.current_market_price || 0);
    const inr = (n) => `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

    const today      = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
    const contractNo = `AGC-${c.id.toString().padStart(6, "0")}`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>AgriChain Contract ${contractNo}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Georgia', serif; color: #1a1a1a; background: white; padding: 40px; }
  .header { text-align: center; border-bottom: 3px solid #16a34a; padding-bottom: 20px; margin-bottom: 30px; }
  .logo { font-size: 28px; font-weight: bold; color: #16a34a; margin-bottom: 4px; }
  .subtitle { font-size: 13px; color: #666; }
  h1 { font-size: 22px; text-align: center; color: #1a1a1a; margin: 20px 0; letter-spacing: 1px; }
  .contract-no { text-align: center; font-size: 13px; color: #666; margin-bottom: 30px; }
  .section { margin-bottom: 25px; }
  .section-title { font-size: 14px; font-weight: bold; color: #16a34a; text-transform: uppercase;
    letter-spacing: 1px; border-bottom: 1px solid #d1fae5; padding-bottom: 6px; margin-bottom: 14px; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  .party-box { border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; background: #f9fafb; }
  .party-label { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
  .party-name { font-size: 17px; font-weight: bold; color: #1a1a1a; margin-bottom: 6px; }
  .party-detail { font-size: 12px; color: #4b5563; line-height: 1.6; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { background: #f0fdf4; color: #166534; font-weight: bold; padding: 10px 14px;
    text-align: left; border: 1px solid #d1fae5; }
  td { padding: 9px 14px; border: 1px solid #e5e7eb; }
  tr:nth-child(even) td { background: #f9fafb; }
  .financial-box { background: #f0fdf4; border: 2px solid #16a34a; border-radius: 10px; padding: 20px; }
  .fin-row { display: flex; justify-content: space-between; padding: 7px 0;
    border-bottom: 1px solid #d1fae5; font-size: 14px; }
  .fin-row:last-child { border-bottom: none; font-weight: bold; font-size: 16px; color: #166534; }
  .fin-label { color: #374151; }
  .fin-value { font-weight: 600; }
  .clause { font-size: 12px; color: #374151; line-height: 1.8; margin-bottom: 8px; }
  .clause-num { font-weight: bold; color: #16a34a; }
  .badge { display: inline-block; background: #d1fae5; color: #065f46; font-size: 11px;
    font-weight: bold; padding: 3px 10px; border-radius: 20px; }
  .sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 10px; }
  .sig-box { border-top: 2px solid #1a1a1a; padding-top: 10px; }
  .sig-name { font-weight: bold; font-size: 14px; }
  .sig-role { font-size: 12px; color: #6b7280; margin-top: 4px; }
  .footer { text-align: center; font-size: 11px; color: #9ca3af; margin-top: 30px;
    padding-top: 20px; border-top: 1px solid #e5e7eb; }
  .status-badge { display: inline-block; padding: 4px 14px; border-radius: 20px; font-size: 12px;
    font-weight: bold; background: ${c.status === "accepted" ? "#d1fae5" : c.status === "completed" ? "#dbeafe" : "#fef9c3"};
    color: ${c.status === "accepted" ? "#065f46" : c.status === "completed" ? "#1e3a8a" : "#713f12"}; }
  @media print {
    body { padding: 20px; }
    .no-print { display: none; }
  }
</style>
</head>
<body>

<div class="header">
  <div class="logo">🌾 AgriChain</div>
  <div class="subtitle">AI-Powered Crop Lifecycle Marketplace</div>
</div>

<h1>AGRICULTURAL PURCHASE CONTRACT</h1>
<p class="contract-no">
  Contract No: <strong>${contractNo}</strong> &nbsp;|&nbsp;
  Date: ${today} &nbsp;|&nbsp;
  Status: <span class="status-badge">${c.status.toUpperCase()}</span>
</p>

<!-- PARTIES -->
<div class="section">
  <div class="section-title">Parties to the Contract</div>
  <div class="grid-2">
    <div class="party-box">
      <div class="party-label">SELLER (Farmer)</div>
      <div class="party-name">${c.farmer_name}</div>
      <div class="party-detail">
        ${c.farmer_email}<br/>
        ${c.farmer_phone || "—"}<br/>
        ${[c.listing_village, c.listing_taluka, c.listing_district, c.listing_state].filter(Boolean).join(", ")}
      </div>
    </div>
    <div class="party-box">
      <div class="party-label">BUYER</div>
      <div class="party-name">${c.buyer_name}</div>
      <div class="party-detail">
        ${c.buyer_email}<br/>
        ${c.buyer_phone || "—"}<br/>
        ${[c.buyer_district, c.buyer_state].filter(Boolean).join(", ") || c.buyer_address || "—"}
      </div>
    </div>
  </div>
</div>

<!-- CROP DETAILS -->
<div class="section">
  <div class="section-title">Crop & Farm Details</div>
  <table>
    <tr><th>Crop Name</th><td>${c.crop_name}</td><th>Season</th><td>${c.season || "—"}</td></tr>
    <tr><th>Land Size</th><td>${c.land_size} acres</td><th>Soil Type</th><td>${c.soil_type || "—"}</td></tr>
    <tr><th>Irrigation</th><td>${c.irrigation_method || "—"}</td><th>Location</th>
      <td>${[c.listing_district, c.listing_state].filter(Boolean).join(", ")}</td></tr>
    <tr><th>Expected Yield</th><td colspan="3">${
      parseFloat(c.farmer_expected_yield) > 0
        ? `${parseFloat(c.farmer_expected_yield).toFixed(2)} tonnes (farmer's estimate)`
        : parseFloat(c.predicted_yield) > 0
          ? `${parseFloat(c.predicted_yield).toFixed(2)} tonnes`
          : "—"
    }</td></tr>
    <tr><th>Contract Quantity</th><td><strong>${c.quantity} tonnes</strong></td>
      <th>Agreed Price</th><td><strong>₹${c.offered_price}/quintal</strong></td></tr>
    ${c.expected_delivery_date ? `<tr><th>Expected Delivery</th><td colspan="3">
      ${new Date(c.expected_delivery_date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</td></tr>` : ""}
  </table>
</div>

<!-- FINANCIAL -->
<div class="section">
  <div class="section-title">Financial Summary</div>
  <div class="financial-box">
    <div class="fin-row">
      <span class="fin-label">Contract Quantity</span>
      <span class="fin-value">${c.quantity} tonnes = ${(parseFloat(c.quantity) * 10).toLocaleString("en-IN")} quintals</span>
    </div>
    <div class="fin-row">
      <span class="fin-label">Agreed Price</span>
      <span class="fin-value">₹${c.offered_price} per quintal</span>
    </div>
    <div class="fin-row">
      <span class="fin-label">Gross Contract Value</span>
      <span class="fin-value">${inr(totalValue)}</span>
    </div>
    <div class="fin-row">
      <span class="fin-label">+ 10% Escrow Buffer (market headroom)</span>
      <span class="fin-value">${inr(buffer)}</span>
    </div>
    <div class="fin-row">
      <span class="fin-label">TOTAL LOCKED IN ESCROW (110%)</span>
      <span class="fin-value">${inr(totalLock)}</span>
    </div>
  </div>
</div>

<!-- PAYMENT SCHEDULE -->
<div class="section">
  <div class="section-title">Stage-Based Payment Schedule</div>
  <table>
    <tr><th>Milestone</th><th>Trigger</th><th>Release</th><th>Amount</th></tr>
    <tr><td>1. Cultivation Advance</td><td>On contract acceptance</td><td>15%</td><td>${inr(advance)}</td></tr>
    <tr><td>2. Sowing Verified</td><td>GPS-tagged "Sowing" photo</td><td>15%</td><td>${inr(totalValue * 0.15)}</td></tr>
    <tr><td>3. Vegetative Growth</td><td>GPS-tagged "Vegetative Growth" photo</td><td>20%</td><td>${inr(totalValue * 0.20)}</td></tr>
    <tr><td>4. Flowering Verified</td><td>GPS-tagged "Flowering" photo</td><td>20%</td><td>${inr(totalValue * 0.20)}</td></tr>
    <tr><td>5. Pre-Harvest Verified</td><td>GPS-tagged "Pre Harvest" photo</td><td>10%</td><td>${inr(totalValue * 0.10)}</td></tr>
    <tr><td><strong>Final Settlement</strong></td><td>At harvest — market-adjusted</td><td><strong>≈20%</strong></td><td><strong>${inr(finalBal)}</strong></td></tr>
  </table>
  <p class="clause" style="margin-top:10px">
    Advance + stage releases pay out ${inr(advance + stageRel)} (80%) as the crop is proven.
    The remaining balance is settled at harvest against the live mandi price${
      liveMarket > 0 ? ` (current ${c.crop_name} reference: ₹${liveMarket}/quintal)` : ""
    }, and the unused escrow buffer is refunded to the Buyer.
  </p>
</div>
${isSettled ? `
<!-- SETTLEMENT RECORD -->
<div class="section">
  <div class="section-title">Settlement Record</div>
  <div class="financial-box" style="border-color:#1e3a8a; background:#eff6ff;">
    <div class="fin-row" style="border-color:#bfdbfe;">
      <span class="fin-label">Market Price at Settlement</span>
      <span class="fin-value">₹${settlePrice.toLocaleString("en-IN")} per quintal</span>
    </div>
    <div class="fin-row" style="border-color:#bfdbfe;">
      <span class="fin-label">Settlement Basis</span>
      <span class="fin-value">${settlePrice > price ? "Live market rate (higher than contracted)" : "Contracted rate"}</span>
    </div>
    <div class="fin-row" style="border-color:#bfdbfe;">
      <span class="fin-label">Buffer Refunded to Buyer</span>
      <span class="fin-value">${inr(buyerRefunded)}</span>
    </div>
    <div class="fin-row" style="color:#1e3a8a; border-color:#bfdbfe;">
      <span class="fin-label">TOTAL PAID TO FARMER</span>
      <span class="fin-value">${inr(farmerReceived)}</span>
    </div>
  </div>
</div>` : ""}

<!-- TERMS -->
<div class="section">
  <div class="section-title">Terms and Conditions</div>
  <p class="clause"><span class="clause-num">1. ADVANCE PAYMENT:</span>
    The Buyer shall release 15% of the total contract value (₹${advance.toLocaleString("en-IN")})
    as cultivation advance within 7 days of contract acceptance to support farming operations.</p>
  <p class="clause"><span class="clause-num">2. GPS VERIFICATION:</span>
    The Seller agrees to upload GPS-tagged crop growth stage photos at each of the five defined stages
    (Sowing, Early Growth, Vegetative Growth, Flowering, Pre-Harvest). All photos must be taken within
    500 meters of the registered farm location.</p>
  <p class="clause"><span class="clause-num">3. MARKET-BASED SETTLEMENT:</span>
    Final payment shall be calculated at harvest using the prevailing APMC market price for
    ${c.crop_name}. The Seller shall receive whichever is higher: the agreed price of
    ₹${c.offered_price}/quintal or the live market price on the delivery date. Market upside is
    honoured up to the 10% escrow buffer (a ceiling of ₹${(price * 1.10).toFixed(0)}/quintal);
    any unused buffer is refunded to the Buyer at settlement.</p>
  <p class="clause"><span class="clause-num">4. QUALITY ASSURANCE:</span>
    The produce must meet standard quality parameters for ${c.crop_name} as per FSSAI guidelines.
    The Buyer has the right to inspect the produce before final acceptance.</p>
  <p class="clause"><span class="clause-num">5. FORCE MAJEURE:</span>
    Neither party shall be liable for delays caused by natural disasters, floods, drought, or
    government restrictions. Both parties must notify AgriChain within 48 hours of such events.</p>
  <p class="clause"><span class="clause-num">6. DISPUTE RESOLUTION:</span>
    Any disputes arising from this contract shall be first mediated through AgriChain's dispute
    resolution process. Unresolved disputes shall be subject to arbitration under Indian Arbitration
    Act, 1996.</p>
  <p class="clause"><span class="clause-num">7. PLATFORM ESCROW:</span>
    All payments are tracked and managed through AgriChain's escrow system. The platform does not
    hold physical funds but maintains a transparent digital ledger of all transactions.</p>
</div>

<!-- SIGNATURES -->
<div class="section">
  <div class="section-title">Signatures</div>
  <div class="sig-grid">
    <div class="sig-box">
      <div class="sig-name">${c.farmer_name}</div>
      <div class="sig-role">Seller (Farmer)</div>
      <div class="sig-role" style="margin-top:8px">Date: ${today}</div>
    </div>
    <div class="sig-box">
      <div class="sig-name">${c.buyer_name}</div>
      <div class="sig-role">Buyer</div>
      <div class="sig-role" style="margin-top:8px">Date: ${today}</div>
    </div>
  </div>
</div>

<div class="footer">
  <p>This contract is generated and managed by AgriChain Platform | Contract ID: ${contractNo}</p>
  <p style="margin-top:6px">🌾 AgriChain — AI-Powered Crop Lifecycle Marketplace | support@agrichain.com</p>
  <p style="margin-top:6px; color: #d1d5db;">This document is legally binding once signed by both parties.</p>
</div>

<script>
  // Auto-trigger print dialog when opened directly
  window.onload = function() {
    if (window.location.search.includes('print=true')) {
      setTimeout(() => window.print(), 500);
    }
  };
</script>

</body>
</html>`;

    res.setHeader("Content-Type", "text/html");
    res.setHeader("Content-Disposition", `inline; filename="contract-${contractNo}.html"`);
    res.send(html);
  } catch (error) {
    console.error("PDF generation error:", error);
    res.status(500).json({ success: false, message: "Error generating contract" });
  }
};

module.exports = { generateContractPDF };
