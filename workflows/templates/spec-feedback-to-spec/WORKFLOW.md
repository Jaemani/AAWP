# spec-feedback-to-spec execution contract

This workflow creates an immutable child Spec candidate from exactly two pinned inputs: one baseline JSON Spec and one Markdown feedback document.

## Boundary

- Never modify the baseline, feedback, `DESIGN.md`, repository source, or previous runs.
- Write only `artifacts/spec-revision/patch-proposal.json` and optional proposal notes inside `AAWP_EXECUTION_DIR`.
- The result remains `candidate`. Do not approve or promote it on behalf of a human.
- Do not invent DB products, physical table names, HTTP status codes, organization roles, or authority decisions.
- Preserve `confirmed`, `assumed`, `unresolved`, `conflicting`, and `deprecated` distinctions from the feedback.
- A missing decision must become an explicit open question or blocker, never a plausible mock fact.

## Read order

1. Read `AAWP_INPUT_PATH`.
2. Read `artifacts/spec-revision/contract.json` and `feedback.normalized.json` from `AAWP_EXECUTION_DIR`.
3. Read `source.affected-projection.json`. It contains the exact original array indexes and values needed for affected screen, actor, interaction, acceptance and storyboard patches, plus the current scope. Current S1 acceptance and the active journey are included even when new feedback names only the screens being added.
4. If `contract.feedback.repairBase` exists, read its pinned proposal and gap report first. Preserve correct operations and repair only reported gaps. Do not re-derive the whole proposal.
5. Read the pinned baseline only when a required value is absent from the affected projection. Do not repeatedly scan or print the 1.4MB baseline.
6. Read the pinned feedback path when normalized feedback does not contain enough context.

`contract.revisionContract.allowedPathPrefixes` is the authoritative write boundary. Check that array directly. Do not infer the boundary from WIR capability declarations or from the baseline's current root keys.

## Proposal format

Write valid JSON with this exact envelope:

```json
{
  "schemaVersion": "aawp/spec-patch-proposal/v1",
  "operations": [
    {
      "operation": "add",
      "path": "/requirements",
      "value": [],
      "feedbackIds": ["FB-SPEC-001"],
      "reason": "사람이 검토할 수 있는 변경 이유"
    }
  ]
}
```

Only `add`, `replace`, and `remove` exist. This contract forbids `remove`. Do not target the same JSON Pointer twice. Every operation must cite existing feedback IDs. `value` must be complete for `add` and `replace`.

## Required candidate shape

Keep all legacy roots required by the heavy v1 profile. Add or update these canonical roots:

`references`, `scope`, `glossary`, `requirements`, `domainModel`, `stateMachines`, `apiContracts`, `flows`, `dataBindings`, `authority`, `acceptance`, `nonFunctional`, `assumptions`, `openQuestions`, `traceability`.

Every listed root must have exactly one `add` or `replace` operation unless the baseline already contains the correct canonical root. A proposal that merely records a missing-root conflict is invalid when the path appears in `allowedPathPrefixes`.

The existing `screens` array is the compatibility projection and canonical screen registry. For active screens touched by this revision:

- add `canonical: true`, `resourceType`, `resourcePurpose`, shared actors, and structured `actions`;
- each action uses canonical `targetType` and `targetId` fields and targets an existing `flow`, `command`, `query`, or `screen`;
- never substitute `type`/`target`, `commandId` alone, or another alias for `targetType`/`targetId`;
- one resource is not duplicated into role-specific routes;
- role differences live in server capabilities, field visibility, record scope, and commands;
- update the matching `interactionModel` entry so the Demo projection does not contradict the screen;
- do not use a policy instance such as 청년기본소득 as a navigation item.

When `scope.selectedScreensForS1Evidence` is non-empty, the child must also declare:

- `scope.entryScreenId`: one selected, canonical, non-deprecated screen;
- `scope.activeDemoJourneyId`: the single active storyboard journey when multiple journey records are preserved;
- no deprecated screen in selected screens, active acceptance or active storyboard records.

Legacy storyboard records may be preserved only with `status: deprecated`. Canonical shared-screen scope and compatibility roots must not disagree about the default entry, active journey or role-specific routes.

Canonical API commands must reference an authority capability and state transition. Keep policy approval, roster approval, and payout-preparation handoff as separate commands. Commands that mutate state declare resource-version and idempotency requirements. Exact unresolved error codes stay unresolved.

S1 acceptance is executable evidence, not prose alone. Every `acceptance.scenarios[]` entry must contain `evidenceChecks[]`. Each check declares:

```json
{
  "id": "stable-check-id",
  "kind": "browser",
  "screenId": "stable-screen-id",
  "actorId": "stable-actor-id",
  "actionId": "stable-action-id",
  "assertions": ["visible", "action-specific-surface", "state-change"],
  "stateKeys": ["status", "resourceVersion", "processedAt", "auditCount"]
}
```

Supported assertions are `visible`, `hidden`, `navigates`, `action-specific-surface`, `state-change`, `persists-after-reload`, `work-item-created`, `no-duplicate`, `input-preserved-on-error`, `control-height-consistent`, and `table-no-overflow`. `hidden` is a complete negative check and cannot be combined with assertions that require clicking the same action. A screen-target action uses `navigates`; it cannot claim a command form surface, resource state change, persistence, work-item creation, duplicate handling or input-error preservation. For navigation evidence, `screenId` is the source screen where the click starts; the matching screen action's `targetId` is the destination. Do not replace `screenId` with the destination. State assertions also declare non-empty `stateKeys`. Use stable IDs from the same child document. Do not claim S1 passed when a scenario has no browser evidence check or needs a screen outside the declared selection.

Visibility contracts must also be consistent across checks. The same `screenId + actorId + actionId` tuple cannot be `hidden` in one check and visible or clickable in another. A negative `hidden` check must name an actor that does not hold the action capability; a positive check must name the authorized actor.

## Revision metadata

Add or replace `/meta/revision` with a candidate record containing the profile, target maturity, feedback IDs, and compatibility policy. Runtime materialization adds pinned lineage digests deterministically.

## Current execution goal

The requested child should pass S1 Demo checks. S2 DB/API gaps must remain visible as `PREVIEW_BLOCKER` inputs through `assumptions` and `openQuestions`; do not force S2 to pass. S3 is out of scope.
