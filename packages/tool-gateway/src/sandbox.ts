import {
  CapabilityAuthorizer,
  InvalidSecretLeaseError,
  validateSecretLease,
  type AuthorizedFilesystemPath,
  type SecretBroker
} from "@awf/policy";
import type { GatewayTraceContext } from "@awf/telemetry";

export interface SandboxLimits {
  timeoutMs: number;
  memoryMb: number;
  cpuCount: number;
  maxProcesses: number;
}

export interface SandboxMount {
  source: string;
  target: string;
  mode: "ro" | "rw";
}

export interface SandboxIsolation {
  rootless: true;
  readOnlyRootFilesystem: true;
  noNewPrivileges: true;
  dropAllCapabilities: true;
}

export interface IsolatedSandboxSpec {
  image: string;
  argv: string[];
  stdin?: string;
  workingDirectory: "/workspace";
  environment: Record<string, string>;
  mounts: SandboxMount[];
  allowedNetworkOrigins: string[];
  limits: SandboxLimits;
  isolation: SandboxIsolation;
}

export interface SandboxBackendResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface SandboxBackend {
  run(spec: IsolatedSandboxSpec, signal: AbortSignal): Promise<SandboxBackendResult>;
}

export interface SandboxLaunchRequest extends GatewayTraceContext {
  authorizer: CapabilityAuthorizer;
  image: string;
  argv: string[];
  stdin?: string;
  filesystemRead?: string[];
  filesystemWrite?: string[];
  networkUrls?: string[];
  secretRefs?: string[];
  secretTtlMs?: number;
  limits?: Partial<SandboxLimits>;
}

export interface SandboxLaunchResult extends SandboxBackendResult {
  redactionValues: string[];
}

const DEFAULT_LIMITS: SandboxLimits = {
  timeoutMs: 60_000,
  memoryMb: 512,
  cpuCount: 1,
  maxProcesses: 128
};

function pinnedImage(image: string): boolean {
  return /^[a-zA-Z0-9./:_-]+@sha256:[a-f0-9]{64}$/.test(image);
}

function validateLimits(overrides: Partial<SandboxLimits> | undefined): SandboxLimits {
  const limits = { ...DEFAULT_LIMITS, ...overrides };
  if (
    !Number.isInteger(limits.timeoutMs) ||
    limits.timeoutMs < 1 ||
    !Number.isInteger(limits.memoryMb) ||
    limits.memoryMb < 16 ||
    !Number.isFinite(limits.cpuCount) ||
    limits.cpuCount <= 0 ||
    !Number.isInteger(limits.maxProcesses) ||
    limits.maxProcesses < 1
  ) {
    throw new Error("sandbox resource limits are invalid");
  }
  return limits;
}

function mountTarget(path: AuthorizedFilesystemPath): string {
  return `/workspace/${path.workspacePath}`;
}

function mergeMounts(paths: AuthorizedFilesystemPath[]): SandboxMount[] {
  const mounts = new Map<string, SandboxMount>();
  for (const path of paths) {
    const target = mountTarget(path);
    const existing = mounts.get(target);
    mounts.set(target, {
      source: path.canonicalPath,
      target,
      mode: existing?.mode === "rw" || path.access === "write" ? "rw" : "ro"
    });
  }
  return [...mounts.values()].sort((left, right) =>
    left.target < right.target ? -1 : left.target > right.target ? 1 : 0
  );
}

export class SandboxLauncher {
  constructor(
    private readonly backend: SandboxBackend,
    private readonly secretBroker?: SecretBroker
  ) {}

  async run(request: SandboxLaunchRequest, signal: AbortSignal): Promise<SandboxLaunchResult> {
    if (!pinnedImage(request.image) || request.argv.length === 0) {
      throw new Error("sandbox requires a pinned image and non-empty argv");
    }
    const paths: AuthorizedFilesystemPath[] = [];
    for (const path of [...new Set(request.filesystemRead ?? [])].sort()) {
      paths.push(await request.authorizer.authorizeFilesystem("read", path));
    }
    for (const path of [...new Set(request.filesystemWrite ?? [])].sort()) {
      paths.push(await request.authorizer.authorizeFilesystem("write", path));
    }
    const allowedNetworkOrigins = [
      ...new Set(
        [...new Set(request.networkUrls ?? [])].map(
          (url) => request.authorizer.authorizeNetwork(url).origin
        )
      )
    ].sort();

    const environment: Record<string, string> = {};
    const redactionValues: string[] = [];
    const secretRefs = [...new Set(request.secretRefs ?? [])].sort();
    const broker = this.secretBroker;
    if (secretRefs.length > 0 && broker === undefined) {
      throw new InvalidSecretLeaseError("sandbox requested secrets without a secret broker");
    }
    for (const reference of secretRefs) {
      if (broker === undefined) {
        throw new InvalidSecretLeaseError("sandbox requested secrets without a secret broker");
      }
      request.authorizer.authorizeSecret(reference);
      const lease = validateSecretLease(
        await broker.issue({
          tenantId: request.tenantId,
          runId: request.runId,
          nodeId: request.nodeId,
          reference,
          ttlMs: request.secretTtlMs ?? 60_000
        }),
        reference
      );
      if (Object.hasOwn(environment, lease.environmentVariable)) {
        throw new InvalidSecretLeaseError(
          `duplicate secret environment variable: ${lease.environmentVariable}`
        );
      }
      environment[lease.environmentVariable] = lease.value;
      redactionValues.push(lease.value);
    }

    const spec: IsolatedSandboxSpec = {
      image: request.image,
      argv: [...request.argv],
      ...(request.stdin === undefined ? {} : { stdin: request.stdin }),
      workingDirectory: "/workspace",
      environment,
      mounts: mergeMounts(paths),
      allowedNetworkOrigins,
      limits: validateLimits(request.limits),
      isolation: {
        rootless: true,
        readOnlyRootFilesystem: true,
        noNewPrivileges: true,
        dropAllCapabilities: true
      }
    };
    const result = await this.backend.run(spec, signal);
    return { ...result, redactionValues };
  }
}
