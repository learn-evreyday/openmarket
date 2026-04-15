const crypto = require("crypto");
const { PASSWORD_ITERATIONS, PASSWORD_DIGEST_BYTES } = require("../config");

function hashPassword(password) {
  const normalizedPassword = String(password ?? "");
  const salt = crypto.randomBytes(16).toString("hex");
  const digest = crypto.pbkdf2Sync(
    normalizedPassword,
    salt,
    PASSWORD_ITERATIONS,
    PASSWORD_DIGEST_BYTES,
    "sha256"
  ).toString("hex");

  return `pbkdf2_sha256$${PASSWORD_ITERATIONS}$${salt}$${digest}`;
}

function verifyPassword(password, storedHash) {
  const normalizedHash = String(storedHash ?? "");
  const [algorithm, iterationsValue, salt, expectedDigest] = normalizedHash.split("$");
  if (algorithm !== "pbkdf2_sha256" || !iterationsValue || !salt || !expectedDigest) {
    return false;
  }

  const iterations = Number(iterationsValue);
  if (!Number.isInteger(iterations) || iterations <= 0) {
    return false;
  }

  const derivedDigest = crypto.pbkdf2Sync(
    String(password ?? ""),
    salt,
    iterations,
    Buffer.from(expectedDigest, "hex").length,
    "sha256"
  );

  return crypto.timingSafeEqual(derivedDigest, Buffer.from(expectedDigest, "hex"));
}

module.exports = {
  hashPassword,
  verifyPassword,
};
