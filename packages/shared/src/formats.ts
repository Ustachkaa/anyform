/**
 * The single source of truth for what Anyform can convert.
 *
 * Both the web app (to render target pickers and SEO pages) and the API/worker
 * (to validate requests and pick an engine) import from here. Never hard-code a
 * format anywhere else.
 */

export type FormatCategory =
  | "image"
  | "video"
  | "audio"
  | "document"
  | "presentation"
  | "spreadsheet"
  | "ebook";

export interface FormatDef {
  /** Canonical lowercase extension without the dot, e.g. "jpg". */
  ext: string;
  /** Human name, e.g. "JPEG Image". */
  name: string;
  category: FormatCategory;
  mime: string;
  /** Other extensions that map onto this format (e.g. "jpeg" -> "jpg"). */
  aliases?: readonly string[];
  /** Can be uploaded as a source. */
  input: boolean;
  /** Can be produced as a target. */
  output: boolean;
  /** Surface first in pickers and marketing. */
  popular?: boolean;
  /** One-line description used on SEO pages. */
  blurb: string;
}

export const CATEGORY_LABELS: Record<FormatCategory, string> = {
  image: "Image",
  video: "Video",
  audio: "Audio",
  document: "Document",
  presentation: "Presentation",
  spreadsheet: "Spreadsheet",
  ebook: "Ebook",
};

export const CATEGORY_ORDER: readonly FormatCategory[] = [
  "video",
  "audio",
  "image",
  "document",
  "presentation",
  "spreadsheet",
  "ebook",
];

const F = (d: FormatDef) => d;

export const FORMATS: readonly FormatDef[] = [
  // ── Image ──────────────────────────────────────────────────────────────
  F({ ext: "jpg", name: "JPEG Image", category: "image", mime: "image/jpeg", aliases: ["jpeg", "jpe", "jfif"], input: true, output: true, popular: true, blurb: "The universal lossy photo format. Small files, supported everywhere." }),
  F({ ext: "png", name: "PNG Image", category: "image", mime: "image/png", input: true, output: true, popular: true, blurb: "Lossless raster image with transparency. Ideal for screenshots, logos and UI." }),
  F({ ext: "webp", name: "WebP Image", category: "image", mime: "image/webp", input: true, output: true, popular: true, blurb: "Google's modern web image format: smaller than JPEG and PNG at the same quality." }),
  F({ ext: "gif", name: "GIF Animation", category: "image", mime: "image/gif", input: true, output: true, popular: true, blurb: "Animated or still 256-colour image. Still the lingua franca of reactions." }),
  F({ ext: "avif", name: "AVIF Image", category: "image", mime: "image/avif", input: true, output: true, blurb: "Next-generation image format based on AV1. Excellent compression, wide browser support." }),
  F({ ext: "tiff", name: "TIFF Image", category: "image", mime: "image/tiff", aliases: ["tif"], input: true, output: true, blurb: "High-fidelity image container used in print, scanning and archiving." }),
  F({ ext: "bmp", name: "Bitmap Image", category: "image", mime: "image/bmp", input: true, output: true, blurb: "Uncompressed Windows bitmap. Large but trivially simple." }),
  F({ ext: "heic", name: "HEIC Image", category: "image", mime: "image/heic", aliases: ["heif"], input: true, output: false, popular: true, blurb: "Apple's default iPhone photo format. Great compression, poor compatibility outside Apple devices." }),
  F({ ext: "svg", name: "SVG Vector", category: "image", mime: "image/svg+xml", input: true, output: false, blurb: "Scalable vector graphics. Rasterise it to PNG or JPG for use where vectors are not supported." }),
  F({ ext: "ico", name: "Icon", category: "image", mime: "image/x-icon", input: true, output: true, blurb: "Windows icon / favicon container holding multiple sizes." }),

  // ── Video ──────────────────────────────────────────────────────────────
  F({ ext: "mp4", name: "MP4 Video", category: "video", mime: "video/mp4", aliases: ["m4v"], input: true, output: true, popular: true, blurb: "The most compatible video container on earth. Plays on every phone, browser and TV." }),
  F({ ext: "mov", name: "QuickTime Video", category: "video", mime: "video/quicktime", input: true, output: true, popular: true, blurb: "Apple's QuickTime container, the default for iPhone and Mac recordings." }),
  F({ ext: "mkv", name: "Matroska Video", category: "video", mime: "video/x-matroska", input: true, output: true, popular: true, blurb: "Flexible open container that holds multiple audio and subtitle tracks." }),
  F({ ext: "avi", name: "AVI Video", category: "video", mime: "video/x-msvideo", input: true, output: true, popular: true, blurb: "Legacy Windows video container. Huge files, still common in archives." }),
  F({ ext: "webm", name: "WebM Video", category: "video", mime: "video/webm", input: true, output: true, popular: true, blurb: "Royalty-free web video (VP9/AV1). The default output of browser screen recorders." }),
  F({ ext: "wmv", name: "Windows Media Video", category: "video", mime: "video/x-ms-wmv", input: true, output: true, blurb: "Microsoft's legacy video format." }),
  F({ ext: "flv", name: "Flash Video", category: "video", mime: "video/x-flv", input: true, output: true, blurb: "Adobe Flash-era video. Convert it to MP4 to play it anywhere today." }),
  F({ ext: "mpeg", name: "MPEG Video", category: "video", mime: "video/mpeg", aliases: ["mpg", "mpe"], input: true, output: true, blurb: "MPEG-1/2 program streams from DVDs and older camcorders." }),
  F({ ext: "3gp", name: "3GP Video", category: "video", mime: "video/3gpp", input: true, output: true, blurb: "Compact mobile video from early feature phones." }),
  F({ ext: "ts", name: "MPEG Transport Stream", category: "video", mime: "video/mp2t", input: true, output: true, blurb: "Broadcast and HLS segment container." }),
  F({ ext: "ogv", name: "Ogg Video", category: "video", mime: "video/ogg", input: true, output: true, blurb: "Open Theora video in an Ogg container." }),

  // ── Audio ──────────────────────────────────────────────────────────────
  F({ ext: "mp3", name: "MP3 Audio", category: "audio", mime: "audio/mpeg", input: true, output: true, popular: true, blurb: "The universal compressed audio format." }),
  F({ ext: "wav", name: "WAV Audio", category: "audio", mime: "audio/wav", input: true, output: true, popular: true, blurb: "Uncompressed PCM audio. Studio quality, big files." }),
  F({ ext: "flac", name: "FLAC Audio", category: "audio", mime: "audio/flac", input: true, output: true, popular: true, blurb: "Lossless compressed audio, about half the size of WAV with identical quality." }),
  F({ ext: "aac", name: "AAC Audio", category: "audio", mime: "audio/aac", input: true, output: true, blurb: "Advanced Audio Coding, the successor to MP3 used by Apple and YouTube." }),
  F({ ext: "m4a", name: "M4A Audio", category: "audio", mime: "audio/mp4", input: true, output: true, popular: true, blurb: "AAC or ALAC audio in an MP4 container. Default for iTunes and Voice Memos." }),
  F({ ext: "ogg", name: "OGG Vorbis", category: "audio", mime: "audio/ogg", aliases: ["oga"], input: true, output: true, blurb: "Open, royalty-free compressed audio." }),
  F({ ext: "opus", name: "Opus Audio", category: "audio", mime: "audio/opus", input: true, output: true, blurb: "State-of-the-art low-latency codec used by WhatsApp, Discord and WebRTC." }),
  F({ ext: "wma", name: "Windows Media Audio", category: "audio", mime: "audio/x-ms-wma", input: true, output: true, blurb: "Microsoft's legacy audio format." }),
  F({ ext: "aiff", name: "AIFF Audio", category: "audio", mime: "audio/aiff", aliases: ["aif"], input: true, output: true, blurb: "Apple's uncompressed audio format, the Mac counterpart to WAV." }),
  F({ ext: "amr", name: "AMR Audio", category: "audio", mime: "audio/amr", input: true, output: true, blurb: "Speech codec used by phone voice recorders." }),

  // ── Document ───────────────────────────────────────────────────────────
  F({ ext: "pdf", name: "PDF Document", category: "document", mime: "application/pdf", input: true, output: true, popular: true, blurb: "The fixed-layout document standard. Looks the same on every device." }),
  F({ ext: "docx", name: "Word Document", category: "document", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", input: true, output: true, popular: true, blurb: "Microsoft Word's modern format. Editable text, styles and images." }),
  F({ ext: "doc", name: "Word 97-2003 Document", category: "document", mime: "application/msword", input: true, output: true, blurb: "Legacy binary Word format." }),
  F({ ext: "odt", name: "OpenDocument Text", category: "document", mime: "application/vnd.oasis.opendocument.text", input: true, output: true, blurb: "The open standard used by LibreOffice Writer." }),
  F({ ext: "rtf", name: "Rich Text Format", category: "document", mime: "application/rtf", input: true, output: true, blurb: "Simple formatted text that nearly every word processor can open." }),
  F({ ext: "txt", name: "Plain Text", category: "document", mime: "text/plain", input: true, output: true, popular: true, blurb: "Just the words. No formatting, maximum compatibility." }),
  F({ ext: "html", name: "HTML Page", category: "document", mime: "text/html", aliases: ["htm"], input: true, output: true, blurb: "A web page as a document." }),
  F({ ext: "md", name: "Markdown", category: "document", mime: "text/markdown", aliases: ["markdown"], input: true, output: true, popular: true, blurb: "Lightweight plain-text formatting beloved by developers and writers." }),

  // ── Presentation ───────────────────────────────────────────────────────
  F({ ext: "pptx", name: "PowerPoint Presentation", category: "presentation", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", input: true, output: true, popular: true, blurb: "Microsoft PowerPoint's modern slide format." }),
  F({ ext: "ppt", name: "PowerPoint 97-2003", category: "presentation", mime: "application/vnd.ms-powerpoint", input: true, output: true, blurb: "Legacy binary PowerPoint format." }),
  F({ ext: "odp", name: "OpenDocument Presentation", category: "presentation", mime: "application/vnd.oasis.opendocument.presentation", input: true, output: true, blurb: "The open standard used by LibreOffice Impress." }),

  // ── Spreadsheet ────────────────────────────────────────────────────────
  F({ ext: "xlsx", name: "Excel Workbook", category: "spreadsheet", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", input: true, output: true, popular: true, blurb: "Microsoft Excel's modern workbook format." }),
  F({ ext: "xls", name: "Excel 97-2003 Workbook", category: "spreadsheet", mime: "application/vnd.ms-excel", input: true, output: true, blurb: "Legacy binary Excel format." }),
  F({ ext: "ods", name: "OpenDocument Spreadsheet", category: "spreadsheet", mime: "application/vnd.oasis.opendocument.spreadsheet", input: true, output: true, blurb: "The open standard used by LibreOffice Calc." }),
  F({ ext: "csv", name: "CSV", category: "spreadsheet", mime: "text/csv", input: true, output: true, popular: true, blurb: "Comma-separated values. The plain-text way to move tabular data anywhere." }),

  // ── Ebook ──────────────────────────────────────────────────────────────
  F({ ext: "epub", name: "EPUB Ebook", category: "ebook", mime: "application/epub+zip", input: true, output: true, popular: true, blurb: "The open ebook standard, reflowable on any screen size." }),
  F({ ext: "mobi", name: "Kindle MOBI", category: "ebook", mime: "application/x-mobipocket-ebook", input: true, output: true, popular: true, blurb: "Amazon's legacy Kindle format." }),
  F({ ext: "azw3", name: "Kindle AZW3", category: "ebook", mime: "application/vnd.amazon.ebook", input: true, output: true, blurb: "Amazon's newer Kindle format (KF8) with better typography." }),
  F({ ext: "fb2", name: "FictionBook", category: "ebook", mime: "application/x-fictionbook+xml", input: true, output: true, blurb: "XML-based ebook format popular in Eastern Europe." }),
];

const byExt = new Map<string, FormatDef>();
for (const f of FORMATS) {
  byExt.set(f.ext, f);
  for (const a of f.aliases ?? []) byExt.set(a, f);
}

/** Normalise "JPEG", ".jpeg", "jpe" -> the canonical FormatDef, or undefined. */
export function getFormat(extOrAlias: string | undefined | null): FormatDef | undefined {
  if (!extOrAlias) return undefined;
  const key = extOrAlias.trim().toLowerCase().replace(/^\./, "");
  return byExt.get(key);
}

/** Extract the extension from a filename ("holiday.MOV" -> "mov"). */
export function extOf(filename: string): string {
  const m = /\.([a-z0-9]{1,8})$/i.exec(filename.trim());
  return m?.[1]?.toLowerCase() ?? "";
}

/** Look up the canonical format for a filename, if we recognise it. */
export function formatOfFilename(filename: string): FormatDef | undefined {
  return getFormat(extOf(filename));
}

/**
 * The conversion rule table. Same-category conversions are always allowed;
 * cross-category conversions are whitelisted explicitly so the picker never
 * offers something the worker cannot do.
 */
export function canConvert(from: FormatDef, to: FormatDef): boolean {
  if (from.ext === to.ext) return false;
  if (!from.input || !to.output) return false;
  const f = from.category;
  const t = to.category;
  if (f === t) return true;
  // video -> audio (extract soundtrack), video <-> gif
  if (f === "video" && t === "audio") return true;
  if (f === "video" && to.ext === "gif") return true;
  if (from.ext === "gif" && t === "video") return true;
  // any raster/vector image -> pdf
  if (f === "image" && to.ext === "pdf") return true;
  // pdf -> raster image (first page or page set)
  if (from.ext === "pdf" && (to.ext === "jpg" || to.ext === "png" || to.ext === "webp")) return true;
  // office -> pdf
  if ((f === "presentation" || f === "spreadsheet") && to.ext === "pdf") return true;
  // documents <-> ebooks
  if (f === "document" && t === "ebook") return true;
  if (f === "ebook" && (to.ext === "pdf" || to.ext === "docx" || to.ext === "txt" || to.ext === "html")) return true;
  return false;
}

/** All formats a given source can be converted to, popular ones first. */
export function targetsFor(from: FormatDef): FormatDef[] {
  return FORMATS.filter((t) => canConvert(from, t)).sort(
    (a, b) =>
      Number(!!b.popular) - Number(!!a.popular) ||
      CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) ||
      a.ext.localeCompare(b.ext),
  );
}

/** All sources that can be converted into a given target. */
export function sourcesFor(to: FormatDef): FormatDef[] {
  return FORMATS.filter((f) => canConvert(f, to));
}

export function formatsByCategory(): Record<FormatCategory, FormatDef[]> {
  const out = {} as Record<FormatCategory, FormatDef[]>;
  for (const c of CATEGORY_ORDER) out[c] = [];
  for (const f of FORMATS) out[f.category].push(f);
  return out;
}

/** Every valid (from, to) pair — used to build the /formats index and sitemaps. */
export function allPairs(): Array<{ from: FormatDef; to: FormatDef }> {
  const out: Array<{ from: FormatDef; to: FormatDef }> = [];
  for (const from of FORMATS) for (const to of FORMATS) if (canConvert(from, to)) out.push({ from, to });
  return out;
}

/**
 * The pairs we pre-render as static SEO landing pages. Chosen for search
 * volume; everything else is still served on demand.
 */
export const POPULAR_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["mp4", "mp3"], ["mov", "mp4"], ["mkv", "mp4"], ["avi", "mp4"], ["webm", "mp4"], ["mp4", "gif"], ["mp4", "webm"],
  ["wav", "mp3"], ["m4a", "mp3"], ["flac", "mp3"], ["mp3", "wav"], ["ogg", "mp3"],
  ["heic", "jpg"], ["png", "jpg"], ["jpg", "png"], ["webp", "png"], ["webp", "jpg"], ["png", "webp"], ["jpg", "webp"], ["svg", "png"], ["avif", "jpg"],
  ["jpg", "pdf"], ["png", "pdf"], ["pdf", "jpg"], ["pdf", "png"], ["pdf", "docx"], ["docx", "pdf"], ["doc", "docx"], ["odt", "docx"], ["pdf", "txt"],
  ["pptx", "pdf"], ["xlsx", "pdf"], ["xlsx", "csv"], ["csv", "xlsx"], ["md", "docx"], ["docx", "md"], ["html", "pdf"], ["md", "pdf"],
  ["epub", "pdf"], ["epub", "mobi"], ["mobi", "epub"], ["azw3", "epub"], ["docx", "epub"],
];

export function pairSlug(from: FormatDef | string, to: FormatDef | string): string {
  const f = typeof from === "string" ? from : from.ext;
  const t = typeof to === "string" ? to : to.ext;
  return `${f}-to-${t}`;
}

/** Parse "mp4-to-mp3" -> { from, to } or undefined if unknown or unsupported. */
export function parsePairSlug(slug: string): { from: FormatDef; to: FormatDef } | undefined {
  const m = /^([a-z0-9]+)-to-([a-z0-9]+)$/i.exec(slug);
  if (!m) return undefined;
  const from = getFormat(m[1]);
  const to = getFormat(m[2]);
  if (!from || !to || !canConvert(from, to)) return undefined;
  return { from, to };
}
