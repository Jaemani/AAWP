import { compileAcceptance, type AcceptanceCompilation } from "./acceptance/index.js";
import {
  compileSpecContracts,
  type CompiledSpecContracts,
  type SpecDocument,
  type SpecToDemoInput
} from "./compiler/index.js";
import { createReactViteScaffold, type GeneratedWorkspace } from "./scaffold.js";
import { createVerificationPlan, type SpecToDemoVerificationPlan } from "./verification.js";

export interface PreparedSpecToDemo {
  contracts: CompiledSpecContracts;
  acceptance: AcceptanceCompilation;
  scaffold: GeneratedWorkspace;
  verificationPlan: SpecToDemoVerificationPlan;
}

export function prepareSpecToDemo(
  input: SpecToDemoInput,
  document: SpecDocument
): PreparedSpecToDemo {
  const contracts = compileSpecContracts(input, document);
  const acceptance = compileAcceptance({ document, ...contracts });
  const scaffold = createReactViteScaffold(acceptance.publicBrief);
  return {
    contracts,
    acceptance,
    scaffold,
    verificationPlan: createVerificationPlan(acceptance.hiddenPackage, contracts.scope)
  };
}
