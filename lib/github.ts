// ============================================================
// RepoShift — Repository Provider (GitHub + Azure DevOps)
// ============================================================

import { RepoFile, RepoTreeEntry } from "./types";

// ----------------------------------------------------------
// Provider Detection
// ----------------------------------------------------------

export type RepoProvider = "github" | "azure-devops";

export interface ParsedRepo {
  provider: RepoProvider;
  // GitHub
  owner?: string;
  repo: string;
  // Azure DevOps
  organization?: string;
  project?: string;
}

/** Parse a repo URL and detect the provider */
export function parseRepoUrl(url: string): ParsedRepo | null {
  const trimmed = url.trim().replace(/\.git$/, "");

  // GitHub: https://github.com/owner/repo
  const ghMatch = trimmed.match(/github\.com\/([^/]+)\/([^/\s#?]+)/);
  if (ghMatch) {
    return { provider: "github", owner: ghMatch[1], repo: ghMatch[2] };
  }

  // Azure DevOps: https://dev.azure.com/{org}/{project}/_git/{repo}
  const azdoMatch1 = trimmed.match(
    /dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/([^/\s#?]+)/
  );
  if (azdoMatch1) {
    return {
      provider: "azure-devops",
      organization: azdoMatch1[1],
      project: azdoMatch1[2],
      repo: azdoMatch1[3],
    };
  }

  // Azure DevOps (old format): https://{org}.visualstudio.com/{project}/_git/{repo}
  const azdoMatch2 = trimmed.match(
    /([^/]+)\.visualstudio\.com\/([^/]+)\/_git\/([^/\s#?]+)/
  );
  if (azdoMatch2) {
    return {
      provider: "azure-devops",
      organization: azdoMatch2[1],
      project: azdoMatch2[2],
      repo: azdoMatch2[3],
    };
  }

  // Shorthand: owner/repo (assume GitHub)
  const shortMatch = trimmed.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (shortMatch) {
    return { provider: "github", owner: shortMatch[1], repo: shortMatch[2] };
  }

  return null;
}

// ----------------------------------------------------------
// Key files to always fetch
// ----------------------------------------------------------

const KEY_FILES = [
  "package.json", "tsconfig.json", "angular.json",
  "next.config.js", "next.config.ts", "next.config.mjs",
  "vite.config.ts", "vite.config.js",
  ".eslintrc.json", ".eslintrc.js", "eslint.config.js", "eslint.config.mjs",
  ".prettierrc", ".prettierrc.json",
  "tailwind.config.js", "tailwind.config.ts",
  "Dockerfile", "docker-compose.yml", "docker-compose.yaml",
  ".env.example", ".env.sample", "README.md",
  "Cargo.toml", "go.mod", "requirements.txt", "pyproject.toml",
  "Gemfile", "pom.xml", "build.gradle",
  ".github/workflows/ci.yml", ".github/workflows/main.yml",
  "azure-pipelines.yml",
  "jest.config.js", "jest.config.ts", "vitest.config.ts",
  "karma.conf.js", "webpack.config.js",
  // .NET specific
  "*.csproj", "*.sln", "appsettings.json", "Program.cs", "Startup.cs",
];

const SOURCE_EXTENSIONS = [
  ".ts", ".tsx", ".js", ".jsx", ".py", ".rb", ".go", ".rs",
  ".java", ".cs", ".vue", ".svelte",
];

// ----------------------------------------------------------
// GitHub Provider
// ----------------------------------------------------------

async function ghFetch(path: string, token?: string): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "RepoShift/1.0",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return fetch(`https://api.github.com${path}`, { headers });
}

async function ghFetchRaw(path: string, token?: string): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3.raw",
    "User-Agent": "RepoShift/1.0",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return fetch(`https://api.github.com${path}`, { headers });
}

async function fetchGitHubTree(
  owner: string,
  repo: string,
  token?: string
): Promise<RepoTreeEntry[]> {
  const res = await ghFetch(
    `/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`,
    token
  );

  if (!res.ok) {
    if (res.status === 404) throw new Error("Repository not found on GitHub");
    if (res.status === 403) throw new Error("GitHub rate limited — add a token");
    if (res.status === 401) throw new Error("Invalid GitHub token");
    throw new Error(`GitHub API error: ${res.status}`);
  }

  const data = await res.json();
  return (data.tree || []).map(
    (entry: { path: string; type: string; size?: number }) => ({
      path: entry.path,
      type: entry.type as "blob" | "tree",
      size: entry.size,
    })
  );
}

async function fetchGitHubFileContent(
  owner: string,
  repo: string,
  path: string,
  token?: string
): Promise<string | null> {
  try {
    const res = await ghFetchRaw(
      `/repos/${owner}/${repo}/contents/${path}`,
      token
    );
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

// ----------------------------------------------------------
// Azure DevOps Provider
// ----------------------------------------------------------

async function azdoFetch(
  organization: string,
  project: string,
  repo: string,
  path: string,
  token?: string
): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "RepoShift/1.0",
  };
  if (token) {
    // Azure DevOps PATs use Basic auth with empty username
    const encoded = Buffer.from(`:${token}`).toString("base64");
    headers["Authorization"] = `Basic ${encoded}`;
  }
  return fetch(
    `https://dev.azure.com/${organization}/${project}/_apis/git/repositories/${repo}${path}`,
    { headers }
  );
}

async function fetchAzDoTree(
  organization: string,
  project: string,
  repo: string,
  token?: string
): Promise<RepoTreeEntry[]> {
  // Azure DevOps: get items recursively
  const res = await azdoFetch(
    organization,
    project,
    repo,
    "/items?recursionLevel=Full&api-version=7.1",
    token
  );

  if (!res.ok) {
    if (res.status === 404) throw new Error("Repository not found on Azure DevOps");
    if (res.status === 401 || res.status === 403)
      throw new Error("Azure DevOps authentication failed — check your PAT");
    throw new Error(`Azure DevOps API error: ${res.status}`);
  }

  const data = await res.json();
  const items = data.value || [];

  return items
    .filter((item: { isFolder: boolean; path: string }) => item.path !== "/")
    .map((item: { isFolder: boolean; path: string; contentMetadata?: { encoding?: string } }) => ({
      path: item.path.replace(/^\//, ""), // Remove leading slash
      type: item.isFolder ? "tree" as const : "blob" as const,
      size: undefined,
    }));
}

async function fetchAzDoFileContent(
  organization: string,
  project: string,
  repo: string,
  path: string,
  token?: string
): Promise<string | null> {
  try {
    const res = await azdoFetch(
      organization,
      project,
      repo,
      `/items?path=${encodeURIComponent("/" + path)}&api-version=7.1`,
      token
    );
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

// ----------------------------------------------------------
// Unified Interface
// ----------------------------------------------------------

/** Fetch the full file tree from any provider */
export async function fetchRepoTree(
  parsed: ParsedRepo,
  token?: string
): Promise<RepoTreeEntry[]> {
  if (parsed.provider === "github") {
    return fetchGitHubTree(parsed.owner!, parsed.repo, token);
  } else {
    return fetchAzDoTree(
      parsed.organization!,
      parsed.project!,
      parsed.repo,
      token
    );
  }
}

/** Fetch a single file from any provider */
async function fetchFileContent(
  parsed: ParsedRepo,
  path: string,
  token?: string
): Promise<string | null> {
  if (parsed.provider === "github") {
    return fetchGitHubFileContent(parsed.owner!, parsed.repo, path, token);
  } else {
    return fetchAzDoFileContent(
      parsed.organization!,
      parsed.project!,
      parsed.repo,
      path,
      token
    );
  }
}

/** Get a display name for the repo */
export function getRepoName(parsed: ParsedRepo): string {
  if (parsed.provider === "github") {
    return `${parsed.owner}/${parsed.repo}`;
  }
  return `${parsed.organization}/${parsed.project}/${parsed.repo}`;
}

/** Intelligently select and fetch files for analysis */
export async function fetchRepoFiles(
  parsed: ParsedRepo,
  tree: RepoTreeEntry[],
  token?: string
): Promise<RepoFile[]> {
  const files: RepoFile[] = [];
  const blobs = tree.filter((e) => e.type === "blob");

  // 1. Always fetch key config files
  const keyFilePaths = blobs
    .filter((b) =>
      KEY_FILES.some((kf) =>
        kf.includes("*")
          ? b.path.endsWith(kf.replace("*", ""))
          : b.path === kf || b.path.endsWith("/" + kf)
      )
    )
    .map((b) => b.path);

  // 2. Fetch a sample of source files (up to 40 for analysis)
  const sourceFiles = blobs
    .filter(
      (b) =>
        SOURCE_EXTENSIONS.some((ext) => b.path.endsWith(ext)) &&
        !b.path.includes("node_modules") &&
        !b.path.includes(".min.") &&
        !b.path.includes("dist/") &&
        !b.path.includes("build/") &&
        !b.path.includes("bin/Debug") &&
        !b.path.includes("bin/Release") &&
        !b.path.includes("obj/") &&
        !b.path.includes(".d.ts") &&
        (b.size || 0) < 50000
    )
    .slice(0, 40)
    .map((b) => b.path);

  // 3. Fetch all selected files in parallel (batched)
  const allPaths = [...new Set([...keyFilePaths, ...sourceFiles])];
  const batchSize = 10;

  for (let i = 0; i < allPaths.length; i += batchSize) {
    const batch = allPaths.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (path) => {
        const content = await fetchFileContent(parsed, path, token);
        if (content) {
          return { path, content, size: content.length };
        }
        return null;
      })
    );
    files.push(...(results.filter(Boolean) as RepoFile[]));
  }

  return files;
}
