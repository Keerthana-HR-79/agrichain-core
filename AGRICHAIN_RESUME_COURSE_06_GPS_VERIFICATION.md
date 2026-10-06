# Part 6 — GPS-based crop-stage verification (EXIF, OCR, Haversine, maps)

> **Group A — a heavily-weighted résumé clause.** **Covers:** GPS & coordinates from basics · EXIF photo metadata · OCR as a fallback · the Haversine distance formula · the 500 m rule · Leaflet interactive maps · the full verification pipeline.
> **Defends:** 🟢 the entire GPS clause in bullet 2 — *"GPS-based crop-stage verification — reading the photo's location from EXIF with an OCR fallback, validating distance to the registered farm, and plotting it on an interactive map."*

This is the clause interviewers love most — it's concrete and unusual. Know it cold.

---

## 6.1 The problem this solves (say it first)

Escrow releases money as the farmer **proves progress**. But a photo alone proves nothing — it could be last year's, or someone else's field. So AgriChain verifies **where** the photo was taken: a crop-stage photo only counts if it was taken **at the registered farm**. That's what turns "here's a picture" into "here's *proof*."

> **Say it:** *"Before releasing staged payments, I need proof the farmer is actually working the registered land — so each progress photo is location-verified against the farm's coordinates."*

---

## 6.2 🔵 LEARN DEEP — GPS & coordinates from basics

- **GPS** = Global Positioning System; a device figures out its position on Earth as **latitude** (north–south) and **longitude** (east–west), in degrees.
- A **coordinate** is a `(lat, lng)` pair — e.g. the farm might be `(12.9716, 77.5946)`.
- Phones tag photos with the coordinates where they were taken, *if* location is enabled — that tag lives in the photo's **EXIF metadata**.

---

## 6.3 🔵 LEARN DEEP — EXIF (the primary source) 🟢

**EXIF** = **Ex**changeable **I**mage **F**ile format — metadata embedded *inside* a photo file by the camera: timestamp, camera model, and (key here) **GPS coordinates**.

**In AgriChain (firsthand):** I use the **`exifr`** library to parse the uploaded image and pull out the GPS latitude/longitude the phone embedded. That's the **primary, most reliable** source of "where was this taken."

> **Say it:** *"First I read the GPS coordinates straight from the photo's EXIF metadata using the exifr library — that's the camera's own record of where it was taken."*

---

## 6.4 🔵 LEARN DEEP — OCR (the fallback) 🟢

EXIF GPS isn't always there — users strip metadata, some apps remove it, screenshots have none. So there's a **fallback**:

**OCR** = **O**ptical **C**haracter **R**ecognition = reading **text out of an image**. Many farming/camera apps **stamp the coordinates visibly onto the photo** (a GPS-camera overlay). If EXIF has no GPS, AgriChain runs OCR (**`tesseract.js`**) to **read those printed coordinates off the image** and uses them instead.

**🔵 Why a fallback at all:** real-world inputs are messy; a single source fails often. A primary + fallback makes verification **robust** instead of brittle. (And if *both* fail, the device's reported coordinates can be used, or it's flagged unverified — graceful degradation.)

> **Say it (interview gold):** *"EXIF is primary, but metadata gets stripped — so if there's no EXIF GPS, I fall back to OCR with Tesseract to read the coordinates that GPS-camera apps stamp onto the image itself. Two independent sources make it robust."*

---

## 6.5 🔵 LEARN DEEP — the Haversine formula (distance) 🟢

Now I have the **photo's** coordinates and the **farm's registered** coordinates (from the listing, Part 4). I need the **distance between two lat/lng points on the Earth's surface**.

**Haversine formula:** the standard way to compute **great-circle distance** (shortest distance over a sphere) between two coordinates. You can't just use flat (Pythagorean) distance because the Earth is curved; Haversine accounts for that curvature.

**In AgriChain (firsthand):**
- Compute Haversine distance between photo-coords and farm-coords.
- **If distance ≤ 500 m → `gps_verified = true`.** Otherwise it's flagged as unverified.
- 500 m is a tolerance that allows for GPS drift and a large field while still rejecting photos taken far away.

> **Say it:** *"I use the Haversine formula to get the real surface distance between the photo and the registered farm — not flat distance, because the Earth's curved — and if it's within 500 metres I mark the stage GPS-verified. The tolerance absorbs GPS drift and field size."*

---

## 6.6 🔵 LEARN DEEP — Leaflet interactive map 🟢

**Leaflet** is a JavaScript library for **interactive maps** in the browser (pan, zoom, markers). AgriChain plots the photo's location (and the farm) on a Leaflet map so a human can **see** where the photo was taken versus the farm — visual confirmation on top of the numeric check.

> **Say it:** *"I plot the verified location on an interactive Leaflet map so you can see the photo's point relative to the farm, not just trust a number."*

---

## 6.7 The full verification pipeline (tell it as one flow)

```
Farmer uploads crop-stage photo  (POST /api/stages, against a contract)
        │
        ▼
1. Try EXIF  (exifr)  ──has GPS?──▶ use it
        │ no GPS
        ▼
2. Fallback OCR (tesseract.js) ──reads stamped coords?──▶ use them
        │ still none
        ▼
3. Device-reported coords / else flag unverified
        │
        ▼
4. Haversine( photo-coords , registered-farm-coords )
        │
        ├─ ≤ 500 m  → gps_verified = true   → this stage can gate a milestone release (Part 7)
        └─ > 500 m  → unverified            → no release
        │
        ▼
5. Plot the point on a Leaflet map for visual confirmation
```

That pipeline — **EXIF → OCR fallback → Haversine vs farm → 500 m → map** — *is* your résumé clause, in order.

---

## 6.8 What this part defends (green recap — the clause, word by word)

- 🟢 *"reading the photo's location from EXIF"* → 6.3 (exifr).
- 🟢 *"with an OCR fallback"* → 6.4 (tesseract.js reads stamped coords).
- 🟢 *"validating distance to the registered farm"* → 6.5 (Haversine vs listing coords, ≤500 m).
- 🟢 *"plotting it on an interactive map"* → 6.6 (Leaflet).

---

## 6.9 Questions you'll get (with answers)

**Q: Walk me through your GPS verification.**
> *"A farmer uploads a progress photo. I read its GPS from EXIF with exifr; if that's missing I fall back to OCR with Tesseract to read coordinates stamped on the image. Then I compute the Haversine distance between that point and the farm's registered coordinates — within 500 metres, it's verified and can release a milestone; otherwise it's rejected. I also plot it on a Leaflet map for visual confirmation."*

**Q: What is EXIF?**
> *"Metadata embedded in a photo by the camera — timestamp, device, and GPS coordinates. It's my primary source for where a photo was taken."*

**Q: Why do you need an OCR fallback?**
> *"EXIF GPS is often stripped — by apps, uploads, or screenshots. Many GPS-camera apps stamp coordinates visibly on the photo, so OCR reads those when EXIF is absent. Two sources make it robust."*

**Q: What's OCR?**
> *"Optical character recognition — extracting text from an image. I use Tesseract.js to read printed coordinates off the photo."*

**Q: Why the Haversine formula and not simple distance?**
> *"Because coordinates are on a sphere. Flat/Pythagorean distance is wrong over the Earth's surface; Haversine gives the true great-circle distance between two lat/lng points."*

**Q: Why 500 metres?**
> *"A tolerance that absorbs GPS drift and the size of a real field while still rejecting photos taken somewhere else. It's a tunable threshold."*

**Q: Can't a farmer fake EXIF data?**
> *"Yes — EXIF can be edited, which is exactly why I don't treat it as unforgeable proof. It raises the bar and, combined with the timestamp, the 500 m check, and a human-viewable map, makes casual fraud hard. For high stakes I'd add server-side capture, liveness, or signed device attestation — I'm clear-eyed that this is deterrence, not cryptographic proof."* ⚠️ *(This honest answer scores well.)*

**Q: What if both EXIF and OCR fail?**
> *"It degrades gracefully — it falls back to device-reported coordinates or flags the stage unverified, which blocks the milestone release rather than guessing."*

**Q: What library draws the map?**
> *"Leaflet — an interactive JS map; I drop markers for the photo location and the farm."*

**Q: Where do the farm's coordinates come from?**
> *"They're registered on the listing when the farmer creates it (Part 4), so there's a fixed reference point to measure every photo against."*

---

### ⚠️ HONEST LIMITS for this part
- **EXIF/OCR are spoofable** → this is fraud *deterrence*, not proof; real hardening = server-side capture / signed device attestation / liveness.
- **OCR is imperfect** → Tesseract can misread stamped text; a bad read falls through to unverified rather than a wrong pass.

---

### Next: Part 7 — Milestone-based escrow (the money engine — the hardest part).
