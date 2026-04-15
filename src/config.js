const path = require("path");

const ROOT = path.resolve(__dirname, "..");

module.exports = {
  ROOT,
  STATIC_DIR: path.join(ROOT, "static"),
  SQL_DIR: path.join(ROOT, "sql"),
  RUNTIME_DIR: path.join(ROOT, "runtime"),
  DATABASE_URL: process.env.DATABASE_URL || "",
  PGSSL_DISABLED: String(process.env.PGSSLMODE || "").toLowerCase() === "disable",
  PORT: Number(process.env.PORT || 8000),
  HOST: process.env.HOST || "0.0.0.0",
  SESSION_COOKIE: "openmarket_session",
  SESSION_TTL_SECONDS: 60 * 60 * 24 * 7,
  STOCK_ACCESS_TTL_SECONDS: 60 * 15,
  PASSWORD_ITERATIONS: 120000,
  PASSWORD_DIGEST_BYTES: 32,
};
