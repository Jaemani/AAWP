<!-- headroom:rtk-instructions -->

# AAWP Agent Rules

- All future shell commands must be prefixed with `rtk`.
- Implementation, documentation, testing, and debugging default to GPT-5.5 with medium reasoning.
- "caveman" means the simplest sufficient implementation: no speculative abstraction, explicit types, and explicit errors.
- Prose documentation and final reports are written in Korean.
- Code identifiers are written in English.
- For `spec-to-demo` product UI, read repository-root `DESIGN.md` completely; it is the only visual design input and does not replace the pinned product spec.
- A `DESIGN.md` edit does not authorize a new model-backed workflow run. Run static/unit/browser checks against existing artifacts first; start a new model run only when the user explicitly requests regeneration.
- When a design cohort is explicitly regenerated, use 2–3 pinned representative screens. Do not rerun the full spec or expand the screen set for design validation.

<!-- /headroom:rtk-instructions -->
