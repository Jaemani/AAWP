import { ModelGateway, type ModelProvider, type ModelProviderRequest } from "@awf/agent-gateway";
import { describe, expect, it } from "vitest";
import { compileAcceptance } from "./acceptance/index.js";
import { CoherentBuilder, applyBuilderPatch, BuilderPatchError } from "./builder.js";
import { compileSpecContracts } from "./compiler/index.js";
import { createReactViteScaffold } from "./scaffold.js";
import { inputFor, loadFixture } from "./test-helpers.js";

async function setup() {
  const document = await loadFixture("catalog");
  const contracts = compileSpecContracts(inputFor(document), document);
  const acceptance = compileAcceptance({ document, ...contracts });
  return {
    ...acceptance,
    scaffold: createReactViteScaffold(acceptance.publicBrief)
  };
}

describe("deterministic scaffold and coherent builder", () => {
  it("generates a byte-stable React/Vite scaffold with runtime-owned files", async () => {
    const { publicBrief } = await setup();
    const first = createReactViteScaffold(publicBrief);
    const second = createReactViteScaffold(publicBrief);
    expect(first).toEqual(second);
    expect(first.files.find((file) => file.path === "package.json")).toMatchObject({
      owner: "runtime",
      mutable: false
    });
    expect(first.files.find((file) => file.path === "src/App.tsx")).toMatchObject({
      owner: "builder",
      mutable: true
    });
  });

  it("uses one model invocation and never sends hidden fixture data", async () => {
    const { publicBrief, scaffold } = await setup();
    const requests: ModelProviderRequest[] = [];
    const patch = {
      summary: "implemented catalog",
      implementedRequirementIds: publicBrief.requirements.map((item) => item.id),
      files: [
        { path: "src/App.tsx", content: "export function App(){return <main>Catalog</main>}" },
        { path: "src/styles.css", content: "main { padding: 2rem; }" }
      ]
    };
    const provider: ModelProvider = {
      name: "fixture-provider",
      invoke: async (request) => {
        requests.push(request);
        return {
          text: JSON.stringify(patch),
          modelRevision: "fixture-model-v1",
          usage: { inputTokens: 100, outputTokens: 40 },
          finishReason: "stop"
        };
      }
    };
    const result = await new CoherentBuilder(new ModelGateway([provider])).build({
      tenantId: "tenant-a",
      runId: "run-a",
      nodeId: "coherent-builder",
      provider: "fixture-provider",
      model: "fixture-model",
      publicBrief,
      scaffold,
      maxOutputTokens: 1000,
      timeoutMs: 1000
    });
    expect(requests).toHaveLength(1);
    const prompt = JSON.stringify(requests[0]?.messages);
    expect(prompt).toContain("catalog-default");
    expect(prompt).not.toContain("getByRole");
    expect(prompt).not.toContain("/opt/awf/acceptance.json");
    expect(prompt).not.toContain('"oracles"');
    expect(result.workspace.files.find((file) => file.path === "src/App.tsx")?.content).toContain(
      "Catalog"
    );
  });

  it("rejects package changes, runtime file replacement and missing requirement claims", async () => {
    const { publicBrief, scaffold } = await setup();
    const ids = publicBrief.requirements.map((item) => item.id);
    expect(() =>
      applyBuilderPatch(scaffold, publicBrief, {
        summary: "bad dependency change",
        implementedRequirementIds: ids,
        files: [{ path: "package.json", content: "{}" }]
      })
    ).toThrowError(expect.objectContaining({ code: "WRITE_OUTSIDE_SCOPE" }));
    expect(() =>
      applyBuilderPatch(scaffold, publicBrief, {
        summary: "bad runtime change",
        implementedRequirementIds: ids,
        files: [{ path: "src/requirements.generated.ts", content: "export const x = 1" }]
      })
    ).toThrowError(expect.objectContaining({ code: "RUNTIME_FILE_WRITE" }));
    expect(() =>
      applyBuilderPatch(scaffold, publicBrief, {
        summary: "incomplete",
        implementedRequirementIds: [],
        files: [{ path: "src/App.tsx", content: "" }]
      })
    ).toThrow(BuilderPatchError);
  });
});
