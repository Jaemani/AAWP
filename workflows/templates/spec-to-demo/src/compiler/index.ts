import type { CompiledSpecContracts } from "./contracts.js";
import { compileRequirementContract } from "./requirements.js";
import { compileScopeContract } from "./scope.js";
import type { SpecDocument, SpecToDemoInput } from "./schema.js";

export function compileSpecContracts(
  input: SpecToDemoInput,
  document: SpecDocument
): CompiledSpecContracts {
  const scope = compileScopeContract(input, document);
  return {
    scope,
    requirements: compileRequirementContract(document, scope)
  };
}

export * from "./contracts.js";
export * from "./requirements.js";
export * from "./schema.js";
export * from "./scope.js";
