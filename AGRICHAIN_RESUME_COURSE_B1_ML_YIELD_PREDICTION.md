# Part B1 — ML yield prediction (XGBoost service)

> **Group B — NOT on your résumé.** Study after Group A. **Covers:** what the service does · regression & XGBoost from basics · the log-transform trick · the metrics (and how to read them honestly) · confidence bands · graceful degradation · how it plugs into AgriChain.
> **Why Group B:** it's a separate **Python** microservice, not part of the three résumé bullets. Know the **gist** so you can say *"yes, it also does X"* without over-claiming.

**Framing line if asked:** *"I kept the ML off my résumé to stay focused on the full-stack core, but yes — there's a yield-prediction service. Here's how it works."*

---

## B1.1 What it does

Given a crop and its context (location, season, area, conditions), it **predicts the expected yield** (kg per hectare) — a decision-support estimate for farmers/buyers planning a contract. It runs as its **own FastAPI (Python) service**, separate from the Node backend, which calls it over HTTP.

**🔵 Why a separate service:** the ML ecosystem (pandas, scikit-learn, XGBoost) is Python; isolating it means the Node app stays lean and the model can be developed/deployed independently. This is a **microservice** boundary.

---

## B1.2 🔵 LEARN DEEP — regression & XGBoost from basics

- **Regression** = predicting a **number** (yield in kg/ha), as opposed to **classification** (predicting a category). This is a regression problem.
- **Decision tree** = a flowchart of yes/no splits on features that lands on a predicted value.
- **🔵 Gradient boosting** = build **many** small trees **in sequence**, each correcting the previous one's errors; sum them for a strong predictor.
- **XGBoost** = a fast, regularized, industry-standard implementation of gradient boosting. Great for **tabular** data like this (rows of features) — typically beats neural nets on structured/tabular problems.

> **Say it:** *"It's a regression problem — predict a yield number — so I used XGBoost, gradient-boosted trees, which is the go-to for tabular data."*

---

## B1.3 🔵 The log-transform trick (a detail that impresses)

Yields are **right-skewed** (a few very high values). Training directly on raw yield lets big values dominate the error. So the model trains on **log(yield)** and converts predictions back with **`expm1`** (inverse of `log1p`).

**🔵 Why:** log-space makes the target more symmetric, stabilizes variance, and makes the model care about **relative** (percentage) error rather than absolute — appropriate when values span orders of magnitude.

> **Say it:** *"I trained on log-yield and inverted with expm1, because yields are skewed — log-space stabilizes variance and focuses the model on relative error."*

---

## B1.4 The metrics (firsthand — and read them honestly)

| Metric | Value | Plain meaning |
|---|---|---|
| **Features** | ~**643** | columns the model learns from (after encoding) |
| **Train / test split** | **210,085 / 37,074** | rows used to learn vs to evaluate (unseen) |
| **R²** | **0.8742** | explains ~87% of the variance in yield — strong |
| **MAE** | **25,061 kg/ha** | average absolute error |
| **MAPE** | **29.79%** | average error ~30% of the actual value |

**🔵 How to read these without over-claiming (interview maturity):**
- **R² 0.87 is strong** — the model captures most of the pattern.
- **But MAPE ~30% is honestly moderate** — individual predictions can be off by about a third. So it's a **planning aid, not a guarantee**. *Say that* — it shows you understand your own model.
- R² and MAPE telling slightly different stories is normal: R² rewards overall variance explained; MAPE exposes per-row relative error, which skewed targets make harder.

> **Say it:** *"R² is about 0.87, so it explains most of the variance, but MAPE is near 30%, so any single prediction can be off by roughly a third. I treat it as decision support, not a promise — and I report a confidence band rather than a single number."*

---

## B1.5 🔵 Confidence band (not just a point estimate) — firsthand

Instead of one number, the service returns a **range** so users see the **uncertainty**, not a false-precise single figure. How the range is built (firsthand, `inference.py`):

- For each crop, at model-load it computes the **5th and 95th percentile of that crop's actual yields in the training data** (`group["yield_kg_ha"].quantile(0.05 / 0.95)`), and uses that span as the band.
- If a crop has **too little data** to form a band, it falls back to a simple **±15%** around the point estimate (`yield × 0.85 … × 1.15`).

**⚠️ Honest nuance (say this if pushed):** this band is the **empirical historical spread** of that crop's yields — **not a calibrated statistical prediction interval** around *this specific* prediction. It's a pragmatic "typical range for this crop" indicator, which is an honest way to communicate uncertainty on a ~30%-MAPE model, but I wouldn't call it a true 90% confidence interval.

> **Say it:** *"I show a range, not just a point. It's the 5th-to-95th percentile of that crop's yields in the training data — so, the typical historical spread — with a ±15% fallback when a crop lacks data. I'm careful to call it an empirical range, not a calibrated prediction interval."*

---

## B1.6 Graceful degradation

If the ML service is **down or unsure**, AgriChain **still works** — the yield estimate is an **enhancement**, not a dependency. The Node app handles the service being unavailable without breaking the core marketplace/escrow flow.

> **Say it:** *"The prediction is optional — if the Python service is down, the marketplace and escrow are unaffected. I designed it as an enhancement, not a hard dependency."*

---

## B1.7 How it plugs in

Node backend → HTTP call → FastAPI ML service → returns predicted yield + confidence band → shown to the user as planning info (e.g., when creating a listing or evaluating a contract). Deployment pins **Python 3.12.1** so the runtime matches the model's dependencies (Part 9.6).

---

## B1.8 Questions you might get (with answers)

**Q: What model and why?**
> *"XGBoost — gradient-boosted trees — because it's a tabular regression problem, where boosting outperforms most alternatives."*

**Q: Regression vs classification?**
> *"Regression predicts a number (yield); classification predicts a category. This predicts kg/ha, so regression."*

**Q: What's gradient boosting in one line?**
> *"Many small trees built in sequence, each fixing the last one's errors, summed into a strong model."*

**Q: Why log-transform the target?**
> *"Yields are skewed; training on log-yield stabilizes variance and focuses on relative error, then I invert with expm1."*

**Q: How good is it, honestly?**
> *"R² about 0.87 — strong overall — but MAPE near 30%, so single predictions can be off by a third. I ship it as decision support with a confidence band, not a guarantee."*

**Q: What's R²? What's MAPE?**
> *"R² is the fraction of variance the model explains, 1.0 is perfect. MAPE is mean absolute percentage error — average relative miss."*

**Q: How do you handle the uncertainty for users?**
> *"An empirical per-crop 5th–95th percentile range — the historical spread of that crop's yields — rather than a single number. I call it a range, not a calibrated interval."*

**Q: What if the ML service fails?**
> *"Graceful degradation — the core app runs fine without it; the estimate is an enhancement."*

**Q: Why a separate Python service instead of in Node?**
> *"The ML tooling is Python; a microservice keeps the Node app lean and lets the model deploy independently."*

---

### ⚠️ HONEST LIMITS
- **MAPE ~30%** → moderate per-row accuracy; planning aid only.
- **Feature/version drift** → a real deployment needs monitoring + retraining; this is a trained snapshot.

---

### Next: Part B2 — AI chatbot / assistant (verified against source).
