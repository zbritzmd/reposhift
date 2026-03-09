# CLAUDE.md — RepoShift

## Project Overview
RepoShift is an AI-powered codebase audit and standardization tool. Users paste a GitHub or Azure DevOps repo URL, and it analyzes the codebase across 7 categories using Claude API, then generates standards documents, AI infrastructure files, MCP recommendations, and remediation plans.

**Live at:** `npm run dev` → http://localhost:3000
**Domain:** reposhift.dev
**Tagline:** "Audit. Standardize. Shift Forward."

## Tech Stack
- **Frontend:** Next.js 15 + React 19 + TypeScript + Tailwind CSS 4
- **Backend:** Next.js API routes (no separate server)
- **AI Engine:** Anthropic Claude API (`claude-sonnet-4-20250514`) via `@anthropic-ai/sdk`
- **Repo Access:** GitHub REST API + Azure DevOps REST API (RepoProvider pattern in `lib/github.ts`)
- **CLI:** Standalone Node.js script at `cli/reposhift.mjs` (zero dependencies, native fetch)

## Architecture

### Analysis Pipeline
1. **Input** → `lib/github.ts` — `parseRepoUrl()` detects provider (GitHub/AzDo), `fetchRepoTree()` gets file tree, `fetchRepoFiles()` fetches key config + source files
2. **Detection** → `lib/stack-detect.ts` — Identifies framework, language, build tool, test framework, styling from config files
3. **Analysis** → `lib/analyzer.ts` — 7 category-specific Claude API calls, each with a focused prompt and JSON response format
4. **Generation** → `lib/analyzer.ts` — 4 generators: Standards, AI Infrastructure, MCP Recommendations, Remediation Plan
5. **API Routes** → `app/api/*/route.ts` — Thin wrappers that call analyzer functions
6. **UI** → `app/page.tsx` + `components/` — Dashboard with scan input, category cards, findings panel, generate panel

### Key Files
- `lib/types.ts` — All TypeScript types, category metadata
- `lib/github.ts` — Multi-provider repo client (GitHub + Azure DevOps)
- `lib/stack-detect.ts` — Stack detection from config files
- `lib/analyzer.ts` — Claude API prompts, analysis, and all generators
- `app/page.tsx` — Main dashboard page (state management, scan flow)
- `components/GeneratePanel.tsx` — 4-tab generate panel with AI tool selector
- `components/ScanInput.tsx` — URL input with provider detection badge
- `cli/reposhift.mjs` — CLI tool

### Environment Variables (.env.local)
- `ANTHROPIC_API_KEY` — Required. Claude API key.
- `GITHUB_TOKEN` — Recommended. Prevents GitHub rate limiting.
- `AZURE_DEVOPS_TOKEN` — Required for Azure DevOps repos.

## Conventions
- kebab-case file names
- React components in `components/` with PascalCase names
- API routes follow Next.js App Router conventions
- All Claude API responses expect JSON — use `safeParseJSON()` helper in analyzer.ts to handle markdown fences
- CSS uses Tailwind v4 with custom theme variables defined in `app/globals.css`
- Dark theme throughout — colors defined as CSS custom properties (surface, border, accent, text-primary, etc.)

## Commands
```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run start        # Start production server
node cli/reposhift.mjs audit --repo=<url>  # CLI audit
```

## Known Issues & Priorities
See the prompt below for current bugs and enhancement requests.
