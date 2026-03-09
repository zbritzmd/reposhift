import { NextRequest, NextResponse } from "next/server";
import { parseRepoUrl, fetchRepoTree, fetchRepoFiles, getRepoName } from "@/lib/github";
import { detectStack } from "@/lib/stack-detect";

export async function POST(req: NextRequest) {
  try {
    const { url, token } = await req.json();

    if (!url) {
      return NextResponse.json({ error: "Missing repo URL" }, { status: 400 });
    }

    const parsed = parseRepoUrl(url);
    if (!parsed) {
      return NextResponse.json(
        {
          error:
            "Invalid repository URL. Supported formats:\n• GitHub: https://github.com/owner/repo\n• Azure DevOps: https://dev.azure.com/org/project/_git/repo",
        },
        { status: 400 }
      );
    }

    // Use provided token, or fall back to env vars
    const resolvedToken =
      token ||
      (parsed.provider === "github"
        ? process.env.GITHUB_TOKEN
        : process.env.AZURE_DEVOPS_TOKEN);

    // Azure DevOps always requires a token
    if (parsed.provider === "azure-devops" && !resolvedToken) {
      return NextResponse.json(
        { error: "Azure DevOps requires a Personal Access Token (PAT)" },
        { status: 400 }
      );
    }

    // Fetch tree
    const tree = await fetchRepoTree(parsed, resolvedToken);

    // Fetch key files
    const files = await fetchRepoFiles(parsed, tree, resolvedToken);

    // Detect stack
    const stack = detectStack(tree, files);

    const repoName = getRepoName(parsed);

    return NextResponse.json({
      provider: parsed.provider,
      repoName,
      tree,
      files,
      stack,
      fileCount: tree.filter((e) => e.type === "blob").length,
      dirCount: tree.filter((e) => e.type === "tree").length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to scan repository";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
