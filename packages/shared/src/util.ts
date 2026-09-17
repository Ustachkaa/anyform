/** Small formatting helpers used by both apps. */

export function formatBytes(bytes: number, digits = 1): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  const rounded = v >= 100 ? Math.round(v) : Number(v.toFixed(digits));
  return `${rounded} ${units[i]}`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem ? `${m}m ${rem}s` : `${m}m`;
}

export function formatRetention(hours: number): string {
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

/** Replace the extension on a filename, keeping the stem. */
export function replaceExt(filename: string, newExt: string): string {
  const stem = filename.replace(/\.[a-z0-9]{1,8}$/i, "");
  return `${stem || "converted"}.${newExt}`;
}

/** Strip path separators and control characters from a user-supplied filename. */
export function safeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\x00-\x1f\x7f<>:"|?*]/g, "_").trim();
  return cleaned.slice(0, 180) || "file";
}
