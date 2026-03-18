# RepoShift CLI

AI-powered codebase audit and documentation generator. Audit. Standardize. Shift Forward.

## Install

```bash
# Run directly (no install needed)
npx reposhift audit

# Or install globally
npm install -g reposhift
```

Requires **Node.js 18+** and an [Anthropic API key](https://console.anthropic.com/).

## Quick Start

```bash
# Set your API key
export ANTHROPIC_API_KEY=sk-ant-...

# Audit the current git repo
reposhift audit

# Audit a specific repo
reposhift audit --repo=owner/repo

# Audit a private repo (auto-authenticates via GitHub)
reposhift audit --repo=owner/private-repo
```

## Features

- **7-category audit** — Structure, patterns, hardcoded values, dependencies, dead code, security, runtime stability
- **Remediation plan** — Sprint-ready fix list prioritized by impact
- **Documentation kit** — Full `ai/` directory with patterns, agents, architecture, guides + tool wrappers
- **Multi-provider** — GitHub and Azure DevOps repos
- **Zero dependencies** — Single file, native Node.js only
- **Auto GitHub auth** — Uses `gh` CLI, cached tokens, or device flow (no PAT needed)

## Authentication

GitHub repos authenticate automatically — no manual token setup needed:

1. **`gh` CLI** — If you have GitHub CLI installed and logged in, it just works
2. **Cached token** — After first login, token is saved to `~/.reposhift/github-token`
3. **Device flow** — Opens browser for one-click GitHub authorization

```bash
# Pre-authenticate (optional — happens automatically when needed)
reposhift login

# Remove saved token
reposhift logout
```

Azure DevOps requires `--token=<PAT>` or `AZURE_DEVOPS_TOKEN` env var.

## Usage

### Audit

```bash
# Basic audit
reposhift audit --repo=owner/repo

# Verbose output — full descriptions, suggestions, file paths
reposhift audit --repo=owner/repo --verbose

# JSON output
reposhift audit --repo=owner/repo --json

# Specific categories only
reposhift audit --repo=owner/repo --categories=security,dependencies
```

### Generate

```bash
# Generate only the remediation plan (fast — 1 API call)
reposhift audit --repo=owner/repo --remediation

# Generate full documentation kit (ai/ directory + tool wrappers)
reposhift audit --repo=owner/repo --generate

# Generate for specific AI tools
reposhift audit --repo=owner/repo --generate --tools=claude,cursor

# Skip existing files
reposhift audit --repo=owner/repo --generate --mode=missing

# Update existing docs
reposhift audit --repo=owner/repo --generate --mode=update

# Output to a directory
reposhift audit --repo=owner/repo --generate --out=./docs
```

### Generated File Structure

```
your-project/
├── AGENTS.md                         # Entry point (table of contents)
├── CLAUDE.md                         # Claude Code wrapper
├── .cursorrules                      # Cursor wrapper
├── .github/copilot-instructions.md   # GitHub Copilot wrapper
├── ai/
│   ├── patterns.md                   # Code patterns (SSOT)
│   ├── agents/code-review.md         # Code review agent
│   ├── architecture/overview.md      # Architecture overview
│   ├── guides/common-mistakes.md     # Common mistakes guide
│   └── mcp/recommendations.md        # MCP server recommendations
└── REMEDIATION-PLAN.md               # Sprint-ready fix plan
```

## All Options

| Flag | Description |
|------|-------------|
| `--repo=<url>` | Repository URL (auto-detected from git remote if omitted) |
| `--token=<pat>` | Access token override (Azure DevOps PAT or GitHub PAT) |
| `--api-key=<key>` | Anthropic API key (alternative to env var) |
| `--json` | Output raw JSON instead of formatted report |
| `--verbose` | Show full finding descriptions and suggestions |
| `--categories=<list>` | Comma-separated categories to analyze (default: all 7) |
| `--remediation` | Generate only the REMEDIATION-PLAN.md |
| `--generate` | Generate full AI documentation kit |
| `--tools=<list>` | AI tools: claude, cursor, copilot, windsurf, codex, gemini |
| `--mode=<mode>` | Generation mode: full, missing, or update |
| `--out=<dir>` | Output directory for generated files |
| `--help` | Show help message |

## Commands

| Command | Description |
|---------|-------------|
| `reposhift audit` | Audit a repository |
| `reposhift login` | Authenticate with GitHub (for private repos) |
| `reposhift logout` | Remove saved GitHub token |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Your Anthropic API key |
| `AZURE_DEVOPS_TOKEN` | No | Default Azure DevOps PAT for private repos |

## Supported Providers

- **GitHub** — `https://github.com/owner/repo` or `owner/repo`
- **Azure DevOps** — `https://dev.azure.com/org/project/_git/repo`

## Web App

For a visual experience with interactive results, visit [reposhift.dev](https://reposhift.dev).

## License

MIT
