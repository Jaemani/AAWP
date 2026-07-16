import { expect, it } from "vitest";
// @ts-expect-error -- the artifact checker is an ESM JavaScript script.
import {
  findMissingCanonicalHashRoutes,
  findMissingSourceCopy,
  findForbiddenVisibleAuthoringLabels,
  findUnbackedPeriodCopy,
  findUnregisteredScreens,
  validateSpecToDemoArtifactText
} from "./check-spec-to-demo-artifact.mjs";

const source = {
  screens: [
    {
      id: "policy",
      copy: [
        { key: "title", text: "정책 작성" },
        { key: "officialTarget", text: "공식 대상: 경기도 거주 6~18세" }
      ]
    }
  ]
};

const artifact = {
  html: '<link href="styles.css" rel="stylesheet"><script src="app.js"></script>',
  app: 'const product = "Gyeonggi Integrated Wallet"; const title = "정책 작성"; const target = "공식 대상: 경기도 거주 6~18세";',
  styles:
    ":root{--rail:#0a2540;--primary:#2368d9}.shell{grid-template-columns:240px minmax(0, 1fr)}@media (max-width:1280px){.rail{width:80px}}@media (max-width:600px){.shell{display:block}}",
  manifest: { schemaVersion: "aawp/demo-manifest/v1" },
  productName: "Gyeonggi Integrated Wallet"
};

it("accepts exact source copy in the generated application", () => {
  expect(
    findMissingSourceCopy({ source, requestedScreens: ["policy"], app: artifact.app })
  ).toEqual([]);
});

it("reports the screen, key and exact text for missing source copy", () => {
  expect(
    findMissingSourceCopy({
      source,
      requestedScreens: ["policy"],
      app: 'const title = "정책 작성"; const target = "경기도 거주 6~18세";'
    })
  ).toEqual([
    {
      screenId: "policy",
      key: "officialTarget",
      text: "공식 대상: 경기도 거주 6~18세"
    }
  ]);
});

it("reports requested screens that cannot be addressed by canonical ID", () => {
  expect(
    findUnregisteredScreens({
      app: 'const routes = { "admin-policy": policy, payout: payout };',
      requestedScreens: ["admin-policy", "admin-payout-execution"]
    })
  ).toEqual(["admin-payout-execution"]);
});

it("requires a direct canonical hash route for every requested screen", () => {
  expect(
    findMissingCanonicalHashRoutes({
      app: 'const routes = ["#admin-policy", "#payout"];',
      requestedScreens: ["admin-policy", "admin-payout-execution"]
    })
  ).toEqual(["admin-payout-execution"]);
});

it("rejects structural authoring labels only when rendered as visible text", () => {
  expect(
    findForbiddenVisibleAuthoringLabels(
      '<section data-panel-role="evidence"><h2>권한·실행 evidence</h2></section>'
    )
  ).toEqual(["evidence"]);
  expect(
    findForbiddenVisibleAuthoringLabels(
      '<section data-panel-role="evidence"><h2>권한·실행 근거</h2></section>'
    )
  ).toEqual([]);
  expect(
    findForbiddenVisibleAuthoringLabels('panel("권한·실행 evidence", "evidence", [])')
  ).toEqual(["evidence"]);
  expect(
    findForbiddenVisibleAuthoringLabels(
      'const basis = "payoutFormula=min(expense, quarterlyCap)"; const badge = "권위 행위";'
    )
  ).toEqual(["payoutformula=", "권위 행위"]);
  expect(
    findForbiddenVisibleAuthoringLabels(`
      function panel(title, body, role) {
        return \`<section data-panel-role="\${role}"><h2>\${title}</h2>\${body}</section>\`;
      }
      const screen = \`<main>
        \${panel("검토 증거", policyRows, "evidence")}
        \${panel("작성 항목", editor, "form")}
      </main>\`;
    `)
  ).toEqual([]);
});

it("rejects period-specific product records not backed by selected screen copy", () => {
  expect(
    findUnbackedPeriodCopy({
      source: {
        screens: [
          {
            id: "policy",
            copy: [{ key: "policyName", text: "2026년 3분기 경기도 청년기본소득" }]
          }
        ]
      },
      requestedScreens: ["policy"],
      requestText: "청년기본소득 정책을 보여주세요.",
      app: 'const requested = "2026년 3분기 경기도 청년기본소득"; const invented = "청소년 교통비 2026년 2분기";'
    })
  ).toEqual(["2026년 2분기"]);
});

it("checks the public static portion of the design contract", () => {
  expect(() => validateSpecToDemoArtifactText(artifact)).not.toThrow();
  expect(() =>
    validateSpecToDemoArtifactText({
      ...artifact,
      styles: artifact.styles.replace("1280px", "860px")
    })
  ).toThrow(/1280px rail-collapse breakpoint/);
  expect(() =>
    validateSpecToDemoArtifactText({
      ...artifact,
      app: 'const product = "관리 콘솔";'
    })
  ).toThrow(/canonical product identity/);
});
