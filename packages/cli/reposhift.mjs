#!/usr/bin/env node

/**
 * RepoShift CLI — Audit. Standardize. Shift Forward.
 *
 * Supports GitHub and Azure DevOps repositories.
 *
 * Usage:
 *   npx reposhift audit --repo=https://github.com/owner/repo
 *   npx reposhift audit --repo=https://dev.azure.com/org/project/_git/repo --token=<PAT>
 *   npx reposhift audit --repo=owner/repo --json
 *   npx reposhift audit --generate=all --api-key=sk-ant-xxx
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from "fs";
import { resolve, dirname, join } from "path";
import { execSync } from "child_process";
import { homedir } from "os";

let ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const AZURE_DEVOPS_TOKEN = process.env.AZURE_DEVOPS_TOKEN;

// ── GitHub OAuth Device Flow (Client ID is public — same as gh CLI pattern) ──
const GITHUB_CLIENT_ID = "Ov23liHEPjbvd1Uw7XLH";
const REPOSHIFT_DIR = join(homedir(), ".reposhift");
const TOKEN_PATH = join(REPOSHIFT_DIR, "github-token");

// ── GitHub Token Resolution ──
// Priority: 1) gh auth token  2) cached ~/.reposhift/github-token  3) device flow
async function resolveGitHubToken(silent = false) {
  // 1. Try gh CLI token
  try {
    const ghToken = execSync("gh auth token", { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
    if (ghToken) {
      if (!silent) console.log(`  ${c.green}✓${c.reset} Using GitHub token from ${c.dim}gh CLI${c.reset}`);
      return ghToken;
    }
  } catch {}

  // 2. Try cached token
  try {
    if (existsSync(TOKEN_PATH)) {
      const cached = readFileSync(TOKEN_PATH, "utf-8").trim();
      if (cached) {
        if (!silent) console.log(`  ${c.green}✓${c.reset} Using saved GitHub token`);
        return cached;
      }
    }
  } catch {}

  // 3. Device flow
  return await githubDeviceFlow(silent);
}

async function githubDeviceFlow(silent = false) {
  if (!GITHUB_CLIENT_ID || GITHUB_CLIENT_ID.includes("xxxxxx")) {
    throw new Error("GitHub OAuth not configured. Use --token=<PAT> for private repos.");
  }

  // Request device code
  const codeRes = await fetch("https://github.com/login/device/code", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ client_id: GITHUB_CLIENT_ID, scope: "repo read:user" }),
  });
  const codeData = await codeRes.json();

  if (codeData.error) {
    throw new Error(`GitHub device flow error: ${codeData.error_description || codeData.error}`);
  }

  const { device_code, user_code, verification_uri, interval, expires_in } = codeData;

  if (!silent) {
    console.log();
    console.log(`  ${c.dim}│${c.blue}>${c.reset} ${c.bold}GitHub authentication required${c.reset}`);
    console.log(`  ${c.dim}│${c.reset}  Go to: ${c.cyan}${c.bold}${verification_uri}${c.reset}`);
    console.log(`  ${c.dim}│${c.reset}  Enter code: ${c.yellow}${c.bold}${user_code}${c.reset}`);
    console.log();
    process.stdout.write(`  ${c.dim}Waiting for authorization...${c.reset}`);
  }

  // Poll for token
  const pollInterval = (interval || 5) * 1000;
  const deadline = Date.now() + (expires_in || 900) * 1000;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollInterval));

    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        device_code,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      }),
    });
    const tokenData = await tokenRes.json();

    if (tokenData.access_token) {
      // Save token
      if (!existsSync(REPOSHIFT_DIR)) mkdirSync(REPOSHIFT_DIR, { recursive: true });
      writeFileSync(TOKEN_PATH, tokenData.access_token, { mode: 0o600 });

      // Get username
      let username = "";
      try {
        const userRes = await fetch("https://api.github.com/user", {
          headers: { Authorization: `Bearer ${tokenData.access_token}`, "User-Agent": "RepoShift-CLI" },
        });
        const user = await userRes.json();
        username = user.login || "";
      } catch {}

      if (!silent) {
        console.log(` ${c.green}✓${c.reset}`);
        console.log(`  ${c.green}✓${c.reset} Authenticated as ${c.bold}@${username}${c.reset}`);
        console.log(`  ${c.dim}Token saved to ${TOKEN_PATH}${c.reset}`);
        console.log();
      }
      return tokenData.access_token;
    }

    if (tokenData.error === "authorization_pending") continue;
    if (tokenData.error === "slow_down") {
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }
    if (tokenData.error === "expired_token") {
      if (!silent) console.log(` ${c.red}✗ expired${c.reset}`);
      throw new Error("Device code expired. Please try again.");
    }
    if (tokenData.error === "access_denied") {
      if (!silent) console.log(` ${c.red}✗ denied${c.reset}`);
      throw new Error("Authorization denied by user.");
    }
    if (tokenData.error) {
      throw new Error(`GitHub OAuth error: ${tokenData.error_description || tokenData.error}`);
    }
  }

  throw new Error("Device flow timed out. Please try again.");
}

// Fallback: read from .env.local if env var is empty (e.g. Claude Code overrides it)
if (!ANTHROPIC_API_KEY) {
  try {
    const envPath = resolve(process.cwd(), ".env.local");
    const content = readFileSync(envPath, "utf-8");
    const match = content.match(/^ANTHROPIC_API_KEY=(.+)$/m);
    if (match?.[1]?.trim()) ANTHROPIC_API_KEY = match[1].trim();
  } catch {}
}

// ── Auto-detect repo URL from local git ──
function detectRepoUrl() {
  try {
    // Try git command first (most reliable, handles worktrees etc.)
    const remote = execSync("git remote get-url origin", { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
    if (remote) return normalizeGitUrl(remote);
  } catch {
    // git command not available or not a repo — try reading .git/config directly
    try {
      let dir = process.cwd();
      while (dir !== "/") {
        const configPath = resolve(dir, ".git", "config");
        if (existsSync(configPath)) {
          const config = readFileSync(configPath, "utf-8");
          const match = config.match(/url\s*=\s*(.+)/);
          if (match) return normalizeGitUrl(match[1].trim());
        }
        dir = resolve(dir, "..");
      }
    } catch {}
  }
  return null;
}

function normalizeGitUrl(url) {
  // Convert SSH format: git@github.com:owner/repo.git → https://github.com/owner/repo
  if (url.startsWith("git@")) {
    url = url.replace(/^git@([^:]+):/, "https://$1/");
  }
  // Strip .git suffix
  url = url.replace(/\.git$/, "");
  return url;
}

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

/** AI documentation files to detect and fetch */
const AI_DOC_FILES = [
  "AGENTS.md", "CLAUDE.md", ".cursorrules", ".github/copilot-instructions.md",
  ".windsurfrules", "CODEX.md", "GEMINI.md",
  "ai/patterns.md", "ai/agents/code-review.md", "ai/agents/doc-update.md",
  "ai/architecture/overview.md", "ai/guides/common-mistakes.md",
  "ai/guides/documentation-governance.md", "ai/mcp/recommendations.md",
  "ai/skills/create-pr/SKILL.md", "REMEDIATION-PLAN.md",
];

/** Tool detection map: file/dir → tool name */
const TOOL_DETECTION = {
  "CLAUDE.md": "claude", ".cursorrules": "cursor",
  ".github/copilot-instructions.md": "copilot",
  ".windsurfrules": "windsurf", "CODEX.md": "codex", "GEMINI.md": "gemini",
};
const TOOL_DIR_DETECTION = { ".claude/": "claude", ".cursor/": "cursor", ".windsurf/": "windsurf" };

/** Detect existing AI docs and tools from the tree */
function detectExistingDocs(tree, files) {
  const treePaths = new Set(tree.map((e) => e.path));

  // Detect existing doc files
  const existingFiles = AI_DOC_FILES.filter((p) => treePaths.has(p));

  // Detect tools from wrapper files and directories
  const detectedTools = new Set();
  for (const [file, tool] of Object.entries(TOOL_DETECTION)) {
    if (treePaths.has(file)) detectedTools.add(tool);
  }
  for (const [dirPrefix, tool] of Object.entries(TOOL_DIR_DETECTION)) {
    if (tree.some((e) => e.path.startsWith(dirPrefix))) detectedTools.add(tool);
  }

  // Gather existing file contents
  const existingContents = {};
  for (const f of files) {
    if (existingFiles.includes(f.path)) {
      existingContents[f.path] = f.content;
    }
  }

  return {
    existingFiles,
    detectedTools: Array.from(detectedTools),
    existingContents,
    hasExistingDocs: existingFiles.length > 0,
  };
}

async function fetchRepoFiles(owner, repo, tree, token) {
  const files = [];
  const blobs = tree.filter((e) => e.type === "blob");

  const keyPaths = blobs.filter((b) => KEY_FILES.includes(b.path)).map((b) => b.path);
  const srcPaths = blobs
    .filter((b) => SOURCE_EXTS.some((ext) => b.path.endsWith(ext)) && !b.path.includes("node_modules") && !b.path.includes(".min.") && !b.path.includes("dist/") && (b.size || 0) < 50000)
    .slice(0, 40)
    .map((b) => b.path);
  const docPaths = blobs.filter((b) => AI_DOC_FILES.includes(b.path)).map((b) => b.path);

  const allPaths = [...new Set([...keyPaths, ...srcPaths, ...docPaths])];

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

// ── Azure DevOps API ──
async function fetchAzDoTree(org, project, repo, token) {
  const headers = { Accept: "application/json", "User-Agent": "RepoShift-CLI/1.0" };
  if (token) {
    const encoded = Buffer.from(`:${token}`).toString("base64");
    headers["Authorization"] = `Basic ${encoded}`;
  }
  const res = await fetch(
    `https://dev.azure.com/${org}/${project}/_apis/git/repositories/${repo}/items?recursionLevel=Full&api-version=7.1`,
    { headers }
  );
  if (!res.ok) {
    if (res.status === 404) throw new Error("Repository not found on Azure DevOps");
    if (res.status === 401 || res.status === 403) throw new Error("Azure DevOps auth failed — check your token");
    throw new Error(`Azure DevOps API error: ${res.status}`);
  }
  const data = await res.json();
  return (data.value || [])
    .filter((item) => item.path !== "/")
    .map((item) => ({
      path: item.path.replace(/^\//, ""),
      type: item.isFolder ? "tree" : "blob",
      size: undefined,
    }));
}

async function fetchAzDoFileContent(org, project, repo, path, token) {
  const headers = { "User-Agent": "RepoShift-CLI/1.0" };
  if (token) {
    const encoded = Buffer.from(`:${token}`).toString("base64");
    headers["Authorization"] = `Basic ${encoded}`;
  }
  try {
    const res = await fetch(
      `https://dev.azure.com/${org}/${project}/_apis/git/repositories/${repo}/items?path=${encodeURIComponent("/" + path)}&api-version=7.1`,
      { headers }
    );
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function fetchAzDoRepoFiles(org, project, repo, tree, token) {
  const files = [];
  const blobs = tree.filter((e) => e.type === "blob");

  const keyPaths = blobs.filter((b) => KEY_FILES.includes(b.path)).map((b) => b.path);
  const srcPaths = blobs
    .filter((b) => SOURCE_EXTS.some((ext) => b.path.endsWith(ext)) && !b.path.includes("node_modules") && !b.path.includes(".min.") && !b.path.includes("dist/") && (b.size || 0) < 50000)
    .slice(0, 40)
    .map((b) => b.path);
  const docPaths = blobs.filter((b) => AI_DOC_FILES.includes(b.path)).map((b) => b.path);

  const allPaths = [...new Set([...keyPaths, ...srcPaths, ...docPaths])];

  for (let i = 0; i < allPaths.length; i += 10) {
    const batch = allPaths.slice(i, i + 10);
    const results = await Promise.all(batch.map(async (p) => {
      const content = await fetchAzDoFileContent(org, project, repo, p, token);
      return content ? { path: p, content, size: content.length } : null;
    }));
    files.push(...results.filter(Boolean));
  }
  return files;
}

// ── URL Parsing ──
function parseRepoUrl(url) {
  const trimmed = url.trim().replace(/\.git$/, "");

  // GitHub: https://github.com/owner/repo
  const ghMatch = trimmed.match(/github\.com\/([^/]+)\/([^/\s#?]+)/);
  if (ghMatch) {
    return { provider: "github", owner: ghMatch[1], repo: ghMatch[2] };
  }

  // Azure DevOps: https://dev.azure.com/{org}/{project}/_git/{repo}
  const azdoMatch1 = trimmed.match(/dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/([^/\s#?]+)/);
  if (azdoMatch1) {
    return { provider: "azure-devops", org: azdoMatch1[1], project: azdoMatch1[2], repo: azdoMatch1[3] };
  }

  // Azure DevOps (old format): https://{org}.visualstudio.com/{project}/_git/{repo}
  const azdoMatch2 = trimmed.match(/([^/]+)\.visualstudio\.com\/([^/]+)\/_git\/([^/\s#?]+)/);
  if (azdoMatch2) {
    return { provider: "azure-devops", org: azdoMatch2[1], project: azdoMatch2[2], repo: azdoMatch2[3] };
  }

  // Shorthand: owner/repo (assume GitHub)
  const shortMatch = trimmed.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (shortMatch) {
    return { provider: "github", owner: shortMatch[1], repo: shortMatch[2] };
  }

  return null;
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

function extractJSON(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return trimmed;
  const fenceMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) return fenceMatch[1].trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

async function analyzeCategory(category, stack, treeSummary, fileContext) {
  const prompt = `Analyze the ${CATEGORY_LABELS[category]} of this ${stack.framework} (${stack.language}) codebase.\n\nREPOSITORY TREE:\n${treeSummary}\n\nSOURCE FILES:\n${fileContext}`;
  const text = await callClaude(SYSTEM_PROMPT, prompt);
  try {
    return JSON.parse(extractJSON(text));
  } catch {
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

function printReport(repoName, stack, results, verboseMode = false) {
  console.log();
  console.log(`  ${c.dim}│${c.blue}>${c.reset} ${c.bold}Repo${c.blue}Shift${c.reset} — Audit Report`);
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

  // Findings summary
  const allFindings = results.flatMap((r) => r.findings.map((f) => ({ ...f, category: r.category })));
  const criticals = allFindings.filter((f) => f.severity === "critical");
  const warnings = allFindings.filter((f) => f.severity === "warning");
  const infos = allFindings.filter((f) => f.severity === "info");

  console.log(`  ${c.bold}Findings:${c.reset} ${c.red}${criticals.length} critical${c.reset}  ${c.yellow}${warnings.length} warnings${c.reset}  ${c.blue}${infos.length} info${c.reset}`);
  console.log();

  // Grouped by category (compact by default, verbose for full details)
  for (const r of results) {
    if (r.findings.length === 0) continue;
    const catLabel = CATEGORY_LABELS[r.category] || r.category;
    const sc = scoreColor(r.score);
    const crits = r.findings.filter((f) => f.severity === "critical").length;
    const warns = r.findings.filter((f) => f.severity === "warning").length;
    const infs = r.findings.filter((f) => f.severity === "info").length;
    const counts = [
      crits ? `${c.red}${crits} critical${c.reset}` : "",
      warns ? `${c.yellow}${warns} warning${c.reset}` : "",
      infs ? `${c.blue}${infs} info${c.reset}` : "",
    ].filter(Boolean).join("  ");

    console.log(`  ${sc}■${c.reset} ${c.bold}${catLabel}${c.reset} ${c.dim}(${r.score}/100)${c.reset}  ${counts}`);
    console.log(`    ${c.dim}${r.summary}${c.reset}`);

    if (verboseMode) {
      for (const f of r.findings) {
        console.log(`      ${severityIcon(f.severity)} ${c.bold}${f.title}${c.reset}`);
        console.log(`        ${c.dim}${f.description}${c.reset}`);
        if (f.file) console.log(`        ${c.cyan}${f.file}${c.reset}`);
        if (f.suggestion) console.log(`        ${c.green}💡 ${f.suggestion}${c.reset}`);
      }
    } else {
      // Compact: show just critical + warning titles
      const important = r.findings.filter((f) => f.severity !== "info");
      for (const f of important) {
        console.log(`      ${severityIcon(f.severity)} ${f.title}${f.file ? `  ${c.dim}${f.file}${c.reset}` : ""}`);
      }
    }
    console.log();
  }

  if (!verboseMode && allFindings.length > 0) {
    console.log(`  ${c.dim}Run with --verbose to see full descriptions and suggestions${c.reset}`);
    console.log();
  }
}

// ── Generation: Documentation Kit (megadata-standards pattern) ──
const ALL_AI_TOOLS = ["claude", "cursor", "copilot", "windsurf", "codex", "gemini"];

const ACCURACY_RULES = `
CRITICAL ACCURACY RULES:
- ONLY document features, files, and patterns that ACTUALLY exist in the provided source code and file tree.
- Use the ACTUAL file tree to list project structure — do NOT omit files or invent ones that don't exist.
- If a feature is already implemented, document it as existing — do NOT claim it is "future" or "planned".
- When documenting naming conventions, use the ACTUAL file names from the tree.
- Do NOT hallucinate file paths, variable names, or code patterns.`;

function stripCodeFences(text) {
  return text.replace(/^```(?:markdown|md)?\s*\n?/i, "").replace(/\n?\s*```\s*$/i, "").trim();
}

async function callClaudeGen(system, userMessage, maxTokens = 8192) {
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set.");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: userMessage }],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API error ${res.status}: ${err}`);
  }
  const data = await res.json();
  let text = data.content[0]?.text || "";
  text = stripCodeFences(text);
  if (data.stop_reason === "max_tokens" && text) {
    return text + "\n\n<!-- Content may be truncated due to length limits -->";
  }
  return text;
}

// Phase 1: ai/patterns.md (SSOT)
async function generatePatternsCli(stack, treeSummary, fileContext, findingsSummary, existingContent) {
  const existingContext = existingContent
    ? `\n\nEXISTING ai/patterns.md (update and improve this — preserve what's accurate, fix what's wrong, add what's missing):\n${existingContent}`
    : "";
  return callClaudeGen(
    `You are RepoShift, generating ai/patterns.md — the Single Source of Truth (SSOT) for all code patterns, naming conventions, and architectural decisions in a project. Write in clear, authoritative Markdown. Output ONLY the raw Markdown content.${ACCURACY_RULES}`,
    `Generate **ai/patterns.md** for this ${stack.framework} (${stack.language}) project.

This is the SSOT for code patterns. Other files will reference this.

Include:
1. **Project Overview** — Brief description of the stack, architecture, and purpose
2. **Folder Structure** — MUST match the actual file tree
3. **Naming Conventions** — Use REAL examples from the source files
4. **Component/Module Patterns** — Extract from ACTUAL source code
5. **State Management** — Document what the code ACTUALLY does
6. **Error Handling Patterns** — Document the ACTUAL approach
7. **API/Service Patterns** — Document the ACTUAL API patterns
8. **Testing Standards** — If no test framework, state that clearly
9. **Dependency Policy** — Key dependencies and their purpose
10. **Environment & Configuration** — Environment variables, config files

DETECTED STACK: ${JSON.stringify(stack, null, 2)}

AUDIT FINDINGS:
${findingsSummary}

REPOSITORY TREE:
${treeSummary}

SOURCE FILES:
${fileContext}${existingContext}`
  );
}

// Phase 2: Specialized files
async function generateCodeReviewAgentCli(stack, patternsContent, findingsSummary, existingContent) {
  const existingContext = existingContent
    ? `\n\nEXISTING ai/agents/code-review.md (update and improve this):\n${existingContent}`
    : "";
  return callClaudeGen(
    `You are RepoShift, generating ai/agents/code-review.md — a code review agent definition. Output ONLY the raw Markdown content. Start with YAML frontmatter (name, description). Reference ai/patterns.md as the source of truth.${ACCURACY_RULES}`,
    `Generate **ai/agents/code-review.md** for this ${stack.framework} (${stack.language}) project.

1. YAML frontmatter (name: code-review, description)
2. Agent purpose
3. "Before Reviewing" prerequisites
4. Review Checklist with checkboxes
5. Output Format template

DETECTED STACK: ${JSON.stringify(stack, null, 2)}

AUDIT FINDINGS:
${findingsSummary}

ai/patterns.md CONTENT (reference, don't duplicate):
${patternsContent}${existingContext}`,
    4096
  );
}

async function generateArchitectureCli(stack, treeSummary, fileContext, patternsContent, existingContent) {
  const existingContext = existingContent
    ? `\n\nEXISTING ai/architecture/overview.md (update and improve this):\n${existingContent}`
    : "";
  return callClaudeGen(
    `You are RepoShift, generating ai/architecture/overview.md. Write clear, concise Markdown. Output ONLY the raw Markdown content. Focus on high-level architecture.${ACCURACY_RULES}`,
    `Generate **ai/architecture/overview.md** for this ${stack.framework} (${stack.language}) project.

Include: System Overview, Key Components, Data Flow, Key Files, Environment Variables, Commands, Architecture Decisions.

DETECTED STACK: ${JSON.stringify(stack, null, 2)}

REPOSITORY TREE:
${treeSummary}

SOURCE FILES:
${fileContext}

ai/patterns.md CONTENT (reference, don't duplicate):
${patternsContent}${existingContext}`,
    4096
  );
}

async function generateCommonMistakesCli(stack, findingsDetail, fileContext, patternsContent, existingContent) {
  const existingContext = existingContent
    ? `\n\nEXISTING ai/guides/common-mistakes.md (update — add new mistakes, remove resolved ones):\n${existingContent}`
    : "";
  return callClaudeGen(
    `You are RepoShift, generating ai/guides/common-mistakes.md. Write clear Markdown with code examples. Output ONLY the raw Markdown content.${ACCURACY_RULES}`,
    `Generate **ai/guides/common-mistakes.md** for this ${stack.framework} (${stack.language}) project.

Derive from audit findings. For each: What's wrong, Why it matters, Correct approach, Example.

AUDIT FINDINGS:
${findingsDetail}

SOURCE FILES:
${fileContext}

ai/patterns.md CONTENT (reference for correct patterns):
${patternsContent}${existingContext}`,
    4096
  );
}

async function generateMCPFileCli(stack, treeSummary, fileContext, existingContent) {
  const existingContext = existingContent
    ? `\n\nEXISTING ai/mcp/recommendations.md (update — verify current recommendations, add new ones):\n${existingContent}`
    : "";
  return callClaudeGen(
    `You are RepoShift, an expert on MCP servers for AI coding assistants. Write in clear Markdown. Only recommend MCP servers that actually exist.`,
    `Recommend MCP servers for this ${stack.framework} (${stack.language}) project. Write as **ai/mcp/recommendations.md**.

For each: Server name, What it does, Why it's relevant, Installation.

DETECTED STACK: ${JSON.stringify(stack, null, 2)}

REPOSITORY TREE:
${treeSummary}

KEY FILES:
${fileContext}${existingContext}`,
    4096
  );
}

// Phase 3: AGENTS.md entry point
async function generateAgentsEntryCli(stack, generatedFiles) {
  const fileList = generatedFiles.map((f) => `- \`${f.path}\` — ${f.label}`).join("\n");

  return callClaudeGen(
    `You are RepoShift, generating AGENTS.md — the universal entry point for AI coding assistants. Follow the megadata-standards format. Output ONLY the raw Markdown content.${ACCURACY_RULES}`,
    `Generate **AGENTS.md** for this ${stack.framework} (${stack.language}) project.

1. Title: "# AI Development Standards — {project description}"
2. Brief project purpose
3. Reference Documents table (task → file mapping)
4. Agents & Skills table
5. Key conventions (3-5 bullets, reference ai/patterns.md)
6. Commands section
7. Critical reminders

DETECTED STACK: ${JSON.stringify(stack, null, 2)}

GENERATED FILES (route to these):
${fileList}`,
    4096
  );
}

// Phase 4: Tool wrappers (template-based, 0 API calls)
function buildToolWrappersCli(selectedTools, agentsContent) {
  const files = [];
  const hasAgents = agentsContent.includes("code-review");

  const templates = {
    claude: {
      fileName: "CLAUDE.md",
      content: () => {
        let c = `# Claude Code Configuration\n\nRead [\`AGENTS.md\`](AGENTS.md) first — it contains all project standards.\n\nThis file adds Claude Code-specific invoke syntax.\n\n---\n\n## Agents & Skills (Claude Code)\n\n| Type | Name | Invoke |\n|------|------|--------|`;
        if (hasAgents) {
          c += `\n| Agent | [\`ai/agents/code-review.md\`](ai/agents/code-review.md) | "Review my changes using ai/agents/code-review.md" |`;
          c += `\n| Agent | [\`ai/agents/doc-update.md\`](ai/agents/doc-update.md) | "Check what docs need updating using ai/agents/doc-update.md" |`;
        }
        c += `\n| Skill | [\`ai/skills/create-pr/SKILL.md\`](ai/skills/create-pr/SKILL.md) | \`/create-pr\` |`;
        return c;
      },
    },
    cursor: {
      fileName: ".cursorrules",
      content: () => `# Cursor Rules\n\nRead AGENTS.md for full project standards and conventions.\nRead ai/patterns.md for the single source of truth on code patterns.\n\n## Key Rules\n- Follow all conventions documented in ai/patterns.md\n- Reference ai/agents/code-review.md checklist before submitting changes\n- Check ai/architecture/overview.md for system architecture context\n- See ai/guides/common-mistakes.md for anti-patterns to avoid\n`,
    },
    copilot: {
      fileName: ".github/copilot-instructions.md",
      content: () => `# GitHub Copilot Instructions\n\nRead AGENTS.md for full project context and standards.\nRead ai/patterns.md for code patterns and naming conventions.\n\n## Code Generation Rules\n- Follow naming conventions from ai/patterns.md\n- Use error handling patterns documented in ai/patterns.md\n- Reference ai/architecture/overview.md for architectural context\n- Avoid anti-patterns listed in ai/guides/common-mistakes.md\n`,
    },
    windsurf: {
      fileName: ".windsurfrules",
      content: () => `# Windsurf Rules\n\nRead AGENTS.md for full project context and standards.\nRead ai/patterns.md for code patterns and naming conventions.\n\n## Cascade AI Rules\n- Follow all conventions in ai/patterns.md\n- Check ai/architecture/overview.md for system design context\n- Avoid patterns in ai/guides/common-mistakes.md\n- Use ai/agents/code-review.md checklist for quality assurance\n`,
    },
    codex: {
      fileName: "CODEX.md",
      content: () => `# OpenAI Codex CLI Instructions\n\nRead AGENTS.md for full project context and standards.\nRead ai/patterns.md for the single source of truth on code patterns.\n\n## Sandbox Notes\n- Follow all conventions documented in ai/patterns.md\n- Reference ai/architecture/overview.md for architecture decisions\n- Avoid anti-patterns in ai/guides/common-mistakes.md\n- Use ai/agents/code-review.md checklist before finalizing changes\n`,
    },
    gemini: {
      fileName: "GEMINI.md",
      content: () => `# Google Gemini Code Assist Instructions\n\nRead AGENTS.md for full project context and standards.\nRead ai/patterns.md for code patterns and naming conventions.\n\n## Code Generation Rules\n- Follow naming conventions from ai/patterns.md\n- Reference ai/architecture/overview.md for architectural context\n- Avoid anti-patterns listed in ai/guides/common-mistakes.md\n- Use ai/agents/code-review.md checklist for validation\n`,
    },
  };

  for (const tool of selectedTools) {
    if (templates[tool]) {
      files.push({ path: templates[tool].fileName, content: templates[tool].content(), label: `${templates[tool].fileName} (${tool} wrapper)`, phase: 4 });
    }
  }

  // Tool-specific directory wrappers for auto-discovery
  if (selectedTools.includes("claude")) {
    files.push({ path: ".claude/agents/code-review.md", content: "# Code Review Agent\n\nRead and follow the full agent definition in [`ai/agents/code-review.md`](../../ai/agents/code-review.md).\n\nThis file enables Claude Code auto-discovery.\n", label: ".claude/agents/ (auto-discovery)", phase: 4 });
    files.push({ path: ".claude/agents/doc-update.md", content: "# Documentation Update Agent\n\nRead and follow the full agent definition in [`ai/agents/doc-update.md`](../../ai/agents/doc-update.md).\n\nThis file enables Claude Code auto-discovery.\n", label: ".claude/agents/ (auto-discovery)", phase: 4 });
    files.push({ path: ".claude/skills/create-pr/SKILL.md", content: "# Create PR Skill\n\nRead and follow the full skill definition in [`ai/skills/create-pr/SKILL.md`](../../../ai/skills/create-pr/SKILL.md).\n\nThis file enables Claude Code auto-discovery.\n", label: ".claude/skills/ (auto-discovery)", phase: 4 });
  }
  if (selectedTools.includes("cursor")) {
    files.push({ path: ".cursor/rules/patterns.mdc", content: "---\ndescription: Code patterns and conventions for this project\nglobs:\nalwaysApply: true\n---\n\nRead and follow the patterns defined in [ai/patterns.md](../../ai/patterns.md).\nReview checklist: [ai/agents/code-review.md](../../ai/agents/code-review.md).\nCommon mistakes to avoid: [ai/guides/common-mistakes.md](../../ai/guides/common-mistakes.md).\n", label: ".cursor/rules/ (auto-discovery)", phase: 4 });
  }
  if (selectedTools.includes("windsurf")) {
    files.push({ path: ".windsurf/rules/patterns.md", content: "# Project Patterns\n\nRead and follow the patterns defined in [ai/patterns.md](../../ai/patterns.md).\nReview checklist: [ai/agents/code-review.md](../../ai/agents/code-review.md).\nCommon mistakes to avoid: [ai/guides/common-mistakes.md](../../ai/guides/common-mistakes.md).\n", label: ".windsurf/rules/ (auto-discovery)", phase: 4 });
  }

  return files;
}

// Phase 5: Remediation Plan
async function generateRemediationCli(stack, treeSummary, fileContext, findingsDetail, existingContent) {
  const existingContext = existingContent
    ? `\n\nEXISTING REMEDIATION-PLAN.md (update — mark resolved items, add new ones):\n${existingContent}`
    : "";
  return callClaudeGen(
    `You are RepoShift, generating a prioritized remediation plan that a tech lead could use for sprint planning. Write in clear, actionable Markdown. Focus on practical execution, not theory.

CRITICAL ACCURACY RULES:
- ONLY include remediation items for issues that are ACTUALLY present in the codebase.
- Cross-check ALL audit findings against the actual source files before including them.`,
    `Generate a PRIORITIZED REMEDIATION PLAN for this ${stack.framework} (${stack.language}) project.

Structure: Executive Summary, Quick Wins, Sprint 1, Sprint 2, Tech Debt Backlog.
For each item: What, Why, How, Files affected, Effort (XS/S/M/L/XL), Risk.

DETECTED STACK: ${JSON.stringify(stack, null, 2)}

AUDIT FINDINGS:
${findingsDetail}

REPOSITORY TREE:
${treeSummary}

SOURCE FILES:
${fileContext}${existingContext}`
  );
}

// Phase 6: Static templates
function buildStaticTemplates() {
  return [
    {
      path: "ai/skills/create-pr/SKILL.md",
      content: `---\nname: create-pr\ndescription: Create a pull request with conventional commit message\n---\n\n# Create Pull Request\n\n## Steps\n\n1. **Check for changes**: Run \`git status\`\n2. **Stage changes**: Stage relevant files with \`git add\`\n3. **Create commit**: Use conventional commit format (feat:, fix:, refactor:, docs:, chore:)\n4. **Push branch**: \`git push -u origin <branch>\`\n5. **Create PR**: \`gh pr create\` with descriptive title and body\n\n## Commit Format\n\n\`\`\`\n<type>(<scope>): <short description>\n\n<body — explain what changed and why>\n\`\`\`\n`,
      label: "Create PR Skill",
      phase: 6,
    },
    {
      path: "ai/agents/doc-update.md",
      content: `---\nname: doc-update\ndescription: Detect and update documentation after code changes\n---\n\n# Documentation Update Agent\n\n## Trigger\nRun after any code change to determine what docs need updating.\n\n## Process\n1. **Identify changed files**: Review the diff\n2. **Map changes to docs**: Component changes → ai/architecture/overview.md, New patterns → ai/patterns.md, Bug fixes → ai/guides/common-mistakes.md, New deps → ai/architecture/overview.md\n3. **Update affected docs**\n4. **Verify cross-references**: Ensure AGENTS.md is accurate\n\n## Update Checklist\n- [ ] ai/patterns.md — Are patterns still accurate?\n- [ ] ai/architecture/overview.md — Does architecture match?\n- [ ] ai/guides/common-mistakes.md — New anti-patterns?\n- [ ] ai/agents/code-review.md — New checklist items?\n- [ ] AGENTS.md — File listing current?\n`,
      label: "Doc Update Agent",
      phase: 6,
    },
    {
      path: "ai/guides/documentation-governance.md",
      content: `# Documentation Governance\n\n## When to Update\n\n### Trigger 1: Code Changes\nRun doc-update agent (ai/agents/doc-update.md) after code changes.\n\n### Trigger 2: New Patterns\n1. Add to ai/patterns.md\n2. Add old pattern to ai/guides/common-mistakes.md\n3. Update ai/agents/code-review.md checklist\n\n### Trigger 3: Dependency Changes\n1. Update ai/architecture/overview.md\n2. Update ai/mcp/recommendations.md\n\n## Maintenance Schedule\n\n### After Each PR\n- Run doc-update agent checklist\n- Verify ai/patterns.md reflects new conventions\n\n### Monthly\n- Review common-mistakes.md for resolved issues\n- Check architecture/overview.md accuracy\n- Verify MCP recommendations\n\n### Quarterly\n- Full documentation audit\n- Review all agent definitions\n- Check tool wrappers are in sync\n`,
      label: "Documentation Governance",
      phase: 6,
    },
  ];
}

// ── Full Documentation Kit Orchestrator (CLI) ──
async function generateDocKit(stack, treeSummary, fileContext, auditResults, selectedTools, asJson, mode = "full", existingContents = {}) {
  const ec = existingContents;
  const shouldSkip = (path) => mode === "missing" && ec[path];
  const getExisting = (path) => mode === "update" ? ec[path] : undefined;

  const findingsSummary = auditResults.map((r) =>
    `## ${r.category} (Score: ${r.score}/100)\n${r.summary}\n${(r.findings || []).map((f) => `- [${f.severity}] ${f.title}: ${f.description}`).join("\n")}`
  ).join("\n\n");

  const findingsDetail = auditResults.map((r) =>
    `## ${r.category} (Score: ${r.score}/100)\n${r.summary}\n${(r.findings || []).map((f) =>
      `- [${f.severity}] ${f.title}: ${f.description}${f.file ? ` (${f.file})` : ""}${f.suggestion ? `\n  Suggestion: ${f.suggestion}` : ""}`
    ).join("\n")}`
  ).join("\n\n");

  const smallFileContext = fileContext.length > 20000 ? fileContext.slice(0, 20000) : fileContext;
  const generatedFiles = [];

  // Phase 1: ai/patterns.md
  let patternsContent;
  if (shouldSkip("ai/patterns.md")) {
    patternsContent = ec["ai/patterns.md"];
    generatedFiles.push({ path: "ai/patterns.md", content: patternsContent, label: "Code Patterns (SSOT)", phase: 1, source: "existing" });
    if (!asJson) console.log(`  ${c.dim}Phase 1: ai/patterns.md${c.reset} ${c.yellow}(exists, skipped)${c.reset}`);
  } else {
    if (!asJson) process.stdout.write(`  ${c.dim}Phase 1: Generating patterns (SSOT)...${c.reset}`);
    patternsContent = await generatePatternsCli(stack, treeSummary, fileContext, findingsSummary, getExisting("ai/patterns.md"));
    generatedFiles.push({ path: "ai/patterns.md", content: patternsContent, label: "Code Patterns (SSOT)", phase: 1, source: "generated" });
    if (!asJson) console.log(` ${c.green}✓${c.reset}`);
  }

  // Phase 2: Specialized files (parallel)
  const phase2Tasks = [
    { path: "ai/agents/code-review.md", label: "Code Review Agent", gen: () => generateCodeReviewAgentCli(stack, patternsContent, findingsSummary, getExisting("ai/agents/code-review.md")) },
    { path: "ai/architecture/overview.md", label: "Architecture Overview", gen: () => generateArchitectureCli(stack, treeSummary, smallFileContext, patternsContent, getExisting("ai/architecture/overview.md")) },
    { path: "ai/guides/common-mistakes.md", label: "Common Mistakes Guide", gen: () => generateCommonMistakesCli(stack, findingsDetail, smallFileContext, patternsContent, getExisting("ai/guides/common-mistakes.md")) },
    { path: "ai/mcp/recommendations.md", label: "MCP Recommendations", gen: () => generateMCPFileCli(stack, treeSummary, smallFileContext, getExisting("ai/mcp/recommendations.md")) },
  ];

  const toGenerate = phase2Tasks.filter((t) => !shouldSkip(t.path));
  const toSkip = phase2Tasks.filter((t) => shouldSkip(t.path));

  if (toSkip.length > 0 && !asJson) {
    for (const t of toSkip) {
      console.log(`  ${c.dim}Phase 2: ${t.path}${c.reset} ${c.yellow}(exists, skipped)${c.reset}`);
      generatedFiles.push({ path: t.path, content: ec[t.path], label: t.label, phase: 2, source: "existing" });
    }
  }

  if (toGenerate.length > 0) {
    if (!asJson) process.stdout.write(`  ${c.dim}Phase 2: Building ${toGenerate.length} specialized files...${c.reset}`);
    const results = await Promise.all(toGenerate.map(async (t) => {
      const content = await t.gen();
      return { path: t.path, content, label: t.label, phase: 2, source: "generated" };
    }));
    generatedFiles.push(...results);
    if (!asJson) console.log(` ${c.green}✓${c.reset} (${results.length} files)`);
  }

  // Phase 3: AGENTS.md
  if (shouldSkip("AGENTS.md")) {
    generatedFiles.push({ path: "AGENTS.md", content: ec["AGENTS.md"], label: "AI Entry Point", phase: 3, source: "existing" });
    if (!asJson) console.log(`  ${c.dim}Phase 3: AGENTS.md${c.reset} ${c.yellow}(exists, skipped)${c.reset}`);
  } else {
    if (!asJson) process.stdout.write(`  ${c.dim}Phase 3: Generating AGENTS.md entry point...${c.reset}`);
    const agentsContent = await generateAgentsEntryCli(stack, generatedFiles);
    generatedFiles.push({ path: "AGENTS.md", content: agentsContent, label: "AI Entry Point", phase: 3, source: "generated" });
    if (!asJson) console.log(` ${c.green}✓${c.reset}`);
  }

  // Phase 4: Tool wrappers
  if (!asJson) process.stdout.write(`  ${c.dim}Phase 4: Building tool wrappers...${c.reset}`);
  const agentsEntry = generatedFiles.find((f) => f.path === "AGENTS.md");
  const wrappers = buildToolWrappersCli(selectedTools, agentsEntry?.content || "");
  let wrappersGenerated = 0;
  for (const w of wrappers) {
    if (shouldSkip(w.path)) {
      generatedFiles.push({ ...w, content: ec[w.path], source: "existing" });
    } else {
      generatedFiles.push({ ...w, source: "generated" });
      wrappersGenerated++;
    }
  }
  if (!asJson) console.log(` ${c.green}✓${c.reset} (${wrappersGenerated} new, ${wrappers.length - wrappersGenerated} existing)`);

  // Phase 5: Remediation plan
  if (shouldSkip("REMEDIATION-PLAN.md")) {
    generatedFiles.push({ path: "REMEDIATION-PLAN.md", content: ec["REMEDIATION-PLAN.md"], label: "Remediation Plan", phase: 5, source: "existing" });
    if (!asJson) console.log(`  ${c.dim}Phase 5: REMEDIATION-PLAN.md${c.reset} ${c.yellow}(exists, skipped)${c.reset}`);
  } else {
    if (!asJson) process.stdout.write(`  ${c.dim}Phase 5: Generating remediation plan...${c.reset}`);
    const remediation = await generateRemediationCli(stack, treeSummary, smallFileContext, findingsDetail, getExisting("REMEDIATION-PLAN.md"));
    generatedFiles.push({ path: "REMEDIATION-PLAN.md", content: remediation, label: "Remediation Plan", phase: 5, source: "generated" });
    if (!asJson) console.log(` ${c.green}✓${c.reset}`);
  }

  // Phase 6: Static templates
  const statics = buildStaticTemplates();
  for (const sf of statics) {
    if (shouldSkip(sf.path)) {
      generatedFiles.push({ ...sf, content: ec[sf.path], source: "existing" });
    } else {
      generatedFiles.push({ ...sf, source: "generated" });
    }
  }

  return generatedFiles;
}

function writeGeneratedFile(filepath, content) {
  const dir = dirname(filepath);
  if (dir && dir !== "." && !existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(filepath, content, "utf-8");
}

// ── Main ──
async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));

  if (!command || flags.help) {
    console.log(`
  ${c.dim}│${c.blue}>${c.reset} ${c.bold}Repo${c.blue}Shift${c.reset}  ${c.dim}— Audit. Standardize. Shift Forward.${c.reset}

${c.bold}Commands:${c.reset}
  reposhift audit                               Audit current git repo (auto-detects URL)
  reposhift audit --repo=<url>                  Audit a specific repository
  reposhift login                               Authenticate with GitHub (for private repos)
  reposhift logout                              Remove saved GitHub token

${c.bold}Usage:${c.reset}
  reposhift audit --repo=<url> --json           Output as JSON
  reposhift audit --repo=<url> --categories=structure,patterns
  reposhift audit --remediation                  Audit + generate remediation plan only
  reposhift audit --generate                    Audit + generate documentation kit
  reposhift audit --generate --tools=claude,codex
  reposhift audit --generate --mode=update       Update existing AI docs

${c.bold}Examples:${c.reset}
  reposhift audit                                          Scan current repo
  reposhift audit --repo=owner/repo                        Scan a public repo
  reposhift audit --repo=owner/private-repo                Scan private repo (auto-authenticates)
  reposhift audit --repo=https://dev.azure.com/org/project/_git/repo --token=<PAT>

${c.bold}Options:${c.reset}
  --repo=<url>          Repository URL — GitHub or Azure DevOps (auto-detected from git remote if omitted)
  --token=<pat>         Access token override (Azure DevOps PAT or GitHub PAT)
  --api-key=<key>       Anthropic API key (alternative to ANTHROPIC_API_KEY env var)
  --json                Output raw JSON instead of formatted report
  --categories=<list>   Comma-separated categories to analyze (default: all)
  --generate            Generate AI documentation kit (ai/ directory + tool wrappers)
  --tools=<list>        AI tools: claude, cursor, copilot, windsurf, codex, gemini (auto-detected or all)
  --mode=<mode>         Generation mode: full (default), missing (skip existing), update (improve existing)
  --verbose             Show full finding descriptions and suggestions in report
  --remediation         Generate only the REMEDIATION-PLAN.md (1 API call, fast)
  --out=<dir>           Output directory for generated files (default: current directory)
  --help                Show this help message

${c.bold}Authentication:${c.reset}
  GitHub repos authenticate automatically:
    1. Uses ${c.dim}gh auth token${c.reset} if GitHub CLI is installed
    2. Uses cached token from ${c.dim}~/.reposhift/github-token${c.reset}
    3. Prompts device flow login (opens browser) if needed
  Azure DevOps requires --token=<PAT> or AZURE_DEVOPS_TOKEN env var.

${c.bold}Environment:${c.reset}
  ANTHROPIC_API_KEY     Required. Your Anthropic API key.
  AZURE_DEVOPS_TOKEN    Optional. Default Azure DevOps PAT for private repos.

${c.bold}Supported Providers:${c.reset}
  GitHub         https://github.com/owner/repo
  Azure DevOps   https://dev.azure.com/org/project/_git/repo
                 https://org.visualstudio.com/project/_git/repo
  Shorthand      owner/repo (assumes GitHub)

${c.bold}Categories:${c.reset}
  structure, patterns, hardcoded-values, dependencies,
  dead-code, security, runtime-stability
`);
    process.exit(0);
  }

  // ── Login command ──
  if (command === "login") {
    console.log();
    console.log(`  ${c.dim}│${c.blue}>${c.reset} ${c.bold}Repo${c.blue}Shift${c.reset} — GitHub Login`);
    console.log();
    try {
      await resolveGitHubToken(false);
    } catch (err) {
      console.error(`  ${c.red}${err.message}${c.reset}`);
      process.exit(1);
    }
    process.exit(0);
  }

  // ── Logout command ──
  if (command === "logout") {
    try {
      if (existsSync(TOKEN_PATH)) {
        unlinkSync(TOKEN_PATH);
        console.log(`  ${c.green}✓${c.reset} Removed saved GitHub token`);
      } else {
        console.log(`  ${c.dim}No saved token found${c.reset}`);
      }
    } catch (err) {
      console.error(`  ${c.red}Failed to remove token: ${err.message}${c.reset}`);
    }
    process.exit(0);
  }

  if (command !== "audit") {
    console.error(`${c.red}Unknown command: ${command}. Use 'reposhift audit', 'reposhift login', or 'reposhift logout'${c.reset}`);
    process.exit(1);
  }

  const asJson = flags.json === true;

  // Support --api-key flag as alternative to env var
  if (flags["api-key"]) {
    ANTHROPIC_API_KEY = flags["api-key"];
  }

  // Auto-detect repo URL if not provided
  if (!flags.repo) {
    const detected = detectRepoUrl();
    if (detected) {
      flags.repo = detected;
      if (!asJson) console.log(`  ${c.dim}Detected repo:${c.reset} ${detected}`);
    } else {
      console.error(`${c.red}Could not detect repo. Run from inside a git repo, or pass --repo=<url>${c.reset}`);
      process.exit(1);
    }
  }

  // Parse repo URL (supports GitHub + Azure DevOps)
  const parsed = parseRepoUrl(flags.repo);
  if (!parsed) {
    console.error(`${c.red}Invalid repo URL: ${flags.repo}${c.reset}`);
    console.error(`${c.dim}Supported formats: GitHub (github.com/owner/repo), Azure DevOps (dev.azure.com/org/project/_git/repo), or owner/repo${c.reset}`);
    process.exit(1);
  }

  // Determine token based on provider
  let token = flags.token || (parsed.provider === "azure-devops" ? AZURE_DEVOPS_TOKEN : null);

  if (!ANTHROPIC_API_KEY) {
    console.error(`${c.red}ANTHROPIC_API_KEY not set. Export it or pass --api-key=sk-ant-...${c.reset}`);
    process.exit(1);
  }

  const repoDisplayName = parsed.provider === "github"
    ? `${parsed.owner}/${parsed.repo}`
    : `${parsed.org}/${parsed.project}/${parsed.repo}`;

  const categoriesToRun = flags.categories
    ? flags.categories.split(",").filter((cat) => ALL_CATEGORIES.includes(cat))
    : ALL_CATEGORIES;

  if (!asJson) {
    console.log();
    console.log(`  ${c.dim}│${c.blue}>${c.reset} ${c.bold}Repo${c.blue}Shift${c.reset} — Scanning ${repoDisplayName}...`);
    if (parsed.provider === "azure-devops") console.log(`        ${c.dim}Provider:${c.reset} Azure DevOps`);
    console.log();
  }

  // Step 1: Fetch tree (try public first for GitHub, then auth if needed)
  if (!asJson) process.stdout.write(`  ${c.dim}Fetching repository tree...${c.reset}`);
  let tree;
  if (parsed.provider === "github") {
    try {
      tree = await fetchRepoTree(parsed.owner, parsed.repo, token);
    } catch (err) {
      // If 401/403/404, try authenticating
      if (!token && (err.message.includes("403") || err.message.includes("404") || err.message.includes("401"))) {
        if (!asJson) {
          console.log(` ${c.yellow}→ private repo${c.reset}`);
        }
        try {
          token = await resolveGitHubToken(asJson);
        } catch (authErr) {
          console.error(`\n  ${c.red}${authErr.message}${c.reset}`);
          process.exit(1);
        }
        if (!asJson) process.stdout.write(`  ${c.dim}Fetching repository tree...${c.reset}`);
        tree = await fetchRepoTree(parsed.owner, parsed.repo, token);
      } else {
        throw err;
      }
    }
  } else {
    tree = await fetchAzDoTree(parsed.org, parsed.project, parsed.repo, token);
  }
  if (!asJson) console.log(` ${c.green}✓${c.reset} ${tree.length} entries`);

  // Step 2: Fetch files
  if (!asJson) process.stdout.write(`  ${c.dim}Fetching source files...${c.reset}`);
  let files;
  if (parsed.provider === "github") {
    files = await fetchRepoFiles(parsed.owner, parsed.repo, tree, token);
  } else {
    files = await fetchAzDoRepoFiles(parsed.org, parsed.project, parsed.repo, tree, token);
  }
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
      repoName: repoDisplayName,
      provider: parsed.provider,
      scannedAt: new Date().toISOString(),
      stack,
      overallScore: overall,
      categories: results,
    }, null, 2));
  } else {
    printReport(repoDisplayName, stack, results, flags.verbose === true);
  }

  // Step 7a: Generate Remediation Plan only (if --remediation flag is set)
  if (flags.remediation) {
    const outDir = flags.out || ".";

    // Build findings detail for the prompt
    const findingsDetail = results.map((r) =>
      `## ${r.category} (Score: ${r.score}/100)\n${r.summary}\n${(r.findings || []).map((f) =>
        `- [${f.severity}] ${f.title}: ${f.description}${f.file ? ` (${f.file})` : ""}${f.suggestion ? `\n  Suggestion: ${f.suggestion}` : ""}`
      ).join("\n")}`
    ).join("\n\n");

    const smallFileContext = fileContext.length > 20000 ? fileContext.slice(0, 20000) : fileContext;

    // Check for existing remediation plan
    let existingContent;
    try {
      const existingPath = resolve(outDir, "REMEDIATION-PLAN.md");
      if (existsSync(existingPath)) {
        existingContent = readFileSync(existingPath, "utf-8");
      }
    } catch {}

    if (!asJson) {
      console.log();
      process.stdout.write(`  ${c.dim}Generating remediation plan...${c.reset}`);
    }

    try {
      const content = await generateRemediationCli(stack, treeSummary, smallFileContext, findingsDetail, existingContent);
      const filePath = resolve(outDir, "REMEDIATION-PLAN.md");
      writeGeneratedFile(filePath, content);
      if (!asJson) {
        console.log(` ${c.green}✓${c.reset}`);
        console.log();
        console.log(`  ${c.green}${c.bold}Done!${c.reset} Written to ${c.cyan}${filePath}${c.reset}`);
        console.log();
      }
    } catch (err) {
      if (!asJson) {
        console.log(` ${c.red}✗ ${err.message}${c.reset}`);
      } else {
        console.error(JSON.stringify({ error: err.message }));
      }
    }
  }

  // Step 7b: Generate Documentation Kit (if --generate flag is set)
  if (flags.generate) {
    const outDir = flags.out || ".";

    // Detect existing AI docs and tools
    const detection = detectExistingDocs(tree, files);

    // Auto-select tools: use detected tools if found, otherwise use --tools flag or all
    let selectedTools;
    if (flags.tools) {
      selectedTools = flags.tools.split(",").filter((t) => ALL_AI_TOOLS.includes(t));
    } else if (detection.detectedTools.length > 0) {
      selectedTools = detection.detectedTools;
    } else {
      selectedTools = ALL_AI_TOOLS;
    }

    // Determine mode: explicit --mode flag, or auto-detect from existing docs
    let mode = flags.mode || (detection.hasExistingDocs ? "missing" : "full");
    if (!["full", "missing", "update"].includes(mode)) {
      console.error(`${c.red}Invalid mode: ${mode}. Use: full, missing, or update${c.reset}`);
      process.exit(1);
    }

    if (!asJson) {
      console.log();
      console.log(`  ${c.bold}${c.cyan}Generating Documentation Kit...${c.reset}`);
      console.log(`  ${c.dim}Tools: ${selectedTools.join(", ")}${c.reset}`);
      console.log(`  ${c.dim}Mode: ${mode}${c.reset}`);
      if (detection.hasExistingDocs) {
        console.log(`  ${c.dim}Existing docs: ${detection.existingFiles.length} files found${c.reset}`);
        if (detection.detectedTools.length > 0 && !flags.tools) {
          console.log(`  ${c.dim}Auto-detected tools: ${detection.detectedTools.join(", ")}${c.reset}`);
        }
      }
      console.log();
    }

    try {
      const generatedFiles = await generateDocKit(
        stack, treeSummary, fileContext, results, selectedTools, asJson,
        mode, detection.existingContents
      );

      // Write all files (only generated ones, not existing/skipped)
      const written = [];
      const skipped = [];
      for (const f of generatedFiles) {
        if (f.source === "existing") {
          skipped.push(f.path);
        } else {
          const filePath = resolve(outDir, f.path);
          writeGeneratedFile(filePath, f.content);
          written.push(f.path);
        }
      }

      if (!asJson) {
        console.log();
        console.log(`  ${c.green}${c.bold}Done!${c.reset} ${written.length} files written to ${c.cyan}${resolve(outDir)}${c.reset}`);
        if (skipped.length > 0) {
          console.log(`  ${c.dim}${skipped.length} existing files skipped${c.reset}`);
        }
        console.log();
        console.log(`  ${c.dim}Generated files:${c.reset}`);
        for (const f of generatedFiles) {
          if (f.source === "existing") {
            console.log(`    ${c.dim}${f.path} — ${f.label} ${c.yellow}(existing, kept)${c.reset}`);
          } else {
            console.log(`    ${c.cyan}${f.path}${c.reset} ${c.dim}— ${f.label}${c.reset}`);
          }
        }
      }
    } catch (err) {
      if (!asJson) {
        console.log(` ${c.red}✗ Generation failed: ${err.message}${c.reset}`);
      } else {
        console.error(JSON.stringify({ error: err.message }));
      }
    }
  }
}

main().catch((err) => {
  console.error(`${c.red}Error: ${err.message}${c.reset}`);
  process.exit(1);
});
