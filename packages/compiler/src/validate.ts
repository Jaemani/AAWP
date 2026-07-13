import { Ajv2020 } from "ajv/dist/2020.js";
import { WorkflowDefinitionSchema, type WorkflowDefinition, type WorkflowNode } from "@awf/ir";
import { ERROR_CODES, type Diagnostic, type ValidationResult } from "./diagnostics.js";

const ajv = new Ajv2020({ allErrors: true, strict: false });
const structuralValidate = ajv.compile(WorkflowDefinitionSchema);

function diagnostic(input: Diagnostic): Diagnostic {
  return input;
}

function patternMatches(pattern: string, path: string): boolean {
  if (pattern === "*") return true;
  if (pattern.endsWith("/**")) {
    const prefix = pattern.slice(0, -3);
    return path.startsWith(`${prefix}/`);
  }
  return path === pattern;
}

function pathMatches(path: string, grants: string[]): boolean {
  return grants.some((grant) => patternMatches(grant, path));
}

function writePatternsOverlap(left: string, right: string): boolean {
  return (
    patternMatches(left, right) ||
    patternMatches(right, left) ||
    (left.endsWith("/**") && right.endsWith("/**") && recursivePatternsOverlap(left, right))
  );
}

function recursivePatternsOverlap(left: string, right: string): boolean {
  const leftPrefix = left.slice(0, -3);
  const rightPrefix = right.slice(0, -3);
  return (
    leftPrefix === rightPrefix ||
    leftPrefix.startsWith(`${rightPrefix}/`) ||
    rightPrefix.startsWith(`${leftPrefix}/`)
  );
}

function portKey(ref: { type: string; schemaVersion: string }): string {
  return `${ref.type}@${ref.schemaVersion}`;
}

function nodePath(nodeId: string): string {
  return `/nodes/${nodeId}`;
}

export function validateWorkflow(input: unknown): ValidationResult {
  const diagnostics: Diagnostic[] = [];
  if (!structuralValidate(input)) {
    for (const err of structuralValidate.errors ?? []) {
      diagnostics.push(
        diagnostic({
          code: ERROR_CODES.SCHEMA_INVALID,
          severity: "error",
          path: err.instancePath || "/",
          message: err.message ?? "schema validation failed",
          details: { keyword: err.keyword, params: err.params }
        })
      );
    }
    return { ok: false, diagnostics };
  }

  const workflow = input as WorkflowDefinition;
  const nodeById = new Map<string, WorkflowNode>();
  const seenNodeIds = new Set<string>();
  for (const [index, node] of workflow.nodes.entries()) {
    if (seenNodeIds.has(node.id)) {
      diagnostics.push(
        diagnostic({
          code: ERROR_CODES.DUPLICATE_NODE_ID,
          severity: "error",
          path: `/nodes/${index}/id`,
          nodeId: node.id,
          message: `duplicate node id ${node.id}`
        })
      );
    }
    seenNodeIds.add(node.id);
    nodeById.set(node.id, node);
  }

  const schemaRefs = new Set<string>();
  for (const [index, schema] of workflow.artifactSchemas.entries()) {
    const key = portKey(schema);
    if (schemaRefs.has(key)) {
      diagnostics.push(
        diagnostic({
          code: ERROR_CODES.DUPLICATE_ARTIFACT_SCHEMA,
          severity: "error",
          path: `/artifactSchemas/${index}`,
          message: `duplicate artifact schema ${key}`
        })
      );
    }
    schemaRefs.add(key);
    if (!ajv.validateSchema(schema.schema)) {
      diagnostics.push(
        diagnostic({
          code: ERROR_CODES.INVALID_ARTIFACT_JSON_SCHEMA,
          severity: "error",
          path: `/artifactSchemas/${index}/schema`,
          message: `invalid artifact JSON Schema ${key}`,
          details: { errors: ajv.errors }
        })
      );
    }
  }

  const declaredPorts: Array<[string, { type: string; schemaVersion: string }]> = [];
  for (const [name, port] of Object.entries(workflow.inputs))
    declaredPorts.push([`/inputs/${name}`, port]);
  for (const [name, port] of Object.entries(workflow.outputs))
    declaredPorts.push([`/outputs/${name}`, port]);
  for (const node of workflow.nodes) {
    for (const [name, port] of Object.entries(node.inputs))
      declaredPorts.push([`${nodePath(node.id)}/inputs/${name}`, port]);
    for (const [name, port] of Object.entries(node.outputs))
      declaredPorts.push([`${nodePath(node.id)}/outputs/${name}`, port]);
  }
  for (const [path, port] of declaredPorts) {
    if (!schemaRefs.has(portKey(port))) {
      diagnostics.push(
        diagnostic({
          code: ERROR_CODES.UNKNOWN_ARTIFACT_SCHEMA,
          severity: "error",
          path,
          message: `unknown artifact schema ${portKey(port)}`
        })
      );
    }
  }

  const producedInputs = new Map<string, number[]>();
  const producedOutputs = new Map<string, number[]>();
  const adjacency = new Map<string, Set<string>>();
  for (const node of workflow.nodes) adjacency.set(node.id, new Set<string>());

  for (const [edgeIndex, edge] of workflow.edges.entries()) {
    const sourcePort =
      edge.source.kind === "workflowInput"
        ? workflow.inputs[edge.source.port]
        : nodeById.get(edge.source.nodeId)?.outputs[edge.source.port];
    const targetPort =
      edge.target.kind === "workflowOutput"
        ? workflow.outputs[edge.target.port]
        : nodeById.get(edge.target.nodeId)?.inputs[edge.target.port];

    if (sourcePort === undefined || targetPort === undefined) {
      diagnostics.push(
        diagnostic({
          code: ERROR_CODES.UNKNOWN_ENDPOINT,
          severity: "error",
          path: `/edges/${edgeIndex}`,
          edgeIndex,
          message: "edge references an unknown endpoint"
        })
      );
      continue;
    }
    if (portKey(sourcePort) !== portKey(targetPort)) {
      diagnostics.push(
        diagnostic({
          code: ERROR_CODES.PORT_TYPE_MISMATCH,
          severity: "error",
          path: `/edges/${edgeIndex}`,
          edgeIndex,
          message: `edge port mismatch ${portKey(sourcePort)} -> ${portKey(targetPort)}`
        })
      );
    }
    if (edge.target.kind === "nodeInput") {
      const key = `${edge.target.nodeId}:${edge.target.port}`;
      producedInputs.set(key, [...(producedInputs.get(key) ?? []), edgeIndex]);
    } else {
      producedOutputs.set(edge.target.port, [
        ...(producedOutputs.get(edge.target.port) ?? []),
        edgeIndex
      ]);
    }
    if (edge.source.kind === "nodeOutput" && edge.target.kind === "nodeInput") {
      adjacency.get(edge.source.nodeId)?.add(edge.target.nodeId);
    }
  }

  for (const node of workflow.nodes) {
    for (const inputName of Object.keys(node.inputs)) {
      const producers = producedInputs.get(`${node.id}:${inputName}`) ?? [];
      if (producers.length === 0) {
        diagnostics.push(
          diagnostic({
            code: ERROR_CODES.REQUIRED_INPUT_MISSING_PRODUCER,
            severity: "error",
            path: `${nodePath(node.id)}/inputs/${inputName}`,
            nodeId: node.id,
            message: `node input ${inputName} has no producer`
          })
        );
      } else if (producers.length > 1) {
        diagnostics.push(
          diagnostic({
            code: ERROR_CODES.MULTIPLE_PRODUCERS,
            severity: "error",
            path: `${nodePath(node.id)}/inputs/${inputName}`,
            nodeId: node.id,
            edgeIndex: producers[1] ?? producers[0]!,
            message: `node input ${inputName} has multiple producers`,
            details: { edgeIndexes: producers }
          })
        );
      }
    }
  }
  for (const outputName of Object.keys(workflow.outputs)) {
    const producers = producedOutputs.get(outputName) ?? [];
    if (producers.length === 0) {
      diagnostics.push(
        diagnostic({
          code: ERROR_CODES.WORKFLOW_OUTPUT_MISSING_PRODUCER,
          severity: "error",
          path: `/outputs/${outputName}`,
          message: `workflow output ${outputName} has no producer`
        })
      );
    } else if (producers.length > 1) {
      diagnostics.push(
        diagnostic({
          code: ERROR_CODES.MULTIPLE_PRODUCERS,
          severity: "error",
          path: `/outputs/${outputName}`,
          edgeIndex: producers[1] ?? producers[0]!,
          message: `workflow output ${outputName} has multiple producers`,
          details: { edgeIndexes: producers }
        })
      );
    }
  }

  detectCycles(
    workflow.nodes.map((node) => node.id),
    adjacency,
    diagnostics
  );
  analyzeNodes(workflow, adjacency, diagnostics);
  analyzeReachability(workflow, adjacency, diagnostics);
  analyzeBudget(workflow, diagnostics);

  return { ok: !diagnostics.some((item) => item.severity === "error"), diagnostics };
}

function detectCycles(
  nodeIds: string[],
  adjacency: Map<string, Set<string>>,
  diagnostics: Diagnostic[]
): void {
  const temporary = new Set<string>();
  const permanent = new Set<string>();
  const stack: string[] = [];
  const visit = (nodeId: string): void => {
    if (permanent.has(nodeId)) return;
    if (temporary.has(nodeId)) {
      diagnostics.push(
        diagnostic({
          code: ERROR_CODES.FORBIDDEN_CYCLE,
          severity: "error",
          path: nodePath(nodeId),
          nodeId,
          message: `cycle detected: ${[...stack, nodeId].join(" -> ")}`
        })
      );
      return;
    }
    temporary.add(nodeId);
    stack.push(nodeId);
    for (const next of adjacency.get(nodeId) ?? []) visit(next);
    stack.pop();
    temporary.delete(nodeId);
    permanent.add(nodeId);
  };
  for (const nodeId of nodeIds) visit(nodeId);
}

function canReach(start: string, target: string, adjacency: Map<string, Set<string>>): boolean {
  const visited = new Set<string>();
  const stack = [...(adjacency.get(start) ?? [])];
  while (stack.length > 0) {
    const nodeId = stack.pop();
    if (nodeId === undefined || visited.has(nodeId)) continue;
    if (nodeId === target) return true;
    visited.add(nodeId);
    stack.push(...(adjacency.get(nodeId) ?? []));
  }
  return false;
}

function analyzeNodes(
  workflow: WorkflowDefinition,
  adjacency: Map<string, Set<string>>,
  diagnostics: Diagnostic[]
): void {
  const writeEntries: Array<{ nodeId: string; pattern: string }> = [];
  const verifierById = new Map<string, WorkflowDefinition["verifierDefinitions"][number]>();
  const seenVerifierIds = new Set<string>();
  const productOrBuilderOwnerIds = new Set(
    workflow.nodes
      .filter((node) => node.owner.role === "product" || node.owner.role === "builder")
      .map((node) => node.owner.id)
  );
  const allowedSecrets = new Set(
    Array.isArray(workflow.scopePolicy.allowedSecrets) ? workflow.scopePolicy.allowedSecrets : []
  );
  const allowedNetwork = new Set(
    Array.isArray(workflow.scopePolicy.allowedNetworkHosts)
      ? workflow.scopePolicy.allowedNetworkHosts
      : []
  );

  for (const [index, verifier] of workflow.verifierDefinitions.entries()) {
    if (seenVerifierIds.has(verifier.id)) {
      diagnostics.push(
        diagnostic({
          code: ERROR_CODES.DUPLICATE_VERIFIER_DEFINITION,
          severity: "error",
          path: `/verifierDefinitions/${index}/id`,
          message: `duplicate verifier definition ${verifier.id}`
        })
      );
    }
    seenVerifierIds.add(verifier.id);
    verifierById.set(verifier.id, verifier);
    if (
      verifier.visibility === "hidden" &&
      (verifier.owner.role === "product" || verifier.owner.role === "builder")
    ) {
      diagnostics.push(
        diagnostic({
          code: ERROR_CODES.HIDDEN_VERIFIER_LEAKAGE,
          severity: "error",
          path: `/verifierDefinitions/${index}/owner`,
          message: "hidden verifier cannot be owned by product or builder"
        })
      );
    }
    if (verifier.owner.role !== "verifier") {
      diagnostics.push(
        diagnostic({
          code: ERROR_CODES.RELEASE_VERIFIER_RULE,
          severity: "error",
          path: `/verifierDefinitions/${index}/owner`,
          message: "verifier definition must be owned by verifier role"
        })
      );
    }
  }

  for (const [index, verifierId] of workflow.releasePolicy.requiredVerifiers.entries()) {
    const verifier = verifierById.get(verifierId);
    if (verifier === undefined) {
      diagnostics.push(
        diagnostic({
          code: ERROR_CODES.UNKNOWN_VERIFIER_REFERENCE,
          severity: "error",
          path: `/releasePolicy/requiredVerifiers/${index}`,
          message: `unknown release verifier ${verifierId}`
        })
      );
      continue;
    }
    if (verifier.owner.role !== "verifier") {
      diagnostics.push(
        diagnostic({
          code: ERROR_CODES.RELEASE_VERIFIER_RULE,
          severity: "error",
          path: `/releasePolicy/requiredVerifiers/${index}`,
          message: "release verifier must be owned by verifier role"
        })
      );
    }
    if (productOrBuilderOwnerIds.has(verifier.owner.id)) {
      diagnostics.push(
        diagnostic({
          code: ERROR_CODES.AUTHORITY_OVERLAP,
          severity: "error",
          path: `/releasePolicy/requiredVerifiers/${index}`,
          message: "product or builder owner cannot also own release verifier"
        })
      );
    }
  }

  for (const node of workflow.nodes) {
    if (node.kind === "loop" && node.loop === undefined) {
      diagnostics.push(
        diagnostic({
          code: ERROR_CODES.UNBOUNDED_LOOP,
          severity: "error",
          path: nodePath(node.id),
          nodeId: node.id,
          message: "loop node requires loop bounds"
        })
      );
    }
    if (node.budget.maxAttempts > 5) {
      diagnostics.push(
        diagnostic({
          code: ERROR_CODES.RETRY_BOUNDS,
          severity: "error",
          path: `${nodePath(node.id)}/budget/maxAttempts`,
          nodeId: node.id,
          message: "maxAttempts must be 5 or less in M1"
        })
      );
    }
    if (node.budget.timeoutSec > 3600) {
      diagnostics.push(
        diagnostic({
          code: ERROR_CODES.TIMEOUT_BOUNDS,
          severity: "error",
          path: `${nodePath(node.id)}/budget/timeoutSec`,
          nodeId: node.id,
          message: "timeoutSec must be 3600 or less in M1"
        })
      );
    }
    if (
      node.kind === "side_effect" &&
      node.sideEffect?.idempotencyKeyTemplate === undefined &&
      node.sideEffect?.compensationNodeId === undefined
    ) {
      diagnostics.push(
        diagnostic({
          code: ERROR_CODES.SIDE_EFFECT_GUARD_MISSING,
          severity: "error",
          path: `${nodePath(node.id)}/sideEffect`,
          nodeId: node.id,
          message: "side effects require idempotency key or compensation node"
        })
      );
    }
    for (const read of node.reads) {
      if (!pathMatches(read, node.capabilities.filesystemRead)) {
        diagnostics.push(
          diagnostic({
            code: ERROR_CODES.UNDECLARED_READ_CAPABILITY,
            severity: "error",
            path: nodePath(node.id),
            nodeId: node.id,
            message: `read ${read} is not declared in filesystemRead`
          })
        );
      }
    }
    for (const write of node.writes) {
      if (!pathMatches(write, node.capabilities.filesystemWrite)) {
        diagnostics.push(
          diagnostic({
            code: ERROR_CODES.UNDECLARED_WRITE_CAPABILITY,
            severity: "error",
            path: nodePath(node.id),
            nodeId: node.id,
            message: `write ${write} is not declared in filesystemWrite`
          })
        );
      }
      for (const prior of writeEntries) {
        if (prior.nodeId === node.id || !writePatternsOverlap(prior.pattern, write)) continue;
        if (
          canReach(prior.nodeId, node.id, adjacency) ||
          canReach(node.id, prior.nodeId, adjacency)
        )
          continue;
        diagnostics.push(
          diagnostic({
            code: ERROR_CODES.WRITE_CONFLICT,
            severity: "error",
            path: nodePath(node.id),
            nodeId: node.id,
            message: `write ${write} conflicts with ${prior.nodeId}`,
            details: { write, conflictingNodeId: prior.nodeId, conflictingWrite: prior.pattern }
          })
        );
      }
      writeEntries.push({ nodeId: node.id, pattern: write });
    }
    for (const secret of node.capabilities.secretRefs) {
      if (!allowedSecrets.has(secret)) {
        diagnostics.push(
          diagnostic({
            code: ERROR_CODES.UNDECLARED_SECRET,
            severity: "error",
            path: nodePath(node.id),
            nodeId: node.id,
            message: `secret ${secret} is not allowed by scopePolicy.allowedSecrets`
          })
        );
      }
    }
    for (const host of node.capabilities.network) {
      if (!allowedNetwork.has(host)) {
        diagnostics.push(
          diagnostic({
            code: ERROR_CODES.UNDECLARED_NETWORK,
            severity: "error",
            path: nodePath(node.id),
            nodeId: node.id,
            message: `network host ${host} is not allowed by scopePolicy.allowedNetworkHosts`
          })
        );
      }
    }
    if (
      (node.owner.role === "builder" || node.owner.role === "product") &&
      Object.values(node.inputs).some((port) => port.visibility === "hidden")
    ) {
      diagnostics.push(
        diagnostic({
          code: ERROR_CODES.HIDDEN_VERIFIER_LEAKAGE,
          severity: "error",
          path: `${nodePath(node.id)}/inputs`,
          nodeId: node.id,
          message: "builder or product node cannot read hidden verifier artifacts"
        })
      );
    }
    for (const [index, binding] of node.verifiers.entries()) {
      if (!verifierById.has(binding.verifierId)) {
        diagnostics.push(
          diagnostic({
            code: ERROR_CODES.UNKNOWN_VERIFIER_REFERENCE,
            severity: "error",
            path: `${nodePath(node.id)}/verifiers/${index}/verifierId`,
            nodeId: node.id,
            message: `unknown verifier binding ${binding.verifierId}`
          })
        );
      }
    }
  }
}

function analyzeReachability(
  workflow: WorkflowDefinition,
  adjacency: Map<string, Set<string>>,
  diagnostics: Diagnostic[]
): void {
  const reachable = new Set<string>();
  for (const edge of workflow.edges) {
    if (edge.source.kind === "workflowInput" && edge.target.kind === "nodeInput")
      reachable.add(edge.target.nodeId);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of Array.from(reachable)) {
      for (const next of adjacency.get(node) ?? []) {
        if (!reachable.has(next)) {
          reachable.add(next);
          changed = true;
        }
      }
    }
  }
  const outputProducer = new Set<string>();
  for (const edge of workflow.edges) {
    if (edge.source.kind === "nodeOutput" && edge.target.kind === "workflowOutput")
      outputProducer.add(edge.source.nodeId);
  }
  for (const node of workflow.nodes) {
    if (!reachable.has(node.id)) {
      diagnostics.push(
        diagnostic({
          code: ERROR_CODES.UNREACHABLE_NODE,
          severity: "warning",
          path: nodePath(node.id),
          nodeId: node.id,
          message: "node is not reachable from workflow inputs"
        })
      );
    }
  }
  for (const [outputName] of Object.entries(workflow.outputs)) {
    const producer = workflow.edges.find(
      (edge) => edge.target.kind === "workflowOutput" && edge.target.port === outputName
    );
    if (producer?.source.kind === "nodeOutput" && !reachable.has(producer.source.nodeId)) {
      diagnostics.push(
        diagnostic({
          code: ERROR_CODES.UNREACHABLE_OUTPUT,
          severity: "error",
          path: `/outputs/${outputName}`,
          nodeId: producer.source.nodeId,
          message: `workflow output ${outputName} is produced by an unreachable node`
        })
      );
    }
  }
  void outputProducer;
}

function analyzeBudget(workflow: WorkflowDefinition, diagnostics: Diagnostic[]): void {
  const limit =
    typeof workflow.scopePolicy.maxWorkflowCostUsd === "number"
      ? workflow.scopePolicy.maxWorkflowCostUsd
      : undefined;
  if (limit === undefined) return;
  let worstCase = 0;
  for (const node of workflow.nodes) {
    const nodeCost = node.budget.maxCostUsd ?? 0;
    const loopRounds = node.kind === "loop" ? (node.loop?.maxRounds ?? 51) : 1;
    worstCase += nodeCost * node.budget.maxAttempts * loopRounds;
  }
  if (worstCase > limit) {
    diagnostics.push(
      diagnostic({
        code: ERROR_CODES.BUDGET_EXCEEDED,
        severity: "error",
        path: "/scopePolicy/maxWorkflowCostUsd",
        message: `theoretical worst-case budget ${worstCase.toFixed(4)} exceeds ${limit.toFixed(4)}`,
        details: { worstCase, limit }
      })
    );
  }
}
