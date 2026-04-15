const { Pool } = require("pg");
const { DATABASE_URL, PGSSL_DISABLED } = require("../config");

function ensureDatabaseUrl() {
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL is required. Configure a PostgreSQL connection string before starting the OpenMarket SQL app.");
  }
}

function createPool() {
  ensureDatabaseUrl();
  return new Pool({
    connectionString: DATABASE_URL,
    ssl: PGSSL_DISABLED ? false : undefined,
  });
}

const pool = createPool();

async function query(text, params = []) {
  return pool.query(text, params);
}

async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function closePool() {
  await pool.end();
}

module.exports = {
  pool,
  query,
  withTransaction,
  closePool,
};
