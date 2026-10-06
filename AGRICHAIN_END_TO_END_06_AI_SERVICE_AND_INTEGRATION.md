# AgriChain End-to-End — Part E6: The AI Service & Integration Points

> **What this part is.** How AgriChain's AI pieces actually *run* and *plug into* the system — the files, the HTTP boundaries, and the exact call sites. This is the **integration view**, not an ML tutorial: the *concepts* (XGBoost, log-transform, RAG, tool-calling) are taught in the interview course's Group B (`..._B1_ML_YIELD_PREDICTION.md`, `..._B2_AI_CHATBOT_RAG.md`). Here we document how the code works and where it connects.

> ## First, the crucial architecture clarification
> "AI in AgriChain" is **two separate things**, and they live in different places:
>
> | | **(1) The Python ML service** | **(2) The Groq LLM features** |
> |---|---|---|
> | **What** | XGBoost crop-yield prediction + a bundled climate lookup | Chatbot (AgriBot), agentic price negotiator, crop-health advice text |
> | **Where it runs** | A **separate FastAPI service** (its own Render service, port 8000) | **Inside the Node backend** — direct HTTPS calls to Groq's API, no separate service |
> | **Files** | `ai-service/` (Python) | `backend/controllers/ragController.js`, `agentController.js` |
> | **Called by** | `listingController` (live) + `predictionController` (stale) + `agentController` (climate) | the frontend → Node routes `/api/chatbot`, `/api/agent` |
>
> So there are **three** deployed services total (frontend, Node backend, Python ML) — and a **fourth external** dependency, Groq's hosted LLM, which the Node backend calls directly. E6.1–E6.4 cover the Python service; E6.5 covers the Groq features.

---

## E6.1 — The Python ML service: shape & boot

**Purpose:** given a crop + location + agronomic inputs, return a **predicted yield** (tonnes) with a confidence band. It's a thin, stateless HTTP wrapper around a pre-trained XGBoost model.

- **Framework:** FastAPI, served by **uvicorn**. Local default `http://127.0.0.1:8000`; in production it's a Render web service, and the Node backend reaches it via the **`AI_SERVICE_URL`** env var.
- **Stateless + load-once:** at startup it `joblib.load`s the model + the column list into module globals, so every request reuses the in-memory model (no per-request disk read). If the model files are missing, startup fails loudly — the service won't serve a broken model.
- **Why a separate service at all:** Python owns the ML ecosystem (XGBoost, pandas, scikit-learn); Node owns the web app. Splitting them means the ML can be trained/redeployed independently, and a slow/crashed model can't take the API process down with it (the Node side degrades gracefully — E6.3).

---

## E6.2 — The Python files

### `app.py` — the FastAPI entry point
- Creates the FastAPI app, enables permissive **CORS** (`*`), and on **startup** loads the model via `inference.py`.
- Declares the request schemas (Pydantic) and the endpoints (table in E6.4).
- Two prediction endpoints — a **JSON** one (`/predict/json`) and a **multipart** one (`/predict/dynamic`, the one the Node backend actually uses) — plus `/health`, `/model/info`, and the `/climate/...` lookup.

### `inference.py` — the model + the prediction logic
This is the brain. Loaded artifacts:
- **`xgboost_yield_model.pkl`** — the trained XGBoost regressor.
- **`model_columns.pkl`** — the **643-column** feature layout the model expects (the one-hot column order).

The prediction path:
1. **Build a feature row** from the request (crop, state/district, season, area, inputs) matching the 643 columns.
2. **One-hot the categoricals** — set the matching `crop_*`, `state_*`, `season_*` columns to 1, the rest 0 (the top feature-importances are the crop one-hots, i.e. *which crop* dominates the prediction).
3. **Join climate** — pull temperature/rainfall/etc. for the location from the bundled climate CSV (E6.2 climate), or `DEFAULT_CLIMATE` if the location isn't found.
4. **Predict in log space, invert with `np.expm1`** — the model was trained on `log1p(yield)` (so errors scale with magnitude and the model never predicts negative yield); the raw output is passed through `np.expm1` to get tonnes back.
5. **Confidence band** — the **empirical 5th/95th percentile of training yields for that crop** (a `±15%` band is the fallback when a crop has too little data). **This is a descriptive range, not a calibrated statistical prediction interval** — stated honestly.
6. Returns `{ predicted_yield / total_tonnes, confidence_lower, confidence_upper, ... }`. (`market_estimate` is returned as `None` — the price side is the Node market service's job, not the model's.)

### `climate_service_v2.py` (+ legacy `climate_service.py`)
- **`climate_service_v2.py`** — loads a **bundled climate CSV** (NASA-POWER-style columns: temperature, rainfall, humidity, etc.), joins by state/district, averages, and exposes a lookup used both by `inference.py` (feature join) and the `/climate` endpoint. Has a `DEFAULT_CLIMATE` for unknown locations.
- **`climate_service.py`** — an **older/legacy version, effectively dead** (v2 is the live one).
- **Why bundled, not live:** the climate data is a **static snapshot shipped with the service**, not a live weather API call — so predictions are reproducible and don't depend on a third-party weather API being up. (Honest limit: it's a snapshot, not current-season weather.)

### `requirements.txt` + `render.yaml`
- `requirements.txt` pins the Python deps (fastapi, uvicorn, xgboost, scikit-learn, pandas, numpy, joblib, python-multipart, requests/groq if shared).
- **`render.yaml` pins Python `3.12.4`** — confirm this at deploy. *(Note: project memory said 3.12.1; the file says **3.12.4** — trust the file.)* Start command is `uvicorn app:app --host 0.0.0.0 --port $PORT`.

### Model metadata (the honest numbers — memorize these)
From the training `metadata.json`:
- **R² = 0.8742** (explains ~87% of yield variance on the test set).
- **MAPE ≈ 29.79%** (mean absolute percentage error — the honest headline: predictions are ~30% off on average).
- **MAE ≈ 25,061.59** (in the raw target unit).
- **643 features**, **n_train ≈ 210,085**, **n_test ≈ 37,074**.
- Top feature-importances = the **crop one-hots** (the crop identity carries most of the signal).

> **⚠️ Honest framing (say this in an interview):** "R² 0.87 looks strong, but MAPE ~30% is the honest number — it's a *ballpark decision-support estimate*, not a precise forecast. That's exactly why the UI treats the **farmer's own expected yield as primary and the model as a fallback** (`yield.js` in E3), and why I kept ML off my résumé headline."

---

## E6.3 — How the Node backend integrates with the Python service

Three call sites — **one live, one stale, one for climate**:

### (1) LIVE — `listingController.createListing` → `POST {AI_SERVICE_URL}/predict/dynamic`
This is the real, user-facing AI path (traced in E1.11-C). When a farmer creates a listing:
```
createListing → axios.post(AI_SERVICE_URL + "/predict/dynamic", form, { timeout: 15000 })
             → reads total_tonnes + confidence band
             → writes listings.predicted_yield / confidence_lower / confidence_upper
```
- **15-second timeout.** **On any failure → `predicted_yield = 0` and the listing is still created.** The graceful degradation lives *here, in the controller* — core commerce never blocks on the ML service.

### (2) STALE — `predictionController.predictYield` → `aiService` → `POST /predict`
- There's a `/api/ai/predict` route → `predictionController` → `services/aiService.getYieldPrediction` → `axios.post(AI_SERVICE_URL + "/predict", data)`.
- **⚠️ The bare `/predict` route does not exist on the FastAPI service** (only `/predict/json` and `/predict/dynamic` do). So this path **404s** — it's **stale/unused**. `aiService` also has no timeout/retry and re-throws (it does *not* degrade gracefully). **The live path is (1); treat `aiService.js` + `/api/ai` as dead code** to be removed or repointed.

### (3) CLIMATE — `agentController.getCropHealthAdvice` → `GET {AI_SERVICE_URL}/climate/:state/:district`
- The crop-health advisor (`GET /api/agent/health/:listingId/:stageName`, surfaced by `<CropHealthAdvisor>` in StageDetail) pulls climate tiles from the Python `/climate` endpoint (short timeout + fallback), then layers rule-based tips on top.

---

## E6.4 — The Python service endpoint reference

| Endpoint | Method | Used by | Returns |
|---|---|---|---|
| `/health` | GET | uptime checks | `{status:"ok"}` |
| `/model/info` | GET | ModelMonitor / curiosity | model name + feature count + per-crop metrics |
| `/predict/json` | POST (JSON) | — (available, not the Node path) | `{predicted_yield, confidence_*}` |
| `/predict/dynamic` | POST (multipart) | **`listingController` (LIVE)** | `{total_tonnes, confidence_*}` |
| `/climate/:state/:district` | GET | **`agentController`** | climate values for that location |

> **⚠️ Honest limit:** `/model/info` reports `per_crop: {}` always, because **`per_crop_metrics.json` is absent** from the deployment, and the model **`name` reads "unknown"**. Cosmetic, but real — the ModelMonitor's per-crop richness comes from the DB `prediction_log`, not from this endpoint. Also: `/predict/dynamic` **accepts an image but ignores it** (the multipart shape is a historical artifact; only the form fields drive the prediction).

---

## E6.5 — The Groq LLM features (live in the Node backend)

These are **not** in the Python service — they're Node controllers calling Groq's hosted LLM over HTTPS. *(Concept depth: course B2.)*

- **`ragController.js` → `POST /api/chatbot/chat`** (AgriBot): **keyword-overlap "RAG"** — it scores the user's question against a **hand-written `KNOWLEDGE_BASE`** of AgriChain facts (how escrow works, the 500 m GPS rule, etc.), stuffs the best-matching entries into the prompt, and asks Groq to answer. **It is retrieval by keyword overlap, *not* embeddings / a vector DB** — stated honestly. Persists `chatbot_messages`; throttled by `chatLimiter` (20/min). *(The frontend renders replies via `dangerouslySetInnerHTML` — the XSS seam noted in E3.)*
  - **Route reconciliation:** the course B2 referenced `POST /api/rag/chat`; the **real route is `POST /api/chatbot/chat`** (the router file is `ragRoutes.js`, mounted at `/api/chatbot`).
- **`agentController.js` → `POST /api/agent/negotiate`** (agentic negotiator): a **tool-calling** loop — Groq is given "tools" (e.g. look up the market price, compute an escrow value) and decides which to call to negotiate a price, then returns a recommendation. Logs to `negotiation_log`.
- **`agentController.getCropHealthAdvice`** — combines the Python `/climate` lookup (E6.3-3) with rule-based agronomic tips.

> **Why Groq, and why in Node:** these features are conversational/orchestration glue, not number-crunching — so they don't need Python. Keeping them in the Node backend avoids a round trip and lets them reuse the DB pool (chat history, logs). Groq is chosen for **fast, cheap LLM inference**; the `GROQ_API_KEY` is referenced by name only (never committed).

---

## E6.6 — Consolidated honest limits & discrepancies

- **MAPE ~30%** — decision-support, not a precise forecast; the UI makes the farmer's estimate primary.
- **Confidence band is empirical percentile, not a calibrated interval** (`±15%` fallback).
- **Climate is a bundled static snapshot**, not live weather.
- **`services/aiService.js` + `/api/ai/predict` are stale** — they post to a non-existent `/predict` (404); the live path is `listingController` → `/predict/dynamic`.
- **`/model/info.per_crop` is always `{}`** (missing `per_crop_metrics.json`); model `name` = "unknown".
- **`/predict/dynamic` ignores the uploaded image** (only form fields matter).
- **CORS is `*`** on the Python service; **Python pinned 3.12.4** (not 3.12.1 as memory had it).
- **"RAG" is keyword-overlap, not embeddings** — don't over-claim a vector DB.
- **Graceful degradation lives in the Node controller, not in `aiService`** — the ML service failing sets `predicted_yield = 0` and the listing still saves.

---

### Next, and last: **E5 — the complete user journey.** It walks a farmer and a buyer end to end (signup → listing → offer → accept → escrow lock → GPS-verified stages → milestone releases → settlement → dispute), tying together E1 (lifecycle), E2 (backend), E3 (frontend), E4 (database), and this part (AI). **E1, E2, E3, E4, E6** are delivered.
