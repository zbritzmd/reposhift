"use client";

import { useState } from "react";
import { CategoryScore, RepoFile, RepoTreeEntry, StackInfo } from "@/lib/types";

interface GeneratePanelProps {
  stack: StackInfo;
  tree: RepoTreeEntry[];
  files: RepoFile[];
  auditFindings: CategoryScore[];
}

type GenerateTab = "standards" | "ai-infra" | "mcp" | "remediation";

const TABS: { key: GenerateTab; label: string; icon: string; description: string }[] = [
  {
    key: "standards",
    label: "Standards",
    icon: "📄",
    description: "Generate a comprehensive coding standards document derived from your codebase analysis. Formalizes detected patterns and recommends improvements.",
  },
  {
    key: "ai-infra",
    label: "AI Infrastructure",
    icon: "🤖",
    description: "Generate AI assistant configuration files — AGENTS.md (tool-agnostic), CLAUDE.md (Claude-specific), and .cursorrules (Cursor-specific).",
  },
  {
    key: "mcp",
    label: "MCP Servers",
    icon: "🔌",
    description: "Get recommended MCP (Model Context Protocol) servers for your stack — with install instructions and relevance explanations.",
  },
  {
    key: "remediation",
    label: "Remediation Plan",
    icon: "🔧",
    description: "Generate a prioritized, sprint-ready remediation plan with effort estimates, risk ratings, and grouped work items.",
  },
];

export function GeneratePanel({
  stack,
  tree,
  files,
  auditFindings,
}: GeneratePanelProps) {
  const [activeTab, setActiveTab] = useState<GenerateTab>("standards");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Content state per tab
  const [standardsContent, setStandardsContent] = useState<string | null>(null);
  const [aiInfra, setAiInfra] = useState<{
    agentsMd: string;
    claudeMd: string;
    cursorRules: string;
    copilotInstructions: string;
    windsurfRules: string;
  } | null>(null);
  const [aiInfraTab, setAiInfraTab] = useState<
    "agentsMd" | "claudeMd" | "cursorRules" | "copilotInstructions" | "windsurfRules"
  >("agentsMd");
  const [selectedTools, setSelectedTools] = useState<Set<string>>(
    new Set(["claude", "cursor", "copilot", "windsurf"])
  );
  const [mcpContent, setMcpContent] = useState<string | null>(null);
  const [remediationContent, setRemediationContent] = useState<string | null>(null);

  const toggleTool = (tool: string) => {
    setSelectedTools((prev) => {
      const next = new Set(prev);
      if (next.has(tool)) next.delete(tool);
      else next.add(tool);
      return next;
    });
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);

    try {
      const headers = { "Content-Type": "application/json" };

      switch (activeTab) {
        case "standards": {
          const body = JSON.stringify({ stack, tree, files, auditFindings });
          const res = await fetch("/api/generate-standards", { method: "POST", headers, body });
          if (!res.ok) throw new Error((await res.json()).error);
          const data = await res.json();
          setStandardsContent(data.content);
          break;
        }
        case "ai-infra": {
          const body = JSON.stringify({
            stack, tree, files, auditFindings,
            selectedTools: Array.from(selectedTools),
          });
          const res = await fetch("/api/generate-ai-infra", { method: "POST", headers, body });
          if (!res.ok) throw new Error((await res.json()).error);
          const data = await res.json();
          setAiInfra(data);
          break;
        }
        case "mcp": {
          const body = JSON.stringify({ stack, tree, files, auditFindings });
          const res = await fetch("/api/generate-mcp", { method: "POST", headers, body });
          if (!res.ok) throw new Error((await res.json()).error);
          const data = await res.json();
          setMcpContent(data.content);
          break;
        }
        case "remediation": {
          const body = JSON.stringify({ stack, tree, files, auditFindings });
          const res = await fetch("/api/generate-remediation", { method: "POST", headers, body });
          if (!res.ok) throw new Error((await res.json()).error);
          const data = await res.json();
          setRemediationContent(data.content);
          break;
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const getCurrentContent = (): string | null => {
    switch (activeTab) {
      case "standards":
        return standardsContent;
      case "ai-infra":
        return aiInfra ? aiInfra[aiInfraTab] : null;
      case "mcp":
        return mcpContent;
      case "remediation":
        return remediationContent;
    }
  };

  const currentContent = getCurrentContent();

  return (
    <div className="rounded-xl border border-border bg-surface-raised overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b border-border overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 min-w-0 py-3 px-3 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === tab.key
                ? "text-accent border-b-2 border-accent bg-accent-glow"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            <span className="mr-1.5">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="p-5">
        {/* Description */}
        <p className="text-sm text-text-secondary mb-4">
          {TABS.find((t) => t.key === activeTab)?.description}
        </p>

        {/* AI Infra tool selector + sub-tabs */}
        {activeTab === "ai-infra" && !aiInfra && (
          <div className="mb-4">
            <p className="text-xs text-text-muted mb-2">Select AI tools to generate wrappers for:</p>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { key: "claude", label: "Claude Code" },
                  { key: "cursor", label: "Cursor" },
                  { key: "copilot", label: "GitHub Copilot" },
                  { key: "windsurf", label: "Windsurf" },
                ] as const
              ).map((tool) => (
                <button
                  key={tool.key}
                  onClick={() => toggleTool(tool.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                    selectedTools.has(tool.key)
                      ? "bg-accent text-white border-accent"
                      : "bg-surface text-text-muted border-border hover:border-border-bright"
                  }`}
                >
                  {selectedTools.has(tool.key) ? "✓ " : ""}{tool.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-text-muted mt-2">AGENTS.md (tool-agnostic foundation) is always generated.</p>
          </div>
        )}

        {activeTab === "ai-infra" && aiInfra && (
          <div className="flex flex-wrap gap-2 mb-4">
            {(
              [
                { key: "agentsMd", label: "AGENTS.md" },
                { key: "claudeMd", label: "CLAUDE.md" },
                { key: "cursorRules", label: ".cursorrules" },
                { key: "copilotInstructions", label: "copilot-instructions.md" },
                { key: "windsurfRules", label: ".windsurfrules" },
              ] as const
            ).filter((tab) => aiInfra[tab.key]).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setAiInfraTab(tab.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  aiInfraTab === tab.key
                    ? "bg-accent text-white"
                    : "bg-surface text-text-muted hover:text-text-secondary"
                }`}
                style={{ fontFamily: "var(--font-mono)" }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* Generate button or content */}
        {!currentContent ? (
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="w-full py-3 rounded-lg bg-accent hover:bg-accent-dim disabled:opacity-50 text-white font-medium transition-colors flex items-center justify-center gap-2"
          >
            {generating ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Generating with Claude...
              </>
            ) : (
              <>Generate {TABS.find((t) => t.key === activeTab)?.label}</>
            )}
          </button>
        ) : (
          <div className="relative">
            <button
              onClick={() => copyToClipboard(currentContent)}
              className="absolute top-3 right-3 px-3 py-1.5 rounded-lg bg-surface-overlay text-text-secondary hover:text-text-primary text-xs font-medium transition-colors z-10"
            >
              Copy
            </button>
            <pre
              className="p-4 rounded-lg bg-surface border border-border overflow-auto max-h-[500px] text-sm text-text-secondary leading-relaxed whitespace-pre-wrap"
              style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem" }}
            >
              {currentContent}
            </pre>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-3 p-3 rounded-lg border border-critical/30 bg-critical/5">
            <p className="text-sm text-critical">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
