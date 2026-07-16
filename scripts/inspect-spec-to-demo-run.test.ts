import { expect, it } from "vitest";
// @ts-expect-error -- the verifier inspection helper is an ESM JavaScript script.
import { createFindingReport, extractVerifierFailures } from "./inspect-spec-to-demo-run.mjs";

it("extracts every independent browser failure without the assertion stack", () => {
  const stderr = `AssertionError [ERR_ASSERTION]: desktop overflow\nmobile page height 2500px > 2400px\n\nfalse !== true\n    at verifier`;
  expect(extractVerifierFailures(stderr)).toEqual([
    "desktop overflow",
    "mobile page height 2500px > 2400px"
  ]);
});

it("extracts all structured browser evidence failures", () => {
  const failures = [
    { checkId: "acc-save", message: "state did not persist" },
    { checkId: "acc-approve", message: "approval action is missing" }
  ];
  expect(
    extractVerifierFailures(
      `BrowserEvidenceError: AAWP_BROWSER_FINDINGS ${JSON.stringify(failures)}\n    at verifier`
    )
  ).toEqual(["acc-save: state did not persist", "acc-approve: approval action is missing"]);
});

it("turns a failed verifier into bounded product findings", () => {
  const report = createFindingReport({
    runId: "run-a",
    workflowId: "spec-to-demo",
    exitCode: 1,
    stdout: "",
    stderr: "AssertionError [ERR_ASSERTION]: desktop overflow\n\nfalse !== true"
  });
  expect(report.status).toBe("failed");
  expect(report.findings).toEqual([
    expect.objectContaining({
      class: "product_defect",
      severity: "blocking",
      message: "desktop overflow",
      status: "open"
    })
  ]);
  expect(report.findings[0]?.allowedRepairWrites).not.toContain("artifacts/demo/manifest.json");
});

it("records a passing inspection without repair findings", () => {
  expect(
    createFindingReport({
      runId: "run-a",
      workflowId: "spec-to-demo",
      exitCode: 0,
      stdout: '{"status":"passed"}\n',
      stderr: ""
    })
  ).toMatchObject({ status: "passed", findings: [] });
});
