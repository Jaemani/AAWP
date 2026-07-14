import { mkdtemp, mkdir, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CapabilityAuthorizer } from "@awf/policy";
import { SandboxLauncher, type IsolatedSandboxSpec, type SandboxBackend } from "@awf/tool-gateway";
import type { VerifierDefinition, VerifierOutput } from "@awf/verifier-sdk";
import { describe, expect, it } from "vitest";
import { VerifierMountConflictError, VerifierWorker } from "./worker.js";

const productHash = "a".repeat(64);

function definition(): VerifierDefinition {
  return {
    id: "hidden-e2e",
    version: "1.0.0",
    ownerId: "acceptance-team",
    visibility: "hidden",
    image: `registry.example/awf/verifier@sha256:${"b".repeat(64)}`,
    argv: ["verify", "--json"],
    policyDigest: "c".repeat(64),
    requiredEvidenceIds: ["hidden-e2e-report"]
  };
}

function output(overrides: Partial<VerifierOutput> = {}): VerifierOutput {
  return {
    outcome: "passed",
    productContentHash: productHash,
    findings: [],
    gates: [{ id: "hidden-e2e", hard: true, status: "passed", evidenceArtifactIds: ["report"] }],
    evidence: [
      {
        id: "hidden-e2e-report",
        kind: "test_report",
        artifactId: "report",
        contentHash: "d".repeat(64),
        required: true
      }
    ],
    observedWrites: [],
    scopeViolationCount: 0,
    costUsd: 0,
    latencyMs: 0,
    ...overrides
  };
}

async function workspace(): Promise<{
  root: string;
  authorizer: CapabilityAuthorizer;
}> {
  const root = await mkdtemp(join(tmpdir(), "awf-verifier-"));
  await mkdir(join(root, "product"));
  await mkdir(join(root, "evidence"));
  return {
    root,
    authorizer: await CapabilityAuthorizer.create(root, {
      filesystemRead: ["product"],
      filesystemWrite: ["evidence"],
      network: [],
      tools: [],
      secretRefs: []
    })
  };
}

function capturingBackend(
  stdout: string,
  exitCode = 0
): {
  backend: SandboxBackend;
  specs: IsolatedSandboxSpec[];
} {
  const specs: IsolatedSandboxSpec[] = [];
  return {
    specs,
    backend: {
      run: async (spec) => {
        specs.push(spec);
        return { exitCode, stdout, stderr: "hidden verifier detail must not escape" };
      }
    }
  };
}

function clock(): { now(): Date } {
  const times = [new Date("2026-07-14T00:00:00.000Z"), new Date("2026-07-14T00:00:00.125Z")];
  return { now: () => times.shift() ?? new Date("2026-07-14T00:00:00.125Z") };
}

describe("VerifierWorker", () => {
  it("mounts only the product read-only and evidence output writable", async () => {
    const { root, authorizer } = await workspace();
    const { backend, specs } = capturingBackend(JSON.stringify(output()));
    const worker = new VerifierWorker(new SandboxLauncher(backend), clock());
    const bundle = await worker.run(
      {
        tenantId: "tenant-a",
        runId: "run-a",
        branchId: "candidate",
        nodeId: "verify-release",
        productArtifactId: "artifact-product",
        productContentHash: productHash,
        productWorkspacePath: "product",
        evidenceWorkspacePath: "evidence",
        definition: definition(),
        authorizer,
        limits: { timeoutMs: 5_000, memoryMb: 256, cpuCount: 0.5, maxProcesses: 32 }
      },
      new AbortController().signal
    );

    expect(specs[0]).toMatchObject({
      image: definition().image,
      argv: definition().argv,
      environment: {},
      allowedNetworkOrigins: [],
      limits: { timeoutMs: 5_000, memoryMb: 256, cpuCount: 0.5, maxProcesses: 32 },
      mounts: [
        {
          source: join(await realpath(root), "evidence"),
          target: "/workspace/evidence",
          mode: "rw"
        },
        {
          source: join(await realpath(root), "product"),
          target: "/workspace/product",
          mode: "ro"
        }
      ]
    });
    expect(specs[0]?.mounts).toHaveLength(2);
    expect(specs[0]?.mounts.some((mount) => mount.source.includes("hidden"))).toBe(false);
    expect(bundle.result.latencyMs).toBe(125);
    expect(bundle.result.outcome).toBe("passed");
  });

  it("rejects overlapping product and evidence mounts before execution", async () => {
    const { authorizer } = await workspace();
    const { backend, specs } = capturingBackend(JSON.stringify(output()));
    const worker = new VerifierWorker(new SandboxLauncher(backend), clock());
    await expect(
      worker.run(
        {
          tenantId: "tenant-a",
          runId: "run-a",
          branchId: "candidate",
          nodeId: "verify-release",
          productArtifactId: "artifact-product",
          productContentHash: productHash,
          productWorkspacePath: "product",
          evidenceWorkspacePath: "product/evidence",
          definition: definition(),
          authorizer
        },
        new AbortController().signal
      )
    ).rejects.toThrow(VerifierMountConflictError);
    expect(specs).toHaveLength(0);
  });

  it("turns malformed verifier output into a blocking harness finding", async () => {
    const { authorizer } = await workspace();
    const { backend } = capturingBackend("not-json");
    const bundle = await new VerifierWorker(new SandboxLauncher(backend), clock()).run(
      {
        tenantId: "tenant-a",
        runId: "run-a",
        branchId: "candidate",
        nodeId: "verify-release",
        productArtifactId: "artifact-product",
        productContentHash: productHash,
        productWorkspacePath: "product",
        evidenceWorkspacePath: "evidence",
        definition: definition(),
        authorizer
      },
      new AbortController().signal
    );
    expect(bundle.result).toMatchObject({
      outcome: "error",
      findings: [
        {
          class: "harness_defect",
          severity: "blocking",
          reasonCode: "INVALID_VERIFIER_OUTPUT"
        }
      ]
    });
  });

  it("rejects a verifier report for a different product hash", async () => {
    const { authorizer } = await workspace();
    const { backend } = capturingBackend(
      JSON.stringify(output({ productContentHash: "f".repeat(64) }))
    );
    const bundle = await new VerifierWorker(new SandboxLauncher(backend), clock()).run(
      {
        tenantId: "tenant-a",
        runId: "run-a",
        branchId: "candidate",
        nodeId: "verify-release",
        productArtifactId: "artifact-product",
        productContentHash: productHash,
        productWorkspacePath: "product",
        evidenceWorkspacePath: "evidence",
        definition: definition(),
        authorizer
      },
      new AbortController().signal
    );
    expect(bundle.result.findings[0]).toMatchObject({
      class: "policy_violation",
      reasonCode: "PRODUCT_HASH_MISMATCH"
    });
  });
});
