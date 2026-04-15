const { PORT, HOST } = require("../config");
const { bootstrapDatabase } = require("../db/bootstrap");
const { createApp } = require("./app");

async function run() {
  await bootstrapDatabase();
  const app = createApp();

  return new Promise((resolve) => {
    app.listen(PORT, HOST, () => {
      console.log(`OpenMarket SQL server running on http://${HOST}:${PORT}`);
      resolve(app);
    });
  });
}

if (require.main === module) {
  run().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  run,
};
