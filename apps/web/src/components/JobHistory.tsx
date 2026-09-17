"use client";

import { useCallback, useEffect, useState } from "react";
import { formatBytes, type ConversionDTO } from "@anyform/shared";
import { deleteConversion, downloadUrl, explainError, listConversions } from "@/lib/api";
import { FormatChip } from "./FormatChip";
import { PairArrow } from "./PairArrow";

export function JobHistory({ className = "" }: { className?: string }) {
  const [jobs, setJobs] = useState<ConversionDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setJobs(await listConversions());
      setError(null);
    } catch (e) {
      setError(explainError(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Keep polling while anything is still in flight.
  useEffect(() => {
    if (!jobs?.some((j) => j.status === "queued" || j.status === "processing")) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [jobs, load]);

  const remove = async (id: string) => {
    if (!window.confirm("Delete this file from our servers now? This cannot be undone.")) return;
    setDeleting(id);
    try {
      await deleteConversion(id);
      setJobs((js) => js?.filter((j) => j.id !== id) ?? null);
    } catch (e) {
      setError(explainError(e));
    } finally {
      setDeleting(null);
    }
  };

  if (error && !jobs) return <p className="text-sm text-bad">{error}</p>;
  if (!jobs) return <p className="mono text-sm text-ink-3">loading…</p>;
  if (jobs.length === 0)
    return (
      <div className={`rounded-[6px] border border-dashed border-line p-8 text-center ${className}`}>
        <p className="display text-xl font-semibold">Nothing converted yet.</p>
        <p className="mt-1 text-sm text-ink-2">Your conversions will show up here with download links.</p>
      </div>
    );

  const now = Date.now();
  return (
    <div className={className}>
      {error && <p className="mb-3 text-sm text-bad">{error}</p>}
      <ul className="divide-y divide-line border-y border-line">
        {jobs.map((j) => {
          const expired = new Date(j.expiresAt).getTime() < now;
          const live = j.status === "queued" || j.status === "processing";
          return (
            <li key={j.id} className="grid gap-3 py-4 sm:grid-cols-[auto_1fr_auto] sm:items-center">
              <div className="flex items-center gap-2">
                <FormatChip format={j.sourceExt} size="sm" tone="paper" />
                <PairArrow size={14} tone="muted" />
                <FormatChip format={j.targetExt} size="sm" />
              </div>
              <div className="min-w-0">
                <p className="mono truncate text-sm text-ink" title={j.sourceName}>
                  {j.sourceName}
                </p>
                <p className="mono mt-0.5 text-xs text-ink-3">
                  {formatBytes(j.sourceBytes)}
                  {j.outputBytes !== null ? ` → ${formatBytes(j.outputBytes)}` : ""} · {relative(j.createdAt)}
                  {j.engine ? ` · ${j.engine}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2 sm:justify-end">
                <StatusBadge status={j.status} progress={j.progress} expired={expired} />
                {j.status === "done" && !expired && (
                  <a
                    href={downloadUrl(j.id)}
                    download={j.outputName ?? undefined}
                    className="rounded-[4px] bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink hover:-translate-y-0.5"
                  >
                    Download
                  </a>
                )}
                {!live && (
                  <button
                    type="button"
                    onClick={() => remove(j.id)}
                    disabled={deleting === j.id}
                    className="rounded-[4px] border border-line px-3 py-1.5 text-sm text-ink-2 hover:border-bad hover:text-bad disabled:opacity-50"
                  >
                    {deleting === j.id ? "…" : "Delete"}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function StatusBadge({ status, progress, expired }: { status: ConversionDTO["status"]; progress: number; expired: boolean }) {
  if (status === "done" && expired) return <span className="mono rounded-[3px] border border-line px-2 py-1 text-xs text-ink-3">expired</span>;
  if (status === "done") return <span className="mono rounded-[3px] bg-ink px-2 py-1 text-xs text-paper">done</span>;
  if (status === "failed") return <span className="mono rounded-[3px] bg-bad/10 px-2 py-1 text-xs text-bad">failed</span>;
  if (status === "processing")
    return (
      <span className="mono rounded-[3px] bg-accent px-2 py-1 text-xs text-accent-ink [animation:pulse-bar_1.2s_ease-in-out_infinite]">
        {progress}%
      </span>
    );
  return <span className="mono rounded-[3px] border border-line px-2 py-1 text-xs text-ink-2">queued</span>;
}

function relative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return `${d} d ago`;
}
