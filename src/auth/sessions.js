const crypto = require("crypto");

function issueSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}

function hashSessionToken(token) {
  return crypto.createHash("sha256").update(String(token ?? "")).digest("hex");
}

module.exports = {
  issueSessionToken,
  hashSessionToken,
};
