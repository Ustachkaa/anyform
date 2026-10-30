import { mkdir, open, readdir, rename, writeFile } from "node:fs/promises";
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
 *
 * On Windows `soffice.exe` is a GUI-subsystem launcher: it never answers
 * `--version` on stdout, so the probe would time out. `soffice.com`, shipped in
 * the same folder, is the console launcher and is always tried first.
 */
export function windowsConsoleLauncher(bin: string | undefined): Array<string | undefined> {
  if (process.platform !== "win32" || !bin || !/soffice\.exe$/i.test(bin)) return [bin];
  return [bin.replace(/\.exe$/i, ".com"), bin];
}

export const sofficeCandidates = (): Array<string | undefined> => [
  ...windowsConsoleLauncher(config.SOFFICE_PATH),
  "soffice",
  "libreoffice",
  ...(process.platform === "win32"
    ? ["C:\\Program Files\\LibreOffice\\program\\soffice.com", "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.com"]
    : ["/usr/bin/soffice", "/usr/lib/libreoffice/program/soffice", "/Applications/LibreOffice.app/Contents/MacOS/soffice"]),
];

/**
 * Settings written into each job's fresh profile before LibreOffice starts.
 * Uploads are untrusted: macros never run (not even signed ones), and a
 * document can't pull in linked content (images, OLE, frames) from outside
 * itself, so it can't make the converter read local files or fetch URLs.
 */
export const HARDENED_REGISTRY = `<?xml version="1.0" encoding="UTF-8"?>
<oor:items xmlns:oor="http://openoffice.org/2001/registry" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop></item>
<item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="DisableMacrosExecution" oor:op="fuse"><value>true</value></prop></item>
<item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="BlockUntrustedRefererLinks" oor:op="fuse"><value>true</value></prop></item>
<item oor:path="/org.openoffice.Office.Common/Misc"><prop oor:name="UseOpenCL" oor:op="fuse"><value>false</value></prop></item>
</oor:items>
`;

/** A cold LibreOffice start (first run, fresh profile, busy machine) easily exceeds the default 15 s. */
const SOFFICE_PROBE_TIMEOUT_MS = 60_000;

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

const ZIP = [0x50, 0x4b, 0x03, 0x04];
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
/**
 * Leading bytes each binary input must start with. LibreOffice picks its
 * import filter from the content, not the name, so without this an HTML page
 * renamed to .docx would reach its HTML import and skip pandoc's filter.
 */
export const LO_MAGIC: Record<string, number[]> = {
  docx: ZIP, xlsx: ZIP, pptx: ZIP, odt: ZIP, ods: ZIP, odp: ZIP,
  doc: OLE, xls: OLE, ppt: OLE,
  rtf: [...Buffer.from("{\\rtf")],
  pdf: [...Buffer.from("%PDF-")],
};
/** Text inputs get a pinned import filter instead, for the same reason. */
export const LO_TEXT_INFILTERS: Record<string, string> = {
  txt: "Text (encoded):UTF8",
  csv: "Text - txt - csv (StarCalc):44,34,76,1",
};

export function hasMagic(head: Uint8Array, fromExt: string): boolean {
  const magic = LO_MAGIC[fromExt];
  if (!magic) return true;
  // A UTF-8 BOM is tolerated before the text signatures (rtf).
  const start = fromExt === "rtf" && head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf ? 3 : 0;
  return magic.every((b, i) => head[start + i] === b);
}

async function readHead(file: string, n = 16): Promise<Uint8Array> {
  const fh = await open(file, "r");
  try {
    const buf = Buffer.alloc(n);
    const { bytesRead } = await fh.read(buf, 0, n, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
}

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
  const textFilter = LO_TEXT_INFILTERS[fromExt];
  if (textFilter) args.push(`--infilter=${textFilter}`);
  // html only ever arrives from pandoc (filtered); see the registry.
  args.push("--convert-to", filter, "--outdir", outDir, input);
  return args;
}

export const libreofficeEngine: Engine = {
  name: "libreoffice",
  probe: memo(async (): Promise<EngineInfo> => {
    const found = await findBinary(sofficeCandidates(), ["--version"], SOFFICE_PROBE_TIMEOUT_MS);
    return { name: "libreoffice", available: Boolean(found), version: found?.version };
  }),
  async convert(ctx: EngineContext): Promise<void> {
    const found = await findBinary(sofficeCandidates(), ["--version"], SOFFICE_PROBE_TIMEOUT_MS);
    if (!found) throw new EngineError("libreoffice", "LibreOffice is not installed");
    if (!hasMagic(await readHead(ctx.inputPath), ctx.fromExt)) {
      throw new EngineError("libreoffice", `This file is not really a .${ctx.fromExt} document.`);
    }

    const outDir = path.join(ctx.tmpDir, "lo-out");
    const profileDir = path.join(ctx.tmpDir, "lo-profile");
    await mkdir(outDir, { recursive: true });
    await mkdir(path.join(profileDir, "user"), { recursive: true });
    await writeFile(path.join(profileDir, "user", "registrymodifications.xcu"), HARDENED_REGISTRY, "utf8");

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
