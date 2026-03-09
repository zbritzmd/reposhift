// ============================================================
// RepoShift — Stack Detection
// ============================================================

import { RepoFile, RepoTreeEntry, StackInfo } from "./types";

export function detectStack(
  tree: RepoTreeEntry[],
  files: RepoFile[]
): StackInfo {
  const paths = tree.map((e) => e.path);
  const hasFile = (name: string) => paths.some((p) => p.endsWith(name));
  const getFile = (name: string) => files.find((f) => f.path.endsWith(name));

  const stack: StackInfo = {
    framework: "Unknown",
    language: "Unknown",
    packageManager: "Unknown",
    additional: [],
  };

  // Package manager
  if (hasFile("pnpm-lock.yaml")) stack.packageManager = "pnpm";
  else if (hasFile("yarn.lock")) stack.packageManager = "yarn";
  else if (hasFile("package-lock.json")) stack.packageManager = "npm";
  else if (hasFile("bun.lockb")) stack.packageManager = "bun";
  else if (hasFile("Cargo.lock")) stack.packageManager = "cargo";
  else if (hasFile("go.sum")) stack.packageManager = "go modules";
  else if (hasFile("Gemfile.lock")) stack.packageManager = "bundler";
  else if (hasFile("requirements.txt") || hasFile("pyproject.toml"))
    stack.packageManager = "pip";

  // Language detection
  const pkg = getFile("package.json");
  let pkgJson: Record<string, unknown> = {};
  if (pkg) {
    try {
      pkgJson = JSON.parse(pkg.content);
    } catch {}
  }

  const allDeps = {
    ...(pkgJson.dependencies as Record<string, string> || {}),
    ...(pkgJson.devDependencies as Record<string, string> || {}),
  };

  if (hasFile("tsconfig.json") || Object.keys(allDeps).includes("typescript")) {
    stack.language = "TypeScript";
  } else if (pkg) {
    stack.language = "JavaScript";
  } else if (hasFile("Cargo.toml")) {
    stack.language = "Rust";
  } else if (hasFile("go.mod")) {
    stack.language = "Go";
  } else if (hasFile("pyproject.toml") || hasFile("requirements.txt")) {
    stack.language = "Python";
  } else if (hasFile("Gemfile")) {
    stack.language = "Ruby";
  } else if (hasFile("pom.xml") || hasFile("build.gradle")) {
    stack.language = "Java";
  } else if (paths.some((p) => p.endsWith(".cs"))) {
    stack.language = "C#";
  }

  // Framework detection
  if (hasFile("angular.json") || allDeps["@angular/core"]) {
    stack.framework = "Angular";
    const angularJson = getFile("angular.json");
    if (angularJson) {
      try {
        const aj = JSON.parse(angularJson.content);
        const version = allDeps["@angular/core"] || "";
        stack.framework = `Angular ${version.replace(/[^0-9.]/g, "").split(".")[0] || ""}`.trim();
      } catch {}
    }
  } else if (
    allDeps["next"] ||
    hasFile("next.config.js") ||
    hasFile("next.config.ts") ||
    hasFile("next.config.mjs")
  ) {
    stack.framework = "Next.js";
  } else if (allDeps["nuxt"] || hasFile("nuxt.config.ts")) {
    stack.framework = "Nuxt";
  } else if (allDeps["react"] && !allDeps["next"]) {
    stack.framework = "React";
  } else if (allDeps["vue"]) {
    stack.framework = "Vue";
  } else if (allDeps["svelte"] || hasFile("svelte.config.js")) {
    stack.framework = "Svelte/SvelteKit";
  } else if (allDeps["express"]) {
    stack.framework = "Express";
  } else if (hasFile("Cargo.toml")) {
    stack.framework = "Rust";
  } else if (hasFile("go.mod")) {
    stack.framework = "Go";
  } else if (allDeps["fastapi"] || allDeps["django"] || allDeps["flask"]) {
    stack.framework = allDeps["fastapi"]
      ? "FastAPI"
      : allDeps["django"]
        ? "Django"
        : "Flask";
  }

  // Build tool
  if (allDeps["vite"] || hasFile("vite.config.ts") || hasFile("vite.config.js")) {
    stack.buildTool = "Vite";
  } else if (allDeps["webpack"] || hasFile("webpack.config.js")) {
    stack.buildTool = "Webpack";
  } else if (allDeps["esbuild"]) {
    stack.buildTool = "esbuild";
  } else if (allDeps["turbo"] || hasFile("turbo.json")) {
    stack.buildTool = "Turborepo";
  }

  // Test framework
  if (allDeps["jest"] || hasFile("jest.config.js") || hasFile("jest.config.ts")) {
    stack.testFramework = "Jest";
  } else if (allDeps["vitest"] || hasFile("vitest.config.ts")) {
    stack.testFramework = "Vitest";
  } else if (allDeps["karma"] || hasFile("karma.conf.js")) {
    stack.testFramework = "Karma";
  } else if (allDeps["mocha"]) {
    stack.testFramework = "Mocha";
  } else if (allDeps["cypress"]) {
    stack.testFramework = "Cypress";
  }

  // Styling
  if (allDeps["tailwindcss"] || hasFile("tailwind.config.js") || hasFile("tailwind.config.ts")) {
    stack.styling = "Tailwind CSS";
  } else if (allDeps["styled-components"]) {
    stack.styling = "Styled Components";
  } else if (allDeps["@emotion/react"]) {
    stack.styling = "Emotion";
  } else if (paths.some((p) => p.endsWith(".scss"))) {
    stack.styling = "SCSS";
  }

  // Additional tools
  if (allDeps["eslint"] || hasFile(".eslintrc.json") || hasFile("eslint.config.js")) {
    stack.additional.push("ESLint");
  }
  if (allDeps["prettier"] || hasFile(".prettierrc") || hasFile(".prettierrc.json")) {
    stack.additional.push("Prettier");
  }
  if (hasFile("Dockerfile") || hasFile("docker-compose.yml")) {
    stack.additional.push("Docker");
  }
  if (paths.some((p) => p.startsWith(".github/workflows/"))) {
    stack.additional.push("GitHub Actions");
  }
  if (allDeps["storybook"] || allDeps["@storybook/react"]) {
    stack.additional.push("Storybook");
  }
  if (hasFile(".husky") || allDeps["husky"]) {
    stack.additional.push("Husky");
  }
  if (allDeps["prisma"] || allDeps["@prisma/client"]) {
    stack.additional.push("Prisma");
  }
  if (allDeps["drizzle-orm"]) {
    stack.additional.push("Drizzle");
  }

  return stack;
}
