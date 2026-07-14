export interface SecretLeaseRequest {
  tenantId: string;
  runId: string;
  nodeId: string;
  reference: string;
  ttlMs: number;
}

export interface SecretLease {
  reference: string;
  environmentVariable: string;
  value: string;
  expiresAt: number;
}

export interface SecretBroker {
  issue(request: SecretLeaseRequest): Promise<SecretLease>;
}

export class InvalidSecretLeaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSecretLeaseError";
  }
}

export function validateSecretLease(
  lease: SecretLease,
  expectedReference: string,
  now = Date.now()
): SecretLease {
  if (
    lease.reference !== expectedReference ||
    !/^[A-Z_][A-Z0-9_]*$/.test(lease.environmentVariable) ||
    lease.value.length === 0 ||
    !Number.isFinite(lease.expiresAt) ||
    lease.expiresAt <= now
  ) {
    throw new InvalidSecretLeaseError(`broker returned an invalid lease for ${expectedReference}`);
  }
  return lease;
}
