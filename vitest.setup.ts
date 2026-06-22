// Load local env (DATABASE_URL etc.) so DB integration tests can reach the
// database. Suites that need it use `describeDb`, which skips when it is absent.
import { config } from "dotenv";

config({ path: ".env.local" });
config(); // fall back to .env
