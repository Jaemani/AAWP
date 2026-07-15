# spec-to-demo execution contract

- Status: executable
- Workflow version: 0.3.0
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
- Build exactly that set—no missing screen and no unrequested screen.
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
  "workflow": { "id": "spec-to-demo", "version": "0.3.0" },
  "sourceSpec": { "path": "...", "byteSha256": "..." },
  "designContract": {
    "path": "DESIGN.md",
    "version": "1.1.0",
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
- Product navigation and primary CTA must work for targets inside the selected set.
- Forms require editable state, validation and submit feedback.
- Execution actions require confirmation, running and terminal states.
- Follow the desktop, tablet, mobile and keyboard requirements in `DESIGN.md`.

## 6. Verification and completion

Run:

```bash
rtk node scripts/verify-spec-to-demo-run.mjs
```

The verifier owns release acceptance. Do not modify it from inside a run. Finish only after it passes. All shell commands must follow repository `AGENTS.md`.
