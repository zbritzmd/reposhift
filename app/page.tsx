"use client";

import { useState, useCallback } from "react";
import {
  AuditCategory,
  AuditReport,
  CategoryScore,
  CATEGORY_META,
  RepoFile,
  RepoTreeEntry,
  ScanPhase,
  StackInfo,
} from "@/lib/types";
import { ScoreRing } from "@/components/ScoreRing";
import { CategoryCard } from "@/components/CategoryCard";
import { FindingsPanel } from "@/components/FindingsPanel";
import { GeneratePanel } from "@/components/GeneratePanel";
import { Header } from "@/components/Header";
import { ScanInput } from "@/components/ScanInput";
import { StackBadges } from "@/components/StackBadges";
import { ScanProgress } from "@/components/ScanProgress";

const CATEGORIES_TO_ANALYZE: AuditCategory[] = [
  "structure",
  "patterns",
  "hardcoded-values",
  "dependencies",
  "dead-code",
  "security",
  "runtime-stability",
];

export default function Home() {
  // Scan state
  const [repoUrl, setRepoUrl] = useState("");
  const [githubToken, setGithubToken] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanPhase, setScanPhase] = useState<ScanPhase>("cloning");
  const [scanProgress, setScanProgress] = useState(0);
  const [scanMessage, setScanMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Repo data (persisted between scan and analyze)
  const [repoName, setRepoName] = useState("");
  const [tree, setTree] = useState<RepoTreeEntry[]>([]);
  const [files, setFiles] = useState<RepoFile[]>([]);
  const [stack, setStack] = useState<StackInfo | null>(null);
  const [fileCount, setFileCount] = useState(0);

  // Analysis state
  const [report, setReport] = useState<AuditReport | null>(null);
  const [categoryResults, setCategoryResults] = useState<
    Map<AuditCategory, CategoryScore>
  >(new Map());
  const [analyzingCategories, setAnalyzingCategories] = useState<
    Set<AuditCategory>
  >(new Set());

  // UI state
  const [selectedCategory, setSelectedCategory] =
    useState<AuditCategory | null>(null);
  const [showGenerate, setShowGenerate] = useState(false);

  // Enhancement 9: Reset/scan another repo
  const handleReset = useCallback(() => {
    setRepoUrl("");
    setGithubToken("");
    setScanning(false);
    setScanPhase("cloning");
    setScanProgress(0);
    setScanMessage("");
    setError(null);
    setRepoName("");
    setTree([]);
    setFiles([]);
    setStack(null);
    setFileCount(0);
    setReport(null);
    setCategoryResults(new Map());
    setAnalyzingCategories(new Set());
    setSelectedCategory(null);
    setShowGenerate(false);
  }, []);

  // --------------------------------------------------------
  // Scan repo
  // --------------------------------------------------------
  const handleScan = useCallback(async () => {
    if (!repoUrl.trim()) return;

    setScanning(true);
    setError(null);
    setReport(null);
    setCategoryResults(new Map());
    setSelectedCategory(null);
    setShowGenerate(false);
    setScanPhase("cloning");
    setScanProgress(5);
    setScanMessage("Connecting to repository...");

    try {
      // Step 1: Scan repo (fetch tree + files + detect stack)
      setScanProgress(10);
      setScanMessage("Fetching repository contents...");

      const scanRes = await fetch("/api/scan-repo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: repoUrl.trim(), token: githubToken || undefined }),
      });

      if (!scanRes.ok) {
        const err = await scanRes.json();
        throw new Error(err.error || "Failed to scan repository");
      }

      const scanData = await scanRes.json();
      setRepoName(scanData.repoName);
      setTree(scanData.tree);
      setFiles(scanData.files);
      setStack(scanData.stack);
      setFileCount(scanData.fileCount);

      setScanPhase("detecting-stack");
      setScanProgress(20);
      setScanMessage(
        `Detected: ${scanData.stack.framework} / ${scanData.stack.language} — ${scanData.fileCount} files`
      );

      // Step 2: Analyze each category
      const results = new Map<AuditCategory, CategoryScore>();
      const phaseMap: Record<AuditCategory, ScanPhase> = {
        structure: "analyzing-structure",
        patterns: "analyzing-patterns",
        "hardcoded-values": "analyzing-hardcoded",
        dependencies: "analyzing-dependencies",
        "dead-code": "analyzing-structure",
        security: "analyzing-security",
        "runtime-stability": "analyzing-runtime",
      };

      for (let i = 0; i < CATEGORIES_TO_ANALYZE.length; i++) {
        const cat = CATEGORIES_TO_ANALYZE[i];
        const progress = 20 + ((i + 1) / CATEGORIES_TO_ANALYZE.length) * 70;

        setScanPhase(phaseMap[cat] || "scoring");
        setScanProgress(progress);
        setScanMessage(`Analyzing ${CATEGORY_META[cat].label}...`);
        setAnalyzingCategories((prev) => new Set(prev).add(cat));

        try {
          const analyzeRes = await fetch("/api/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              category: cat,
              stack: scanData.stack,
              tree: scanData.tree,
              files: scanData.files,
            }),
          });

          if (analyzeRes.ok) {
            const result: CategoryScore = await analyzeRes.json();
            results.set(cat, result);
            setCategoryResults(new Map(results));
          } else {
            const errData = await analyzeRes.json().catch(() => ({ error: `Analysis failed (${analyzeRes.status})` }));
            // Surface API errors (e.g., "credit balance too low") to the user
            if (analyzeRes.status >= 500 && errData.error) {
              setError(errData.error);
            }
          }
        } catch (catError) {
          console.error(`Failed to analyze ${cat}:`, catError);
        }

        setAnalyzingCategories((prev) => {
          const next = new Set(prev);
          next.delete(cat);
          return next;
        });
      }

      // Step 3: Build final report
      const allCategories = Array.from(results.values());
      const overallScore = Math.round(
        allCategories.reduce((sum, c) => sum + c.score, 0) /
          (allCategories.length || 1)
      );

      const allFindings = allCategories.flatMap((c) => c.findings);

      const finalReport: AuditReport = {
        repoUrl: repoUrl.trim(),
        repoName: scanData.repoName,
        scannedAt: new Date().toISOString(),
        stack: scanData.stack,
        overallScore,
        categories: allCategories,
        totalFindings: allFindings.length,
        criticalCount: allFindings.filter((f) => f.severity === "critical")
          .length,
        warningCount: allFindings.filter((f) => f.severity === "warning")
          .length,
        infoCount: allFindings.filter((f) => f.severity === "info").length,
      };

      setReport(finalReport);
      setScanPhase("complete");
      setScanProgress(100);
      setScanMessage("Audit complete");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong"
      );
      setScanPhase("error");
    } finally {
      setScanning(false);
    }
  }, [repoUrl, githubToken]);

  // --------------------------------------------------------
  // Render
  // --------------------------------------------------------
  const hasResults = categoryResults.size > 0 || report;

  return (
    <div className="min-h-screen bg-surface">
      <Header />

      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-20">
        {/* Scan Input */}
        <div className="mt-8">
          <ScanInput
            repoUrl={repoUrl}
            githubToken={githubToken}
            onRepoUrlChange={setRepoUrl}
            onGithubTokenChange={setGithubToken}
            onScan={handleScan}
            scanning={scanning}
          />
        </div>

        {/* Progress */}
        {scanning && (
          <div className="mt-8 animate-fade-up">
            <ScanProgress
              phase={scanPhase}
              progress={scanProgress}
              message={scanMessage}
            />
          </div>
        )}

        {/* Error Banner (Enhancement 4) */}
        {error && (
          <div className="mt-8 rounded-xl border border-critical/30 bg-critical/5 p-4 animate-fade-up flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="text-critical text-lg mt-0.5">⚠</span>
              <div>
                <p className="text-critical font-medium">Scan Failed</p>
                <p className="text-critical/80 text-sm mt-1">{error}</p>
              </div>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-critical/60 hover:text-critical transition-colors text-lg leading-none p-1"
            >
              ×
            </button>
          </div>
        )}

        {/* Stack Info + Reset Button (Enhancement 9) */}
        {stack && !scanning && (
          <div className="mt-6 animate-fade-up flex items-start gap-3">
            <div className="flex-1">
              <StackBadges stack={stack} fileCount={fileCount} repoName={repoName} />
            </div>
            <button
              onClick={handleReset}
              className="mt-0.5 px-3 py-2 rounded-lg border border-border bg-surface-raised hover:border-border-bright text-text-secondary hover:text-text-primary text-xs font-medium transition-colors whitespace-nowrap"
            >
              Scan Another
            </button>
          </div>
        )}

        {/* Results */}
        {hasResults && !scanning && (
          <>
            {/* Overall Score + Category Grid */}
            <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Score */}
              <div className="lg:col-span-3">
                <div className="rounded-xl border border-border bg-surface-raised p-6 flex flex-col items-center card-glow animate-fade-up">
                  <ScoreRing
                    score={report?.overallScore || 0}
                    size={160}
                  />
                  <div className="mt-4 text-center">
                    <p className="text-text-secondary text-sm">
                      Overall Health
                    </p>
                    <div className="mt-2 flex items-center gap-4 text-xs text-text-muted">
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-critical" />
                        {report?.criticalCount || 0}
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-warning" />
                        {report?.warningCount || 0}
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-info" />
                        {report?.infoCount || 0}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Generate Button */}
                {report && (
                  <button
                    onClick={() => setShowGenerate(!showGenerate)}
                    className="mt-4 w-full rounded-xl bg-accent hover:bg-accent-dim text-white font-medium py-3 px-4 transition-colors animate-fade-up"
                    style={{ animationDelay: "0.1s" }}
                  >
                    Generate Outputs
                  </button>
                )}
              </div>

              {/* Category Cards */}
              <div className="lg:col-span-9 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {CATEGORIES_TO_ANALYZE.map((cat, i) => {
                  const result = categoryResults.get(cat);
                  const isAnalyzing = analyzingCategories.has(cat);
                  return (
                    <CategoryCard
                      key={cat}
                      category={cat}
                      result={result}
                      isAnalyzing={isAnalyzing}
                      isSelected={selectedCategory === cat}
                      onClick={() =>
                        setSelectedCategory(
                          selectedCategory === cat ? null : cat
                        )
                      }
                      delay={i * 0.05}
                    />
                  );
                })}
              </div>
            </div>

            {/* Findings Detail Panel */}
            {selectedCategory && categoryResults.get(selectedCategory) && (
              <div className="mt-6 animate-fade-up">
                <FindingsPanel
                  result={categoryResults.get(selectedCategory)!}
                  onClose={() => setSelectedCategory(null)}
                />
              </div>
            )}

            {/* Generate Panel */}
            {showGenerate && report && (
              <div className="mt-6 animate-fade-up">
                <GeneratePanel
                  stack={stack!}
                  tree={tree}
                  files={files}
                  auditFindings={report.categories}
                />
              </div>
            )}
          </>
        )}

        {/* Empty State */}
        {!hasResults && !scanning && !error && (
          <div className="mt-24 text-center animate-fade-up">
            <div className="text-6xl mb-4">⌘</div>
            <h2
              className="text-2xl font-semibold text-text-primary"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Paste a GitHub repo to begin
            </h2>
            <p className="mt-2 text-text-secondary max-w-md mx-auto">
              RepoShift analyzes your codebase with senior architect-level
              intelligence and generates standards, AI infrastructure, and
              remediation plans.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
