import { ensureCoreSchema } from "../bootstrap/ensureCoreSchema.js";
import pool from "../db.js";

const run = async () => {
  try {
    await ensureCoreSchema();
    console.log("EDUVISTA schema migration completed.");
  } finally {
    await pool.end();
  }
};

run().catch((error) => {
  console.error("Schema migration failed.", error);
  process.exit(1);
});
