#!/usr/bin/env node

/**
 * RepoShift CLI
 *
 * Usage:
 *   npx reposhift audit --repo=https://github.com/owner/repo
 *   npx reposhift audit --repo=https://github.com/owner/repo --token=ghp_xxxx
 *   npx reposhift audit --repo=https://github.com/owner/repo --json
 *   npx reposhift audit --repo=https://github.com/owner/repo --categories=structure,patterns
 */

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

// ── Colors for terminal output ──
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
  bgBlue: "\x1b[44m",
};

// ── Arg parsing ──
function parseArgs(args) {
  const parsed = { command: null, flags: {} };
  for (const arg of args) {
    if (arg.startsWith("--")) {
      const [key, ...valParts] = arg.slice(2).split("=");
      parsed.flags[key] = valParts.length > 0 ? valParts.join("=") : true;
    } else if (!parsed.command) {
      parsed.command = arg;
    }
  }
  return parsed;
}

// ── GitHub API ──
async function fetchRepoTree(owner, repo, token) {
  const headers = { Accept: "application/vnd.github.v3+json", "User-Agent": "RepoShift-CLI/1.0" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`, { headers });
  if (!res.ok) throw new Error(`GitHub API error: ${res.status} — ${res.statusText}`);
  const data = await res.json();
  return (data.tree || []).map((e) => ({ path: e.path, type: e.type, size: e.size }));
}

async function fetchFileContent(owner, repo, path, token) {
  const headers = { Accept: "application/vnd.github.v3.raw", "User-Agent": "RepoShift-CLI/1.0" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, { headers });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

const KEY_FILES = [
  "package.json", "tsconfig.json", "angular.json", "next.config.js", "next.config.ts",
  "next.config.mjs", "vite.config.ts", "vite.config.js", ".eslintrc.json", ".eslintrc.js",
  "eslint.config.js", "eslint.config.mjs", ".prettierrc", ".prettierrc.json",
  "tailwind.config.js", "tailwind.config.ts", "Dockerfile", "docker-compose.yml",
  "README.md", "Cargo.toml", "go.mod", "requirements.txt", "pyproject.toml",
  "jest.config.js", "jest.config.ts", "vitest.config.ts",
];

const SOURCE_EXTS = [".ts", ".tsx", ".js", ".jsx", ".py", ".rb", ".go", ".rs", ".java", ".cs", ".vue", ".svelte"];

async function fetchRepoFiles(owner, repo, tree, token) {
  const files = [];
  const blobs = tree.filter((e) => e.type === "blob");

  const keyPaths = blobs.filter((b) => KEY_FILES.includes(b.path)).map((b) => b.path);
  const srcPaths = blobs
    .filter((b) => SOURCE_EXTS.some((ext) => b.path.endsWith(ext)) && !b.path.includes("node_modules") && !b.path.includes(".min.") && !b.path.includes("dist/") && (b.size || 0) < 50000)
    .slice(0, 40)
    .map((b) => b.path);

  const allPaths = [...new Set([...keyPaths, ...srcPaths])];

  for (let i = 0; i < allPaths.length; i += 10) {
    const batch = allPaths.slice(i, i + 10);
    const results = await Promise.all(batch.map(async (p) => {
      const content = await fetchFileContent(owner, repo, p, token);
      return content ? { path: p, content, size: content.length } : null;
    }));
    files.push(...results.filter(Boolean));
  }
  return files;
}

// ── Stack Detection (simplified) ──
function detectStack(tree, files) {
  const paths = tree.map((e) => e.path);
  const hasFile = (n) => paths.some((p) => p.endsWith(n));
  const getFile = (n) => files.find((f) => f.path.endsWith(n));

  const stack = { framework: "Unknown", language: "Unknown", packageManager: "Unknown", additional: [] };

  if (hasFile("pnpm-lock.yaml")) stack.packageManager = "pnpm";
  else if (hasFile("yarn.lock")) stack.packageManager = "yarn";
  else if (hasFile("package-lock.json")) stack.packageManager = "npm";

  const pkg = getFile("package.json");
  let allDeps = {};
  if (pkg) { try { const j = JSON.parse(pkg.content); allDeps = { ...j.dependencies, ...j.devDependencies }; } catch {} }

  if (hasFile("tsconfig.json") || allDeps["typescript"]) stack.language = "TypeScript";
  else if (pkg) stack.language = "JavaScript";
  else if (hasFile("Cargo.toml")) stack.language = "Rust";
  else if (hasFile("go.mod")) stack.language = "Go";
  else if (hasFile("requirements.txt")) stack.language = "Python";

  if (allDeps["@angular/core"]) stack.framework = "Angular";
  else if (allDeps["next"]) stack.framework = "Next.js";
  else if (allDeps["react"]) stack.framework = "React";
  else if (allDeps["vue"]) stack.framework = "Vue";
  else if (allDeps["svelte"]) stack.framework = "Svelte";

  return stack;
}

// ── Claude API ──
async function callClaude(system, userMessage) {
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set. Export it or add to .env.local");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system,
      messages: [{ role: "user", content: userMessage }],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.content[0]?.text || "";
}

// ── Analysis ──
const SYSTEM_PROMPT = `You are RepoShift, a senior software architect analyzing a codebase. You produce precise, actionable audit findings.

RESPONSE FORMAT: You MUST respond with ONLY a valid JSON object. No markdown, no code fences, no preamble. Just the JSON object.

The JSON must have this exact shape:
{
  "score": <number 0-100>,
  "summary": "<2-3 sentence summary>",
  "findings": [
    {
      "id": "<category>-<number>",
      "severity": "critical" | "warning" | "info",
      "title": "<short title>",
      "description": "<detailed explanation>",
      "file": "<filepath or null>",
      "suggestion": "<how to fix>"
    }
  ]
}

Be specific. Reference actual file paths and code patterns you see. Every finding must be actionable.`;

const ALL_CATEGORIES = ["structure", "patterns", "hardcoded-values", "dependencies", "dead-code", "security", "runtime-stability"];

const CATEGORY_LABELS = {
  structure: "Structure & Organization",
  patterns: "Patterns & Consistency",
  "hardcoded-values": "Hardcoded Values",
  dependencies: "Dependencies & Packages",
  "dead-code": "Dead Code",
  security: "Security Basics",
  "runtime-stability": "Runtime & Stability",
};

async function analyzeCategory(category, stack, treeSummary, fileContext) {
  const prompt = `Analyze the ${CATEGORY_LABELS[category]} of this ${stack.framework} (${stack.language}) codebase.\n\nREPOSITORY TREE:\n${treeSummary}\n\nSOURCE FILES:\n${fileContext}`;
  const text = await callClaude(SYSTEM_PROMPT, prompt);
  try {
    return JSON.parse(text);
  } catch {
    // Try to extract JSON from potential markdown wrapping
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch {}
    }
    return { score: 0, summary: "Analysis failed to parse", findings: [] };
  }
}

// ── Output Formatting ──
function severityIcon(sev) {
  if (sev === "critical") return `${c.bgRed}${c.white} CRIT ${c.reset}`;
  if (sev === "warning") return `${c.bgYellow}${c.bold} WARN ${c.reset}`;
  return `${c.bgBlue}${c.white} INFO ${c.reset}`;
}

function scoreColor(score) {
  if (score >= 80) return c.green;
  if (score >= 60) return c.yellow;
  return c.red;
}

function printReport(repoName, stack, results) {
  console.log();
  console.log(`${c.bold}${c.cyan}╔══════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.bold}${c.cyan}║${c.reset}  ${c.bold}RepoShift${c.reset} — Audit Report                       ${c.bold}${c.cyan}║${c.reset}`);
  console.log(`${c.bold}${c.cyan}╚══════════════════════════════════════════════════╝${c.reset}`);
  console.log();
  console.log(`  ${c.dim}Repository:${c.reset}  ${repoName}`);
  console.log(`  ${c.dim}Stack:${c.reset}       ${stack.framework} / ${stack.language}`);
  console.log(`  ${c.dim}Scanned at:${c.reset}  ${new Date().toISOString()}`);
  console.log();

  // Overall score
  const scores = results.map((r) => r.score);
  const overall = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  const sc = scoreColor(overall);
  console.log(`  ${c.bold}Overall Score:${c.reset} ${sc}${c.bold}${overall}${c.reset}${c.dim}/100${c.reset}`);
  console.log();

  // Per-category
  console.log(`${c.bold}  ┌─────────────────────────────────┬───────┐${c.reset}`);
  console.log(`${c.bold}  │ Category                        │ Score │${c.reset}`);
  console.log(`${c.bold}  ├─────────────────────────────────┼───────┤${c.reset}`);
  for (const r of results) {
    const label = (CATEGORY_LABELS[r.category] || r.category).padEnd(31);
    const sc = scoreColor(r.score);
    const scoreStr = String(r.score).padStart(3);
    console.log(`  │ ${label} │ ${sc}${scoreStr}${c.reset}   │`);
  }
  console.log(`${c.bold}  └─────────────────────────────────┴───────┘${c.reset}`);
  console.log();

  // Findings
  const allFindings = results.flatMap((r) => r.findings.map((f) => ({ ...f, category: r.category })));
  const criticals = allFindings.filter((f) => f.severity === "critical");
  const warnings = allFindings.filter((f) => f.severity === "warning");
  const infos = allFindings.filter((f) => f.severity === "info");

  console.log(`  ${c.bold}Findings:${c.reset} ${c.red}${criticals.length} critical${c.reset}  ${c.yellow}${warnings.length} warnings${c.reset}  ${c.blue}${infos.length} info${c.reset}`);
  console.log();

  // List findings grouped by severity
  for (const [label, group] of [["Critical", criticals], ["Warnings", warnings], ["Info", infos]]) {
    if (group.length === 0) continue;
    console.log(`  ${c.bold}${label}:${c.reset}`);
    for (const f of group) {
      console.log(`    ${severityIcon(f.severity)} ${c.bold}${f.title}${c.reset}`);
      console.log(`      ${c.dim}${f.description}${c.reset}`);
      if (f.file) console.log(`      ${c.cyan}${f.file}${c.reset}`);
      if (f.suggestion) console.log(`      ${c.green}💡 ${f.suggestion}${c.reset}`);
      console.log();
    }
  }
}

// ── Main ──
async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));

  if (!command || flags.help) {
    console.log(`
${c.bold}RepoShift${c.reset} — Audit. Standardize. Shift Forward.

${c.bold}Usage:${c.reset}
  reposhift audit --repo=<github-url>           Audit a repository
  reposhift audit --repo=<url> --token=<pat>    Audit a private repository
  reposhift audit --repo=<url> --json           Output as JSON
  reposhift audit --repo=<url> --categories=structure,patterns

${c.bold}Options:${c.reset}
  --repo=<url>          GitHub repository URL (required)
  --token=<pat>         GitHub Personal Access Token for private repos
  --json                Output raw JSON instead of formatted report
  --categories=<list>   Comma-separated categories to analyze (default: all)
  --help                Show this help message

${c.bold}Environment:${c.reset}
  ANTHROPIC_API_KEY     Required. Your Anthropic API key.
  GITHUB_TOKEN          Optional. Default GitHub token for private repos.

${c.bold}Categories:${c.reset}
  structure, patterns, hardcoded-values, dependencies,
  dead-code, security, runtime-stability
`);
    process.exit(0);
  }

  if (command !== "audit") {
    console.error(`${c.red}Unknown command: ${command}. Use 'reposhift audit --repo=<url>'${c.reset}`);
    process.exit(1);
  }

  if (!flags.repo) {
    console.error(`${c.red}Missing --repo flag. Usage: reposhift audit --repo=https://github.com/owner/repo${c.reset}`);
    process.exit(1);
  }

  if (!ANTHROPIC_API_KEY) {
    console.error(`${c.red}ANTHROPIC_API_KEY not set. Export it: export ANTHROPIC_API_KEY=sk-ant-...${c.reset}`);
    process.exit(1);
  }

  // Parse repo URL
  const match = flags.repo.replace(/\.git$/, "").match(/github\.com\/([^/]+)\/([^/\s#?]+)/);
  if (!match) {
    console.error(`${c.red}Invalid GitHub URL: ${flags.repo}${c.reset}`);
    process.exit(1);
  }
  const [, owner, repo] = match;
  const token = flags.token || GITHUB_TOKEN;
  const asJson = flags.json === true;
  const categoriesToRun = flags.categories
    ? flags.categories.split(",").filter((c) => ALL_CATEGORIES.includes(c))
    : ALL_CATEGORIES;

  if (!asJson) {
    console.log();
    console.log(`${c.bold}${c.cyan}⌘ RepoShift${c.reset} — Scanning ${owner}/${repo}...`);
    console.log();
  }

  // Step 1: Fetch tree
  if (!asJson) process.stdout.write(`  ${c.dim}Fetching repository tree...${c.reset}`);
  const tree = await fetchRepoTree(owner, repo, token);
  if (!asJson) console.log(` ${c.green}✓${c.reset} ${tree.length} entries`);

  // Step 2: Fetch files
  if (!asJson) process.stdout.write(`  ${c.dim}Fetching source files...${c.reset}`);
  const files = await fetchRepoFiles(owner, repo, tree, token);
  if (!asJson) console.log(` ${c.green}✓${c.reset} ${files.length} files`);

  // Step 3: Detect stack
  const stack = detectStack(tree, files);
  if (!asJson) console.log(`  ${c.dim}Detected stack:${c.reset} ${stack.framework} / ${stack.language}`);
  if (!asJson) console.log();

  // Step 4: Build context
  const treeSummary = tree
    .filter((e) => e.type === "tree" && e.path.split("/").length <= 3)
    .map((e) => e.path + "/")
    .concat(tree.filter((e) => e.type === "blob" && e.path.split("/").length <= 2).map((e) => e.path))
    .sort()
    .join("\n");

  let fileContext = "";
  for (const f of files) {
    const entry = `\n--- FILE: ${f.path} ---\n${f.content}\n`;
    if (fileContext.length + entry.length > 80000) break;
    fileContext += entry;
  }

  // Step 5: Analyze categories
  const results = [];
  for (const cat of categoriesToRun) {
    if (!asJson) process.stdout.write(`  ${c.dim}Analyzing ${CATEGORY_LABELS[cat]}...${c.reset}`);
    try {
      const result = await analyzeCategory(cat, stack, treeSummary, fileContext);
      results.push({ category: cat, ...result });
      if (!asJson) console.log(` ${scoreColor(result.score)}${result.score}${c.reset}`);
    } catch (err) {
      results.push({ category: cat, score: 0, summary: `Error: ${err.message}`, findings: [] });
      if (!asJson) console.log(` ${c.red}✗ ${err.message}${c.reset}`);
    }
  }

  // Step 6: Output
  if (asJson) {
    const overall = Math.round(results.reduce((s, r) => s + r.score, 0) / results.length);
    console.log(JSON.stringify({
      repoUrl: flags.repo,
      repoName: `${owner}/${repo}`,
      scannedAt: new Date().toISOString(),
      stack,
      overallScore: overall,
      categories: results,
    }, null, 2));
  } else {
    printReport(`${owner}/${repo}`, stack, results);
  }
}

main().catch((err) => {
  console.error(`${c.red}Error: ${err.message}${c.reset}`);
  process.exit(1);
});
