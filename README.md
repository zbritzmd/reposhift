# RepoShift

**Audit. Standardize. Shift Forward.**

AI-powered codebase audit and standardization tool. Get senior architect-level intelligence for any repository.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Add your Anthropic API key
cp .env.local.example .env.local
# Edit .env.local and add your key from https://console.anthropic.com

# 3. Run the web dashboard
npm run dev

# 4. Or use the CLI
export ANTHROPIC_API_KEY=sk-ant-...
node cli/reposhift.mjs audit --repo=https://github.com/owner/repo
```

Open [http://localhost:3000](http://localhost:3000) and paste a GitHub repo URL.

## What It Does

### Phase 1: Audit
Scans your repo via GitHub API, detects the tech stack, and analyzes 7 categories using Claude AI:

- **Structure & Organization** — folder layout, module boundaries, separation of concerns
- **Patterns & Consistency** — naming conventions, architectural patterns, error handling approaches
- **Hardcoded Values** — magic strings, magic numbers, inline URLs, embedded credentials
- **Dependencies & Packages** — outdated, unused, deprecated, or duplicate packages
- **Dead Code** — unused exports, commented-out blocks, unreachable code
- **Security Basics** — exposed secrets, unsafe patterns, missing protections
- **Runtime & Stability** — memory leaks, unhandled errors, race conditions, missing cleanup

### Phase 2: Standardize
Generates tailored outputs from the audit:

- **Coding Standards Document** — formalizes detected patterns, recommends improvements
- **AI Infrastructure** — AGENTS.md (tool-agnostic), CLAUDE.md (Claude-specific), .cursorrules (Cursor-specific)
- **MCP Server Recommendations** — relevant MCP servers for your stack with install instructions
- **Remediation Plan** — prioritized, sprint-ready plan with effort estimates and risk ratings

## Web Dashboard

Paste a GitHub URL → watch results populate → drill into findings → generate outputs with one click.

## CLI

```bash
# Basic audit
node cli/reposhift.mjs audit --repo=https://github.com/owner/repo

# Private repo
node cli/reposhift.mjs audit --repo=https://github.com/org/private --token=ghp_xxxx

# JSON output (for piping)
node cli/reposhift.mjs audit --repo=https://github.com/owner/repo --json

# Specific categories only
node cli/reposhift.mjs audit --repo=https://github.com/owner/repo --categories=structure,patterns,security

# Help
node cli/reposhift.mjs --help
```

## Private Repos

**Web:** Click "Private repo? Add GitHub token" and paste a Personal Access Token with `repo` scope.

**CLI:** Use `--token=ghp_xxxx` or set `GITHUB_TOKEN` environment variable.

## Tech Stack

- Next.js 15 + React 19 + TypeScript
- Anthropic Claude API (claude-sonnet-4-20250514)
- GitHub REST API
- Tailwind CSS 4
- Node.js CLI (zero dependencies)

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Your Anthropic API key |
| `GITHUB_TOKEN` | No | GitHub PAT for private repos |
