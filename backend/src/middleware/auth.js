import crypto from "crypto";
import jwt from "jsonwebtoken";
import "../env.js";
import pool from "../db.js";

const TOKEN_TTL_HOURS = Number(process.env.JWT_TTL_HOURS || 8);
const getJwtSecret = () => process.env.JWT_SECRET || "dev-secret";

const toExpiryDate = () => {
  const expiry = new Date();
  expiry.setHours(expiry.getHours() + TOKEN_TTL_HOURS);
  return expiry;
};

export const issueAuthToken = async ({ user, userAgent, ipAddress }) => {
  const jti = crypto.randomUUID();
  const expiresAt = toExpiryDate();
  const token = jwt.sign(
    {
      id: user.id,
      role: user.role,
      jti
    },
    getJwtSecret(),
    { expiresIn: `${TOKEN_TTL_HOURS}h` }
  );

  await pool.query(
    `INSERT INTO session_tokens (user_id, jti, expires_at, user_agent, ip_address)
     VALUES (?, ?, ?, ?, ?)`,
    [user.id, jti, expiresAt, userAgent || null, ipAddress || null]
  );

  return {
    token,
    expiresAt: expiresAt.toISOString(),
    jti
  };
};

export const revokeSessionByJti = async (jti) => {
  if (!jti) {
    return;
  }

  await pool.query(
    `UPDATE session_tokens
     SET revoked_at = NOW()
     WHERE jti = ? AND revoked_at IS NULL`,
    [jti]
  );
};

const readBearerToken = (headerValue) => {
  const header = headerValue || "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    return null;
  }
  return token;
};

export const requireAuth = async (req, res, next) => {
  const token = readBearerToken(req.headers.authorization);
  if (!token) {
    return res.status(401).json({ error: "Authentication is required." });
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret());

    if (!decoded?.jti || !decoded?.id) {
      return res.status(401).json({ error: "Invalid token payload." });
    }

    const [rows] = await pool.query(
      `SELECT st.id
       FROM session_tokens st
       JOIN users u ON u.id = st.user_id
       WHERE st.jti = ?
         AND st.user_id = ?
         AND st.revoked_at IS NULL
         AND st.expires_at > NOW()
       LIMIT 1`,
      [decoded.jti, decoded.id]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: "Session expired. Please log in again." });
    }

    req.user = {
      id: decoded.id,
      role: decoded.role,
      jti: decoded.jti
    };
    return next();
  } catch (_error) {
    return res.status(401).json({ error: "Invalid or expired token." });
  }
};

export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication is required." });
  }

  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: "You do not have access to this action." });
  }

  return next();
};
