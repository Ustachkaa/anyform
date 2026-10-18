export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
export const API_INTERNAL_URL = (process.env.API_INTERNAL_URL ?? "http://localhost:4000").replace(/\/$/, "");
export const SITE_NAME = "Anyform";
export const SITE_TAGLINE = "Any file. Any format. No nonsense.";
export const SITE_DESCRIPTION =
  "Convert video, audio, images, documents, spreadsheets, presentations and ebooks online. 10 free conversions, no ads, files deleted automatically.";

/** Paddle.js client-side token (Paddle → Developer tools → Authentication). Safe to expose. */
export const PADDLE_CLIENT_TOKEN = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN ?? "";
export const PADDLE_ENV: "sandbox" | "production" = process.env.NEXT_PUBLIC_PADDLE_ENV === "production" ? "production" : "sandbox";
