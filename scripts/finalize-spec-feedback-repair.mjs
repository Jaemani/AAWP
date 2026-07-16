import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { digestWorkflow } from "../packages/ir/dist/index.js";
import { compilePreviewContracts } from "../packages/preview-contracts/dist/index.js";
import {
  compileSemanticSpecProfile,
  compileSpecFeedbackContract,
  createHeavyProductionSpecValidator,
  materializeSpecRevisionCandidate,
  verifySpecRevision
} from "../workflows/templates/spec-feedback-to-spec/dist/index.js";

const runId = process.argv[2];
if (typeof runId !== "string" || !/^run_[a-zA-Z0-9-]+$/u.test(runId)) {
  throw new Error("usage: node scripts/finalize-spec-feedback-repair.mjs <failed-run-id>");
}

const runDirectory = resolve("runs", runId, "artifacts", "spec-revision");
const [sourceCandidate, runtimeContract, normalizedFeedback] = await Promise.all([
  readFile(resolve(runDirectory, "child-spec.candidate.json"), "utf8").then(JSON.parse),
  readFile(resolve(runDirectory, "contract.json"), "utf8").then(JSON.parse),
  readFile(resolve(runDirectory, "feedback.normalized.json"), "utf8").then(JSON.parse)
]);
const baseline = await readFile(resolve(runtimeContract.source.path), "utf8").then(JSON.parse);
const feedbackIds = normalizedFeedback.items.map((item) => item.id);
const feedbackIdSet = new Set(feedbackIds);
for (const required of ["FB-POLICY-001", "FB-DEMO-001", "FB-SPEC-001"]) {
  if (!feedbackIdSet.has(required)) throw new Error(`repair fixture is missing ${required}`);
}

const originalScreenById = new Map(baseline.screens.map((screen) => [screen.id, screen]));
const document = structuredClone(sourceCandidate);
document.requirements = document.requirements.map((requirement) => ({
  ...requirement,
  sourceRefs: [
    ...new Set([
      ...(Array.isArray(requirement.sourceRefs) ? requirement.sourceRefs : []),
      ...(Array.isArray(requirement.feedbackIds) ? requirement.feedbackIds : []),
      ...(typeof requirement.source === "string" ? [requirement.source] : [])
    ])
  ]
}));
document.assumptions = document.assumptions.map((assumption) => ({
  ...assumption,
  status: String(assumption.status).startsWith("assumed") ? "assumed" : assumption.status,
  reviewOwner: assumption.reviewOwner ?? "spec-owner",
  blocks:
    Array.isArray(assumption.blocks) && assumption.blocks.length > 0
      ? assumption.blocks
      : ["preview"]
}));

const flowIds = new Set(document.flows.map((flow) => flow.id));
for (const screen of document.screens) {
  for (const action of Array.isArray(screen.actions) ? screen.actions : []) {
    if (action.targetType !== "flow" || flowIds.has(action.targetId)) continue;
    document.flows.push({
      id: action.targetId,
      status: "assumed",
      feedbackIds: Array.isArray(action.feedbackIds) ? action.feedbackIds : ["FB-SCREEN-001"],
      screens: [screen.id],
      steps: [action.label ?? `Execute ${action.id}`],
      note: "Bounded repair: the screen declared this flow target but the proposal omitted its flow record."
    });
    flowIds.add(action.targetId);
  }
}

const activeScreenIds = new Set([
  "admin-condition-builder",
  "admin-circulation-policy-composer",
  "admin-policy-list",
  "admin-roster-builder",
  "admin-approval-inbox",
  "admin-voucher-program-workspace",
  "admin-policy-approval-detail",
  "admin-payout-worklist"
]);
const seenRoutes = new Set();
for (const screen of document.screens) {
  const original = originalScreenById.get(screen.id);
  if ((typeof screen.audience !== "string" || screen.audience.length === 0) && original) {
    screen.audience = original.audience;
  }
  if (seenRoutes.has(screen.route) && original?.route) screen.route = original.route;
  seenRoutes.add(screen.route);
  if (activeScreenIds.has(screen.id)) screen.canonical = true;
}

const screenById = new Map(document.screens.map((screen) => [screen.id, screen]));
Object.assign(screenById.get("admin-policy-list"), {
  title: "정책 목록",
  copy: [
    { key: "title", text: "정책" },
    { key: "filter", text: "내 처리 필요" },
    { key: "policyName", text: "2026년 3분기 경기도 청년기본소득" },
    { key: "policyMeta", text: "경기도 청년기회과 · 29개 시군 · 정책 버전 v1" },
    { key: "openPolicy", text: "정책 상세 보기" },
    { key: "pocNote", text: "PoC 예시 데이터" },
    { key: "empty", text: "조회 가능한 정책이 없습니다" }
  ],
  dataNeeds: [
    "qry-policy-list: 정책명·사업연도·회차·담당부서·참여 시군",
    "정책 버전·신청 심사·대상 명부·지급 준비 인계 상태",
    "현재 actor의 record scope와 availableActions"
  ]
});
Object.assign(screenById.get("admin-voucher-program-workspace"), {
  title: "2026년 3분기 경기도 청년기본소득",
  copy: [
    { key: "title", text: "2026년 3분기 경기도 청년기본소득" },
    { key: "officialPolicy", text: "경기도 청년기본소득" },
    { key: "department", text: "경기도 청년기회과" },
    { key: "eligibility", text: "2001-07-02~2002-07-01 출생 · 경기도 3년 연속 또는 합산 10년" },
    { key: "participation", text: "29개 시군 참여 · 성남·고양 제외" },
    { key: "grant", text: "분기 250,000원 · 연 최대 1,000,000원" },
    { key: "application", text: "신청 2026-09-01~2026-10-02 · 잡아바 어플라이" },
    { key: "pocNote", text: "PoC 예시 30건" }
  ],
  dataNeeds: [
    "qry-policy-round-detail: 공식 정책값·정책 버전·운영 회차",
    "qry-condition-set: 연령·거주·참여 시군·증빙 조건",
    "qry-application-roster: 신청 30건·대상 후보 28명·예정 총액 7,000,000원",
    "qry-approval-detail: 정책 결재와 명부 결재를 분리한 버전 이력",
    "qry-work-items-audit-handoff: 지급 준비 인계와 감사 이력"
  ]
});
Object.assign(screenById.get("admin-roster-builder"), {
  title: "2026년 3분기 신청·대상 검토",
  copy: [
    { key: "title", text: "2026년 3분기 신청·대상 검토" },
    { key: "pocNote", text: "PoC 예시 30건" },
    { key: "firstPass", text: "1차: 정상 22 · 주의 3 · 오류 3 · 제외 2" },
    { key: "secondPass", text: "수정본: 정상 25 · 주의 3 · 오류 0 · 제외 2" },
    { key: "candidate", text: "대상 확정 후보 28명" },
    { key: "amount", text: "분기 지급 예정 총액 7,000,000원" },
    { key: "import", text: "PoC 파일 반입 - 실제 운영 방식 확인 필요" },
    { key: "submit", text: "명부 결재 상신" }
  ],
  dataNeeds: [
    "qry-application-roster: 마스킹 신청자·신청 시군·신청 원천·증빙·판정 이유",
    "명부 스냅샷 버전과 이전 버전 diff",
    "파일 반입 계약과 실제 신청 원천은 unresolved"
  ]
});

const stripNavFragments = (value) => {
  if (Array.isArray(value)) {
    value.forEach(stripNavFragments);
    return;
  }
  if (value === null || typeof value !== "object") return;
  if (typeof value.target === "string" && value.target.includes("#")) {
    value.target = value.target.split("#")[0];
  }
  Object.values(value).forEach(stripNavFragments);
};
stripNavFragments(document.navModel);

const sourceDigest = digestWorkflow(sourceCandidate);
const intent = {
  schemaVersion: "aawp/spec-feedback-intent/v1",
  sourceArtifactId: `specrev_${sourceDigest}`,
  sourceDigest,
  requestText:
    "Verified S1 findings only: normalize compatibility aliases, restore required legacy fields, resolve declared UI flow targets, and remove active transport-voucher demo residue.",
  feedback: normalizedFeedback.items.map((item) => ({ id: item.id, text: item.text })),
  authority: {
    allowedPathPrefixes: [
      "/meta",
      "/requirements",
      "/assumptions",
      "/flows",
      "/navModel",
      "/screens"
    ],
    allowRemove: false
  },
  profile: {
    id: "gyeonggi-policy-backoffice-spec/v2",
    requiredPointers: runtimeContract.revisionContract.requiredPointers
  }
};
const contract = compileSpecFeedbackContract(intent, sourceCandidate);
document.meta.revision = {
  ...document.meta.revision,
  parentArtifactId: intent.sourceArtifactId,
  parentDigest: sourceDigest,
  contractDigest: contract.digest,
  repairBaseRunId: runId,
  repairPolicy: "verified-s1-findings-only/v1",
  promotionStatus: "candidate"
};

const changedScreenIds = new Set([
  ...activeScreenIds,
  "admin-voucher-policy-setup",
  "admin-roster-approval",
  "admin-payout-execution",
  "admin-payout-result"
]);
const operations = [
  {
    operation: "replace",
    path: "/meta/revision",
    value: document.meta.revision,
    feedbackIds: ["FB-SPEC-001", "FB-SPEC-003"],
    reason: "검증된 repair parent와 candidate 상태를 기록한다."
  },
  {
    operation: "replace",
    path: "/requirements",
    value: document.requirements,
    feedbackIds: ["FB-SPEC-002", "FB-TRACE-001"],
    reason:
      "confirmed requirement의 feedback/source provenance를 canonical sourceRefs로 정규화한다."
  },
  {
    operation: "replace",
    path: "/assumptions",
    value: document.assumptions,
    feedbackIds: ["FB-SPEC-002", "FB-DEMO-001"],
    reason: "Demo 전용 가정을 assumed로 정규화하고 Preview 검토 owner와 blocker를 보존한다."
  },
  {
    operation: "replace",
    path: "/flows",
    value: document.flows,
    feedbackIds: ["FB-SCREEN-001", "FB-SCREEN-004"],
    reason: "화면에 선언됐지만 누락된 필터·유통 검토 flow record만 추가한다."
  },
  {
    operation: "replace",
    path: "/navModel",
    value: document.navModel,
    feedbackIds: ["FB-ARCH-003"],
    reason:
      "navigation target을 stable screen ID로 유지하고 section anchor는 화면 내부 상태로 분리한다."
  },
  ...document.screens.flatMap((screen, index) =>
    changedScreenIds.has(screen.id)
      ? [
          {
            operation: "replace",
            path: `/screens/${index}`,
            value: screen,
            feedbackIds: ["FB-ARCH-002", "FB-DEMO-001", "FB-POLICY-001"],
            reason: `${screen.id}의 required legacy fields, shared-resource action과 active 청년기본소득 Demo copy를 검증 finding 범위에서 교정한다.`
          }
        ]
      : []
  )
];
const proposal = { schemaVersion: "aawp/spec-patch-proposal/v1", operations };
const candidate = materializeSpecRevisionCandidate({
  sourceDocument: sourceCandidate,
  contract,
  proposal
});
const semantics = compileSemanticSpecProfile(candidate.document, "S1");
const structural = createHeavyProductionSpecValidator(baseline);
const verdict = verifySpecRevision({
  sourceDocument: sourceCandidate,
  candidate,
  contract,
  validator: (value) => [...structural(value), ...semantics.revisionFindings]
});
const childSpecJson = `${JSON.stringify(candidate.document, null, 2)}\n`;
const previewContracts = compilePreviewContracts({
  document: candidate.document,
  source: {
    artifactPath: "child-spec.candidate.json",
    byteSha256: createHash("sha256").update(childSpecJson).digest("hex"),
    canonicalDigest: candidate.contentDigest
  },
  blockers: semantics.gapReport.findings
    .filter(
      (finding) => finding.blocker !== "NON_BLOCKING_GAP" && finding.affectedStages.includes("S2")
    )
    .map((finding) => ({
      id: finding.id,
      code: finding.code,
      message: finding.message,
      pointers: finding.pointers,
      objectIds: finding.objectIds,
      sourceRefs: finding.sourceRefs,
      ...(finding.owner === undefined ? {} : { owner: finding.owner }),
      ...(finding.question === undefined ? {} : { question: finding.question })
    }))
});
const repairId = `specrepair_${createHash("sha256")
  .update(`${runId}:${candidate.contentDigest}`)
  .digest("hex")
  .slice(0, 24)}`;
const revisionsDirectory = resolve("runs", "revisions");
await mkdir(revisionsDirectory, { recursive: true });
const outputDirectory = resolve(revisionsDirectory, repairId);
await mkdir(outputDirectory, { recursive: false });
const summary = {
  schemaVersion: "aawp/spec-feedback-repair-summary/v1",
  repairId,
  baseRunId: runId,
  candidateId: candidate.candidateId,
  parentDigest: candidate.parentDigest,
  childDigest: candidate.contentDigest,
  status: verdict.status,
  maturity: semantics.maturityVerdict.stages,
  gapCounts: semantics.gapReport.counts,
  traceCoverage: semantics.traceabilityReport.coverage,
  previewContractStatus: previewContracts.status,
  dataContractDigest: previewContracts.dataContract.digest,
  apiContractDigest: previewContracts.apiContract.digest,
  operationCount: operations.length
};
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
await Promise.all([
  writeFile(resolve(outputDirectory, "child-spec.candidate.json"), childSpecJson),
  writeFile(resolve(outputDirectory, "candidate-envelope.json"), json(candidate)),
  writeFile(resolve(outputDirectory, "repair-proposal.json"), json(proposal)),
  writeFile(resolve(outputDirectory, "revision-verdict.json"), json(verdict)),
  writeFile(resolve(outputDirectory, "gap-report.json"), json(semantics.gapReport)),
  writeFile(resolve(outputDirectory, "maturity-verdict.json"), json(semantics.maturityVerdict)),
  writeFile(
    resolve(outputDirectory, "traceability-report.json"),
    json(semantics.traceabilityReport)
  ),
  writeFile(resolve(outputDirectory, "data-contract.json"), json(previewContracts.dataContract)),
  writeFile(resolve(outputDirectory, "api-contract.json"), json(previewContracts.apiContract)),
  writeFile(
    resolve(outputDirectory, "preview-blocker-routing.json"),
    json(previewContracts.blockerRouting)
  ),
  writeFile(resolve(outputDirectory, "summary.json"), json(summary))
]);
process.stdout.write(json({ ...summary, outputDirectory }));
if (verdict.status !== "passed") process.exitCode = 1;
