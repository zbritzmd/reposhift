"use client";

import { StackInfo } from "@/lib/types";

interface StackBadgesProps {
  stack: StackInfo;
  fileCount: number;
  repoName: string;
}

export function StackBadges({ stack, fileCount, repoName }: StackBadgesProps) {
  const badges = [
    stack.framework,
    stack.language,
    stack.buildTool,
    stack.testFramework,
    stack.styling,
    stack.packageManager,
    ...stack.additional,
  ].filter(Boolean);

  return (
    <div className="rounded-xl border border-border bg-surface-raised p-4 flex flex-wrap items-center gap-3">
      <span
        className="text-sm font-medium text-text-primary"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {repoName}
      </span>
      <span className="text-text-muted">·</span>
      <span className="text-xs text-text-secondary">{fileCount} files</span>
      <span className="text-text-muted">·</span>
      <div className="flex flex-wrap gap-2">
        {badges.map((badge) => (
          <span
            key={badge}
            className="px-2.5 py-1 rounded-md bg-accent-glow text-accent text-xs font-medium border border-accent/20"
          >
            {badge}
          </span>
        ))}
      </div>
    </div>
  );
}
