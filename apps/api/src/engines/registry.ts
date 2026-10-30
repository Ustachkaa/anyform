import path from "node:path";
import type { EngineInfo } from "@anyform/shared";
import { canConvert, getFormat } from "@anyform/shared";
import { calibreEngine, calibreSupports } from "./calibre.js";
import { ffmpegEngine } from "./ffmpeg.js";
import { imagemagickEngine } from "./imagemagick.js";
import { libreofficeEngine, LO_INPUTS } from "./libreoffice.js";
import { pandocEngine, pandocSupports } from "./pandoc.js";
import { pdflibEngine } from "./pdflib.js";
import { popplerEngine } from "./poppler.js";
import { sharpEngine, SHARP_INPUTS, sharpSupports } from "./sharp.js";
import { EngineError, type Engine, type EngineContext } from "./types.js";

/**
 * Maps a (from, to) pair to an ordered list of engines. The first one whose
 * probe says "available" runs. Order is fixed and documented here:
 *
 *   video / audio (incl. gif ↔ video)      ffmpeg
 *   image → image                          sharp, then imagemagick (bmp/ico/heic need imagemagick)
 *   image → pdf                            pdf-lib, then imagemagick
 *   pdf → jpg/png/webp                     poppler, then imagemagick
 *   pdf → txt                              poppler, then libreoffice
 *   pdf → html                             poppler (pdftohtml), then libreoffice
 *   pdf → md                               poppler→html + pandoc, then libreoffice→docx + pandoc
 *   pdf → docx/odt/rtf/doc                 libreoffice
 *   md → pdf                               pandoc→html, libreoffice→pdf
 *   html → pdf/doc                         pandoc→html (filtered), libreoffice
 *   html → other documents                 pandoc
 *   md ↔ text formats                      pandoc
 *   document → pdf                         libreoffice
 *   document ↔ document                    libreoffice, then pandoc
 *   presentation / spreadsheet             libreoffice
 *   document → epub                        pandoc, then calibre
 *   document → mobi/azw3/fb2               calibre, then pandoc(→epub)+calibre (md/txt/html: pandoc first only)
 *   ebook ↔ ebook                          calibre (pandoc for epub ↔ fb2)
 *   ebook → pdf/docx/txt                   calibre
 *   ebook → html                           pandoc (epub/fb2) or calibre(→epub)+pandoc
 */

export const BASE_ENGINES: readonly Engine[] = [
  ffmpegEngine,
  sharpEngine,
  imagemagickEngine,
  pdflibEngine,
  popplerEngine,
  libreofficeEngine,
  pandocEngine,
  calibreEngine,
];

/** Compose two engines through an intermediate format. */
export function chain(first: Engine, midExt: string, second: Engine): Engine {
  return {
    name: `${first.name}+${second.name}`,
    async probe(): Promise<EngineInfo> {
      const [a, b] = await Promise.all([first.probe(), second.probe()]);
      return { name: `${first.name}+${second.name}`, available: a.available && b.available };
    },
    async convert(ctx: EngineContext): Promise<void> {
      const midPath = path.join(ctx.tmpDir, `intermediate.${midExt}`);
      const started = Date.now();
      await first.convert({
        ...ctx,
        outputPath: midPath,
        toExt: midExt,
        onProgress: (p) => ctx.onProgress(Math.round(p / 2)),
      });
      await second.convert({
        ...ctx,
        inputPath: midPath,
        fromExt: midExt,
        // The chain shares one budget; the second engine gets what the first left.
        timeoutMs: Math.max(1000, ctx.timeoutMs - (Date.now() - started)),
        onProgress: (p) => ctx.onProgress(50 + Math.round(p / 2)),
      });
    },
  };
}

const MEDIA = new Set(["video", "audio"]);

/** Ordered engine candidates for a pair; empty if the registry says the pair is unsupported. */
export function candidatesFor(fromExt: string, toExt: string): Engine[] {
  const from = getFormat(fromExt);
  const to = getFormat(toExt);
  if (!from || !to || !canConvert(from, to)) return [];
  const f = from.ext;
  const t = to.ext;
  const fc = from.category;
  const tc = to.category;

  if (MEDIA.has(fc) || MEDIA.has(tc)) return [ffmpegEngine];

  if (fc === "image" && tc === "image") {
    return sharpSupports(f, t) ? [sharpEngine, imagemagickEngine] : [imagemagickEngine];
  }
  if (fc === "image" && t === "pdf") {
    return SHARP_INPUTS.has(f) ? [pdflibEngine, imagemagickEngine] : [imagemagickEngine];
  }

  if (f === "pdf") {
    if (tc === "image") return [popplerEngine, imagemagickEngine];
    if (t === "txt") return [popplerEngine, libreofficeEngine];
    // LibreOffice's PDF import puts body text in drawing frames, which its HTML
    // export and pandoc both drop (only the title survived), so prefer pdftohtml.
    if (t === "html") return [popplerEngine, libreofficeEngine];
    if (t === "md") return [chain(popplerEngine, "html", pandocEngine), chain(libreofficeEngine, "docx", pandocEngine)];
    if (tc === "document") return [libreofficeEngine];
    if (tc === "ebook") return [calibreEngine];
  }

  if (fc === "document" && tc === "document") {
    if (f === "md") {
      if (t === "pdf") return [chain(pandocEngine, "html", libreofficeEngine)];
      if (t === "doc") return [chain(pandocEngine, "docx", libreofficeEngine)];
      return [pandocEngine];
    }
    if (f === "html") {
      // LibreOffice loads whatever a page embeds (iframes, images, styles,
      // local or remote), so it only ever sees pandoc's filtered copy.
      if (t === "pdf" || t === "doc") return [chain(pandocEngine, "html", libreofficeEngine)];
      return [pandocEngine];
    }
    if (t === "md") {
      if (f === "doc") return [chain(libreofficeEngine, "docx", pandocEngine)];
      return [pandocEngine];
    }
    if (t === "pdf") return [libreofficeEngine];
    const list: Engine[] = [];
    if (LO_INPUTS.has(f)) list.push(libreofficeEngine);
    if (pandocSupports(f, t)) list.push(pandocEngine);
    return list;
  }

  if (fc === "presentation" || fc === "spreadsheet") return [libreofficeEngine];

  if (fc === "document" && tc === "ebook") {
    if (f === "doc") {
      // legacy binary Word: neither pandoc nor calibre read it → go through docx
      const list: Engine[] = [chain(libreofficeEngine, "docx", calibreEngine)];
      if (t === "epub" || t === "fb2") list.push(chain(libreofficeEngine, "docx", pandocEngine));
      return list;
    }
    if (t === "epub") {
      const list: Engine[] = [];
      if (pandocSupports(f, "epub")) list.push(pandocEngine);
      if (calibreSupports(f, "epub")) list.push(calibreEngine);
      return list;
    }
    const list: Engine[] = [];
    if (calibreSupports(f, t)) list.push(calibreEngine);
    if (pandocSupports(f, t)) list.push(pandocEngine); // fb2
    if (pandocSupports(f, "epub")) list.push(chain(pandocEngine, "epub", calibreEngine));
    return list;
  }

  if (fc === "ebook") {
    if (tc === "ebook") {
      const list: Engine[] = [calibreEngine];
      if (pandocSupports(f, t)) list.push(pandocEngine);
      return list;
    }
    if (t === "html") {
      return pandocSupports(f, "html") ? [pandocEngine, chain(calibreEngine, "epub", pandocEngine)] : [chain(calibreEngine, "epub", pandocEngine)];
    }
    if (calibreSupports(f, t)) return [calibreEngine];
  }

  return [];
}

/** First available engine for the pair, or undefined. */
export async function resolveEngine(fromExt: string, toExt: string): Promise<Engine | undefined> {
  for (const engine of candidatesFor(fromExt, toExt)) {
    const info = await engine.probe();
    if (info.available) return engine;
  }
  return undefined;
}

/** Availability of every base engine (cached per process). */
export async function probeEngines(): Promise<EngineInfo[]> {
  return Promise.all(BASE_ENGINES.map((e) => e.probe()));
}

export { EngineError };
export type { Engine, EngineContext };
