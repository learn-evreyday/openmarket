const { HttpError } = require("./errors");

function trimString(value) {
  return String(value ?? "").trim();
}

function parseMoney(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new HttpError(400, "Price must be a valid positive number.");
  }
  return Number(amount.toFixed(2));
}

function parseStock(value) {
  const stock = Number(value);
  if (!Number.isInteger(stock) || stock < 0) {
    throw new HttpError(400, "Stock must be a whole number greater than or equal to zero.");
  }
  return stock;
}

function parseDateInput(value) {
  const normalized = trimString(value);
  if (!normalized) {
    return null;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new HttpError(400, "Dates must use the YYYY-MM-DD format.");
  }
  return normalized;
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

module.exports = {
  trimString,
  parseMoney,
  parseStock,
  parseDateInput,
  toNumber,
};
