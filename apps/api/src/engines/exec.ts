import { spawn } from "node:child_process";

/**
 * The only place in the codebase that spawns processes.
 *
 * Rules: never `shell: true`; arguments are file paths and fixed flags only;
 * every run has a hard timeout after which the whole process tree is killed.
 */

export interface RunOptions {
  cwd?: string;
  timeoutMs: number;
  env?: NodeJS.ProcessEnv;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
  /** Cap on captured stdout/stderr text (default 1 MB each). */
  maxCapture?: number;
}

export interface RunResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export class BinaryNotFoundError extends Error {
  readonly code = "ENOENT";
  constructor(public readonly bin: string) {
    super(`binary not found: ${bin}`);
    this.name = "BinaryNotFoundError";
  }
}

export class CommandTimeoutError extends Error {
  constructor(public readonly bin: string, public readonly timeoutMs: number) {
    super(`${bin} timed out after ${Math.round(timeoutMs / 1000)}s`);
    this.name = "CommandTimeoutError";
  }
}

export class CommandFailedError extends Error {
  constructor(public readonly bin: string, public readonly exitCode: number | null, public readonly stderr: string) {
    super(`${bin} exited with code ${exitCode}${stderr ? `: ${stderr.trim().split("\n").slice(-3).join(" | ")}` : ""}`);
    this.name = "CommandFailedError";
  }
}

function killTree(pid: number): void {
  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true }).on("error", () => {});
    } else {
      try {
        process.kill(-pid, "SIGKILL"); // process group (we spawn detached on POSIX)
      } catch {
        process.kill(pid, "SIGKILL");
      }
    }
  } catch {
    /* already gone */
  }
}

/** Run a binary to completion. Resolves even on non-zero exit; rejects only on ENOENT or timeout. */
export function run(bin: string, args: readonly string[], opts: RunOptions): Promise<RunResult> {
  const maxCapture = opts.maxCapture ?? 1024 * 1024;
  return new Promise<RunResult>((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;

    const child = spawn(bin, args, {
      cwd: opts.cwd,
      env: opts.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      shell: false,
      detached: process.platform !== "win32",
    });

    const timer = setTimeout(() => {
      timedOut = true;
      if (child.pid) killTree(child.pid);
    }, opts.timeoutMs);

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      if (stdout.length < maxCapture) stdout += chunk;
      opts.onStdout?.(chunk);
    });
    child.stderr?.on("data", (chunk: string) => {
      if (stderr.length < maxCapture) stderr += chunk;
      opts.onStderr?.(chunk);
    });

    child.on("error", (err: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err.code === "ENOENT") reject(new BinaryNotFoundError(bin));
      else reject(err);
    });

    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (timedOut) reject(new CommandTimeoutError(bin, opts.timeoutMs));
      else resolve({ code, signal, stdout, stderr, timedOut });
    });
  });
}

/** Like `run` but throws CommandFailedError on a non-zero exit code. */
export async function runOk(bin: string, args: readonly string[], opts: RunOptions): Promise<RunResult> {
  const res = await run(bin, args, opts);
  if (res.code !== 0) throw new CommandFailedError(bin, res.code, res.stderr || res.stdout);
  return res;
}

export interface FoundBinary {
  path: string;
  version?: string;
}

const probeCache = new Map<string, Promise<FoundBinary | null>>();

/**
 * Try each candidate path/name until one spawns. Any exit code counts as
 * "present" (some tools return 1 for --version). Cached per candidate list.
 */
export function findBinary(candidates: ReadonlyArray<string | undefined>, versionArgs: readonly string[] = ["--version"]): Promise<FoundBinary | null> {
  const list = candidates.filter((c): c is string => Boolean(c));
  const key = `${list.join("|")}::${versionArgs.join(" ")}`;
  const cached = probeCache.get(key);
  if (cached) return cached;
  const p = (async () => {
    for (const bin of list) {
      try {
        const res = await run(bin, versionArgs, { timeoutMs: 15_000 });
        const firstLine = (res.stdout || res.stderr).split(/\r?\n/).find((l) => l.trim()) ?? "";
        const m = /(\d+\.\d+(?:\.\d+)?)/.exec(firstLine);
        return { path: bin, version: m?.[1] };
      } catch (err) {
        if (err instanceof BinaryNotFoundError) continue;
        if (err instanceof CommandTimeoutError) continue;
        continue;
      }
    }
    return null;
  })();
  probeCache.set(key, p);
  return p;
}

/** Test hook. */
export function clearBinaryCache(): void {
  probeCache.clear();
}
