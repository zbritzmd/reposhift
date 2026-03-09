import { NextRequest, NextResponse } from "next/server";
import { analyzeCategory } from "@/lib/analyzer";
import { AuditCategory, RepoFile, RepoTreeEntry, StackInfo } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const { category, stack, tree, files } = (await req.json()) as {
      category: AuditCategory;
      stack: StackInfo;
      tree: RepoTreeEntry[];
      files: RepoFile[];
    };

    if (!category || !stack || !tree || !files) {
      return NextResponse.json(
        { error: "Missing required fields: category, stack, tree, files" },
        { status: 400 }
      );
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY not configured. Add it to .env.local" },
        { status: 500 }
      );
    }

    const result = await analyzeCategory(category, stack, tree, files);
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Analysis failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
