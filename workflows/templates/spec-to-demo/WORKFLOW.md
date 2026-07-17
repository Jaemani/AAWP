# spec-to-demo execution contract

- Status: executable
- Workflow version: 0.7.3
- Design contract: repository-root `DESIGN.md` only
- Run root: repository-root `runs/`

This file is the complete operating instruction for the registered `spec-to-demo` builder. Do not rely on chat history, a previous agent, or an earlier demo.

## 1. Inputs

The deterministic `compile-demo-scope` node reads `$AAWP_INPUT_PATH`, verifies the pinned
source digest and writes these two run artifacts before this builder starts:

```text
$AAWP_EXECUTION_DIR/artifacts/selection/selection-contract.json
$AAWP_EXECUTION_DIR/artifacts/selection/demo-execution-contract.json
```

Read `demo-execution-contract.json` completely. It is the only product input for the builder and
contains the selected screen, flow, state-machine, API, binding, authority, acceptance, storyboard,
fixture and unresolved-question closure. It also contains the pinned `sourceSpec` provenance and
the exact `selectionContract`.

Do not open `sourceSpec.path` from this node. The compiler has already verified and projected the
heavy source Spec. Re-reading it is both outside this node's authority and a timeout risk.

The original brief contains:

- `sourceSpec.path` and `sourceSpec.byteSha256`
- `requestedScreens`: the exact screen ID set to build
- `selectionContract`: explicit entry screen, requested screens, flow dependencies, deprecated-screen conflicts and any explicit scope expansion
- `requestText`: the user's original selection request
- `designContract.path`, `designContract.version`, and `designContract.byteSha256`
- `demoArtifact.relativePath`, relative to `$AAWP_EXECUTION_DIR`

`sourceSpec.path` points to a deterministic requested-screen projection used by the compiler and
verifier. The builder consumes only the smaller compiled execution contract.

Resolve repository paths from `$PWD`. Resolve the demo output as:

```text
$AAWP_EXECUTION_DIR/<brief.demoArtifact.relativePath>
```

Digest verification belongs to `compile-demo-scope`. Do not repeat it in the model builder.

## 2. Allowed knowledge

Use the compiled Demo execution contract only for product meaning: actor, authority, route, copy,
panels, state, data and interaction. Use `DESIGN.md` only for visual design: tokens, shell, layout,
density, responsive behavior, interaction presentation and accessibility.

Do not inspect or use:

- `presentation-contract.yaml`
- `visual-reference-contract.yaml`
- `design-tokens.css`
- previous run directories, demos, screenshots, HTML or CSS
- the pinned `sourceSpec.path` or any uncompiled source Spec
- design details remembered from chat or another agent

Generic browser behavior and local icon assets created inside this run are allowed. Do not copy assets from an earlier demo.

## 3. Screen selection

- `compile-demo-scope` owns selection validation. If `selectionContract.status` is `scope-expansion-required` or `selection-conflict`, it writes the contract and fails before this model is called.
- Use `selectionContract.entryScreenId` as the default route and replace the initial empty hash with `#<entryScreenId>`. Never infer the entry from requested-screen array order, actor order or storyboard order.
- Never render or navigate to a screen listed in `selectionContract.deprecatedScreenIds`.
- Find every requested screen ID in the pinned source spec.
- Treat the projected screen and semantic dependency sections as the closed input scope. Do not expand it by reading another source file.
- Build exactly that set—no missing screen and no unrequested screen.
- Address every screen with its canonical `#<screenId>` hash. Navigation may use a friendly label but must not replace the canonical screen ID with an internal alias.
- Keep each route as an independent product screen. A screen bundle is navigation, not a dashboard that merges their panels.
- Connect every declared in-scope navigation target. A required flow dependency cannot be represented as a disabled “out of scope” product button and still pass S1.
- `selectionContract.outOfScopeNavigationTargets` are optional destinations exposed by a selected hub, not screens in the current bundle. Do not build them or let them expand scope. Hide those optional menu entries in the focused Demo; never hide a target listed in `requiredScreenIds`.
- Do not correct source logic. Emit ambiguity as non-product `specFeedback` in the manifest.

## 4. Required output

Create a standalone static demo without a bundler:

```text
artifacts/demo/
  index.html
  app.js
  styles.css
  manifest.json
  assets/          # optional, run-local only
```

All URLs must be relative. `index.html` must run when served at `/runs/<runId>/demo/`.

`manifest.json` must contain:

```json
{
  "schemaVersion": "aawp/demo-manifest/v1",
  "workflow": { "id": "spec-to-demo", "version": "0.7.3" },
  "sourceSpec": { "path": "...", "byteSha256": "..." },
  "designContract": {
    "path": "DESIGN.md",
    "version": "<brief.designContract.version>",
    "byteSha256": "..."
  },
  "designInputs": ["DESIGN.md"],
  "screens": [{ "id": "..." }],
  "specFeedback": []
}
```

The manifest must not contain `visualReference`, `presentationContract`, `presentationDigest`, `visualReferenceDigest`, or `adapterVersion`.

## 5. Interaction and fidelity

- Preserve source user-facing copy. Do not render route, internal component type, purpose, `dataNeeds`, raw spec prose or feedback diagnostics in the product UI.
- Do not invent product records, periods, departments, people, amounts or domain-specific labels that are absent from the selected screen copy or explicit selected mock data. Generic UI labels are allowed. A list with one sourced record must not be padded with an unrelated record from actor notes or surrounding prose.
- Product navigation and primary CTA must work for targets inside the selected set.
- Render each declared product action with `data-aawp-action-id="<stable action id>"`. Demo-only actor controls use `data-aawp-actor-id="<stable actor id>"` and must be labelled “Demo 역할 보기”, not as a production authority switcher.
- A single actor selector may represent multiple roles, but every declared actor ID must be selectable by its stable value. Changing the Demo role must immediately update record scope, visible fields and available actions. Hide unauthorized actions; do not leave every action visible for every role.
- Action-specific forms or staged surfaces use `data-aawp-action-surface="<stable action id>"`. The surface owns that command's editable fields, validation feedback and its single visible submit control; all of them must be nested inside the surface. Do not duplicate the same command button in both a card body and footer, or route unrelated commands through one generic confirmation dialog.
- The one submit control inside the surface uses `data-aawp-submit-action="<stable action id>"`. Clicking it once performs the successful command once. Do not execute the command merely by opening its surface.
- Acceptance that covers error preservation exposes a separate visible secondary control with `data-aawp-error-trigger="<stable action id>"`. It deterministically produces a local `role="alert"` after the user has entered a value, preserves those values and does not perform the success transition. Do not put the error-trigger marker on the normal submit control.
- Duplicate protection starts without `data-aawp-duplicate-blocked`. After the second command attempt is rejected, expose `data-aawp-duplicate-blocked="<stable action id>"` on the rejection evidence and keep all state keys unchanged.
- Observable resource fields use `data-aawp-state-key` for status, resourceVersion, processedBy, processedAt, auditCount and workItemCount when those values are affected by an in-scope command.
- Forms require editable state, validation, input preservation on error and submit feedback. File interaction must begin at an unselected state and expose each declared validation/re-upload/diff step.
- Execution actions require confirmation where the source requires it, running and terminal states. Successful commands update the same resource state, version, actor/time, audit evidence and next work item declared by the flow.
- Every browser evidence check in `acceptance` is mandatory. Missing instrumentation or an unexercised acceptance check is a release failure, not `specFeedback`.
- Each browser evidence check starts from a clean local Demo state and navigates directly to its declared screen. Its action must therefore be reachable from that screen and actor without an undeclared prior click sequence. Use only the selected canonical `mockData` to make a declared row/action directly reachable; if the Spec requires setup state but supplies no selected fixture, fail as a Spec gap instead of inventing one.
- A command evidence check observes state keys on its declared source screen. Keep those keys mounted and visibly update status, version, actor/time, audit and work-item values before any optional navigation. Navigation is verified only by a separate action whose canonical target type is `screen`.
- Follow the desktop, tablet, mobile and keyboard requirements in `DESIGN.md`.

## 6. Builder completion boundary

The registered `verify-release` node owns Playwright and release acceptance outside the builder sandbox. The `build-demo` node must not read, inspect, modify or execute `scripts/verify-spec-to-demo-run.mjs`, `scripts/demo-layout-qa-lib.mjs`, Playwright, localhost servers or previous verifier logs. Do not spend model work reverse-engineering acceptance implementation.

Write the four required files immediately after reading `WORKFLOW.md`, `DESIGN.md` and the compiled
execution contract. Do not narrate an implementation plan or create another projection first.

Before finishing, the builder must perform these local artifact checks, which require no network or browser:

- `node --check` for `app.js`
- JSON parse for `manifest.json`
- confirm the four required files exist in the output directory
- run `node scripts/check-spec-to-demo-artifact.mjs` with the existing `AAWP_INPUT_PATH` and `AAWP_EXECUTION_DIR`; fix every reported canonical screen-ID/hash route, stable action instrumentation, exact source-copy, visible authoring-label or public static design-contract failure and run it again until it passes. The checker reports all missing stable actions together so no declared action may be deferred to bounded repair.

Return after writing the artifact. Do not attempt browser repair inside `build-demo`.

## 7. Runtime verification and bounded repair

After the builder returns, the runtime owns this fixed sequence:

1. `inspect-release` runs the independent verifier and writes a hidden structured finding report. A product finding is evidence, not a process crash.
2. `repair-demo` is a no-op when the initial report passed. When blocking findings exist, it may run one model repair round and may write only `app.js`, `index.html` and `styles.css` inside the current candidate.
3. `inspect-repair` reruns the complete independent verifier. If the first finding ID repeats or blocking finding count does not decrease, the workflow fails without another model call.
4. `repair-demo-2` is the optional second and final round. It runs only for a disjoint, smaller finding set exposed after the first repair. It has the same write boundary and must preserve `manifest.json`, source copy, screen set, canonical routes and behavior outside named findings.
5. `verify-release` runs the independent verifier again. Any remaining blocking finding fails the run; there is no third repair or full regeneration fallback.

All shell commands must follow repository `AGENTS.md`.
