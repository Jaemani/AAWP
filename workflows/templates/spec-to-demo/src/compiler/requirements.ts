import { digestWorkflow, sha256Hex } from "@awf/ir";
import type { CompiledRequirement, RequirementContract, ScopeContract } from "./contracts.js";
import { parseSpecDocument, type SpecDocument } from "./schema.js";

function requirementId(documentId: string, screenId: string, sourceKey: string): string {
  return `REQ-${sha256Hex(`${documentId}\0${screenId}\0${sourceKey}`).slice(0, 12).toUpperCase()}`;
}

export function compileRequirementContract(
  rawDocument: SpecDocument,
  scope: ScopeContract
): RequirementContract {
  const document = parseSpecDocument(rawDocument);
  const selected = new Set(scope.selectedRequirementKeys);
  const requirements: CompiledRequirement[] = [];
  for (const screen of document.screens) {
    for (const requirement of screen.requirements) {
      if (!selected.has(requirement.key)) continue;
      requirements.push({
        id: requirementId(document.documentId, screen.id, requirement.key),
        sourceKey: requirement.key,
        screenId: screen.id,
        screenTitle: screen.title,
        route: screen.route,
        text: requirement.text,
        kind: requirement.kind,
        publicCriterion: requirement.publicCriterion,
        sourceArtifactId: document.sourceArtifactId,
        sourceSpan: { ...requirement.sourceSpan },
        preconditions: requirement.preconditions.map((item) => ({ ...item })),
        actions: requirement.actions.map((item) => ({ ...item })),
        oracles: requirement.oracles.map((item) => ({
          type: item.type,
          assertion: { ...item.assertion }
        }))
      });
    }
  }
  requirements.sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  const content = {
    contractType: "requirements" as const,
    documentId: document.documentId,
    sourceArtifactId: document.sourceArtifactId,
    requirements
  };
  return { ...content, digest: digestWorkflow(content) };
}
