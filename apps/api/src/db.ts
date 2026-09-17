import { PrismaClient } from "@prisma/client";
import { isProd } from "./config.js";

/** Prisma client singleton. Tests replace this module with `vi.mock("../db.js")`. */

declare global {
  // eslint-disable-next-line no-var
  var __anyformPrisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  globalThis.__anyformPrisma ??
  new PrismaClient({
    log: isProd ? ["error"] : ["warn", "error"],
  });

if (!isProd) globalThis.__anyformPrisma = prisma;

export type Db = PrismaClient;
