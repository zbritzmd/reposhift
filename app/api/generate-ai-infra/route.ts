import { NextRequest, NextResponse } from "next/server";
import { generateAIInfra, AITool } from "@/lib/analyzer";
import { CategoryScore, RepoFile, RepoTreeEntry, StackInfo } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const { stack, tree, files, auditFindings, selectedTools } = (await req.json()) as {
      stack: StackInfo;
      tree: RepoTreeEntry[];
      files: RepoFile[];
      auditFindings: CategoryScore[];
      selectedTools?: AITool[];
    };

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY not configured" },
        { status: 500 }
      );
    }

    const result = await generateAIInfra(stack, tree, files, auditFindings, selectedTools);
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
