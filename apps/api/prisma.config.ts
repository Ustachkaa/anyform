import { existsSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "prisma/config";

// Prisma 7 no longer reads .env itself. Locally the URL comes from the repo's
// .env; in Docker it is already in the environment.
const dotenv = path.join(import.meta.dirname, "../../.env");
if (!process.env.DATABASE_URL && existsSync(dotenv)) process.loadEnvFile(dotenv);

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Not env(): that throws when unset, and the Docker build runs `generate` with no database.
  // Commands that do need one (migrate) still fail loudly on the empty URL.
  datasource: { url: process.env.DATABASE_URL ?? "" },
});
