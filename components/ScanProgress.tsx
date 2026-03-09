"use client";

import { ScanPhase } from "@/lib/types";

interface ScanProgressProps {
  phase: ScanPhase;
  progress: number;
  message: string;
}

export function ScanProgress({ phase, progress, message }: ScanProgressProps) {
  return (
    <div className="rounded-xl border border-border bg-surface-raised p-5">
      {/* Progress bar */}
      <div className="h-2 rounded-full bg-surface overflow-hidden">
        <div
          className="h-full rounded-full bg-accent transition-all duration-700 ease-out"
          style={{
            width: `${progress}%`,
            boxShadow: "0 0 12px var(--color-accent)",
          }}
        />
      </div>

      {/* Status */}
      <div className="mt-3 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-accent animate-pulse-dot" />
        <span className="text-sm text-text-secondary">{message}</span>
        <span
          className="ml-auto text-xs text-text-muted"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {Math.round(progress)}%
        </span>
      </div>
    </div>
  );
}
