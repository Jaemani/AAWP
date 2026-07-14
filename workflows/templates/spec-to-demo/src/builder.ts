import { ModelGateway, type ModelUsage } from "@awf/agent-gateway";
import { digestWorkflow, sha256Hex } from "@awf/ir";
import type { PublicImplementationBrief } from "./acceptance/index.js";
import type { GeneratedWorkspace, GeneratedWorkspaceFile } from "./scaffold.js";

export interface BuilderPatchFile {
  path: string;
  content: string;
}

export interface BuilderPatch {
  summary: string;
  implementedRequirementIds: string[];
  files: BuilderPatchFile[];
}

export interface CoherentBuilderResult {
  workspace: GeneratedWorkspace;
  summary: string;
  provider: string;
  modelRevision: string;
  usage: ModelUsage;
}

export class BuilderPatchError extends Error {
  constructor(
    readonly code:
      | "INVALID_PATH"
      | "DUPLICATE_PATH"
      | "WRITE_OUTSIDE_SCOPE"
      | "RUNTIME_FILE_WRITE"
      | "REQUIREMENT_NOT_IMPLEMENTED",
    message: string
  ) {
    super(message);
    this.name = "BuilderPatchError";
  }
}

const responseSchema = {
  type: "object",
  required: ["summary", "implementedRequirementIds", "files"],
  properties: {
    summary: { type: "string", minLength: 1 },
    implementedRequirementIds: {
      type: "array",
      items: { type: "string", minLength: 1 },
      uniqueItems: true
    },
    files: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["path", "content"],
        properties: {
          path: { type: "string", minLength: 1 },
          content: { type: "string" }
        },
        additionalProperties: false
      }
    }
  },
  additionalProperties: false
};

function pathAllowed(path: string): boolean {
  return path.startsWith("src/") || path.startsWith("public-tests/");
}

function validatePath(path: string): void {
  if (
    path.length === 0 ||
    path.startsWith("/") ||
    path.includes("\\") ||
    path.split("/").some((part) => part.length === 0 || part === "." || part === "..")
  ) {
    throw new BuilderPatchError("INVALID_PATH", `invalid builder path ${path}`);
  }
  if (!pathAllowed(path)) {
    throw new BuilderPatchError("WRITE_OUTSIDE_SCOPE", `builder cannot write ${path}`);
  }
}

export function applyBuilderPatch(
  scaffold: GeneratedWorkspace,
  brief: PublicImplementationBrief,
  patch: BuilderPatch
): GeneratedWorkspace {
  const requiredIds = new Set(brief.requirements.map((requirement) => requirement.id));
  const implemented = new Set(patch.implementedRequirementIds);
  for (const requirementId of requiredIds) {
    if (!implemented.has(requirementId)) {
      throw new BuilderPatchError(
        "REQUIREMENT_NOT_IMPLEMENTED",
        `builder did not claim requirement ${requirementId}`
      );
    }
  }

  const files = new Map(scaffold.files.map((file) => [file.path, file]));
  const seen = new Set<string>();
  for (const proposed of patch.files) {
    validatePath(proposed.path);
    if (seen.has(proposed.path)) {
      throw new BuilderPatchError("DUPLICATE_PATH", `duplicate builder path ${proposed.path}`);
    }
    seen.add(proposed.path);
    const existing = files.get(proposed.path);
    if (existing !== undefined && !existing.mutable) {
      throw new BuilderPatchError(
        "RUNTIME_FILE_WRITE",
        `builder cannot replace runtime file ${proposed.path}`
      );
    }
    const owner = proposed.path.startsWith("public-tests/") ? "public_test" : "builder";
    files.set(proposed.path, {
      path: proposed.path,
      content: proposed.content,
      contentHash: sha256Hex(proposed.content),
      owner,
      mutable: true
    });
  }
  const normalized = [...files.values()].sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0
  );
  return {
    ...scaffold,
    files: normalized,
    digest: digestWorkflow(
      normalized.map((file: GeneratedWorkspaceFile) => ({
        path: file.path,
        contentHash: file.contentHash,
        owner: file.owner,
        mutable: file.mutable
      }))
    )
  };
}

export class CoherentBuilder {
  constructor(private readonly gateway: ModelGateway) {}

  async build(
    input: {
      tenantId: string;
      runId: string;
      nodeId: string;
      provider: string;
      model: string;
      publicBrief: PublicImplementationBrief;
      scaffold: GeneratedWorkspace;
      maxOutputTokens: number;
      timeoutMs: number;
    },
    signal?: AbortSignal
  ): Promise<CoherentBuilderResult> {
    const result = await this.gateway.invoke<BuilderPatch>(
      {
        tenantId: input.tenantId,
        runId: input.runId,
        nodeId: input.nodeId,
        provider: input.provider,
        model: input.model,
        messages: [
          {
            role: "system",
            content:
              "Implement the complete React demo as one coherent writer. Return JSON only. Modify only mutable src/ and public-tests/ files."
          },
          {
            role: "user",
            content: JSON.stringify({
              brief: input.publicBrief,
              scaffold: input.scaffold.files.map((file) => ({
                path: file.path,
                content: file.content,
                mutable: file.mutable
              }))
            })
          }
        ],
        responseSchema,
        maxOutputTokens: input.maxOutputTokens,
        timeoutMs: input.timeoutMs
      },
      signal
    );
    return {
      workspace: applyBuilderPatch(input.scaffold, input.publicBrief, result.value),
      summary: result.value.summary,
      provider: result.provider,
      modelRevision: result.modelRevision,
      usage: result.usage
    };
  }
}
