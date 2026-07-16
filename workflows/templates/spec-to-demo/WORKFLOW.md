# spec-to-demo execution contract

- Status: executable
- Workflow version: 0.4.0
- Design contract: repository-root `DESIGN.md` only
- Run root: repository-root `runs/`

This file is the complete operating instruction for the registered `spec-to-demo` builder. Do not rely on chat history, a previous agent, or an earlier demo.

## 1. Inputs

Read the JSON document at `$AAWP_INPUT_PATH`. Its `brief` object must contain:

- `sourceSpec.path` and `sourceSpec.byteSha256`
- `requestedScreens`: the exact screen ID set to build
- `requestText`: the user's original selection request
- `designContract.path`, `designContract.version`, and `designContract.byteSha256`
- `demoArtifact.relativePath`, relative to `$AAWP_EXECUTION_DIR`

`sourceSpec.path` may point to a deterministic requested-screen projection. When `sourceSpec.projection` is present, that file is the complete source for this run: do not search for or read the heavy original spec. `sourceSpec.originalByteSha256` preserves original provenance while `sourceSpec.byteSha256` pins the executable projection.

Resolve repository paths from `$PWD`. Resolve the demo output as:

```text
$AAWP_EXECUTION_DIR/<brief.demoArtifact.relativePath>
```

Verify both declared SHA-256 values before implementation. Fail instead of silently accepting changed inputs.

## 2. Allowed knowledge

Use the source spec only for product meaning: actor, authority, route, copy, panels, state, data and interaction. Use `DESIGN.md` only for visual design: tokens, shell, layout, density, responsive behavior, interaction presentation and accessibility.

Do not inspect or use:

- `presentation-contract.yaml`
- `visual-reference-contract.yaml`
- `design-tokens.css`
- previous run directories, demos, screenshots, HTML or CSS
- design details remembered from chat or another agent

Generic browser behavior and local icon assets created inside this run are allowed. Do not copy assets from an earlier demo.

## 3. Screen selection

- Find every requested screen ID in the pinned source spec.
- Treat the projected `screens`, referenced actors, components and interactions as the closed input scope. Do not expand it by reading another source file.
- Build exactly that set—no missing screen and no unrequested screen.
- Address every screen with its canonical `#<screenId>` hash. Navigation may use a friendly label but must not replace the canonical screen ID with an internal alias.
- Keep each route as an independent product screen. A screen bundle is navigation, not a dashboard that merges their panels.
- Connect in-scope navigation targets. Mark out-of-scope targets without fabricating their destination.
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
  "workflow": { "id": "spec-to-demo", "version": "0.4.0" },
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
- Forms require editable state, validation and submit feedback.
- Execution actions require confirmation, running and terminal states.
- Follow the desktop, tablet, mobile and keyboard requirements in `DESIGN.md`.

## 6. Builder completion boundary

The registered `verify-release` node owns Playwright and release acceptance outside the builder sandbox. The `build-demo` node must not read, inspect, modify or execute `scripts/verify-spec-to-demo-run.mjs`, `scripts/demo-layout-qa-lib.mjs`, Playwright, localhost servers or previous verifier logs. Do not spend model work reverse-engineering acceptance implementation.

Before finishing, the builder must perform these local artifact checks, which require no network or browser:

- `node --check` for `app.js`
- JSON parse for `manifest.json`
- confirm the four required files exist in the output directory
- run `node scripts/check-spec-to-demo-artifact.mjs` with the existing `AAWP_INPUT_PATH` and `AAWP_EXECUTION_DIR`; fix every reported canonical screen-ID/hash route, exact source-copy, visible authoring-label or public static design-contract failure and run it again until it passes

Return after writing the artifact. Do not attempt browser repair inside `build-demo`.

## 7. Runtime verification and bounded repair

After the builder returns, the runtime owns this fixed sequence:

1. `inspect-release` runs the independent verifier and writes a hidden structured finding report. A product finding is evidence, not a process crash.
2. `repair-demo` is a no-op when the initial report passed. When blocking findings exist, it may run exactly one model repair round and may write only `app.js`, `index.html` and `styles.css` inside the current candidate.
3. The repair must preserve `manifest.json`, source copy, screen set, canonical routes and behavior outside named findings. It may not read another run or verifier implementation.
4. `verify-release` runs the independent verifier again. Any remaining blocking finding fails the run; there is no second repair or full regeneration fallback.

All shell commands must follow repository `AGENTS.md`.
