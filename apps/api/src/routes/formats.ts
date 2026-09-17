import type { FastifyPluginAsync } from "fastify";
import { CATEGORY_LABELS, FORMATS, POPULAR_PAIRS, allPairs } from "@anyform/shared";

/** The registry, for external consumers (the web app imports @anyform/shared directly). */
export const formatsRoutes: FastifyPluginAsync = async (app) => {
  const payload = {
    categories: CATEGORY_LABELS,
    formats: FORMATS,
    pairs: allPairs().map(({ from, to }) => [from.ext, to.ext] as const),
    popular: POPULAR_PAIRS,
  };
  app.get("/formats", { config: { rateLimit: false } }, async (_request, reply) => {
    reply.header("Cache-Control", "public, max-age=3600");
    return payload;
  });
};
