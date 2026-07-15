import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { digestWorkflow } from "@awf/ir";
import { format } from "prettier";

type JsonRecord = Record<string, unknown>;

const baselinePath = resolve("refined-production-spec.json");
const candidatePath = resolve(
  "examples/heavy-spec-feedback-revision/generated/refined-production-spec.role-workspaces.candidate.json"
);
const outputPath = resolve("examples/heavy-spec-role-comparison/comparison-manifest.json");

const baselineBytes = await readFile(baselinePath);
const candidateBytes = await readFile(candidatePath);
const baseline = JSON.parse(baselineBytes.toString("utf8")) as JsonRecord;
const candidate = JSON.parse(candidateBytes.toString("utf8")) as JsonRecord;

const roles = [
  {
    id: "policy",
    label: "정책 담당",
    description: "정책 검토와 바우처 정책 설정",
    baseline: ["admin-policy-list", "admin-voucher-policy-setup"],
    candidate: ["admin-policy-list", "admin-voucher-program-detail"]
  },
  {
    id: "roster",
    label: "사업·명부 담당",
    description: "명부 업로드, 검증과 확정 상신",
    baseline: ["admin-roster-builder", "admin-roster-approval"],
    candidate: ["admin-roster-work-list", "admin-roster-builder"]
  },
  {
    id: "approval",
    label: "결재 담당",
    description: "정책 결재와 명부 결재를 분리해 처리",
    baseline: ["admin-approval-inbox", "admin-roster-approval"],
    candidate: ["admin-approval-inbox", "admin-policy-approval-detail"]
  },
  {
    id: "payout",
    label: "지급 담당",
    description: "준비상태 확인, 지급 실행과 실패 대상 재처리",
    baseline: [],
    baselineGap: "원본 spec에는 지급 담당자 전용 업무 화면이 정의되어 있지 않습니다.",
    candidate: ["admin-payout-work-list", "admin-payout-execution-detail"]
  },
  {
    id: "issuance",
    label: "발행 담당",
    description: "발행 계획 작성과 승인·서명 전 인계",
    baseline: ["admin-issuance-plans", "admin-issuance-plan"],
    candidate: ["admin-issuance-plans", "admin-issuance-plan"]
  },
  {
    id: "settlement",
    label: "정산 담당",
    description: "정산 현황과 예외 업무 확인",
    baseline: ["admin-settlement-dashboard", "admin-settlement-exception"],
    candidate: ["admin-settlement-dashboard", "admin-settlement-exception"]
  },
  {
    id: "audit",
    label: "감사 담당",
    description: "관리 활동과 감사 기록 조회",
    baseline: ["admin-audit-log"],
    candidate: ["admin-audit-log"]
  },
  {
    id: "access",
    label: "계정·권한 담당",
    description: "계정 상태와 역할·관할 관리",
    baseline: ["admin-account-management", "admin-role-grant"],
    candidate: ["admin-account-management", "admin-role-grant"]
  }
] as const;

function screens(document: JsonRecord): JsonRecord[] {
  if (!Array.isArray(document.screens)) throw new Error("spec screens must be an array");
  return document.screens as JsonRecord[];
}

function projectScreens(document: JsonRecord, ids: string[]): JsonRecord[] {
  const source = screens(document);
  return ids.map((id) => {
    const index = source.findIndex((screen) => screen.id === id);
    if (index < 0) throw new Error(`screen ${id} is missing`);
    const screen = source[index]!;
    return {
      sourcePointer: `/screens/${index}`,
      id: screen.id,
      route: screen.route,
      surface: screen.surface,
      title: screen.title,
      audience: screen.audience,
      layout: screen.layout,
      components: screen.components,
      states: screen.states,
      copy: screen.copy,
      dataNeeds: screen.dataNeeds
    };
  });
}

const baselineIds = [...new Set(roles.flatMap((role) => role.baseline))];
const candidateIds = [...new Set(roles.flatMap((role) => role.candidate))];
const candidateRevision = (candidate.meta as JsonRecord | undefined)?.revision as
  JsonRecord | undefined;
const manifestBody = {
  schemaVersion: "aawp/spec-role-comparison/v1",
  requestText: "원본 spec과 담당자별 피드백 candidate를 역할별 1–2화면으로 비교",
  versions: [
    {
      id: "baseline",
      label: "기존 spec",
      status: "source",
      sourcePath: "refined-production-spec.json",
      byteSha256: createHash("sha256").update(baselineBytes).digest("hex"),
      contentDigest: digestWorkflow(baseline)
    },
    {
      id: "candidate",
      label: "담당자별 candidate",
      status: candidateRevision?.status ?? "candidate",
      sourcePath:
        "examples/heavy-spec-feedback-revision/generated/refined-production-spec.role-workspaces.candidate.json",
      contentDigest: digestWorkflow(candidate),
      parentDigest: candidateRevision?.parentDigest,
      contractDigest: candidateRevision?.contractDigest,
      executionInput: candidateRevision?.executionInput
    }
  ],
  roles: roles.map((role) => ({
    id: role.id,
    label: role.label,
    description: role.description,
    versions: {
      baseline: {
        screenIds: [...role.baseline],
        ...(role.id === "payout" ? { gap: role.baselineGap } : {})
      },
      candidate: { screenIds: [...role.candidate] }
    }
  })),
  screens: {
    baseline: projectScreens(baseline, baselineIds),
    candidate: projectScreens(candidate, candidateIds)
  }
};
const manifest = { ...manifestBody, digest: digestWorkflow(manifestBody) };

await mkdir(resolve("examples/heavy-spec-role-comparison"), { recursive: true });
await writeFile(
  outputPath,
  await format(JSON.stringify(manifest), {
    parser: "json",
    printWidth: 100,
    singleQuote: false,
    trailingComma: "none"
  })
);
console.log(
  JSON.stringify({
    outputPath,
    digest: manifest.digest,
    versions: manifest.versions.map((version) => version.id),
    roles: manifest.roles.length,
    screens: {
      baseline: manifest.screens.baseline.length,
      candidate: manifest.screens.candidate.length
    }
  })
);
