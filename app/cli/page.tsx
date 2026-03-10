"use client";

import { useState } from "react";

function CliSnippet({ label, command }: { label: string; command: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <p className="text-[10px] text-text-muted mb-1">{label}</p>
      <div className="flex items-center gap-2 bg-surface-overlay rounded-lg px-3 py-2 border border-border">
        <span className="text-accent text-xs font-mono">$</span>
        <code className="flex-1 text-xs text-text-secondary font-mono truncate">
          {command}
        </code>
        <button
          onClick={() => {
            navigator.clipboard.writeText(command);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="px-2 py-0.5 rounded bg-surface-raised border border-border text-text-muted hover:text-text-primary text-[10px] font-medium transition-colors whitespace-nowrap"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
    </div>
  );
}

const FLAGS = [
  ["--repo=<url>", "Repository URL (auto-detected from git remote if omitted)"],
  ["--token=<pat>", "Personal Access Token for private repos"],
  ["--api-key=<key>", "Anthropic API key (alternative to env var)"],
  ["--json", "Output raw JSON instead of formatted report"],
  ["--verbose", "Show full finding descriptions and suggestions in report"],
  ["--categories=<list>", "Comma-separated categories to analyze (default: all 7)"],
  ["--remediation", "Generate only the REMEDIATION-PLAN.md (1 API call, fast)"],
  ["--generate", "Generate full AI documentation kit (ai/ directory + tool wrappers)"],
  ["--tools=<list>", "AI tools: claude, cursor, copilot, windsurf, codex, gemini"],
  ["--mode=<mode>", "Generation mode: full (default), missing (skip existing), update (improve existing)"],
  ["--out=<dir>", "Output directory for generated files"],
];

export default function CliPage() {
  return (
    <main className="w-full mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-20">
      <section className="pt-16 sm:pt-20 pb-12">
        <h1
          className="text-2xl sm:text-4xl font-bold text-text-primary text-center"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Command Line Interface
        </h1>
        <p className="mt-3 text-text-secondary text-center text-sm max-w-lg mx-auto">
          Run RepoShift directly from your terminal. No URL needed inside a git repo.
        </p>
        <div className="mt-4 flex justify-center">
          <a
            href="https://www.npmjs.com/package/reposhift"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-surface-raised hover:bg-surface-overlay text-text-secondary hover:text-text-primary text-xs font-medium transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 256 256" fill="currentColor">
              <path d="M0 256V0h256v256z" fill="#C12127"/>
              <path d="M48 48h160v160h-32V80h-48v128H48z" fill="#fff"/>
            </svg>
            reposhift on npm
            <span className="text-text-muted">v0.1.1</span>
          </a>
        </div>

        {/* Install */}
        <div className="mt-10 max-w-4xl mx-auto">
          <div className="rounded-xl border border-border bg-surface-raised p-6 animate-fade-up">
            <h3 className="text-sm font-semibold text-text-primary mb-4">Install</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <CliSnippet label="Run directly (no install)" command="npx reposhift audit" />
              <CliSnippet label="Or install globally" command="npm install -g reposhift" />
            </div>
            <p className="text-[10px] text-text-muted mt-3">
              Requires Node.js 18+ and an <code className="text-text-secondary font-mono">ANTHROPIC_API_KEY</code> environment variable.
            </p>
          </div>
        </div>

        <div className="mt-6 max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Quick Start */}
          <div className="rounded-xl border border-border bg-surface-raised p-6 animate-fade-up">
            <h3 className="text-sm font-semibold text-text-primary mb-4">Quick Start</h3>
            <div className="space-y-3">
              <CliSnippet label="From inside a git repo" command="reposhift audit" />
              <CliSnippet label="Specify a repo" command="reposhift audit --repo=owner/repo" />
              <CliSnippet label="Detailed output" command="reposhift audit --verbose" />
            </div>
          </div>

          {/* Generation Options */}
          <div className="rounded-xl border border-border bg-surface-raised p-6 animate-fade-up" style={{ animationDelay: "0.05s" }}>
            <h3 className="text-sm font-semibold text-text-primary mb-4">Generation Options</h3>
            <div className="space-y-3">
              <CliSnippet label="Remediation plan only" command="npx reposhift audit --remediation" />
              <CliSnippet label="Full documentation kit" command="npx reposhift audit --generate" />
              <CliSnippet label="Specific tools" command="npx reposhift audit --generate --tools=claude,cursor" />
              <CliSnippet label="Output to a directory" command="npx reposhift audit --generate --out=./docs" />
            </div>
          </div>

          {/* Flags Reference (full width) */}
          <div className="lg:col-span-2 rounded-xl border border-border bg-surface-raised p-6 animate-fade-up" style={{ animationDelay: "0.1s" }}>
            <h3 className="text-sm font-semibold text-text-primary mb-4">All Options</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-text-muted border-b border-border">
                    <th className="pb-2 pr-4 font-medium text-xs">Flag</th>
                    <th className="pb-2 font-medium text-xs">Description</th>
                  </tr>
                </thead>
                <tbody className="text-text-secondary">
                  {FLAGS.map(([flag, desc]) => (
                    <tr key={flag} className="border-b border-border/50 last:border-b-0">
                      <td className="py-2 pr-4">
                        <code className="text-xs text-accent font-mono whitespace-nowrap">{flag}</code>
                      </td>
                      <td className="py-2 text-xs">{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Env vars */}
            <h4 className="text-xs font-semibold text-text-primary mt-6 mb-2">Environment Variables</h4>
            <div className="space-y-1 text-xs text-text-muted">
              <p><code className="text-text-secondary font-mono">ANTHROPIC_API_KEY</code> — Required. Claude API key.</p>
              <p><code className="text-text-secondary font-mono">GITHUB_TOKEN</code> — Optional. GitHub PAT for private repos.</p>
              <p><code className="text-text-secondary font-mono">AZURE_DEVOPS_TOKEN</code> — Optional. Azure DevOps PAT.</p>
            </div>

            {/* Supported providers */}
            <h4 className="text-xs font-semibold text-text-primary mt-6 mb-2">Supported Providers</h4>
            <div className="space-y-1 text-xs text-text-muted">
              <p><strong className="text-text-secondary">GitHub:</strong> https://github.com/owner/repo or owner/repo</p>
              <p><strong className="text-text-secondary">Azure DevOps:</strong> https://dev.azure.com/org/project/_git/repo</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
