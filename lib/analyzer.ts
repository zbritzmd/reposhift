// ============================================================
// RepoShift — AI Analysis Engine (Claude API)
// ============================================================

import Anthropic from "@anthropic-ai/sdk";
import {
  AuditCategory,
  CategoryScore,
  Finding,
  RepoFile,
  RepoTreeEntry,
  Severity,
  StackInfo,
} from "./types";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || "" });

// ----------------------------------------------------------
// Robust JSON extraction — handles markdown fences, preamble
// ----------------------------------------------------------

function extractJSON(text: string): string {
  // Try raw text first
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return trimmed;

  // Strip markdown code fences: ```json ... ``` or ``` ... ```
  const fenceMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) return fenceMatch[1].trim();

  // Find first { to last }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  return trimmed;
}

function safeParseJSON(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(extractJSON(text));
  } catch {
    return null;
  }
}

// ----------------------------------------------------------
// Prompt Builders
// ----------------------------------------------------------

function buildTreeSummary(tree: RepoTreeEntry[]): string {
  // Show folder structure (directories + key files, limit depth)
  const dirs = tree
    .filter((e) => e.type === "tree")
    .map((e) => e.path)
    .filter((p) => p.split("/").length <= 3);

  const keyBlobs = tree
    .filter(
      (e) =>
        e.type === "blob" &&
        (e.path.split("/").length <= 2 ||
          e.path.endsWith("package.json") ||
          e.path.endsWith("tsconfig.json") ||
          e.path.endsWith("angular.json"))
    )
    .map((e) => e.path);

  return [...dirs.map((d) => `${d}/`), ...keyBlobs].sort().join("\n");
}

function buildFileContext(files: RepoFile[], maxChars = 80000): string {
  let context = "";
  for (const f of files) {
    const entry = `\n--- FILE: ${f.path} ---\n${f.content}\n`;
    if (context.length + entry.length > maxChars) break;
    context += entry;
  }
  return context;
}

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

Scoring guide:
- 90-100: Excellent, minor suggestions only
- 70-89: Good, some issues to address
- 50-69: Needs work, significant improvements needed
- 0-49: Critical issues, major refactoring needed

Be specific. Reference actual file paths and code patterns you see. Every finding must be actionable.`;

function categoryPrompt(
  category: AuditCategory,
  stack: StackInfo,
  treeSummary: string,
  fileContext: string
): string {
  const prompts: Record<AuditCategory, string> = {
    structure: `Analyze the STRUCTURE & ORGANIZATION of this ${stack.framework} (${stack.language}) codebase.

Evaluate:
- Folder structure: Is it logical? Does it follow ${stack.framework} conventions?
- Module boundaries: Are concerns properly separated?
- File organization: Are files in the right places?
- Entry points: Are they clean and minimal?
- Barrel exports: Used appropriately or creating circular deps?
- Shared vs feature-specific code: Properly separated?

REPOSITORY TREE:
${treeSummary}

SOURCE FILES:
${fileContext}`,

    patterns: `Analyze the PATTERNS & CONSISTENCY of this ${stack.framework} (${stack.language}) codebase.

Evaluate:
- Naming conventions: Are files, variables, functions, classes named consistently?
- Architectural patterns: Is there a clear pattern (MVC, component-based, etc.)? Is it followed consistently?
- Code style: Consistent formatting, import ordering, export patterns?
- Error handling: Consistent approach across the codebase?
- State management: Consistent patterns for managing state?
- API patterns: Consistent approach to data fetching, services, etc.?

REPOSITORY TREE:
${treeSummary}

SOURCE FILES:
${fileContext}`,

    "hardcoded-values": `Analyze HARDCODED VALUES in this ${stack.framework} (${stack.language}) codebase.

Look for:
- Magic strings: Inline string literals that should be constants (status codes, role names, etc.)
- Magic numbers: Unexplained numeric literals (timeouts, limits, sizes)
- Hardcoded URLs: API endpoints, external service URLs embedded in source
- Inline configuration: Values that should be in config/environment variables
- Embedded credentials: Any secrets, keys, tokens in source code
- Repeated literals: Same string/number used in multiple places without a constant

REPOSITORY TREE:
${treeSummary}

SOURCE FILES:
${fileContext}`,

    dependencies: `Analyze the DEPENDENCIES & PACKAGES of this ${stack.framework} (${stack.language}) codebase.

Evaluate:
- Are there dependencies that appear unused (imported in package.json but not referenced)?
- Are there duplicate dependencies that serve the same purpose?
- Are there any known deprecated packages?
- Is the dependency count reasonable for the project size?
- Are dev dependencies properly separated from production dependencies?
- Are version ranges appropriate (too loose or too strict)?

REPOSITORY TREE:
${treeSummary}

SOURCE FILES:
${fileContext}`,

    "dead-code": `Analyze DEAD CODE in this ${stack.framework} (${stack.language}) codebase.

Look for:
- Unused exports: Functions, classes, or variables exported but never imported elsewhere
- Commented-out code blocks: Large sections of commented code
- Unused imports: Imported symbols that aren't used in the file
- Unreachable code: Code after return statements, impossible conditions
- Unused variables and parameters
- Empty files or placeholder files with no real content
- TODO/FIXME/HACK comments indicating unfinished work

REPOSITORY TREE:
${treeSummary}

SOURCE FILES:
${fileContext}`,

    security: `Analyze SECURITY BASICS of this ${stack.framework} (${stack.language}) codebase.

Look for:
- Exposed secrets: API keys, passwords, tokens in source code or config
- Missing input validation: User inputs not sanitized
- Unsafe patterns: eval(), innerHTML, SQL concatenation, etc.
- Missing authentication/authorization checks
- CORS misconfiguration
- Missing CSRF protection
- Insecure dependencies (known vulnerabilities patterns)
- Missing rate limiting
- Overly permissive file/API access

REPOSITORY TREE:
${treeSummary}

SOURCE FILES:
${fileContext}`,

    "runtime-stability": `Analyze RUNTIME & STABILITY of this ${stack.framework} (${stack.language}) codebase.

Look for:
- Memory leaks: Unsubscribed observables, event listeners not cleaned up, missing lifecycle cleanup
- Unhandled errors: Missing try-catch, unhandled promise rejections, missing error boundaries
- Race conditions: Concurrent state mutations, missing guards
- Performance issues: N+1 queries, unnecessary re-renders, missing memoization
- Missing cleanup: Timers not cleared, connections not closed
- Infinite loops potential: Recursive calls without base cases
- Resource exhaustion: Unbounded arrays, missing pagination

REPOSITORY TREE:
${treeSummary}

SOURCE FILES:
${fileContext}`,
  };

  return prompts[category];
}

// ----------------------------------------------------------
// Analysis Runner
// ----------------------------------------------------------

export async function analyzeCategory(
  category: AuditCategory,
  stack: StackInfo,
  tree: RepoTreeEntry[],
  files: RepoFile[]
): Promise<CategoryScore> {
  const treeSummary = buildTreeSummary(tree);
  const fileContext = buildFileContext(files);
  const prompt = categoryPrompt(category, stack, treeSummary, fileContext);

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";

    // Parse JSON response (handles markdown fences, preamble)
    const parsed = safeParseJSON(text);
    if (!parsed) throw new Error("Failed to parse AI response as JSON");

    const findings: Finding[] = (parsed.findings as Record<string, unknown>[] || []).map(
      (f: Record<string, unknown>, i: number) => ({
        id: (f.id as string) || `${category}-${i + 1}`,
        category,
        severity: (f.severity as Severity) || "info",
        title: (f.title as string) || "Finding",
        description: (f.description as string) || "",
        file: (f.file as string) || undefined,
        suggestion: (f.suggestion as string) || undefined,
      })
    );

    return {
      category,
      score: Math.max(0, Math.min(100, (parsed.score as number) || 50)),
      findings,
      summary: (parsed.summary as string) || "Analysis complete.",
    };
  } catch (error) {
    console.error(`Analysis error for ${category}:`, error);
    return {
      category,
      score: 0,
      findings: [
        {
          id: `${category}-error`,
          category,
          severity: "warning",
          title: "Analysis Failed",
          description: `Could not analyze this category: ${error instanceof Error ? error.message : "Unknown error"}`,
        },
      ],
      summary: "Analysis could not be completed.",
    };
  }
}

// ----------------------------------------------------------
// Standards Document Generation
// ----------------------------------------------------------

export async function generateStandards(
  stack: StackInfo,
  tree: RepoTreeEntry[],
  files: RepoFile[],
  auditFindings: CategoryScore[]
): Promise<string> {
  const treeSummary = buildTreeSummary(tree);
  const fileContext = buildFileContext(files, 40000);

  const findingsSummary = auditFindings
    .map(
      (c) =>
        `## ${c.category} (Score: ${c.score}/100)\n${c.summary}\n${c.findings.map((f) => `- [${f.severity}] ${f.title}: ${f.description}`).join("\n")}`
    )
    .join("\n\n");

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8192,
    system: `You are RepoShift, generating a comprehensive coding standards document for a development team. Write in clear, authoritative Markdown. The standards should be derived from what you observe in the codebase — formalizing good patterns and recommending improvements for bad ones.`,
    messages: [
      {
        role: "user",
        content: `Generate a CODING STANDARDS document for this ${stack.framework} (${stack.language}) project.

The document should include:
1. **Project Overview** — brief description of the stack and architecture
2. **Folder Structure Standards** — how files and folders should be organized
3. **Naming Conventions** — files, variables, functions, components, services, etc.
4. **Component/Module Patterns** — standard patterns for building new features
5. **State Management** — how state should be handled
6. **Error Handling** — standard approach to errors
7. **API/Service Patterns** — how to interact with backends/APIs
8. **Testing Standards** — naming, structure, coverage expectations
9. **Dependency Policy** — when to add, how to evaluate, update cadence
10. **Code Review Checklist** — derived from the audit findings

Base this on what you observe in the actual codebase, not generic best practices. Reference specific patterns you see.

DETECTED STACK: ${JSON.stringify(stack, null, 2)}

AUDIT FINDINGS:
${findingsSummary}

REPOSITORY TREE:
${treeSummary}

SOURCE FILES:
${fileContext}`,
      },
    ],
  });

  return response.content[0].type === "text"
    ? response.content[0].text
    : "Failed to generate standards.";
}

// ----------------------------------------------------------
// AI Infrastructure Generation
// ----------------------------------------------------------

export type AITool = "claude" | "cursor" | "copilot" | "windsurf";

export interface AIInfraOutput {
  agentsMd: string;
  claudeMd?: string;
  cursorRules?: string;
  copilotInstructions?: string;
  windsurfRules?: string;
}

export async function generateAIInfra(
  stack: StackInfo,
  tree: RepoTreeEntry[],
  files: RepoFile[],
  auditFindings: CategoryScore[],
  selectedTools: AITool[] = ["claude", "cursor", "copilot", "windsurf"]
): Promise<AIInfraOutput> {
  const treeSummary = buildTreeSummary(tree);
  const fileContext = buildFileContext(files, 30000);

  const findingsSummary = auditFindings
    .map((c) => `${c.category}: ${c.summary}`)
    .join("\n");

  // Build the list of files to generate
  const fileDescriptions: string[] = [
    `1. **AGENTS.md** — Tool-agnostic entry point (ALWAYS generated). Describes the project, architecture, key conventions, file structure, how to run/test, and coding standards. Any AI assistant should be able to read this and understand the project. This is the single source of truth — all wrappers reference this.`,
  ];

  const jsonKeys = ["agentsMd"];

  if (selectedTools.includes("claude")) {
    fileDescriptions.push(
      `${fileDescriptions.length + 1}. **CLAUDE.md** — Claude Code wrapper. References AGENTS.md and adds Claude-specific instructions: thinking approach, command preferences, slash commands, how to use Claude's extended thinking, preferred response format.`
    );
    jsonKeys.push("claudeMd");
  }

  if (selectedTools.includes("cursor")) {
    fileDescriptions.push(
      `${fileDescriptions.length + 1}. **.cursorrules** — Cursor-specific rules file. Same project knowledge from AGENTS.md but formatted for Cursor's conventions: file references, code generation preferences, context management rules.`
    );
    jsonKeys.push("cursorRules");
  }

  if (selectedTools.includes("copilot")) {
    fileDescriptions.push(
      `${fileDescriptions.length + 1}. **.github/copilot-instructions.md** — GitHub Copilot custom instructions file. References AGENTS.md conventions and translates them into Copilot's instruction format: coding patterns to follow, naming conventions, architectural rules, common completions context.`
    );
    jsonKeys.push("copilotInstructions");
  }

  if (selectedTools.includes("windsurf")) {
    fileDescriptions.push(
      `${fileDescriptions.length + 1}. **.windsurfrules** — Windsurf/Codeium rules file. Same project knowledge adapted for Windsurf's Cascade AI: project context, conventions, architecture overview, preferred patterns.`
    );
    jsonKeys.push("windsurfRules");
  }

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8192,
    system: `You are RepoShift, generating AI coding assistant infrastructure files. Respond with ONLY a valid JSON object with these keys: ${JSON.stringify(jsonKeys)}. Each value is the full Markdown content for that file. No code fences, no preamble. Just the JSON object.

CRITICAL: The AGENTS.md is the universal foundation. Every wrapper should reference it and add ONLY tool-specific instructions on top. This ensures a single source of truth — update AGENTS.md and all wrappers stay consistent.`,
    messages: [
      {
        role: "user",
        content: `Generate AI assistant infrastructure files for this ${stack.framework} (${stack.language}) project.

${fileDescriptions.join("\n\n")}

All files should reference the actual project structure, stack, patterns, and conventions observed in the codebase.

DETECTED STACK: ${JSON.stringify(stack, null, 2)}

AUDIT SUMMARY:
${findingsSummary}

REPOSITORY TREE:
${treeSummary}

KEY FILES:
${fileContext}`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "{}";

  const parsed = safeParseJSON(text);
  if (parsed) {
    return parsed as unknown as AIInfraOutput;
  }

  // Fallback
  const fallback: AIInfraOutput = {
    agentsMd: "# AGENTS.md\n\nGeneration failed — please retry.",
  };
  if (selectedTools.includes("claude"))
    fallback.claudeMd = "# CLAUDE.md\n\nGeneration failed — please retry.";
  if (selectedTools.includes("cursor"))
    fallback.cursorRules = "# .cursorrules\n\nGeneration failed — please retry.";
  if (selectedTools.includes("copilot"))
    fallback.copilotInstructions = "# copilot-instructions.md\n\nGeneration failed — please retry.";
  if (selectedTools.includes("windsurf"))
    fallback.windsurfRules = "# .windsurfrules\n\nGeneration failed — please retry.";
  return fallback;
}

// ----------------------------------------------------------
// MCP Server Recommendations
// ----------------------------------------------------------

export async function generateMCPRecommendations(
  stack: StackInfo,
  tree: RepoTreeEntry[],
  files: RepoFile[]
): Promise<string> {
  const treeSummary = buildTreeSummary(tree);
  const fileContext = buildFileContext(files, 20000);

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: `You are RepoShift, an expert on MCP (Model Context Protocol) servers for AI coding assistants. You recommend MCP servers that would benefit a specific project based on its tech stack and tooling. Write in clear Markdown.`,
    messages: [
      {
        role: "user",
        content: `Recommend MCP servers for this ${stack.framework} (${stack.language}) project.

For each recommendation, provide:
1. **Server name** — the MCP server name
2. **What it does** — brief description
3. **Why it's relevant** — specific to this project's stack/patterns
4. **Installation** — how to add it (npm package or config snippet)

Consider MCP servers for:
- The primary framework (${stack.framework})
- The language/runtime (${stack.language})
- Key libraries detected in the project
- Database/ORM tools if present
- CI/CD and DevOps tools if present
- Testing frameworks
- UI component libraries (e.g., AG Grid, Material)
- Package managers and build tools
- Documentation tools
- Any other tooling detected

Only recommend MCP servers that actually exist or are highly likely to exist. Do not fabricate server names. If you're unsure whether an MCP server exists for a tool, note that it may need to be verified.

DETECTED STACK: ${JSON.stringify(stack, null, 2)}

REPOSITORY TREE:
${treeSummary}

KEY FILES:
${fileContext}`,
      },
    ],
  });

  return response.content[0].type === "text"
    ? response.content[0].text
    : "Failed to generate MCP recommendations.";
}

// ----------------------------------------------------------
// Remediation Plan Generation
// ----------------------------------------------------------

export async function generateRemediationPlan(
  stack: StackInfo,
  tree: RepoTreeEntry[],
  files: RepoFile[],
  auditFindings: CategoryScore[]
): Promise<string> {
  const treeSummary = buildTreeSummary(tree);

  const findingsDetail = auditFindings
    .map(
      (c) =>
        `## ${c.category} (Score: ${c.score}/100)\n${c.summary}\n${c.findings
          .map(
            (f) =>
              `- [${f.severity}] ${f.title}: ${f.description}${f.file ? ` (${f.file})` : ""}${f.suggestion ? `\n  Suggestion: ${f.suggestion}` : ""}`
          )
          .join("\n")}`
    )
    .join("\n\n");

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8192,
    system: `You are RepoShift, generating a prioritized remediation plan that a tech lead could use for sprint planning. Write in clear, actionable Markdown. Focus on practical execution, not theory.`,
    messages: [
      {
        role: "user",
        content: `Generate a PRIORITIZED REMEDIATION PLAN for this ${stack.framework} (${stack.language}) project based on the audit findings below.

Structure the plan as:

1. **Executive Summary** — 2-3 sentences on the overall state and top priorities
2. **Quick Wins** (< 1 hour each) — Low-effort, high-impact fixes that can be done immediately
3. **Sprint 1 Priorities** (1-2 days) — The most critical issues to address first
4. **Sprint 2 Priorities** (3-5 days) — Important but less urgent improvements
5. **Tech Debt Backlog** — Longer-term items to track and address over time

For each item, include:
- **What**: Clear description of the change
- **Why**: Impact if not addressed
- **How**: Specific steps to implement
- **Files affected**: List of files/directories to modify
- **Effort estimate**: T-shirt size (XS/S/M/L/XL)
- **Risk**: Low/Medium/High — risk of the change breaking something

Group related findings into single work items where it makes sense (e.g., "Extract all hardcoded role strings into a Roles enum" rather than listing each hardcoded string separately).

DETECTED STACK: ${JSON.stringify(stack, null, 2)}

AUDIT FINDINGS:
${findingsDetail}

REPOSITORY TREE:
${treeSummary}`,
      },
    ],
  });

  return response.content[0].type === "text"
    ? response.content[0].text
    : "Failed to generate remediation plan.";
}
