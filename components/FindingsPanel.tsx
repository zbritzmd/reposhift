"use client";

import { CategoryScore, CATEGORY_META, Severity } from "@/lib/types";

interface FindingsPanelProps {
  result: CategoryScore;
  onClose: () => void;
}

const severityStyles: Record<Severity, { bg: string; text: string; dot: string }> = {
  critical: { bg: "bg-critical/10", text: "text-critical", dot: "bg-critical" },
  warning: { bg: "bg-warning/10", text: "text-warning", dot: "bg-warning" },
  info: { bg: "bg-info/10", text: "text-info", dot: "bg-info" },
};

export function FindingsPanel({ result, onClose }: FindingsPanelProps) {
  const meta = CATEGORY_META[result.category];

  return (
    <div className="rounded-xl border border-border bg-surface-raised overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div>
          <h3
            className="text-lg font-semibold text-text-primary"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {meta.label}
          </h3>
          <p className="text-sm text-text-secondary mt-0.5">{result.summary}</p>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-surface-overlay text-text-muted hover:text-text-primary transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Findings list */}
      <div className="divide-y divide-border max-h-[500px] overflow-y-auto">
        {result.findings.length === 0 ? (
          <div className="p-8 text-center text-text-muted">
            No findings — this category looks clean.
          </div>
        ) : (
          result.findings.map((finding) => {
            const styles = severityStyles[finding.severity];
            return (
              <div key={finding.id} className="p-4 hover:bg-surface-overlay/50 transition-colors">
                <div className="flex items-start gap-3">
                  <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${styles.dot}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm font-medium text-text-primary">
                        {finding.title}
                      </h4>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase ${styles.bg} ${styles.text}`}>
                        {finding.severity}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-text-secondary leading-relaxed">
                      {finding.description}
                    </p>
                    {finding.file && (
                      <p
                        className="mt-1.5 text-xs text-text-muted"
                        style={{ fontFamily: "var(--font-mono)" }}
                      >
                        {finding.file}
                        {finding.line ? `:${finding.line}` : ""}
                      </p>
                    )}
                    {finding.suggestion && (
                      <div className="mt-2 p-2.5 rounded-lg bg-accent-glow border border-accent/10">
                        <p className="text-xs text-accent leading-relaxed">
                          💡 {finding.suggestion}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
