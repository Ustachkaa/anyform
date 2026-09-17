import { mkdir, readdir, rename } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { EngineInfo } from "@anyform/shared";
import { config } from "../config.js";
import { findBinary, runOk } from "./exec.js";
import { EngineError, memo, type Engine, type EngineContext } from "./types.js";

/**
 * LibreOffice headless — office documents, presentations, spreadsheets and
 * PDF import. Each job gets a private user profile so concurrent runs do not
 * fight over the lock file.
 */
export const sofficeCandidates = (): Array<string | undefined> => [
  config.SOFFICE_PATH,
  "soffice",
  "libreoffice",
  ...(process.platform === "win32"
    ? ["C:\\Program Files\\LibreOffice\\program\\soffice.exe", "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe"]
    : ["/usr/bin/soffice", "/usr/lib/libreoffice/program/soffice", "/Applications/LibreOffice.app/Contents/MacOS/soffice"]),
];

/** `--convert-to` filter spec per target extension. */
export const LO_EXPORT_FILTERS: Record<string, string> = {
  pdf: "pdf",
  docx: "docx:MS Word 2007 XML",
  doc: "doc:MS Word 97",
  odt: "odt",
  rtf: "rtf:Rich Text Format",
  txt: "txt:Text (encoded):UTF8",
  html: "html",
  xlsx: "xlsx:Calc MS Excel 2007 XML",
  xls: "xls:MS Excel 97",
  ods: "ods",
  csv: "csv:Text - txt - csv (StarCalc):44,34,76,1",
  pptx: "pptx:Impress MS PowerPoint 2007 XML",
  ppt: "ppt:MS PowerPoint 97",
  odp: "odp",
};

export const LO_INPUTS = new Set(["pdf", "docx", "doc", "odt", "rtf", "txt", "html", "xlsx", "xls", "ods", "csv", "pptx", "ppt", "odp"]);

export function buildSofficeArgs(input: string, outDir: string, profileDir: string, fromExt: string, toExt: string): string[] {
  const filter = LO_EXPORT_FILTERS[toExt];
  if (!filter) throw new EngineError("libreoffice", `LibreOffice cannot write ${toExt}`);
  const args = [
    `-env:UserInstallation=${pathToFileURL(profileDir).href}`,
    "--headless",
    "--norestore",
    "--nologo",
    "--nolockcheck",
    "--nodefault",
  ];
  if (fromExt === "pdf") args.push("--infilter=writer_pdf_import");
  args.push("--convert-to", filter, "--outdir", outDir, input);
  return args;
}

export const libreofficeEngine: Engine = {
  name: "libreoffice",
  probe: memo(async (): Promise<EngineInfo> => {
    const found = await findBinary(sofficeCandidates(), ["--version"]);
    return { name: "libreoffice", available: Boolean(found), version: found?.version };
  }),
  async convert(ctx: EngineContext): Promise<void> {
    const found = await findBinary(sofficeCandidates(), ["--version"]);
    if (!found) throw new EngineError("libreoffice", "LibreOffice is not installed");

    const outDir = path.join(ctx.tmpDir, "lo-out");
    const profileDir = path.join(ctx.tmpDir, "lo-profile");
    await mkdir(outDir, { recursive: true });
    await mkdir(profileDir, { recursive: true });

    const args = buildSofficeArgs(ctx.inputPath, outDir, profileDir, ctx.fromExt, ctx.toExt);
    ctx.log(`soffice ${args.join(" ")}`);
    ctx.onProgress(5);
    try {
      await runOk(found.path, args, { timeoutMs: ctx.timeoutMs, cwd: ctx.tmpDir });
    } catch (err) {
      throw new EngineError("libreoffice", `LibreOffice failed: ${(err as Error).message}`);
    }
    ctx.onProgress(90);

    // LibreOffice names the output after the input stem; find it.
    const stem = path.parse(ctx.inputPath).name;
    const files = await readdir(outDir);
    const produced = files.find((f) => f.toLowerCase() === `${stem}.${ctx.toExt}`.toLowerCase()) ?? files.find((f) => f.toLowerCase().endsWith(`.${ctx.toExt}`));
    if (!produced) throw new EngineError("libreoffice", "LibreOffice produced no output (unsupported or corrupt document?)");
    await rename(path.join(outDir, produced), ctx.outputPath);
  },
};
