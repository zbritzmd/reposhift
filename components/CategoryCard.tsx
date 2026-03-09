"use client";

import { type ReactNode } from "react";
import { AuditCategory, CategoryScore, CATEGORY_META } from "@/lib/types";

interface CategoryCardProps {
  category: AuditCategory;
  result?: CategoryScore;
  isAnalyzing: boolean;
  isSelected: boolean;
  onClick: () => void;
  delay?: number;
}

const ICONS: Record<string, ReactNode> = {
  FolderTree: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  ),
  Layers: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  ),
  Hash: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="9" x2="20" y2="9" /><line x1="4" y1="15" x2="20" y2="15" />
      <line x1="10" y1="3" x2="8" y2="21" /><line x1="16" y1="3" x2="14" y2="21" />
    </svg>
  ),
  Package: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="16.5" y1="9.4" x2="7.5" y2="4.21" />
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  ),
  Trash2: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  ),
  Shield: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  Activity: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
};

export function CategoryCard({
  category,
  result,
  isAnalyzing,
  isSelected,
  onClick,
  delay = 0,
}: CategoryCardProps) {
  const meta = CATEGORY_META[category];
  const score = result?.score;
  const findingCount = result?.findings.length || 0;

  const scoreColor =
    score === undefined
      ? "text-text-muted"
      : score >= 80
        ? "text-success"
        : score >= 60
          ? "text-warning"
          : "text-critical";

  return (
    <button
      onClick={onClick}
      disabled={!result}
      className={`
        text-left rounded-xl border p-4 transition-all duration-200 card-glow animate-fade-up
        ${isSelected
          ? "border-accent bg-accent-glow"
          : "border-border bg-surface-raised hover:border-border-bright"
        }
        ${!result && !isAnalyzing ? "opacity-40" : ""}
        disabled:cursor-default
      `}
      style={{ animationDelay: `${delay}s` }}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="text-text-secondary">{ICONS[meta.icon]}</div>
        {isAnalyzing ? (
          <span className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
        ) : score !== undefined ? (
          <span
            className={`text-2xl font-bold ${scoreColor}`}
            style={{ fontFamily: "var(--font-display)" }}
          >
            {score}
          </span>
        ) : null}
      </div>

      {/* Label */}
      <h3 className="mt-3 text-sm font-medium text-text-primary">
        {meta.label}
      </h3>

      {/* Summary or loading */}
      {isAnalyzing ? (
        <div className="mt-2 space-y-1.5">
          <div className="h-3 rounded shimmer w-full" />
          <div className="h-3 rounded shimmer w-3/4" />
        </div>
      ) : result ? (
        <>
          <p className="mt-1.5 text-xs text-text-muted line-clamp-2 leading-relaxed">
            {result.summary}
          </p>
          {findingCount > 0 && (
            <p className="mt-2 text-xs text-text-secondary">
              {findingCount} finding{findingCount !== 1 ? "s" : ""}
            </p>
          )}
        </>
      ) : (
        <p className="mt-2 text-xs text-text-muted">{meta.description}</p>
      )}
    </button>
  );
}
