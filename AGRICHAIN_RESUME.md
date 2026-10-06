# AgriChain — Résumé Bullets (final) + Keyword Defense

> Every keyword below maps to real code you can show. Nothing here is filler, and nothing is beyond what you can explain in an interview. Read the defense lines out loud once so they feel natural.

---

## The 3 bullets (copy-paste ready)

- Developed a **full-stack agricultural marketplace** (**React, Node.js, Express, PostgreSQL**) with **RESTful APIs**, **JWT-based authentication**, and **email-OTP signup verification**, supporting crop listings and crop lifecycle management; **deployed live on Vercel, Render, and Supabase**.

- Built **role-based dashboards for farmers and buyers**, with contract management and **GPS-based crop-stage verification** — reading photo location from **EXIF metadata** (with **OCR** fallback), validating the distance against the registered farm, and **plotting it on an interactive map**.

- Implemented a **milestone-based escrow system** to track staged contract payments, and integrated **live mandi prices** from the government **Agmarknet (data.gov.in) API** for market-linked final settlement.

---

## How to defend every keyword (say exactly this if asked)

| Keyword | Your one-line answer |
|---|---|
| **Full-stack** | "I built all three layers — React frontend, Node/Express backend, PostgreSQL database." |
| **React** | "The frontend — component-based UI for the dashboards and marketplace." |
| **Node.js** | "It lets me run JavaScript on the server instead of just in the browser — my backend runtime." |
| **Express** | "The framework I used on Node to define my API routes and middleware." |
| **PostgreSQL** | "My relational database — chosen because escrow is money data that needs reliable transactions." |
| **RESTful APIs** | "Resource endpoints using HTTP verbs — GET to fetch listings, POST to create, PUT to update." |
| **JWT authentication** | "On login the server signs a token holding the user's id and role; the browser sends it on every request and the server verifies it." |
| **Email-OTP signup verification** | "When someone signs up, I email a 6-digit code that expires in minutes; they must enter it to verify their account before they can log in." |
| **Crop listings** | "Farmers post their crop with details; buyers browse them on the marketplace." |
| **Crop lifecycle management** | "Farmers record growth stages — sowing, vegetative, flowering, pre-harvest — each with a photo update." |
| **Deployed live (Vercel / Render / Supabase)** | "Vercel hosts the React frontend, Render hosts the Node backend, and Supabase hosts the PostgreSQL database — it's live on the internet, not just my laptop." |
| **Role-based dashboards** | "Two roles — farmer and buyer — each sees its own dashboard and allowed actions." |
| **Contract management** | "Buyers send contract offers; farmers accept or reject; status moves pending → accepted → completed." |
| **GPS-based verification** | "I check the photo was actually taken at the farm before accepting a growth-stage update." |
| **EXIF metadata** | "Phone photos store GPS coordinates inside the file's metadata; I read them with a library." |
| **OCR (fallback)** | "If the metadata is missing, GPS-camera apps stamp coordinates onto the photo — I read that text with OCR and pull out the numbers." |
| **Distance validation** | "I calculate the distance between the photo's location and the registered farm; within 500 m, it's verified." |
| **Interactive map (Leaflet)** | "I use Leaflet to plot the farm and the photo's GPS point as markers on a map, so the verified location is visible." |
| **Milestone-based escrow** | "The buyer's payment is tracked and released in stages as the crop progresses, instead of all at once." |
| **Staged contract payments** | "Five milestones — the money is released a portion at a time as each stage is verified." |
| **Live mandi prices** | "I call the government's open market-price API to get the current mandi rate for the crop." |
| **Agmarknet / data.gov.in API** | "The government's public agricultural market-price data source." |
| **Market-linked settlement** | "Final payment uses the live market price so the farmer isn't stuck with an outdated rate." |

---

## Left off on purpose (know why)

- **Admin panel** — the code exists, but signup only allows farmer/buyer, so an admin account has to be set manually. Off the résumé unless you can log in as admin and demo it.
- **ML yield prediction, RAG chatbot, negotiation assistant, offline/PWA** — all real, but dropped to keep the résumé to keywords you can defend cold.

## Keep in your back pocket (don't write it, but say it if they dig into escrow)

Your escrow is concurrency-safe — it guards against double-releasing money using database transactions, row locks, and idempotency keys, and you proved it with a 53-assertion test. You left it off the page for simplicity, but **if an interviewer digs into the payments, this is your single strongest point** — mention it out loud: *"I also made the money movement safe against double-release, and wrote a test suite to prove it."*
