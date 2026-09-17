/** Small HTTP helpers shared by routes and storage. */

/**
 * RFC 6266 / RFC 5987 Content-Disposition with an ASCII fallback and a UTF-8
 * `filename*` so non-Latin filenames survive every browser.
 */
export function contentDisposition(filename: string, type: "attachment" | "inline" = "attachment"): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(filename).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/** Truncate and strip control characters from an error message before storing it. */
export function sanitiseErrorMessage(err: unknown, max = 500): string {
  let msg: string;
  if (err instanceof Error) msg = err.message;
  else if (typeof err === "string") msg = err;
  else msg = "Unknown error";
  // eslint-disable-next-line no-control-regex
  msg = msg.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "").replace(/\s+/g, " ").trim();
  // Never leak absolute filesystem paths from the worker.
  msg = msg.replace(/(?:[A-Za-z]:\\|\/)(?:[^\s"'`]+[\\/])+[^\s"'`]*/g, "<path>");
  return msg.length > max ? `${msg.slice(0, max - 1)}…` : msg || "Unknown error";
}
