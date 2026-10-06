// Input validation and rate limiting middleware
// No extra packages needed — pure Express

// ── In-memory rate limiter ──────────────────────────────────────────────────
const rateLimitStore = new Map();

const rateLimit = ({ windowMs = 15 * 60 * 1000, max = 100, message = "Too many requests" }) => {
  return (req, res, next) => {
    const key = req.ip || req.connection.remoteAddress;
    const now = Date.now();

    if (!rateLimitStore.has(key)) {
      rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    const record = rateLimitStore.get(key);

    if (now > record.resetAt) {
      rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    record.count++;

    if (record.count > max) {
      res.setHeader("Retry-After", Math.ceil((record.resetAt - now) / 1000));
      return res.status(429).json({
        success: false,
        message,
        retry_after_seconds: Math.ceil((record.resetAt - now) / 1000),
      });
    }

    next();
  };
};

// Clean up stale entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of rateLimitStore.entries()) {
    if (now > val.resetAt) rateLimitStore.delete(key);
  }
}, 10 * 60 * 1000);

// ── Validation helpers ───────────────────────────────────────────────────────
const isEmail   = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const isString  = (v, min = 1, max = 500) => typeof v === "string" && v.trim().length >= min && v.trim().length <= max;
const isNumber  = (v, min = 0) => !isNaN(parseFloat(v)) && parseFloat(v) >= min;
const isRole    = (v) => ["farmer", "buyer"].includes(v);

// ── Route param ID validator ──────────────────────────────────────────────
// Rejects requests like /listings/undefined, /stages/abc, or negative/zero
// ids with a clean 400 BEFORE they reach PostgreSQL — which would otherwise
// throw "invalid input syntax for type integer". Pass one or more param names;
// defaults to "id". Usage: router.get("/:id", validateIdParam("id"), handler)
const validateIdParam = (...paramNames) => (req, res, next) => {
  const names = paramNames.length ? paramNames : ["id"];
  for (const name of names) {
    const raw = req.params[name];
    const num = Number(raw);
    if (raw === undefined || raw === "" || !Number.isInteger(num) || num <= 0) {
      return res.status(400).json({
        success: false,
        message: `Invalid ${name.replace(/_/g, " ").replace(/id$/i, "ID")}`,
      });
    }
  }
  next();
};

const validate = (schema) => (req, res, next) => {
  const errors = [];

  for (const [field, rules] of Object.entries(schema)) {
    const value = req.body[field];

    if (rules.required && (value === undefined || value === null || value === "")) {
      errors.push(`${field} is required`);
      continue;
    }

    if (value === undefined || value === null || value === "") continue;

    if (rules.type === "email"  && !isEmail(value))       errors.push(`${field} must be a valid email`);
    if (rules.type === "string" && !isString(value, rules.min || 1, rules.max || 500))
      errors.push(`${field} must be ${rules.min || 1}-${rules.max || 500} characters`);
    if (rules.type === "number" && !isNumber(value, rules.min || 0))
      errors.push(`${field} must be a number${rules.min ? ` >= ${rules.min}` : ""}`);
    if (rules.type === "role"   && !isRole(value))         errors.push(`${field} must be farmer or buyer`);
    if (rules.enum && !rules.enum.includes(value))
      errors.push(`${field} must be one of: ${rules.enum.join(", ")}`);
  }

  if (errors.length > 0) {
    return res.status(400).json({ success: false, message: errors[0], errors });
  }

  next();
};

// ── Pre-built schema validators ──────────────────────────────────────────────
const validateSignup = validate({
  name:     { required: true,  type: "string", min: 2, max: 100 },
  email:    { required: true,  type: "email" },
  password: { required: true,  type: "string", min: 6, max: 100 },
  role:     { required: true,  type: "role" },
});

const validateLogin = validate({
  email:    { required: true, type: "email" },
  password: { required: true, type: "string", min: 1 },
});

const validateContract = validate({
  listing_id:    { required: true,  type: "number", min: 1 },
  quantity:      { required: true,  type: "number", min: 0.1 },
  offered_price: { required: true,  type: "number", min: 1 },
  message:       { required: false, type: "string", max: 1000 },
});

const validateReview = validate({
  contract_id: { required: true, type: "number", min: 1 },
  rating:      { required: true, type: "number", min: 1 },
});

// ── Rate limiter presets ─────────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 minutes
  max: 10,
  message: "Too many login attempts. Please wait 15 minutes.",
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,         // 1 minute
  max: 60,
  message: "Too many requests. Please slow down.",
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,         // 1 minute
  max: 10,
  message: "Too many uploads. Please wait a moment.",
});

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,         // 1 minute
  max: 20,
  message: "Too many chat messages. Please slow down.",
});

module.exports = {
  rateLimit,
  validate,
  validateIdParam,
  validateSignup,
  validateLogin,
  validateContract,
  validateReview,
  authLimiter,
  apiLimiter,
  uploadLimiter,
  chatLimiter,
};
