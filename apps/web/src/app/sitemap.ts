import type { MetadataRoute } from "next";
import { POPULAR_PAIRS, allPairs, pairSlug } from "@anyform/shared";
import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const popular = new Set(POPULAR_PAIRS.map(([a, b]) => pairSlug(a, b)));
  const now = new Date();
  const pairs: MetadataRoute.Sitemap = allPairs().map(({ from, to }) => {
    const slug = pairSlug(from, to);
    return {
      url: `${SITE_URL}/convert/${slug}`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: popular.has(slug) ? 0.8 : 0.5,
    };
  });
  return [
    { url: SITE_URL, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/formats`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/pricing`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    ...pairs,
  ];
}
