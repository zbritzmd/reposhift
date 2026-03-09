// ============================================================
// RepoShift — Core Types
// ============================================================

/** Severity of an individual finding */
export type Severity = "critical" | "warning" | "info";

/** A single issue found during audit */
export interface Finding {
  id: string;
  category: AuditCategory;
  severity: Severity;
  title: string;
  description: string;
  file?: string;
  line?: number;
  suggestion?: string;
  code?: string;
}

/** Audit category identifiers */
export type AuditCategory =
  | "structure"
  | "patterns"
  | "hardcoded-values"
  | "dependencies"
  | "dead-code"
  | "security"
  | "runtime-stability";

/** Human-readable category metadata */
export interface CategoryMeta {
  id: AuditCategory;
  label: string;
  description: string;
  icon: string;
}

/** Score for a single audit category */
export interface CategoryScore {
  category: AuditCategory;
  score: number; // 0-100
  findings: Finding[];
  summary: string;
}

/** Full audit report */
export interface AuditReport {
  repoUrl: string;
  repoName: string;
  scannedAt: string;
  stack: StackInfo;
  overallScore: number;
  categories: CategoryScore[];
  totalFindings: number;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
}

/** Detected technology stack */
export interface StackInfo {
  framework: string;
  language: string;
  buildTool?: string;
  packageManager: string;
  testFramework?: string;
  styling?: string;
  additional: string[];
}

/** A file from the repo with its content */
export interface RepoFile {
  path: string;
  content: string;
  size: number;
}

/** Minimal repo tree entry */
export interface RepoTreeEntry {
  path: string;
  type: "blob" | "tree";
  size?: number;
}

/** Scan status for streaming updates */
export type ScanPhase =
  | "cloning"
  | "detecting-stack"
  | "analyzing-structure"
  | "analyzing-patterns"
  | "analyzing-hardcoded"
  | "analyzing-dependencies"
  | "analyzing-security"
  | "analyzing-runtime"
  | "scoring"
  | "complete"
  | "error";

export interface ScanStatus {
  phase: ScanPhase;
  message: string;
  progress: number; // 0-100
}

/** Category metadata registry */
export const CATEGORY_META: Record<AuditCategory, CategoryMeta> = {
  structure: {
    id: "structure",
    label: "Structure & Organization",
    description: "Folder structure, module boundaries, separation of concerns",
    icon: "FolderTree",
  },
  patterns: {
    id: "patterns",
    label: "Patterns & Consistency",
    description: "Naming conventions, code style, architectural patterns",
    icon: "Layers",
  },
  "hardcoded-values": {
    id: "hardcoded-values",
    label: "Hardcoded Values",
    description:
      "Magic strings, magic numbers, inline URLs, embedded credentials",
    icon: "Hash",
  },
  dependencies: {
    id: "dependencies",
    label: "Dependencies & Packages",
    description: "Outdated, unused, deprecated, or duplicate packages",
    icon: "Package",
  },
  "dead-code": {
    id: "dead-code",
    label: "Dead Code",
    description: "Unused exports, unreachable code, commented-out blocks",
    icon: "Trash2",
  },
  security: {
    id: "security",
    label: "Security Basics",
    description: "Exposed secrets, unsafe patterns, missing protections",
    icon: "Shield",
  },
  "runtime-stability": {
    id: "runtime-stability",
    label: "Runtime & Stability",
    description:
      "Memory leaks, unhandled errors, missing cleanup, race conditions",
    icon: "Activity",
  },
};
