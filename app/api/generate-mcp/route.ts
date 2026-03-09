import { NextRequest, NextResponse } from "next/server";
import { generateMCPRecommendations } from "@/lib/analyzer";
import { RepoFile, RepoTreeEntry, StackInfo } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const { stack, tree, files } = (await req.json()) as {
      stack: StackInfo;
      tree: RepoTreeEntry[];
      files: RepoFile[];
    };

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY not configured" },
        { status: 500 }
      );
    }

    const content = await generateMCPRecommendations(stack, tree, files);
    return NextResponse.json({ content });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
