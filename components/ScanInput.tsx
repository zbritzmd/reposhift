"use client";

import { useState, useMemo } from "react";

interface ScanInputProps {
  repoUrl: string;
  githubToken: string;
  onRepoUrlChange: (url: string) => void;
  onGithubTokenChange: (token: string) => void;
  onScan: () => void;
  scanning: boolean;
}

function detectProvider(url: string): "github" | "azure-devops" | null {
  if (url.includes("dev.azure.com") || url.includes("visualstudio.com"))
    return "azure-devops";
  if (url.includes("github.com") || /^[^/\s]+\/[^/\s]+$/.test(url.trim()))
    return "github";
  return null;
}

export function ScanInput({
  repoUrl,
  githubToken,
  onRepoUrlChange,
  onGithubTokenChange,
  onScan,
  scanning,
}: ScanInputProps) {
  const [showToken, setShowToken] = useState(false);
  const provider = useMemo(() => detectProvider(repoUrl), [repoUrl]);

  const isAzDo = provider === "azure-devops";

  const tokenLabel = isAzDo
    ? "Azure DevOps Personal Access Token (required)"
    : "Private repo? Add a token";

  const tokenPlaceholder = isAzDo
    ? "Azure DevOps PAT (Code: Read scope)"
    : "ghp_xxxx (GitHub Personal Access Token)";

  return (
    <div className="rounded-xl border border-border bg-surface-raised p-5">
      <div className="flex gap-3">
        <div className="flex-1 relative">
          <input
            type="text"
            value={repoUrl}
            onChange={(e) => onRepoUrlChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !scanning && onScan()}
            placeholder="GitHub or Azure DevOps repo URL"
            className="w-full h-12 px-4 rounded-lg bg-surface border border-border text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/50 transition-colors"
            style={{ fontFamily: "var(--font-mono)", fontSize: "0.9rem" }}
            disabled={scanning}
          />
          {/* Provider badge */}
          {provider && repoUrl.trim() && (
            <span
              className={`absolute right-3 top-1/2 -translate-y-1/2 px-2 py-0.5 rounded text-[10px] font-medium uppercase ${
                isAzDo
                  ? "bg-blue-500/15 text-blue-400 border border-blue-500/20"
                  : "bg-accent-glow text-accent border border-accent/20"
              }`}
            >
              {isAzDo ? "Azure DevOps" : "GitHub"}
            </span>
          )}
        </div>
        <button
          onClick={onScan}
          disabled={scanning || !repoUrl.trim()}
          className="h-12 px-6 rounded-lg bg-accent hover:bg-accent-dim disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium transition-colors flex items-center gap-2"
        >
          {scanning ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Scanning
            </>
          ) : (
            <>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              Scan
            </>
          )}
        </button>
      </div>

      {/* Supported providers hint */}
      <div className="mt-2 flex items-center gap-3 text-xs text-text-muted">
        <span>Supports:</span>
        <span className="flex items-center gap-1">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
          GitHub
        </span>
        <span className="flex items-center gap-1">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M0 8.877L2.247 5.91l8.405-3.416V.022l7.37 5.393L2.966 8.338v8.225L0 8.877zm5.027 4.142l7.37 5.393L24 8.877l-2.247-2.967-8.405 3.416v2.472l-8.321 1.221z"/></svg>
          Azure DevOps
        </span>
      </div>

      {/* Token section */}
      <div className="mt-3">
        <button
          onClick={() => setShowToken(!showToken)}
          className="text-xs text-text-muted hover:text-text-secondary transition-colors flex items-center gap-1"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {showToken ? (
              <polyline points="18 15 12 9 6 15" />
            ) : (
              <polyline points="6 9 12 15 18 9" />
            )}
          </svg>
          {showToken ? "Hide token" : tokenLabel}
        </button>

        {showToken && (
          <input
            type="password"
            value={githubToken}
            onChange={(e) => onGithubTokenChange(e.target.value)}
            placeholder={tokenPlaceholder}
            className="mt-2 w-full h-10 px-4 rounded-lg bg-surface border border-border text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/50 transition-colors text-sm"
            style={{ fontFamily: "var(--font-mono)" }}
          />
        )}
      </div>
    </div>
  );
}
