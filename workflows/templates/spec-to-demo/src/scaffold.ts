import { canonicalize, digestWorkflow, sha256Hex } from "@awf/ir";
import type { PublicImplementationBrief } from "./acceptance/index.js";

export type WorkspaceFileOwner = "runtime" | "builder" | "public_test";

export interface GeneratedWorkspaceFile {
  path: string;
  content: string;
  contentHash: string;
  owner: WorkspaceFileOwner;
  mutable: boolean;
}

export interface GeneratedWorkspace {
  profile: "web-react";
  scaffoldVersion: "1.0.0";
  files: GeneratedWorkspaceFile[];
  digest: string;
}

function requirementsModule(brief: PublicImplementationBrief): string {
  const requirements = brief.requirements.map((requirement) => ({
    id: requirement.id,
    screenId: requirement.screenId,
    route: requirement.route,
    text: requirement.text,
    publicCriterion: requirement.publicCriterion
  }));
  return `export const PUBLIC_REQUIREMENTS = ${JSON.stringify(requirements, null, 2)} as const;\n`;
}

function appShell(brief: PublicImplementationBrief): string {
  const screens = [...new Map(brief.requirements.map((item) => [item.screenId, item])).values()];
  return `import "./styles.css";
import { PUBLIC_REQUIREMENTS } from "./requirements.generated";

export function App() {
  return (
    <main>
      <h1>{${JSON.stringify(brief.title)}}</h1>
      <nav aria-label="Demo screens">
        ${screens
          .map(
            (screen) =>
              `<a href={${JSON.stringify(screen.route)}}>{${JSON.stringify(screen.screenTitle)}}</a>`
          )
          .join("\n        ")}
      </nav>
      <section aria-label="Implementation status">
        <p>The coherent builder must replace this scaffold shell.</p>
        <p>{PUBLIC_REQUIREMENTS.length} requirements loaded.</p>
      </section>
    </main>
  );
}
`;
}

export function createReactViteScaffold(brief: PublicImplementationBrief): GeneratedWorkspace {
  const packageJson = {
    name: "awf-spec-to-demo-product",
    private: true,
    type: "module",
    scripts: {
      build: "vite build",
      preview: "vite preview",
      typecheck: "tsc --noEmit",
      "test:unit": "vitest run public-tests/unit",
      "test:public": "playwright test public-tests/e2e"
    },
    dependencies: { react: "19.1.1", "react-dom": "19.1.1" },
    devDependencies: {
      "@playwright/test": "1.55.1",
      "@types/react": "19.1.16",
      "@types/react-dom": "19.1.9",
      "@vitejs/plugin-react": "5.0.4",
      typescript: "5.9.3",
      vite: "7.1.7",
      vitest: "3.2.4"
    }
  };
  const raw: Array<Omit<GeneratedWorkspaceFile, "contentHash">> = [
    {
      path: "package.json",
      content: `${canonicalize(packageJson)}\n`,
      owner: "runtime",
      mutable: false
    },
    {
      path: "index.html",
      content:
        '<!doctype html>\n<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Adaptive demo</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>\n',
      owner: "runtime",
      mutable: false
    },
    {
      path: "tsconfig.json",
      content: `${canonicalize({
        compilerOptions: {
          target: "ES2022",
          useDefineForClassFields: true,
          lib: ["ES2022", "DOM", "DOM.Iterable"],
          allowJs: false,
          skipLibCheck: true,
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          strict: true,
          forceConsistentCasingInFileNames: true,
          module: "ESNext",
          moduleResolution: "Bundler",
          resolveJsonModule: true,
          isolatedModules: true,
          noEmit: true,
          jsx: "react-jsx"
        },
        include: ["src", "public-tests"]
      })}\n`,
      owner: "runtime",
      mutable: false
    },
    {
      path: "vite.config.ts",
      content:
        'import { defineConfig } from "vite";\nimport react from "@vitejs/plugin-react";\nexport default defineConfig({ plugins: [react()] });\n',
      owner: "runtime",
      mutable: false
    },
    {
      path: "src/main.tsx",
      content:
        'import { StrictMode } from "react";\nimport { createRoot } from "react-dom/client";\nimport { App } from "./App";\ncreateRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);\n',
      owner: "runtime",
      mutable: false
    },
    {
      path: "src/requirements.generated.ts",
      content: requirementsModule(brief),
      owner: "runtime",
      mutable: false
    },
    {
      path: "src/App.tsx",
      content: appShell(brief),
      owner: "builder",
      mutable: true
    },
    {
      path: "src/styles.css",
      content:
        ":root { font-family: system-ui, sans-serif; color: #172033; background: #f7f8fb; }\nbody { margin: 0; }\nmain { max-width: 72rem; margin: 0 auto; padding: 2rem; }\nnav { display: flex; gap: 1rem; }\n",
      owner: "builder",
      mutable: true
    },
    {
      path: "public-tests/unit/requirements.test.ts",
      content:
        'import { describe, expect, it } from "vitest";\nimport { PUBLIC_REQUIREMENTS } from "../../src/requirements.generated";\ndescribe("public requirements", () => { it("contains runtime-owned requirement ids", () => { expect(new Set(PUBLIC_REQUIREMENTS.map((item) => item.id)).size).toBe(PUBLIC_REQUIREMENTS.length); }); });\n',
      owner: "public_test",
      mutable: true
    }
  ];
  const files = raw
    .map((file) => ({ ...file, contentHash: sha256Hex(file.content) }))
    .sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
  return {
    profile: "web-react",
    scaffoldVersion: "1.0.0",
    files,
    digest: digestWorkflow(
      files.map((file) => ({
        path: file.path,
        contentHash: file.contentHash,
        owner: file.owner,
        mutable: file.mutable
      }))
    )
  };
}
