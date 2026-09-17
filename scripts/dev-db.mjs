#!/usr/bin/env node
/**
 * Local development database without Docker.
 *
 * Starts an embedded PostgreSQL server (binaries ship with the
 * `embedded-postgres` npm package) on the port from DATABASE_URL in .env
 * (default 5433), creates the `anyform` database on first run, and keeps
 * running until Ctrl+C. Data lives in ./data/pg and survives restarts.
 *
 *   npm run dev:db
 */
import EmbeddedPostgres from "embedded-postgres";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function readEnvUrl() {
  try {
    const env = readFileSync(resolve(root, ".env"), "utf8");
    const line = env.split(/\r?\n/).find((l) => l.startsWith("DATABASE_URL="));
    if (line) return new URL(line.slice("DATABASE_URL=".length).trim().replace(/\s+#.*$/, ""));
  } catch {
    /* no .env yet */
  }
  return new URL("postgresql://anyform:anyform@localhost:5433/anyform");
}

const url = readEnvUrl();
const port = Number(url.port || 5432);
const user = decodeURIComponent(url.username || "anyform");
const password = decodeURIComponent(url.password || "anyform");
const database = url.pathname.replace(/^\//, "") || "anyform";
const databaseDir = resolve(root, "data", "pg");
const firstRun = !existsSync(resolve(databaseDir, "PG_VERSION"));

mkdirSync(databaseDir, { recursive: true });

const pg = new EmbeddedPostgres({
  databaseDir,
  user,
  password,
  port,
  persistent: true,
  // Windows initdb defaults to the system code page (e.g. WIN1252); the app stores
  // UTF-8 text (arrows in error messages, any filename), so force UTF8 like the
  // official postgres Docker image does.
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  onLog: (msg) => process.stdout.write(String(msg).endsWith("\n") ? String(msg) : `${msg}\n`),
  onError: (msg) => process.stderr.write(String(msg).endsWith("\n") ? String(msg) : `${msg}\n`),
});

async function main() {
  if (firstRun) {
    console.log(`[dev-db] initialising a new cluster in ${databaseDir}`);
    await pg.initialise();
  }
  await pg.start();
  if (firstRun) {
    await pg.createDatabase(database);
    console.log(`[dev-db] created database "${database}"`);
  } else {
    // Make sure the database exists even if a previous run was interrupted.
    try {
      await pg.createDatabase(database);
      console.log(`[dev-db] created missing database "${database}"`);
    } catch {
      /* already exists */
    }
  }
  console.log(`[dev-db] PostgreSQL ready on postgresql://${user}:***@localhost:${port}/${database}`);
  console.log("[dev-db] press Ctrl+C to stop");

  const shutdown = async () => {
    console.log("\n[dev-db] stopping…");
    try {
      await pg.stop();
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[dev-db] failed:", err?.message ?? err);
  process.exit(1);
});
