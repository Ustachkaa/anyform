"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type DragEvent } from "react";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  ONE_TIME_PRODUCTS,
  PLANS,
  canConvert,
  formatBytes,
  formatDuration,
  formatOfFilename,
  getFormat,
  targetsFor,
  type ConversionDTO,
  type FormatDef,
  type UsageDTO,
} from "@anyform/shared";
import { ApiClientError, createConversion, downloadUrl, explainError, getConversion, getUsage } from "@/lib/api";
import { FormatChip } from "./FormatChip";
import { PairArrow } from "./PairArrow";
import { UsageMeter } from "./UsageMeter";

type Phase =
  | { kind: "idle" }
  | { kind: "ready"; file: File; from: FormatDef }
  | { kind: "uploading"; file: File; from: FormatDef; to: FormatDef; percent: number }
  | { kind: "working"; file: File; from: FormatDef; to: FormatDef; job: ConversionDTO }
  | { kind: "done"; file: File; from: FormatDef; to: FormatDef; job: ConversionDTO }
  | { kind: "failed"; file: File; from: FormatDef; to: FormatDef; job: ConversionDTO | null; message: string }
  | { kind: "paywall"; usage: UsageDTO | null };

interface Props {
  /** Pre-selected source extension (from a /convert/[pair] page). */
  initialFrom?: string;
  /** Pre-selected target extension. */
  initialTo?: string;
  className?: string;
}

const POLL_MS = 1500;
/** Give up after this many failed polls in a row (~30 s of no answer). */
const MAX_POLL_ERRORS = 20;
/** Stop watching after this long; the job may still finish and appear in the dashboard. */
const MAX_WATCH_MS = 60 * 60_000;

export function Converter({ initialFrom, initialTo, className = "" }: Props) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadAbort = useRef<AbortController | null>(null);

  // Leaving the page mid-upload cancels it, so the visitor isn't charged for a file they abandoned.
  useEffect(() => () => uploadAbort.current?.abort(), []);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [target, setTarget] = useState<string | null>(initialTo ?? null);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [usage, setUsage] = useState<UsageDTO | null>(null);

  const presetFrom = useMemo(() => getFormat(initialFrom), [initialFrom]);
  const presetTo = useMemo(() => getFormat(initialTo), [initialTo]);

  const refreshUsage = useCallback(() => {
    getUsage()
      .then(setUsage)
      .catch(() => setUsage(null));
  }, []);

  useEffect(() => {
    refreshUsage();
  }, [refreshUsage]);

  // ── File intake ─────────────────────────────────────────────────────────
  const takeFiles = useCallback(
    (files: FileList | File[] | null) => {
      const file = files?.[0];
      if (!file) return;
      setNotice(null);
      const from = formatOfFilename(file.name);
      if (!from) {
        const ext = file.name.split(".").pop();
        setNotice(
          ext && ext !== file.name
            ? `We don't recognise .${ext.toLowerCase()} files yet. Browse the formats page to see what's supported.`
            : "That file has no extension, so we can't tell what it is. Rename it with the right extension and try again.",
        );
        return;
      }
      if (!from.input) {
        setNotice(`.${from.ext} can be produced but not read yet. Try a different source file.`);
        return;
      }
      if (usage && file.size > usage.maxFileBytes) {
        setNotice(
          `That file is ${formatBytes(file.size)}. Your plan allows up to ${formatBytes(usage.maxFileBytes)} per file — Business goes to ${formatBytes(PLANS.business.maxFileBytes)}.`,
        );
      }
      // Keep the chosen target if it still makes sense for this file.
      const keep = target ? getFormat(target) : undefined;
      if (!keep || !canConvert(from, keep)) {
        const fallback = presetTo && canConvert(from, presetTo) ? presetTo.ext : null;
        setTarget(fallback);
      }
      setPhase({ kind: "ready", file, from });
    },
    [presetTo, target, usage],
  );

  const onDrop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    setDragging(false);
    takeFiles(e.dataTransfer.files);
  };
  const onDragOver = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    if (!dragging) setDragging(true);
  };
  const onDragLeave = (e: DragEvent<HTMLElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setDragging(false);
  };

  // ── Start ───────────────────────────────────────────────────────────────
  const start = useCallback(async () => {
    if (phase.kind !== "ready" || !target) return;
    const to = getFormat(target);
    if (!to || !canConvert(phase.from, to)) return;
    const { file, from } = phase;
    setNotice(null);
    setPhase({ kind: "uploading", file, from, to, percent: 0 });
    try {
      uploadAbort.current = new AbortController();
      const res = await createConversion(
        file,
        to.ext,
        (percent) => setPhase((p) => (p.kind === "uploading" ? { ...p, percent } : p)),
        uploadAbort.current.signal,
      );
      setUsage(res.usage);
      setPhase({ kind: "working", file, from, to, job: res.conversion });
    } catch (e) {
      if (e instanceof ApiClientError && e.code === "QUOTA_EXCEEDED") {
        const u = (e.details as UsageDTO | undefined) ?? usage;
        setPhase({ kind: "paywall", usage: u ?? null });
        return;
      }
      setPhase({ kind: "failed", file, from, to, job: null, message: explainError(e) });
    }
  }, [phase, target, usage]);

  // ── Poll while working ─────────────────────────────────────────────────
  useEffect(() => {
    if (phase.kind !== "working") return;
    const id = phase.job.id;
    let alive = true;
    let errorsInARow = 0;
    const started = Date.now();
    const stop = (message: string) =>
      setPhase((p) => (p.kind === "working" && p.job.id === id ? { kind: "failed", file: p.file, from: p.from, to: p.to, job: p.job, message } : p));
    const tick = async () => {
      if (Date.now() - started > MAX_WATCH_MS) {
        stop("This is taking much longer than usual. If it finishes, it will be in your dashboard.");
        return;
      }
      try {
        const job = await getConversion(id);
        if (!alive) return;
        errorsInARow = 0;
        setPhase((p) => {
          if (p.kind !== "working" || p.job.id !== id) return p;
          if (job.status === "done") return { kind: "done", file: p.file, from: p.from, to: p.to, job };
          if (job.status === "failed")
            return {
              kind: "failed",
              file: p.file,
              from: p.from,
              to: p.to,
              job,
              message: job.error ? humaniseJobError(job.error) : "The conversion failed. Try again or pick another format.",
            };
          return { ...p, job };
        });
      } catch (e) {
        if (!alive) return;
        if (e instanceof ApiClientError && e.status === 404) {
          stop("This conversion no longer exists: it expired or was deleted.");
          return;
        }
        // Transient network blips are normal; a long run of them is not.
        if (++errorsInARow >= MAX_POLL_ERRORS) {
          stop("We lost touch with the server. Your file may still finish; check your dashboard in a minute.");
        }
      }
    };
    const t = setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [phase.kind === "working" ? phase.job.id : null, phase.kind]);

  useEffect(() => {
    if (phase.kind === "done" || phase.kind === "failed") refreshUsage();
  }, [phase.kind, refreshUsage]);

  const reset = () => {
    setPhase({ kind: "idle" });
    setNotice(null);
    setTarget(initialTo ?? null);
    if (inputRef.current) inputRef.current.value = "";
  };

  // ── Render ──────────────────────────────────────────────────────────────
  const oversize = phase.kind === "ready" && usage ? phase.file.size > usage.maxFileBytes : false;

  return (
    <section className={`relative ${className}`} aria-label="File converter">
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        className="sr-only"
        onChange={(e) => takeFiles(e.target.files)}
        tabIndex={-1}
      />

      {phase.kind === "idle" && (
        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragEnter={onDragOver}
          onDragLeave={onDragLeave}
          className={`relative rounded-[6px] border-2 border-dashed bg-paper-2 p-6 transition-colors sm:p-10 ${
            dragging ? "march border-transparent bg-accent/20" : "border-line"
          }`}
        >
          {(presetFrom || presetTo) && (
            <div className="mb-6 flex items-center justify-center gap-3">
              {presetFrom ? <FormatChip format={presetFrom} size="lg" tone="paper" /> : <span className="mono text-sm text-ink-3">any file</span>}
              <PairArrow size={26} />
              {presetTo ? <FormatChip format={presetTo} size="lg" /> : <span className="mono text-sm text-ink-3">pick</span>}
            </div>
          )}
          <div className="flex flex-col items-center text-center">
            <svg viewBox="0 0 64 64" className="h-12 w-12 text-ink" aria-hidden="true">
              <path d="M32 44V14M18 28l14-14 14 14" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M12 46v6a4 4 0 0 0 4 4h32a4 4 0 0 0 4-4v-6" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
            </svg>
            <h2 className="display mt-4 text-2xl font-semibold sm:text-3xl">
              {dragging ? "Let go." : presetFrom ? `Drop your .${presetFrom.ext} here` : "Drop a file here"}
            </h2>
            <p className="mt-1 text-sm text-ink-2">or</p>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="mt-3 inline-flex items-center gap-2 rounded-[4px] bg-ink px-5 py-3 text-base font-medium text-paper transition-transform hover:-translate-y-0.5 active:translate-y-0"
            >
              Choose a file
            </button>
            <p className="mono mt-5 text-xs text-ink-3">
              up to {formatBytes(usage?.maxFileBytes ?? PLANS.free.maxFileBytes)} · 50 formats · deleted in{" "}
              {usage ? `${usage.retentionHours}h` : "2h"}
            </p>
          </div>
          {notice && (
            <p role="alert" className="mt-5 rounded-[4px] border border-bad/40 bg-bad/5 px-3 py-2 text-sm text-bad">
              {notice}
            </p>
          )}
        </div>
      )}

      {phase.kind === "ready" && (
        <div className="rounded-[6px] border border-line bg-paper-2 p-4 sm:p-6">
          <div className="flex flex-wrap items-center gap-3">
            <FormatChip format={phase.from} size="lg" tone="paper" />
            <div className="min-w-0 flex-1">
              <p className="mono truncate text-sm text-ink" title={phase.file.name}>
                {phase.file.name}
              </p>
              <p className="mono text-xs text-ink-3">
                {formatBytes(phase.file.size)} · {phase.from.name}
              </p>
            </div>
            <button type="button" onClick={reset} className="text-sm text-ink-3 underline-offset-2 hover:text-ink hover:underline">
              change
            </button>
          </div>

          <div className="mt-5 flex items-center gap-3">
            <PairArrow size={22} tone="muted" />
            <span className="mono text-xs uppercase tracking-widest text-ink-3">convert to</span>
          </div>
          <TargetPicker from={phase.from} value={target} onChange={setTarget} />

          {notice && (
            <p role="alert" className="mt-4 rounded-[4px] border border-bad/40 bg-bad/5 px-3 py-2 text-sm text-bad">
              {notice}{" "}
              <Link href="/pricing" className="font-medium underline">
                See plans
              </Link>
            </p>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={!target || oversize}
              onClick={start}
              className="inline-flex items-center gap-3 rounded-[4px] bg-ink px-6 py-3 text-base font-medium text-paper transition-transform enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Convert
              {target && (
                <span className="mono rounded-[3px] bg-accent px-1.5 py-0.5 text-xs text-accent-ink">.{target}</span>
              )}
            </button>
            {usage && <UsageMeter usage={usage} compact className="min-w-[180px] flex-1" />}
          </div>
        </div>
      )}

      {(phase.kind === "uploading" || phase.kind === "working" || phase.kind === "done" || phase.kind === "failed") && (
        <Ticket phase={phase} onReset={reset} />
      )}

      {phase.kind === "paywall" && <Paywall usage={phase.usage} onBack={reset} />}
    </section>
  );
}

// ─── Target picker ─────────────────────────────────────────────────────────

function TargetPicker({ from, value, onChange }: { from: FormatDef; value: string | null; onChange: (ext: string) => void }) {
  const targets = useMemo(() => targetsFor(from), [from]);
  const groups = CATEGORY_ORDER.map((c) => ({ c, items: targets.filter((t) => t.category === c) })).filter((g) => g.items.length > 0);
  return (
    <div role="radiogroup" aria-label="Target format" className="mt-3 space-y-3">
      {groups.map((g) => (
        <div key={g.c}>
          {groups.length > 1 && <p className="mono mb-1.5 text-[11px] uppercase tracking-widest text-ink-3">{CATEGORY_LABELS[g.c]}</p>}
          <div className="flex flex-wrap gap-1.5">
            {g.items.map((t) => {
              const on = value === t.ext;
              return (
                <button
                  key={t.ext}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  title={t.name}
                  onClick={() => onChange(t.ext)}
                  className={`mono rounded-[3px] border px-2.5 py-1.5 text-sm leading-none transition-colors ${
                    on ? "border-ink bg-ink text-paper" : "border-line bg-paper text-ink hover:border-ink"
                  }`}
                >
                  .{t.ext}
                  {t.popular && !on && <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-accent align-middle" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Ticket (job card) ────────────────────────────────────────────────────

type JobPhase = Extract<Phase, { kind: "uploading" | "working" | "done" | "failed" }>;

function Ticket({ phase, onReset }: { phase: JobPhase; onReset: () => void }) {
  const job = "job" in phase ? phase.job : null;
  const done = phase.kind === "done";
  const failed = phase.kind === "failed";
  const pct = phase.kind === "uploading" ? phase.percent : phase.kind === "working" ? phase.job.progress : done ? 100 : 0;
  const indeterminate = phase.kind === "working" && (phase.job.status === "queued" || phase.job.progress <= 0);

  const label =
    phase.kind === "uploading"
      ? `Uploading… ${phase.percent}%`
      : phase.kind === "working"
        ? phase.job.status === "queued"
          ? "Queued — waiting for a worker"
          : `Converting… ${phase.job.progress}%`
        : done
          ? "Done"
          : "Failed";

  const took = job?.startedAt && job?.finishedAt ? new Date(job.finishedAt).getTime() - new Date(job.startedAt).getTime() : null;

  return (
    <div className="overflow-visible">
      <div className="rounded-t-[6px] bg-ink px-4 py-4 text-paper sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <FormatChip format={phase.from} size="md" tone="paper" />
          <PairArrow size={18} tone="accent" />
          <FormatChip format={phase.to} size="md" tone="accent" />
          <p className="mono ml-auto max-w-full truncate text-xs text-paper/70" title={phase.file.name}>
            {phase.file.name}
          </p>
        </div>
      </div>
      <div className="ticket-edge rounded-b-[6px] border border-t-0 border-line bg-paper-2 px-4 pb-5 pt-5 sm:px-6">
        <div className="flex items-baseline justify-between gap-4">
          <p className={`display text-xl font-semibold ${failed ? "text-bad" : "text-ink"}`} aria-live="polite" role="status">
            {label}
          </p>
          {job?.engine && done && <p className="mono text-xs text-ink-3">via {job.engine}</p>}
        </div>

        <div className="mt-3 h-3 w-full overflow-hidden rounded-[3px] bg-ink/10" aria-hidden="true">
          <div
            className={`h-full transition-[width] duration-500 ease-out ${
              failed ? "bg-bad" : done ? "bg-ink" : indeterminate ? "stripes" : "bg-accent"
            }`}
            style={{ width: indeterminate ? "100%" : `${Math.max(2, pct)}%` }}
          />
        </div>

        {done && job && (
          <p className="mono mt-3 text-sm text-ink-2">
            {formatBytes(job.sourceBytes)} → {job.outputBytes !== null ? formatBytes(job.outputBytes) : "—"}
            {took !== null ? ` · ${formatDuration(took)}` : ""}
          </p>
        )}

        {failed && <p className="mt-3 text-sm text-bad">{phase.message}</p>}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          {done && job ? (
            <a
              href={downloadUrl(job.id)}
              download={job.outputName ?? undefined}
              className="inline-flex items-center gap-2 rounded-[4px] bg-accent px-6 py-3 text-base font-medium text-accent-ink transition-transform hover:-translate-y-0.5"
            >
              Download
              {job.outputName && <span className="mono text-xs opacity-80">.{phase.to.ext}</span>}
            </a>
          ) : null}
          <button
            type="button"
            onClick={onReset}
            className={`inline-flex items-center rounded-[4px] px-4 py-3 text-sm font-medium transition-colors ${
              done || failed ? "border border-ink text-ink hover:bg-ink hover:text-paper" : "text-ink-3 hover:text-ink"
            }`}
          >
            {done ? "Convert another" : failed ? "Try again" : "Cancel"}
          </button>
        </div>
        {done && (
          <p className="mono mt-4 text-xs text-ink-3">
            expires {job ? new Date(job.expiresAt).toLocaleString() : ""} · you can delete it earlier from the dashboard
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Paywall ──────────────────────────────────────────────────────────────

function Paywall({ usage, onBack }: { usage: UsageDTO | null; onBack: () => void }) {
  const limit = usage?.limit ?? 10;
  return (
    <div className="rounded-[6px] border border-ink bg-paper-2 p-6 sm:p-8" role="region" aria-live="polite">
      <p className="mono text-xs uppercase tracking-widest text-ink-3">free conversions used</p>
      <h2 className="display mt-2 text-3xl font-semibold sm:text-4xl">
        That was <span className="rounded-[3px] bg-accent px-2 text-accent-ink">{limit}</span> of {limit}.
      </h2>
      <p className="mt-3 max-w-lg text-base text-ink-2">
        Your free conversions are done. Anyform has no ads to pay for the next one, so this is where a subscription comes in: unlimited conversions,
        bigger files, and downloads that stick around.
      </p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-[4px] border border-line bg-paper p-4">
          <p className="display text-lg font-semibold">Starter</p>
          <p className="mono text-sm text-ink-2">
            ${PLANS.starter.priceMonthly}/mo · {formatBytes(PLANS.starter.maxFileBytes)} files
          </p>
        </div>
        <div className="rounded-[4px] border border-ink bg-ink p-4 text-paper">
          <p className="display text-lg font-semibold">
            Pro <span className="mono ml-1 rounded-[3px] bg-accent px-1.5 py-0.5 text-[10px] uppercase text-accent-ink">popular</span>
          </p>
          <p className="mono text-sm text-paper/80">
            ${PLANS.pro.priceMonthly}/mo · {formatBytes(PLANS.pro.maxFileBytes)} files · API
          </p>
        </div>
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Link href="/pricing" className="inline-flex items-center rounded-[4px] bg-accent px-6 py-3 text-base font-medium text-accent-ink transition-transform hover:-translate-y-0.5">
          See plans
        </Link>
        <Link href="/pricing#pay-once" className="inline-flex items-center rounded-[4px] border border-ink px-4 py-3 text-sm font-medium text-ink hover:bg-ink hover:text-paper">
          Pay once: {ONE_TIME_PRODUCTS.pack.credits} for ${ONE_TIME_PRODUCTS.pack.price}
        </Link>
        <Link href="/login" className="inline-flex items-center rounded-[4px] border border-ink px-4 py-3 text-sm font-medium text-ink hover:bg-ink hover:text-paper">
          Already subscribed? Log in
        </Link>
        <button type="button" onClick={onBack} className="ml-auto text-sm text-ink-3 hover:text-ink">
          back
        </button>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function humaniseJobError(raw: string): string {
  const s = raw.toLowerCase();
  if (s.includes("engine") && s.includes("unavailable")) return "This conversion needs an engine that isn't installed on this server yet. Try another target format.";
  if (s.includes("timeout") || s.includes("timed out")) return "The conversion took too long and was stopped. Try a smaller file or a lighter target format.";
  if (s.includes("invalid data") || s.includes("corrupt") || s.includes("could not open")) return "The file looks damaged or isn't really the type its name says. Try opening it locally first.";
  if (s.includes("password") || s.includes("encrypted")) return "The file is password-protected. Remove the password and try again.";
  return raw.length > 160 ? `${raw.slice(0, 157)}…` : raw;
}
