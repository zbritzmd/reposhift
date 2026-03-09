"use client";

import { useState, useCallback } from "react";
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

  // Per-tab generating and error state (Bug 2 fix: fully independent)
  const [generatingTabs, setGeneratingTabs] = useState<Set<GenerateTab>>(new Set());
  const [tabErrors, setTabErrors] = useState<Map<GenerateTab, string>>(new Map());

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

  // Copy feedback state (Enhancement 7)
  const [copyFeedback, setCopyFeedback] = useState(false);

  const toggleTool = (tool: string) => {
    setSelectedTools((prev) => {
      const next = new Set(prev);
      if (next.has(tool)) next.delete(tool);
      else next.add(tool);
      return next;
    });
  };

  const isTabGenerated = (tab: GenerateTab): boolean => {
    switch (tab) {
      case "standards": return standardsContent !== null;
      case "ai-infra": return aiInfra !== null;
      case "mcp": return mcpContent !== null;
      case "remediation": return remediationContent !== null;
    }
  };

  const generateTab = useCallback(async (tab: GenerateTab) => {
    setGeneratingTabs((prev) => new Set(prev).add(tab));
    setTabErrors((prev) => { const next = new Map(prev); next.delete(tab); return next; });

    try {
      const headers = { "Content-Type": "application/json" };

      switch (tab) {
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
      setTabErrors((prev) => {
        const next = new Map(prev);
        next.set(tab, err instanceof Error ? err.message : "Generation failed");
        return next;
      });
    } finally {
      setGeneratingTabs((prev) => { const next = new Set(prev); next.delete(tab); return next; });
    }
  }, [stack, tree, files, auditFindings, selectedTools]);

  const handleGenerate = () => generateTab(activeTab);

  // Enhancement 5: Generate All
  const handleGenerateAll = async () => {
    const tabs: GenerateTab[] = ["standards", "ai-infra", "mcp", "remediation"];
    const toGenerate = tabs.filter((t) => !isTabGenerated(t));
    await Promise.all(toGenerate.map((tab) => generateTab(tab)));
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 1500);
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
  const isGenerating = generatingTabs.has(activeTab);
  const currentError = tabErrors.get(activeTab) ?? null;
  const anyGenerating = generatingTabs.size > 0;
  const allGenerated = TABS.every((t) => isTabGenerated(t.key));

  return (
    <div className="rounded-xl border border-border bg-surface-raised overflow-hidden">
      {/* Header with Generate All button (Enhancement 5) */}
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <h3 className="text-sm font-medium text-text-primary">Generate Outputs</h3>
        {!allGenerated && (
          <button
            onClick={handleGenerateAll}
            disabled={anyGenerating}
            className="px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-dim disabled:opacity-50 text-white text-xs font-medium transition-colors flex items-center gap-1.5"
          >
            {anyGenerating ? (
              <>
                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Generating...
              </>
            ) : (
              "Generate All"
            )}
          </button>
        )}
      </div>

      {/* Tabs with checkmarks (Enhancement 6) */}
      <div className="flex border-b border-border overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 min-w-0 py-3 px-3 text-sm font-medium transition-colors whitespace-nowrap flex items-center justify-center gap-1.5 ${
              activeTab === tab.key
                ? "text-accent border-b-2 border-accent bg-accent-glow"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            <span className="mr-0.5">{tab.icon}</span>
            {tab.label}
            {isTabGenerated(tab.key) && (
              <span className="w-4 h-4 rounded-full bg-success/20 text-success flex items-center justify-center text-[10px]">
                ✓
              </span>
            )}
            {generatingTabs.has(tab.key) && !isTabGenerated(tab.key) && (
              <span className="w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
            )}
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
        {!currentContent && !isGenerating ? (
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="w-full py-3 rounded-lg bg-accent hover:bg-accent-dim disabled:opacity-50 text-white font-medium transition-colors flex items-center justify-center gap-2"
          >
            Generate {TABS.find((t) => t.key === activeTab)?.label}
          </button>
        ) : isGenerating && !currentContent ? (
          <div className="w-full py-3 rounded-lg bg-accent/20 text-accent font-medium flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
            Generating with Claude...
          </div>
        ) : currentContent ? (
          <div className="relative">
            <button
              onClick={() => copyToClipboard(currentContent)}
              className="absolute top-3 right-3 px-3 py-1.5 rounded-lg bg-surface-overlay text-text-secondary hover:text-text-primary text-xs font-medium transition-colors z-10"
            >
              {copyFeedback ? "Copied!" : "Copy"}
            </button>
            <pre
              className="p-4 rounded-lg bg-surface border border-border overflow-auto max-h-[500px] text-sm text-text-secondary leading-relaxed whitespace-pre-wrap"
              style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem" }}
            >
              {currentContent}
            </pre>
          </div>
        ) : null}

        {/* Per-tab error (Bug 2 fix) */}
        {currentError && (
          <div className="mt-3 p-3 rounded-lg border border-critical/30 bg-critical/5">
            <p className="text-sm text-critical">{currentError}</p>
          </div>
        )}
      </div>
    </div>
  );
}
