import type { FormatDef } from "@anyform/shared";

/**
 * Editorial copy for /convert/[pair] pages. Each pair gets a distinct
 * combination of format blurbs, a category-specific "why" paragraph and
 * quality notes, so the pages are not boilerplate clones of one another.
 */

export interface PairCopy {
  title: string;
  description: string;
  h1: string;
  intro: string;
  why: string;
  quality: string[];
  steps: string[];
  faq: Array<{ q: string; a: string }>;
}

const up = (f: FormatDef) => f.ext.toUpperCase();

function whyParagraph(from: FormatDef, to: FormatDef): string {
  const F = up(from);
  const T = up(to);
  const fc = from.category;
  const tc = to.category;

  if (fc === "video" && tc === "audio") {
    return `Pulling the soundtrack out of a ${F} file is the fastest way to turn a recorded lecture, interview, concert clip or voice note into something you can listen to anywhere. Anyform extracts the audio stream and re-encodes it to ${T}, so the result is small, plays on every device, and carries none of the video weight.`;
  }
  if (fc === "video" && to.ext === "gif") {
    return `Short, silent, looping clips travel better as GIFs than as video: they autoplay in chats, docs, and issue trackers without a play button. Anyform samples the ${F} at a sensible frame rate, scales it down and builds an optimised palette so the GIF stays sharp without ballooning in size.`;
  }
  if (from.ext === "gif" && tc === "video") {
    return `A GIF is a surprisingly bulky way to ship a few seconds of motion. Re-encoding it as ${T} typically cuts the size by 80–90% while keeping every frame, and the result can be uploaded to social platforms and messengers that reject animated GIFs.`;
  }
  if (fc === "video" && tc === "video") {
    return `${from.name} files don't play everywhere. Phones, web forms, smart TVs and editing tools each have their favourites, and ${T} is the container most of them agree on. Anyform re-wraps or re-encodes the ${F} so it opens on the device you actually need it on, without you installing anything.`;
  }
  if (fc === "audio" && tc === "audio") {
    return `Audio formats trade size against fidelity and compatibility. ${from.name} is great for what it was made for, but if you need the file to play in a car stereo, a browser, a Kindle or a phone recorder, ${T} is often the answer. Anyform decodes the ${F} and re-encodes it to ${T} with sensible defaults, keeping the original metadata where the format allows.`;
  }
  if (fc === "image" && to.ext === "pdf") {
    return `Turning a ${F} into a PDF gives you a fixed-page document you can attach, sign, print or merge with other pages. Anyform places the image on a page sized to fit it, at full resolution, so nothing is cropped or resampled.`;
  }
  if (from.ext === "pdf" && tc === "image") {
    return `Sometimes you need a page, not a document: a slide for a presentation, a preview thumbnail, a figure to paste into a chat. Anyform renders the PDF pages to ${T} at a print-quality resolution so text stays crisp.`;
  }
  if (fc === "image" && tc === "image") {
    return `${from.name} and ${to.name} were designed for different jobs, and the tool or site you're uploading to usually only accepts one of them. Anyform converts the ${F} to ${T} in memory, preserving dimensions and colour, and handles transparency and animation sensibly where both formats support them.`;
  }
  if (from.ext === "pdf" && tc === "document") {
    return `A PDF is built to be looked at, not edited. Converting it to ${T} gives you back text you can change, reflow and restyle. Anyform reconstructs paragraphs, headings and tables from the PDF so you can pick up where the original author left off.`;
  }
  if (fc === "document" && to.ext === "pdf") {
    return `PDF is the format you send when you want the document to look identical everywhere and not be edited by accident. Anyform renders your ${F} with the same layout engine as a desktop office suite, embedding fonts so the output is print-ready.`;
  }
  if ((fc === "presentation" || fc === "spreadsheet") && to.ext === "pdf") {
    return `Sharing a ${F} as a PDF means recipients see exactly what you see: no missing fonts, no reflowed slides or columns, no accidental edits. Anyform prints every ${fc === "presentation" ? "slide" : "sheet"} to a page.`;
  }
  if (fc === "spreadsheet" && tc === "spreadsheet") {
    return `Tabular data moves between tools constantly, and every tool has an opinion about the file format. Anyform converts the ${F} to ${T} while keeping cell values, sheet names and column order intact, so your import goes through first time.`;
  }
  if (fc === "presentation" && tc === "presentation") {
    return `Slide decks are stubborn about formats. Anyform converts the ${F} to ${T} with a full office layout engine so slides, notes and images make the trip together.`;
  }
  if (fc === "document" && tc === "ebook") {
    return `A ${F} reads badly on an e-reader: fixed margins, no reflow, tiny type. Converting it to ${T} turns it into a proper ebook with a table of contents that Kindle, Kobo and Apple Books understand.`;
  }
  if (fc === "ebook" && tc === "ebook") {
    return `Ebook stores lock you into their formats. ${from.name} and ${to.name} carry the same text, but only one of them will open on the device in your hand. Anyform rebuilds the book in ${T}, keeping chapters, cover and metadata.`;
  }
  if (fc === "ebook") {
    return `Getting a book out of ${F} and into ${T} lets you quote it, print it or read it on a device with no e-reader app. Anyform unpacks the ebook and lays it out as ${T} with the chapters in order.`;
  }
  if (fc === "document" && tc === "document") {
    return `${from.name} and ${to.name} are both text documents, but they belong to different worlds — different editors, different collaborators, different publishing tools. Anyform converts the ${F} to ${T} preserving headings, lists, links and images so you don't have to reformat by hand.`;
  }
  return `Anyform converts ${F} files to ${T} in your browser, with no software to install and no account required for your first ten conversions.`;
}

function qualityNotes(from: FormatDef, to: FormatDef): string[] {
  const notes: string[] = [];
  const lossyAudio = new Set(["mp3", "aac", "m4a", "ogg", "opus", "wma", "amr"]);
  const losslessAudio = new Set(["wav", "flac", "aiff"]);
  const lossyImage = new Set(["jpg", "webp", "avif", "heic"]);

  if (to.ext === "mp3") notes.push("MP3 is lossy. We encode at 192 kbps VBR, which is indistinguishable from the source for nearly everyone; the original is never changed.");
  else if (lossyAudio.has(to.ext)) notes.push(`${to.name} is a lossy format. We pick a bitrate that keeps speech and music transparent while staying small.`);
  if (losslessAudio.has(from.ext) && losslessAudio.has(to.ext)) notes.push("Both formats are lossless, so the audio is bit-for-bit identical after conversion.");
  if (lossyAudio.has(from.ext) && losslessAudio.has(to.ext)) notes.push(`Converting a lossy ${from.ext.toUpperCase()} to ${to.name} doesn't restore quality that was already removed; it just makes the file larger and more compatible.`);

  if (to.ext === "jpg") notes.push("JPEG doesn't support transparency; transparent areas become white. We save at quality 90.");
  if (to.ext === "png") notes.push("PNG is lossless and keeps transparency. Photos will be larger than the original if that was a JPEG.");
  if (to.ext === "webp" || to.ext === "avif") notes.push(`${to.name} keeps transparency and is usually 25–50% smaller than JPEG or PNG at the same visual quality.`);
  if (to.ext === "gif") notes.push("GIF is limited to 256 colours per frame. Gradients may band slightly; we build an optimised palette per file to minimise it.");
  if (lossyImage.has(from.ext) && to.ext === "png") notes.push("Converting a lossy image to PNG keeps every pixel as-is; it won't recover detail lost in the original compression.");
  if (from.ext === "svg") notes.push("SVG is vector; we rasterise it at 2x density so it stays crisp on high-DPI screens.");
  if (from.ext === "heic") notes.push("HEIC photos from iPhones keep their orientation and colour profile after conversion.");

  if (to.ext === "mp4") notes.push("We use H.264 video and AAC audio in the MP4, the combination with the widest playback support. Streams that are already compatible are copied without re-encoding, which is fast and lossless.");
  if (to.ext === "webm") notes.push("WebM output uses VP9 video and Opus audio, the royalty-free pair that browsers play natively.");
  if (from.category === "video" && to.category === "video" && to.ext !== "mp4" && to.ext !== "webm") notes.push("Video is re-encoded with a quality-based setting rather than a fixed bitrate, so simple footage stays small and complex footage keeps its detail.");
  if (from.category === "video" && to.category === "audio") notes.push("Only the first audio track is extracted. Video is discarded, so the result is typically 5–10% of the original size.");

  if (from.ext === "pdf" && (to.ext === "docx" || to.ext === "odt" || to.ext === "rtf")) notes.push("Layout-heavy PDFs (magazines, forms, multi-column) may need touch-ups after conversion. Text-heavy PDFs convert cleanly.");
  if (from.ext === "pdf" && to.ext === "txt") notes.push("Only the text layer is extracted. Scanned PDFs without a text layer produce an empty file; OCR is on the roadmap.");
  if (from.ext === "pdf" && to.category === "image") notes.push("Each page is rendered at 150 DPI. Multi-page PDFs produce a ZIP of images.");
  if (to.ext === "pdf" && from.category !== "image" && from.ext !== "pdf") notes.push("Fonts are embedded and page breaks follow the document's own page setup, so the PDF prints exactly as it looks.");
  if (from.category === "spreadsheet" && to.ext === "csv") notes.push("CSV holds one sheet of plain values: formulas become their results, and formatting is dropped. Only the first sheet is exported.");
  if (from.ext === "csv") notes.push("CSV has no types, so numbers and dates are inferred. Check columns that mix text and numbers.");
  if (to.category === "ebook") notes.push("Chapters are detected from headings to build the table of contents; use proper heading styles in the source for best results.");
  if (to.ext === "md") notes.push("Markdown can't express everything a word processor can. Complex tables and text boxes are simplified.");

  if (notes.length === 0) notes.push(`The ${to.name} output keeps the content of your ${from.name} intact; nothing is uploaded anywhere other than Anyform, and the file is deleted automatically afterwards.`);
  return notes;
}

export function pairCopy(from: FormatDef, to: FormatDef): PairCopy {
  const F = up(from);
  const T = up(to);
  return {
    title: `Convert ${F} to ${T} online — free`,
    description: `Turn .${from.ext} files into .${to.ext} in your browser. 10 free conversions, no ads, no sign-up, files deleted automatically.`,
    h1: `${F} to ${T}`,
    intro: `${from.name} (.${from.ext}): ${from.blurb} ${to.name} (.${to.ext}): ${to.blurb}`,
    why: whyParagraph(from, to),
    quality: qualityNotes(from, to),
    steps: [
      `Drop your .${from.ext} file onto the converter, or click to choose it.`,
      `Check that .${to.ext} is selected as the target (it is pre-selected on this page).`,
      `Press Convert. Upload and conversion progress are shown live.`,
      `Download your .${to.ext}. The file is deleted from our servers automatically.`,
    ],
    faq: [
      {
        q: `Is converting ${F} to ${T} free?`,
        a: `Yes. Every visitor gets 10 free conversions, up to 100 MB per file, with no account and no ads. Subscriptions from $7.99/month remove the count limit and raise the file size to 5 GB.`,
      },
      {
        q: `Is it safe to upload my ${F} file?`,
        a: `Files are transferred over TLS, stored encrypted, processed by an isolated worker and deleted after two hours on the Free plan (longer on paid plans, or instantly if you press Delete). Nobody looks at them and they are never used for anything else.`,
      },
      {
        q: `How long does ${F} to ${T} take?`,
        a: from.category === "video"
          ? "Video conversion runs at roughly 2–5x real-time on our workers, so a 10-minute clip typically takes two to four minutes. Extracting audio or re-wrapping compatible streams takes seconds."
          : "Most files finish in a few seconds. Very large documents and ebooks can take up to a minute.",
      },
      {
        q: `Can I convert ${T} back to ${F}?`,
        a: `Usually. Browse all formats to see every supported direction.`,
      },
    ],
  };
}
