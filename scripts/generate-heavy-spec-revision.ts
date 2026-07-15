import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { format } from "prettier";
import {
  compileSpecFeedbackContract,
  createHeavyProductionSpecValidator,
  materializeSpecRevisionCandidate,
  parseSpecFeedbackIntent,
  verifySpecRevision,
  type SpecPatchOperation,
  type SpecRevisionFinding
} from "../workflows/templates/spec-feedback-to-spec/src/index.js";

type JsonRecord = Record<string, unknown>;

const sourcePath = resolve("refined-production-spec.json");
const intentPath = resolve("examples/heavy-spec-feedback-revision/feedback-intent.json");
const outputDirectory = resolve("examples/heavy-spec-feedback-revision/generated");
const source = JSON.parse(await readFile(sourcePath, "utf8")) as JsonRecord;
const intent = parseSpecFeedbackIntent(JSON.parse(await readFile(intentPath, "utf8")));
const contract = compileSpecFeedbackContract(intent, source);
const screens = source.screens as JsonRecord[];
const actors = source.actors as JsonRecord[];
const components = source.components as JsonRecord[];
const interactions = source.interactionModel as JsonRecord[];
const mockData = source.mockData as JsonRecord[];
const stateModel = source.stateModel as { slices: JsonRecord[] };
const operations: SpecPatchOperation[] = [];

const standardStates = [
  ["default", "현재 역할과 업무 상태에 맞는 기본 화면을 표시한다."],
  ["loading", "업무 데이터와 권한을 불러오며 진행 상태를 보조기기에 알린다."],
  ["empty", "처리할 업무가 없을 때 이유와 다음 확인 경로를 안내한다."],
  ["error", "오류 원인과 수정 방법 또는 재시도 경로를 텍스트로 안내한다."],
  ["unauthorized", "접근할 수 없는 이유와 권한 요청 경로를 안내한다."],
  ["read-only", "현재 역할이 조회만 가능함을 표시하고 편집 행동을 숨긴다."],
  ["success", "처리 결과, 다음 담당자와 인계된 업무를 표시한다."]
].map(([state, description]) => ({ state, description }));

function addOperation(input: {
  operation: "add" | "replace";
  path: string;
  value: unknown;
  feedbackIds: string[];
  reason: string;
}): void {
  operations.push({ ...input });
}

function indexBy(items: JsonRecord[], key: string, value: string): number {
  const index = items.findIndex((item) => item[key] === value);
  if (index < 0) throw new Error(`missing ${key} ${value}`);
  return index;
}

function copy(text: Record<string, string>): Array<{ key: string; text: string }> {
  return Object.entries(text).map(([key, value]) => ({ key, text: value }));
}

function replaceScreen(
  id: string,
  value: Partial<JsonRecord>,
  feedbackIds: string[],
  reason: string
): void {
  const index = indexBy(screens, "id", id);
  addOperation({
    operation: "replace",
    path: `/screens/${index}`,
    value: { ...screens[index], ...value },
    feedbackIds,
    reason
  });
}

let nextScreenIndex = screens.length;
function addScreen(value: JsonRecord, feedbackIds: string[], reason: string): void {
  addOperation({
    operation: "add",
    path: `/screens/${nextScreenIndex}`,
    value,
    feedbackIds,
    reason
  });
  nextScreenIndex += 1;
}

function screen(input: {
  id: string;
  route: string;
  surface: string;
  title: string;
  purpose: string;
  audience: string;
  actors: string[];
  layout: string;
  components: string[];
  copy: Record<string, string>;
  dataNeeds: string[];
}): JsonRecord {
  return { ...input, states: standardStates, copy: copy(input.copy) };
}

const adminCommonComponents = [
  "ConsoleNavRail",
  "SessionActorBadge",
  "AuthorityScopeBadge",
  "AccessibleStatusRow"
];
const issuerCommonComponents = [
  "IssuerConsoleNavRail",
  "SessionActorBadge",
  "AuthorityScopeBadge",
  "AccessibleStatusRow"
];

replaceScreen(
  "admin-auth",
  {
    title: "관리 업무 로그인",
    purpose:
      "행정 SSO 또는 공동인증서로 먼저 인증한 뒤 접근 가능한 업무영역을 조회한다. 단일 업무영역이면 시작 화면으로 바로 이동하고 여러 업무영역이면 선택 화면으로 이동한다.",
    audience: "관리·발행·정산·감사·권한 업무 사용자",
    actors: [
      "act-superadmin",
      "act-issuer-principal",
      "act-policy-operator",
      "act-policy-approver",
      "act-program-roster-operator",
      "act-roster-approver",
      "act-payout-operator",
      "act-issuance-manager",
      "act-issue-approver",
      "act-master-minter",
      "act-settlement-operator",
      "act-auditor"
    ],
    layout:
      "콘솔 선택 없는 단일 인증 카드, 인증 수단, 관할 안내, 인증 진행상태와 접근 실패 복구 경로",
    components: ["AdminAuthPanel", "AsyncStatusTracker", ...adminCommonComponents.slice(1)],
    states: standardStates,
    copy: copy({
      title: "관리 업무에 로그인",
      submit: "인증하기",
      checking: "접근 가능한 업무를 확인하고 있습니다",
      noAccess: "현재 계정에 연결된 업무영역이 없습니다",
      requestAccess: "권한 요청 방법 보기"
    }),
    dataNeeds: [
      "인증 수단과 step-up 결과",
      "한글 업무영역명, 관할, 처리할 업무 수가 포함된 availableWorkAreas[]",
      "singleWorkAreaStartScreenId",
      "권한 없음 사유와 accessRequestRoute",
      "인증 전에는 admin 또는 issuer consoleSurface를 사용자에게 선택시키지 않는다"
    ]
  },
  ["role-workspace-001", "authority-boundary-001", "human-copy-001"],
  "콘솔 선택보다 인증을 먼저 수행하고 인증 결과로 업무영역을 결정한다."
);

replaceScreen(
  "admin-policy-list",
  {
    title: "내 정책 업무",
    purpose:
      "정책 담당자가 보완 요청, 기한 임박과 내 처리 필요 바우처 사업을 우선순위로 찾고 사업 업무 상세로 진입한다.",
    audience: "정책 담당자",
    actors: ["act-policy-operator", "act-policy-approver", "act-auditor"],
    layout:
      "현재 업무영역 header, 내 처리 필요·보완 요청·결재 진행 tab, 업무 요약 지표, 사업 중심 queue table",
    components: ["WorkAreaSwitcher", "WorkQueueTable", ...adminCommonComponents],
    states: standardStates,
    copy: copy({
      title: "내 정책 업무",
      createVoucher: "새 바우처 사업",
      dueSoon: "처리기한이 가까운 업무",
      openProgram: "사업 업무 보기",
      empty: "지금 처리할 정책 업무가 없습니다"
    }),
    dataNeeds: [
      "사업연도, 정책명, 담당부서와 대상 요약",
      "예상 대상 수와 지급 예정 총액",
      "현재 업무상태와 결재상태",
      "명부·지급 준비 요약, 처리기한과 다음 행동",
      "현재 역할에 허용된 primaryAction"
    ]
  },
  ["policy-work-001", "human-copy-001", "role-workspace-002"],
  "기능별 정책 분류표를 정책 담당자의 개인 업무 queue로 전환한다."
);

replaceScreen(
  "admin-voucher-policy-setup",
  {
    title: "바우처 정책 작성·보완",
    purpose:
      "한 바우처 사업의 기본정보와 근거, 대상과 지급, 사용 조건, 운영 일정과 재원, 검토와 결재를 한 페이지의 명확한 구역으로 작성한다.",
    audience: "정책 담당자",
    actors: ["act-policy-operator", "act-policy-approver", "act-auditor"],
    layout:
      "사업 문맥 header, 5개 편집 section, 오류·주의 검토 panel, 임시저장·검토하기·결재 상신 action bar",
    components: [
      "VoucherPolicySetupPanel",
      "VoucherProgramContextHeader",
      "ResponsibilityGatePanel",
      "HumanReadableTechnicalDisclosure",
      ...adminCommonComponents
    ],
    states: standardStates,
    copy: copy({
      title: "바우처 정책 작성·보완",
      draftName: "청년 지역화폐 지급 바우처 (가칭)",
      assumption: "정책 시나리오 확인 필요",
      saveDraft: "임시저장",
      review: "검토하기",
      submitApproval: "결재 상신"
    }),
    dataNeeds: [
      "사업 목적, 행정·법적 근거, 문서번호와 첨부",
      "사람이 읽는 대상 조건, 1인 지급액, 예상 대상 수와 총액",
      "시행기간, 사용 지역·업종·기간, 종료 시 잔액 처리 원칙",
      "재원 근거, 유통 단위와 발행 검토 필요 여부",
      "필수 누락·조건 충돌·총액 불일치 오류와 재원·발행 주의",
      "실제 연령·금액·일정은 확인 전 확정하지 않는다"
    ]
  },
  ["policy-work-001", "voucher-hub-001", "scenario-assumption-001"],
  "고정 9단계 마법사를 사업 문맥 안의 5개 편집 구역과 명시적 행동으로 바꾼다."
);

replaceScreen(
  "admin-roster-builder",
  {
    title: "명부 업로드·검증",
    purpose:
      "승인된 정책과 회차를 읽고 명부 파일을 업로드해 파일 오류와 행 오류를 구분하고, 수정본 재업로드와 버전 비교 뒤 명부 결재를 상신한다.",
    audience: "사업·명부 담당자",
    actors: ["act-program-roster-operator", "act-roster-approver", "act-auditor"],
    layout:
      "사업 문맥 header, upload dropzone, 검증 진행상태, 정상·주의·오류·제외 집계, 오류 table, version comparison",
    components: [
      "RosterBuilderPanel",
      "RosterValidationWorkbench",
      "VoucherProgramContextHeader",
      ...adminCommonComponents
    ],
    states: standardStates,
    copy: copy({
      title: "명부 업로드·검증",
      upload: "원본 명부 파일 선택",
      downloadErrors: "오류 목록 다운로드",
      reupload: "수정본 재업로드",
      compareVersion: "명부 버전 비교",
      submit: "명부 확정 상신"
    }),
    dataNeeds: [
      "정책명·버전, 사업 회차와 명부 기준일",
      "파일 전송 상태와 파일 형식 오류",
      "행 번호, 오류 사유와 수정 방법",
      "전체·정상·주의·오류·제외 건수",
      "확정 대상 수와 지급 총액, 명부 version diff"
    ]
  },
  ["roster-work-001", "accessibility-001"],
  "기존 운영계획형 화면을 같은 사업에서 진입하는 명부 upload/validation workbench로 전환한다."
);

replaceScreen(
  "admin-roster-approval",
  {
    title: "명부 결재 상세",
    purpose:
      "결재자가 정책 조건과 명부 집계를 읽고 이전 버전과 달라진 건을 비교해 보완·반려·승인을 판단하며 명부 행을 직접 수정하지 않는다.",
    audience: "명부 결재자",
    actors: ["act-roster-approver", "act-auditor"],
    layout:
      "사업·회차 context, 제출자와 처리기한, 집계 snapshot, version diff, 검증 경고, read-only 결재 action",
    components: [
      "RosterApprovalTable",
      "ApprovalComparisonPanel",
      "ResponsibilityGatePanel",
      ...adminCommonComponents
    ],
    states: standardStates,
    copy: copy({
      title: "명부 결재 상세",
      requestRevision: "보완 요청",
      reject: "반려",
      approve: "명부 승인",
      immutableNotice: "제출된 명부는 이 화면에서 수정할 수 없습니다"
    }),
    dataNeeds: [
      "정책명과 버전, 회차, 명부 기준일과 version",
      "원본 파일과 제출자, 전체·정상·주의·오류·제외 건수",
      "확정 대상 수와 총 지급액, 이전 version diff",
      "명부 승인 결과는 지급 준비상태만 만들고 지급을 시작하지 않는다"
    ]
  },
  ["roster-work-001", "approval-separation-001"],
  "명부 작성과 결재를 분리하고 승인 후 자동 지급을 금지한다."
);

replaceScreen(
  "admin-approval-inbox",
  {
    title: "내 결재함",
    purpose:
      "현재 결재 업무영역과 역할에 해당하는 승인 대기, 내가 처리한 결재, 보완 후 재상신과 완료 건을 분리해 보여준다.",
    audience: "정책·명부 결재자와 기안자",
    actors: ["act-policy-operator", "act-policy-approver", "act-roster-approver", "act-auditor"],
    layout:
      "업무영역 header, 승인 대기·처리 완료 tab, 기한·사업·결재 유형 filter와 role-scoped inbox table",
    components: [
      "ApprovalInboxTable",
      "WorkAreaSwitcher",
      "WorkQueueTable",
      ...adminCommonComponents
    ],
    states: standardStates,
    copy: copy({
      title: "내 결재함",
      pending: "승인 대기",
      processed: "내가 처리한 결재",
      resubmitted: "보완 후 재상신",
      empty: "현재 업무영역에 대기 중인 결재가 없습니다"
    }),
    dataNeeds: [
      "현재 workAreaId와 approval responsibility",
      "사업연도, 담당부서, 기안자와 처리기한",
      "정책 결재 또는 명부 결재 유형",
      "보완 요청, 반려와 승인 이력"
    ]
  },
  ["role-workspace-002", "approval-separation-001"],
  "모든 결재를 섞지 않고 현재 역할에 맞는 결재 queue를 기본 표시한다."
);

replaceScreen(
  "admin-issuance-plans",
  {
    title: "발행 필요 정책",
    purpose:
      "승인된 정책과 지급 수요를 읽어 신규 발행 필요성을 검토하는 발행 계획 담당자의 시작 화면이며 정책 작성 행동을 제공하지 않는다.",
    audience: "발행 계획 담당자",
    actors: ["act-issuance-manager", "act-issue-approver", "act-issuer-auditor"],
    layout:
      "발행 업무영역 header, 검토 필요·승인 진행·발행 내역 tab, 행정 문맥과 지급 일정 중심 table",
    components: [
      "IssuancePlanTable",
      "WorkAreaSwitcher",
      "WorkQueueTable",
      ...issuerCommonComponents
    ],
    states: standardStates,
    copy: copy({
      title: "발행 필요 정책",
      createPlan: "발행 계획 작성",
      noPolicyCreation: "정책 작성은 관리 콘솔의 정책 업무에서 수행합니다",
      empty: "신규 발행을 검토할 정책이 없습니다"
    }),
    dataNeeds: [
      "정책명, 담당 지자체와 부서, 정책 승인일",
      "시행기간과 지급 예정일, 대상 수와 지급 총액",
      "명부 준비상태, 기존 발행물량과 신규 발행 필요량",
      "정책 field는 read-only"
    ]
  },
  ["issuance-work-001", "authority-boundary-001"],
  "발행사 콘솔에서 새 정책 수립을 제거하고 발행 필요 정책을 시작 queue로 만든다."
);

replaceScreen(
  "admin-issuance-plan",
  {
    title: "발행 계획 작성·승인",
    purpose:
      "작성 상태에서는 발행 계획 담당자가 계획을 작성하고, 승인 상태에서는 발행 승인자가 정책 근거와 수요·준비자산을 읽고 승인 또는 반려만 수행한다.",
    audience: "발행 계획 담당자·발행 승인자",
    actors: ["act-issuance-manager", "act-issue-approver", "act-issuer-auditor"],
    layout:
      "행정 문맥 summary, 발행량과 준비자산 readiness, 작성 또는 read-only approval mode, 변경 비교와 결재 action",
    components: [
      "IssuancePlanTable",
      "ApprovalComparisonPanel",
      "ResponsibilityGatePanel",
      ...issuerCommonComponents
    ],
    states: standardStates,
    copy: copy({
      title: "발행 계획 작성·승인",
      submit: "발행 결재 상신",
      approve: "발행 승인",
      reject: "발행 반려",
      immutableNotice: "승인 상태에서는 계획 본문을 수정할 수 없습니다"
    }),
    dataNeeds: [
      "정책 근거, 대상 수, 지급 총액과 시행일",
      "발행 필요량, 기존 물량과 준비자산 상태",
      "작성자와 승인자의 currentResponsibility",
      "발행 승인 뒤 상태는 final-signature-pending이며 자동 서명하지 않는다"
    ]
  },
  ["issuance-work-001", "approval-separation-001"],
  "발행 계획 작성과 승인을 mode와 권한으로 분리한다."
);

replaceScreen(
  "admin-issuance-execute",
  {
    title: "서명 완료 발행 실행",
    purpose:
      "발행 승인과 최종 서명이 모두 완료된 계획만 멱등 실행하며 승인 또는 서명 행동을 이 화면에 합치지 않는다.",
    audience: "발행 실행 담당자",
    actors: ["act-issuance-manager", "act-master-minter", "act-issuer-auditor"],
    layout: "승인·서명·준비상태 checklist, 실행 대상 summary, idempotency 상태와 실행 결과",
    components: ["IssuanceExecutionPanel", "ResponsibilityGatePanel", ...issuerCommonComponents],
    states: standardStates,
    copy: copy({
      title: "서명 완료 발행 실행",
      execute: "서명된 계획 발행하기",
      blocked: "최종 서명이 완료되어야 발행할 수 있습니다",
      result: "발행 결과 보기"
    }),
    dataNeeds: [
      "issuanceApprovalStatus=approved",
      "finalSignatureStatus=signed",
      "준비자산과 발행 한도 readiness",
      "idempotencyKey와 ledger result"
    ]
  },
  ["issuance-work-001", "approval-separation-001"],
  "최종 서명 이후의 실행만 소유하게 해 승인·서명·실행을 분리한다."
);

replaceScreen(
  "admin-role-grant",
  {
    title: "역할·관할 관리",
    purpose:
      "내부 role code보다 한글 업무영역, 실제 가능한 업무와 관할을 먼저 보여주며 정책 생성 행동을 노출하지 않는다.",
    audience: "계정·권한 관리자",
    actors: ["act-superadmin", "act-auditor"],
    layout:
      "사용자 검색, 한글 업무영역 카드, 관할과 가능 업무 preview, 결재가 필요한 권한 변경 action",
    components: [
      "RoleGrantPanel",
      "WorkAreaSwitcher",
      "HumanReadableTechnicalDisclosure",
      ...adminCommonComponents
    ],
    states: standardStates,
    copy: copy({
      title: "역할·관할 관리",
      grant: "업무 권한 부여 요청",
      revoke: "업무 권한 회수 요청",
      technical: "기술정보 보기"
    }),
    dataNeeds: [
      "한글 업무영역명과 관할",
      "해당 영역에서 실제 가능한 업무 목록",
      "권한 변경 결재상태와 접근 이력",
      "role code와 grantedBy root는 기술정보에서만 표시"
    ]
  },
  ["role-workspace-002", "human-copy-001", "authority-boundary-001"],
  "권한 코드를 업무 문맥으로 투영하되 authority root는 내부 계약으로 보존한다."
);

const newScreens: JsonRecord[] = [
  screen({
    id: "admin-work-area-choice",
    route: "/admin/work-areas",
    surface: "관리·발행 공통 진입(웹)",
    title: "업무영역 선택",
    purpose:
      "인증된 사용자가 여러 역할을 가질 때 현재 처리할 업무영역 하나를 선택하고 해당 시작 화면과 역할별 메뉴로 진입한다.",
    audience: "복수 업무영역 권한 사용자",
    actors: [
      "act-policy-operator",
      "act-policy-approver",
      "act-program-roster-operator",
      "act-roster-approver",
      "act-payout-operator",
      "act-issuance-manager",
      "act-issue-approver",
      "act-master-minter",
      "act-settlement-operator",
      "act-auditor",
      "act-superadmin"
    ],
    layout: "현재 사용자와 관할 header, 처리할 건수·기한 초과·최근 사업이 있는 업무영역 카드 grid",
    components: ["WorkAreaSwitcher", "WorkAreaCard", "SessionActorBadge", "AccessibleStatusRow"],
    copy: {
      title: "어떤 업무를 처리하시겠어요?",
      switch: "이 업무영역으로 이동",
      overdue: "기한이 지난 업무",
      recent: "최근 처리한 사업"
    },
    dataNeeds: [
      "availableWorkAreas[]",
      "pendingCount",
      "overdueCount",
      "lastProgram",
      "startScreenId"
    ]
  }),
  screen({
    id: "admin-voucher-program-detail",
    route: "/admin/voucher-programs/:programId",
    surface: "관리 콘솔(웹)",
    title: "바우처 사업 업무 상세",
    purpose:
      "정책·명부·결재·지급·발행 결과를 같은 사업 문맥에서 보여주고 현재 역할이 책임지는 구역과 다음 행동만 편집 가능하게 하는 업무 허브다.",
    audience: "바우처 사업 관련 모든 담당자",
    actors: [
      "act-policy-operator",
      "act-policy-approver",
      "act-program-roster-operator",
      "act-roster-approver",
      "act-payout-operator",
      "act-issuance-manager",
      "act-issue-approver",
      "act-master-minter",
      "act-auditor"
    ],
    layout:
      "sticky 사업 문맥 header, 정책·명부·재원·결재·지급·최근 활동 section, 역할별 responsibility gate와 detail deeplink",
    components: [
      "VoucherProgramContextHeader",
      "VoucherProgramStatusBoard",
      "ResponsibilityGatePanel",
      "ApprovalChainStepper",
      "ActivityTimeline",
      ...adminCommonComponents
    ],
    copy: {
      title: "바우처 사업 업무 상세",
      assumption: "정책 시나리오 확인 필요",
      nextAction: "내가 해야 할 다음 업무",
      technical: "감사정보 보기"
    },
    dataNeeds: [
      "정책·명부·지급·발행의 분리된 status projection",
      "현재 역할과 editableSections[]",
      "사업연도, 부서, 회차, 기간, 처리기한",
      "대상·총액·재원·유통 단위·발행 준비",
      "담당자 이름·역할·부서·시각·결과가 있는 activity timeline"
    ]
  }),
  screen({
    id: "admin-policy-approval-detail",
    route: "/admin/approvals/policies/:requestId",
    surface: "관리 콘솔(웹)",
    title: "정책 결재 상세",
    purpose:
      "정책 결재자가 현재 제출안, 이전 버전, 근거·첨부, 대상 수·총액과 검증 결과를 읽고 보완·반려·승인을 판단한다.",
    audience: "정책 결재자",
    actors: ["act-policy-approver", "act-auditor"],
    layout:
      "사업 context, 결재 metadata, current/previous diff, 근거·첨부, 오류·주의, read-only approval actions",
    components: [
      "ApprovalComparisonPanel",
      "ResponsibilityGatePanel",
      "ApprovalChainStepper",
      ...adminCommonComponents
    ],
    copy: {
      title: "정책 결재 상세",
      requestRevision: "보완 요청",
      reject: "반려",
      approve: "정책 승인",
      immutableNotice: "제출안은 결재 화면에서 수정할 수 없습니다"
    },
    dataNeeds: [
      "사업연도·부서·기안자·기한",
      "근거와 첨부",
      "version diff",
      "대상 수·총액 snapshot",
      "검증 warning"
    ]
  }),
  screen({
    id: "admin-roster-work-list",
    route: "/admin/roster/tasks",
    surface: "관리 콘솔(웹)",
    title: "내 명부·지급 준비 업무",
    purpose:
      "사업·명부 담당자가 승인된 정책에서 생성된 회차별 명부 작업과 보완·오류 업무를 우선순위로 찾는다.",
    audience: "사업·명부 담당자",
    actors: ["act-program-roster-operator", "act-roster-approver", "act-auditor"],
    layout: "업무영역 header, 내 업무·대상 명부·지급 준비·보완 오류 tab, 회차별 work queue",
    components: [
      "WorkAreaSwitcher",
      "WorkQueueTable",
      "VoucherProgramContextHeader",
      ...adminCommonComponents
    ],
    copy: {
      title: "내 명부·지급 준비 업무",
      start: "명부 작업 시작",
      fix: "오류 처리",
      empty: "처리할 명부 업무가 없습니다"
    },
    dataNeeds: [
      "정책명과 version",
      "사업 회차·기준일",
      "명부 상태",
      "오류 수",
      "처리기한과 다음 행동"
    ]
  }),
  screen({
    id: "admin-payout-work-list",
    route: "/admin/payouts/tasks",
    surface: "관리 콘솔(웹)",
    title: "지급 실행 대기",
    purpose:
      "지급 담당자가 실행 대기, 준비 미완료, 처리 중, 일부 실패와 완료 업무를 우선순위로 찾는다.",
    audience: "지급 실행 담당자",
    actors: ["act-payout-operator", "act-auditor"],
    layout:
      "업무영역 header, 실행 대기·처리 중·일부 실패·완료 tab, readiness와 blocking owner가 있는 queue",
    components: [
      "WorkAreaSwitcher",
      "WorkQueueTable",
      "PayoutReadinessChecklist",
      ...adminCommonComponents
    ],
    copy: {
      title: "지급 실행 대기",
      open: "지급 준비 확인",
      blocked: "차단 사유 보기",
      retry: "실패 건 확인"
    },
    dataNeeds: [
      "정책·명부 승인 상태",
      "재원·유통 단위·발행 준비",
      "지급 예정일",
      "blocking reason과 해결 업무영역"
    ]
  }),
  screen({
    id: "admin-payout-execution-detail",
    route: "/admin/payouts/tasks/:taskId/execute",
    surface: "관리 콘솔(웹)",
    title: "지급 준비·실행",
    purpose:
      "정책·명부·재원·발행 준비를 재확인하고 중복 실행을 검사한 뒤 지급 담당자가 재인증해 수동으로 지급을 시작한다.",
    audience: "지급 실행 담당자",
    actors: ["act-payout-operator", "act-auditor"],
    layout:
      "readiness checklist, 정책·회차·명부 version·대상 수·총액 summary, 재인증 dialog와 idempotent start action",
    components: [
      "PayoutReadinessChecklist",
      "ResponsibilityGatePanel",
      "StepUpAuthPanel",
      ...adminCommonComponents
    ],
    copy: {
      title: "지급 준비·실행",
      check: "지급 준비 확인",
      start: "지급 시작",
      blocked: "아직 지급을 시작할 수 없습니다",
      reauth: "재인증 후 시작"
    },
    dataNeeds: [
      "policyVersion",
      "rosterVersion",
      "recipientCount",
      "totalAmount",
      "duplicateExecutionCheck",
      "readiness gates",
      "stepUp result"
    ]
  }),
  screen({
    id: "admin-payout-progress",
    route: "/admin/payouts/tasks/:taskId/progress",
    surface: "관리 콘솔(웹)",
    title: "지급 진행·결과",
    purpose:
      "대기·검증 중·지급 중·완료·보류·실패 결과를 보여주고 부분 실패 시 실패 대상만 재처리한다.",
    audience: "지급 실행 담당자·감사 담당자",
    actors: ["act-payout-operator", "act-auditor"],
    layout:
      "진행률과 상태 summary, 성공·보류·실패 집계, 사람이 읽는 실패 원인 table, 실패 대상 재처리와 audit timeline",
    components: [
      "PayoutProgressMonitor",
      "ActivityTimeline",
      "ResponsibilityGatePanel",
      ...adminCommonComponents
    ],
    copy: {
      title: "지급 진행·결과",
      retryFailed: "실패 건 재처리",
      result: "지급 결과",
      noOverwrite: "완료 수치는 직접 수정할 수 없습니다"
    },
    dataNeeds: [
      "payoutJob status",
      "성공·보류·실패 count",
      "실패 사유와 retryable",
      "failedRecipientIds only",
      "wallet projection result",
      "audit events"
    ]
  }),
  screen({
    id: "admin-issuance-final-signature",
    route: "/admin/issuance/plans/:planId/sign",
    surface: "발행사 콘솔(웹)",
    title: "발행 최종 서명",
    purpose:
      "발행 승인 완료 계획만 조회해 발행량·유통 단위·승인 이력과 준비상태를 확인하고 재인증과 다중서명을 수행한다.",
    audience: "최종 서명자",
    actors: ["act-master-minter", "act-issuer-auditor"],
    layout:
      "승인 완료 context, 발행량·유통 단위·준비상태 summary, signer quorum, 재인증과 다중서명 결과",
    components: [
      "FinalSignaturePanel",
      "StepUpAuthPanel",
      "ResponsibilityGatePanel",
      ...issuerCommonComponents
    ],
    copy: {
      title: "발행 최종 서명",
      reauth: "서명자 재인증",
      sign: "최종 서명",
      waiting: "추가 서명을 기다리고 있습니다",
      complete: "최종 서명 완료"
    },
    dataNeeds: [
      "issuanceApprovalStatus=approved",
      "issuance amount",
      "circulationUnit",
      "approval history",
      "reserve readiness",
      "signer quorum",
      "signature result"
    ]
  })
];

const newScreenFeedback: Record<string, string[]> = {
  "admin-work-area-choice": ["role-workspace-001", "role-workspace-002"],
  "admin-voucher-program-detail": ["voucher-hub-001", "authority-boundary-001"],
  "admin-policy-approval-detail": ["approval-separation-001", "policy-work-001"],
  "admin-roster-work-list": ["roster-work-001", "role-workspace-002"],
  "admin-payout-work-list": ["payout-work-001", "role-workspace-002"],
  "admin-payout-execution-detail": ["payout-work-001", "approval-separation-001"],
  "admin-payout-progress": ["payout-work-001", "accessibility-001"],
  "admin-issuance-final-signature": ["issuance-work-001", "approval-separation-001"]
};
for (const item of newScreens) {
  addScreen(
    item,
    newScreenFeedback[String(item.id)] ?? ["voucher-hub-001"],
    `피드백이 요구한 ${String(item.title)} 업무 화면을 추가한다.`
  );
}

const newComponents = [
  [
    "WorkAreaSwitcher",
    "현재 업무영역과 관할을 표시하고 복수 권한 사용자에게만 업무영역 전환을 제공한다."
  ],
  ["WorkAreaCard", "업무영역 설명, 처리할 건수, 기한 초과 건수와 최근 사업을 한글로 표시한다."],
  ["WorkQueueTable", "담당자별 처리기한, 상태, 다음 행동 중심의 업무 목록을 표시한다."],
  [
    "VoucherProgramContextHeader",
    "같은 programId의 사업연도, 부서, 회차, 역할과 다음 행동을 고정 표시한다."
  ],
  [
    "VoucherProgramStatusBoard",
    "정책 승인, 명부 확정, 지급 준비, 발행 준비와 지급 결과를 분리해 표시한다."
  ],
  [
    "ResponsibilityGatePanel",
    "현재 역할의 read/edit/approve/execute 권한과 차단 사유·해결 담당을 표시한다."
  ],
  [
    "RosterValidationWorkbench",
    "파일 오류와 행 오류, 검증 집계, 재업로드와 version diff를 처리한다."
  ],
  [
    "PayoutReadinessChecklist",
    "정책·명부·재원·유통 단위·발행 준비 gate와 해결 업무영역을 표시한다."
  ],
  ["PayoutProgressMonitor", "지급 상태와 부분 실패를 추적하고 실패 대상만 재처리한다."],
  [
    "ApprovalComparisonPanel",
    "현재안과 이전 version, 근거·첨부·수치 snapshot을 read-only로 비교한다."
  ],
  ["FinalSignaturePanel", "승인 완료 계획의 재인증, signer quorum과 다중서명 결과를 표시한다."],
  [
    "HumanReadableTechnicalDisclosure",
    "한글 업무 문구를 기본으로 두고 내부 코드와 기술 계보를 펼쳐보기로 격리한다."
  ],
  ["ActivityTimeline", "담당자 이름·역할·부서·시각·결과가 있는 사업 활동을 시간순으로 표시한다."],
  ["StepUpAuthPanel", "지급·서명 같은 위험 행동 전에 대상과 금액을 재확인하고 재인증한다."]
].map(([name, purpose]) => ({
  name,
  purpose,
  props: ["currentRole", "workAreaId", "programId", "readOnly", "ariaLiveMessage"],
  variants: ["default", "compact", "read-only"],
  states: ["default", "loading", "empty", "error", "unauthorized", "success"]
}));
newComponents.forEach((component, offset) =>
  addOperation({
    operation: "add",
    path: `/components/${components.length + offset}`,
    value: component,
    feedbackIds: ["role-workspace-002", "accessibility-001", "human-copy-001"],
    reason: `역할별 업무 화면에서 재사용할 ${component.name} component contract를 추가한다.`
  })
);

const newActors: JsonRecord[] = [
  {
    id: "act-program-roster-operator",
    role: "사업·명부 담당자",
    surface: "관리 콘솔(웹) - 대상·명부와 지급 준비",
    authorityScope: "authoritative-within-assigned-program",
    grantedBy: "act-superadmin",
    jurisdiction: "부여된 지자체·부서·사업",
    authn: "행정 SSO + 명부 확정 상신 시 step-up",
    canOperate: [
      "admin-auth",
      "admin-work-area-choice",
      "admin-roster-work-list",
      "admin-voucher-program-detail",
      "admin-roster-builder"
    ],
    separationFrom: ["act-roster-approver", "act-payout-operator", "act-issuer-principal"],
    accountable: true,
    notes:
      "승인된 정책은 read-only로 보고 회차·명부를 작성한다. 자신이 만든 명부를 승인하거나 지급을 실행하지 않는다."
  },
  {
    id: "act-payout-operator",
    role: "지급 실행 담당자",
    surface: "관리 콘솔(웹) - 지급 실행",
    authorityScope: "authoritative-payout-execution-only",
    grantedBy: "act-superadmin",
    jurisdiction: "부여된 지자체·부서·사업",
    authn: "행정 SSO + 지급 시작 시 step-up",
    canOperate: [
      "admin-auth",
      "admin-work-area-choice",
      "admin-payout-work-list",
      "admin-voucher-program-detail",
      "admin-payout-execution-detail",
      "admin-payout-progress"
    ],
    separationFrom: ["act-policy-operator", "act-roster-approver", "act-issuer-principal"],
    accountable: true,
    notes:
      "승인 정책과 확정 명부를 수정하지 않고 준비상태 확인, 지급 시작과 실패 대상 재처리만 수행한다."
  }
];
newActors.forEach((actor, offset) =>
  addOperation({
    operation: "add",
    path: `/actors/${actors.length + offset}`,
    value: actor,
    feedbackIds: ["role-workspace-002", "authority-boundary-001"],
    reason: `${String(actor.role)}의 책임과 금지 행동을 별도 actor contract로 추가한다.`
  })
);

const actorScreenAdditions: Record<string, string[]> = {
  "act-superadmin": ["admin-work-area-choice"],
  "act-policy-operator": [
    "admin-work-area-choice",
    "admin-voucher-program-detail",
    "admin-policy-approval-detail"
  ],
  "act-policy-approver": [
    "admin-work-area-choice",
    "admin-voucher-program-detail",
    "admin-policy-approval-detail"
  ],
  "act-roster-approver": [
    "admin-work-area-choice",
    "admin-voucher-program-detail",
    "admin-roster-work-list"
  ],
  "act-issuance-manager": ["admin-work-area-choice", "admin-voucher-program-detail"],
  "act-issue-approver": ["admin-work-area-choice", "admin-voucher-program-detail"],
  "act-master-minter": [
    "admin-work-area-choice",
    "admin-voucher-program-detail",
    "admin-issuance-final-signature"
  ],
  "act-settlement-operator": ["admin-work-area-choice", "admin-voucher-program-detail"],
  "act-auditor": [
    "admin-work-area-choice",
    "admin-voucher-program-detail",
    "admin-policy-approval-detail",
    "admin-roster-work-list",
    "admin-payout-work-list",
    "admin-payout-execution-detail",
    "admin-payout-progress"
  ],
  "act-issuer-auditor": ["admin-voucher-program-detail", "admin-issuance-final-signature"]
};
for (const [actorId, additions] of Object.entries(actorScreenAdditions)) {
  const index = indexBy(actors, "id", actorId);
  const existing = Array.isArray(actors[index]?.canOperate)
    ? (actors[index]!.canOperate as string[])
    : [];
  addOperation({
    operation: "replace",
    path: `/actors/${index}/canOperate`,
    value: [...new Set([...existing, ...additions])],
    feedbackIds: ["role-workspace-002", "authority-boundary-001"],
    reason: `${actorId}가 역할에 맞는 새 업무 화면만 접근하도록 screen authority를 확장한다.`
  });
}

const workAreas = [
  ["policy-work", "정책 업무", "admin-policy-list", ["act-policy-operator"]],
  ["roster-work", "사업·명부 업무", "admin-roster-work-list", ["act-program-roster-operator"]],
  [
    "approval-work",
    "결재 업무",
    "admin-approval-inbox",
    ["act-policy-approver", "act-roster-approver"]
  ],
  ["payout-work", "지급 실행 업무", "admin-payout-work-list", ["act-payout-operator"]],
  [
    "issuance-work",
    "발행 업무",
    "admin-issuance-plans",
    ["act-issuance-manager", "act-issue-approver", "act-master-minter"]
  ],
  ["settlement-work", "정산 업무", "admin-settlement-dashboard", ["act-settlement-operator"]],
  ["audit-work", "감사 업무", "admin-audit-log", ["act-auditor", "act-issuer-auditor"]],
  ["access-work", "계정·권한 관리", "admin-account-management", ["act-superadmin"]]
].map(([id, label, startScreenId, actorRefs]) => ({
  id,
  label,
  startScreenId,
  actorRefs,
  showSwitcherWhenMultiple: true,
  preserveProgramContextOnSwitch: true
}));
addOperation({
  operation: "add",
  path: "/navModel/workAreas",
  value: workAreas,
  feedbackIds: ["role-workspace-001", "role-workspace-002", "authority-boundary-001"],
  reason: "surface 공통 메뉴와 별도로 현재 역할 하나에 해당하는 업무영역 navigation을 정의한다."
});
addOperation({
  operation: "add",
  path: "/navModel/authenticationRouting",
  value: {
    authenticateFirst: true,
    oneWorkArea: "navigate-start-screen",
    multipleWorkAreas: "admin-work-area-choice",
    unauthorizedDeepLink: "show-reason-and-access-request"
  },
  feedbackIds: ["role-workspace-001"],
  reason: "인증 뒤 권한 수에 따라 업무영역 시작 화면을 결정한다."
});

const newSlices: JsonRecord[] = [
  {
    name: "workAreaContext",
    fields: [
      { name: "availableWorkAreas", type: "array", initial: "[]" },
      { name: "currentWorkAreaId", type: "string|null", initial: "null" },
      { name: "currentProgramId", type: "string|null", initial: "null" }
    ],
    actions: [
      {
        name: "resolveAfterAuthentication",
        signature: "({session})=>WorkAreaRoute",
        effect: "권한이 하나면 시작 화면, 여러 개면 선택 화면을 반환한다"
      },
      {
        name: "switchWorkArea",
        signature: "({workAreaId,programId?})=>void",
        effect: "메뉴·시작 화면·가능 행동을 함께 전환한다"
      }
    ]
  },
  {
    name: "voucherProgramWork",
    fields: [
      { name: "policyApprovalStatus", type: "string", initial: "draft" },
      { name: "rosterApprovalStatus", type: "string", initial: "not-started" },
      { name: "payoutReadinessStatus", type: "string", initial: "blocked" },
      { name: "issuanceReadinessStatus", type: "string", initial: "not-required" },
      { name: "payoutResultStatus", type: "string", initial: "not-started" }
    ],
    actions: [
      {
        name: "deriveRoleProjection",
        signature: "({programId,actorId})=>ProgramWorkProjection",
        effect: "같은 사업을 역할별 read/edit/approve/execute projection으로 만든다"
      }
    ]
  },
  {
    name: "rosterWork",
    fields: [
      { name: "uploadStatus", type: "string", initial: "not-started" },
      { name: "rosterVersion", type: "string|null", initial: "null" },
      { name: "validationSummary", type: "object|null", initial: "null" },
      { name: "approvalStatus", type: "string", initial: "not-submitted" }
    ],
    actions: [
      {
        name: "uploadAndValidate",
        signature: "({file,programId,roundId})=>void",
        effect: "파일 오류와 행 오류를 분리해 새 version을 만든다"
      },
      {
        name: "submitRosterApproval",
        signature: "({rosterVersion})=>void",
        effect: "지급을 시작하지 않고 명부 결재만 요청한다"
      }
    ]
  },
  {
    name: "payoutWork",
    fields: [
      { name: "readiness", type: "object", initial: "{}" },
      { name: "status", type: "string", initial: "blocked" },
      { name: "failedRecipientIds", type: "array", initial: "[]" }
    ],
    actions: [
      {
        name: "startPayout",
        signature: "({programId,rosterVersion,idempotencyKey,stepUp})=>void",
        effect: "준비 완료와 재인증 뒤 수동으로 지급을 시작한다"
      },
      {
        name: "retryFailedOnly",
        signature: "({payoutJobId,failedRecipientIds,idempotencyKey})=>void",
        effect: "성공 건을 제외하고 실패 대상만 재처리한다"
      }
    ]
  },
  {
    name: "issuanceApprovalSeparation",
    fields: [
      { name: "planStatus", type: "string", initial: "draft" },
      { name: "approvalStatus", type: "string", initial: "not-submitted" },
      { name: "finalSignatureStatus", type: "string", initial: "not-ready" },
      { name: "executionStatus", type: "string", initial: "blocked" }
    ],
    actions: [
      {
        name: "approvePlan",
        signature: "({planId,decision})=>void",
        effect: "승인 결과만 기록하고 서명하지 않는다"
      },
      {
        name: "signApprovedPlan",
        signature: "({planId,stepUp,signature})=>void",
        effect: "승인 완료 계획만 별도 서명한다"
      },
      {
        name: "executeSignedPlan",
        signature: "({planId,idempotencyKey})=>void",
        effect: "서명 완료 계획만 발행 실행한다"
      }
    ]
  }
];
newSlices.forEach((slice, offset) =>
  addOperation({
    operation: "add",
    path: `/stateModel/slices/${stateModel.slices.length + offset}`,
    value: slice,
    feedbackIds: ["approval-separation-001", "role-workspace-002", "payout-work-001"],
    reason: `${String(slice.name)}의 역할·상태·행동 분리 contract를 추가한다.`
  })
);

const reachableStates = standardStates.map(({ state, description }) => ({
  state,
  via: description
}));
function interaction(screenId: string, affordances: Array<Record<string, string>>): JsonRecord {
  return { screenId, affordances, reachableStates };
}

const interactionDefinitions: Record<string, JsonRecord> = {
  "admin-auth": interaction("admin-auth", [
    {
      id: "admin-auth.authenticate",
      element: "AdminAuthPanel",
      trigger: "submit",
      action: "submit",
      target: "workAreaContext.resolveAfterAuthentication",
      storeEffect: "session.authenticate(); workAreaContext.resolveAfterAuthentication()",
      expected: "인증 후 업무영역 수에 따라 시작 화면 또는 업무영역 선택으로 이동한다."
    }
  ]),
  "admin-policy-list": interaction("admin-policy-list", [
    {
      id: "admin-policy-list.open",
      element: "WorkQueueTable(row)",
      trigger: "click",
      action: "navigate",
      target: "admin-voucher-program-detail",
      storeEffect: "workAreaContext.currentProgramId=programId",
      expected: "편집폼이 아니라 같은 사업 업무 상세를 연다."
    },
    {
      id: "admin-policy-list.create",
      element: "Button(newVoucher)",
      trigger: "click",
      action: "navigate",
      target: "admin-voucher-policy-setup",
      storeEffect: "policy.createVoucherDraft({scenarioStatus:'confirmation-required'})",
      expected: "가칭과 미확정 표시가 있는 바우처 초안을 연다."
    }
  ]),
  "admin-voucher-policy-setup": interaction("admin-voucher-policy-setup", [
    {
      id: "voucher.save",
      element: "Button(saveDraft)",
      trigger: "click",
      action: "submit",
      target: "draft",
      storeEffect: "policy.saveDraft()",
      expected: "임시저장하고 같은 사업 문맥을 유지한다."
    },
    {
      id: "voucher.review",
      element: "Button(review)",
      trigger: "click",
      action: "setLocalState",
      target: "review-findings",
      storeEffect: "policy.validateDraft()",
      expected: "오류와 주의를 구분하고 오류 위치로 이동할 수 있다."
    },
    {
      id: "voucher.submit",
      element: "Button(submitApproval)",
      trigger: "click",
      action: "submit",
      target: "admin-approval-inbox",
      storeEffect: "approvals.submitPolicy()",
      expected: "오류가 없을 때 결재만 상신하고 지급·발행은 시작하지 않는다."
    }
  ]),
  "admin-roster-builder": interaction("admin-roster-builder", [
    {
      id: "roster.upload",
      element: "RosterValidationWorkbench",
      trigger: "upload",
      action: "submit",
      target: "validation",
      storeEffect: "rosterWork.uploadAndValidate()",
      expected: "파일 오류와 행 오류를 분리해 전체 행을 검증한다."
    },
    {
      id: "roster.resubmit",
      element: "Button(reupload)",
      trigger: "click",
      action: "submit",
      target: "new-version",
      storeEffect: "rosterWork.uploadAndValidate()",
      expected: "수정본을 새 version으로 검증한다."
    },
    {
      id: "roster.submitApproval",
      element: "Button(submit)",
      trigger: "click",
      action: "submit",
      target: "admin-roster-approval",
      storeEffect: "rosterWork.submitRosterApproval()",
      expected: "명부 결재만 요청하고 지급은 시작하지 않는다."
    }
  ]),
  "admin-roster-approval": interaction("admin-roster-approval", [
    {
      id: "roster-approval.requestRevision",
      element: "Button(requestRevision)",
      trigger: "click",
      action: "submit",
      target: "revision-requested",
      storeEffect: "approvals.requestRevision()",
      expected: "보완 사유를 기록하고 작성자에게 돌려보낸다."
    },
    {
      id: "roster-approval.approve",
      element: "Button(approve)",
      trigger: "click",
      action: "submit",
      target: "roster-approved",
      storeEffect: "approvals.approveRoster()",
      expected: "지급 준비상태만 만들고 실제 지급은 시작하지 않는다."
    }
  ]),
  "admin-approval-inbox": interaction("admin-approval-inbox", [
    {
      id: "inbox.openPolicy",
      element: "ApprovalInboxTable(policyRow)",
      trigger: "click",
      action: "navigate",
      target: "admin-policy-approval-detail",
      storeEffect: "none",
      expected: "정책 결재 상세를 read-only로 연다."
    },
    {
      id: "inbox.openRoster",
      element: "ApprovalInboxTable(rosterRow)",
      trigger: "click",
      action: "navigate",
      target: "admin-roster-approval",
      storeEffect: "none",
      expected: "명부 결재 상세를 read-only로 연다."
    }
  ]),
  "admin-issuance-plans": interaction("admin-issuance-plans", [
    {
      id: "issuance.open",
      element: "IssuancePlanTable(row)",
      trigger: "click",
      action: "navigate",
      target: "admin-issuance-plan",
      storeEffect: "none",
      expected: "정책을 수정하지 않고 발행 계획 문맥을 연다."
    }
  ]),
  "admin-issuance-plan": interaction("admin-issuance-plan", [
    {
      id: "issuance.submit",
      element: "Button(submit)",
      trigger: "click",
      action: "submit",
      target: "approval-pending",
      storeEffect: "issuance.submitPlanApproval()",
      expected: "발행 승인만 요청한다."
    },
    {
      id: "issuance.approve",
      element: "Button(approve)",
      trigger: "click",
      action: "submit",
      target: "admin-issuance-final-signature",
      storeEffect: "issuanceApprovalSeparation.approvePlan()",
      expected: "계획을 승인하고 최종 서명 대기로 전환하지만 자동 서명하지 않는다."
    }
  ]),
  "admin-issuance-execute": interaction("admin-issuance-execute", [
    {
      id: "issuance.execute",
      element: "IssuanceExecutionPanel",
      trigger: "submit",
      action: "submit",
      target: "admin-issuance-ledger",
      storeEffect: "issuanceApprovalSeparation.executeSignedPlan()",
      expected: "승인과 서명이 완료된 계획만 멱등 실행한다."
    }
  ]),
  "admin-role-grant": interaction("admin-role-grant", [
    {
      id: "role.selectWorkArea",
      element: "RoleGrantPanel",
      trigger: "change",
      action: "setLocalState",
      target: "work-area-preview",
      storeEffect: "none",
      expected: "한글 업무영역과 실제 가능한 업무를 먼저 보여준다."
    },
    {
      id: "role.requestGrant",
      element: "Button(grant)",
      trigger: "click",
      action: "submit",
      target: "approval-requested",
      storeEffect: "access.requestRoleGrant()",
      expected: "권한 변경 결재를 요청하고 즉시 권한을 바꾸지 않는다."
    }
  ]),
  "admin-work-area-choice": interaction("admin-work-area-choice", [
    {
      id: "work-area.select",
      element: "WorkAreaCard",
      trigger: "click",
      action: "navigate",
      target: "selectedWorkArea.startScreenId",
      storeEffect: "workAreaContext.switchWorkArea()",
      expected: "현재 업무영역, 메뉴와 가능한 행동을 함께 전환한다."
    }
  ]),
  "admin-voucher-program-detail": interaction("admin-voucher-program-detail", [
    {
      id: "program.openResponsibility",
      element: "ResponsibilityGatePanel(action)",
      trigger: "click",
      action: "navigate",
      target: "roleAllowedDetailScreen",
      storeEffect: "workAreaContext.currentProgramId=programId",
      expected: "현재 역할에 허용된 세부 작업을 열고 완료 뒤 같은 사업으로 돌아온다."
    },
    {
      id: "program.switchRole",
      element: "WorkAreaSwitcher",
      trigger: "change",
      action: "navigate",
      target: "same-program-role-projection",
      storeEffect: "workAreaContext.switchWorkArea({programId})",
      expected: "같은 programId를 새 역할의 read/edit projection으로 다시 연다."
    }
  ]),
  "admin-policy-approval-detail": interaction("admin-policy-approval-detail", [
    {
      id: "policy-approval.requestRevision",
      element: "Button(requestRevision)",
      trigger: "click",
      action: "submit",
      target: "revision-requested",
      storeEffect: "approvals.requestRevision()",
      expected: "보완 사유를 기록하고 원안은 수정하지 않는다."
    },
    {
      id: "policy-approval.approve",
      element: "Button(approve)",
      trigger: "click",
      action: "submit",
      target: "policy-approved",
      storeEffect: "approvals.approvePolicy()",
      expected: "정책 승인만 기록하고 명부·지급·발행을 자동 실행하지 않는다."
    }
  ]),
  "admin-roster-work-list": interaction("admin-roster-work-list", [
    {
      id: "roster-list.open",
      element: "WorkQueueTable(row)",
      trigger: "click",
      action: "navigate",
      target: "admin-voucher-program-detail",
      storeEffect: "workAreaContext.currentProgramId=programId",
      expected: "같은 사업의 명부 구역을 연다."
    },
    {
      id: "roster-list.start",
      element: "Button(start)",
      trigger: "click",
      action: "navigate",
      target: "admin-roster-builder",
      storeEffect: "rosterWork.start()",
      expected: "승인된 정책을 read-only로 유지한 채 명부 작업을 시작한다."
    }
  ]),
  "admin-payout-work-list": interaction("admin-payout-work-list", [
    {
      id: "payout-list.open",
      element: "WorkQueueTable(row)",
      trigger: "click",
      action: "navigate",
      target: "admin-payout-execution-detail",
      storeEffect: "none",
      expected: "준비 gate와 차단 해결 담당을 확인한다."
    }
  ]),
  "admin-payout-execution-detail": interaction("admin-payout-execution-detail", [
    {
      id: "payout.check",
      element: "Button(check)",
      trigger: "click",
      action: "submit",
      target: "readiness",
      storeEffect: "payout.evaluateReadiness()",
      expected: "모든 준비조건과 중복 실행 여부를 재평가한다."
    },
    {
      id: "payout.start",
      element: "Button(start)",
      trigger: "click",
      action: "submit",
      target: "admin-payout-progress",
      storeEffect: "payoutWork.startPayout()",
      expected: "준비 완료와 재인증 뒤 한 번만 지급을 시작한다."
    }
  ]),
  "admin-payout-progress": interaction("admin-payout-progress", [
    {
      id: "payout.retryFailed",
      element: "Button(retryFailed)",
      trigger: "click",
      action: "submit",
      target: "retrying-failed-only",
      storeEffect: "payoutWork.retryFailedOnly()",
      expected: "성공 건을 제외하고 실패 대상만 재처리한다."
    }
  ]),
  "admin-issuance-final-signature": interaction("admin-issuance-final-signature", [
    {
      id: "signature.reauthenticate",
      element: "StepUpAuthPanel",
      trigger: "submit",
      action: "submit",
      target: "signature-ready",
      storeEffect: "session.stepUp()",
      expected: "서명자 재인증과 대상·발행량 확인을 완료한다."
    },
    {
      id: "signature.sign",
      element: "FinalSignaturePanel",
      trigger: "submit",
      action: "submit",
      target: "admin-issuance-execute",
      storeEffect: "issuanceApprovalSeparation.signApprovedPlan()",
      expected: "승인 완료 계획에 별도 다중서명을 기록하고 실행 화면으로 인계한다."
    }
  ])
};
for (const [screenId, value] of Object.entries(interactionDefinitions)) {
  const index = interactions.findIndex((item) => item.screenId === screenId);
  addOperation({
    operation: index < 0 ? "add" : "replace",
    path: `/interactionModel/${
      index < 0
        ? interactions.length +
          Object.keys(interactionDefinitions)
            .filter((id) => interactions.findIndex((item) => item.screenId === id) < 0)
            .indexOf(screenId)
        : index
    }`,
    value,
    feedbackIds: ["approval-separation-001", "accessibility-001", "poc-flow-001"],
    reason: `${screenId}의 역할별 이동, 승인·실행 분리와 결과 feedback을 정의한다.`
  });
}

const mockEntries = [
  {
    entity: "업무영역(WorkArea)",
    fields: [
      "workAreaId",
      "한글 업무명",
      "설명",
      "pendingCount",
      "overdueCount",
      "lastProgram",
      "startScreenId",
      "actorRefs[]"
    ],
    sampleNote:
      "사용자가 가진 여러 역할을 메뉴 합집합으로 표시하지 않고 현재 업무영역 하나를 선택하는 projection이다."
  },
  {
    entity: "바우처 사업 업무(VoucherProgramWork)",
    fields: [
      "programId",
      "가칭",
      "confirmationRequired",
      "policyStatus",
      "rosterStatus",
      "payoutReadiness",
      "issuanceReadiness",
      "payoutResult",
      "currentResponsibility"
    ],
    sampleNote:
      "첫 PoC는 청년 지역화폐 지급 바우처 가칭과 확정 명부 직접 지급을 작업용 시나리오로 사용한다. 실제 연령·금액·일정은 확정하지 않는다."
  },
  {
    entity: "명부 작업(RosterWork)",
    fields: [
      "rosterTaskId",
      "programId",
      "roundId",
      "sourceFile",
      "rosterVersion",
      "totalCount",
      "validCount",
      "warningCount",
      "errorCount",
      "excludedCount",
      "approvedCount",
      "totalAmount",
      "approvalStatus"
    ],
    sampleNote:
      "파일 업로드 실패와 행 오류를 분리하고 수정본은 새 version으로 비교한다. 명부 승인 뒤 지급은 자동 시작되지 않는다."
  },
  {
    entity: "지급 작업(PayoutWork)",
    fields: [
      "payoutJobId",
      "programId",
      "policyVersion",
      "rosterVersion",
      "readiness",
      "status",
      "successCount",
      "heldCount",
      "failedCount",
      "failedRecipientIds[]",
      "idempotencyKey"
    ],
    sampleNote:
      "준비 완료와 재인증 뒤 수동 시작한다. 부분 실패 시 failedRecipientIds만 재처리하며 완료 수치를 직접 덮어쓰지 않는다."
  }
];
mockEntries.forEach((entry, offset) =>
  addOperation({
    operation: "add",
    path: `/mockData/${mockData.length + offset}`,
    value: entry,
    feedbackIds: ["scenario-assumption-001", "voucher-hub-001", "payout-work-001"],
    reason: `${entry.entity}의 작업용 시나리오 data contract를 추가한다.`
  })
);

const priorityScreens = [
  "admin-work-area-choice",
  "admin-policy-list",
  "admin-voucher-program-detail",
  "admin-voucher-policy-setup",
  "admin-approval-inbox",
  "admin-policy-approval-detail",
  "admin-roster-work-list",
  "admin-roster-builder",
  "admin-roster-approval",
  "admin-payout-work-list",
  "admin-payout-execution-detail",
  "admin-payout-progress",
  "admin-issuance-plans",
  "admin-issuance-plan",
  "admin-issuance-final-signature"
];
addOperation({
  operation: "add",
  path: "/demoStoryboard/0",
  value: {
    id: "voucher-role-handoff-poc",
    title: "바우처 사업 담당자별 종단 업무",
    scenarioStatus: "working-assumption",
    priorityScreens,
    steps: [
      "정책 담당자가 내 정책 업무에서 사업을 열어 초안을 작성·검토·상신한다",
      "정책 결재자가 보완 요청하고 정책 담당자가 재상신한 뒤 정책만 승인한다",
      "사업·명부 담당자가 명부를 업로드·검증하고 명부 결재자가 명부만 승인한다",
      "지급 담당자가 준비상태와 재인증을 확인해 지급을 시작하고 실패 대상만 재처리한다",
      "신규 발행 필요 시 발행 계획 담당자 작성, 발행 승인자 승인, 최종 서명자 서명과 실행을 분리한다",
      "각 역할은 같은 programId의 사업 업무 상세에서 허용된 projection으로 결과를 확인한다"
    ]
  },
  feedbackIds: ["poc-flow-001", "scenario-assumption-001", "approval-separation-001"],
  reason: "첫 PoC 15화면과 역할별 handoff 종단 시나리오를 명시한다."
});
addOperation({
  operation: "add",
  path: "/meta/workAreaRevision",
  value: {
    schemaVersion: "gyeonggi-work-area-revision/v1",
    status: "candidate",
    feedbackDate: "2026-07-15",
    workingAssumptions: [
      "청년 지역화폐 지급 바우처는 가칭이다",
      "첫 지급은 확정 명부 기반 직접 지급이다",
      "명부 승인 뒤 지급은 자동 시작되지 않는다",
      "신규 발행이 필요한 경우에만 발행사 콘솔로 인계한다"
    ],
    unresolvedPolicyFacts: [
      "정확한 정책명과 대상 연령",
      "거주기간·제외조건·지급액",
      "회차·신청기간·명부 원천·지급 예정일",
      "환불·소각의 최종 모델"
    ]
  },
  feedbackIds: ["scenario-assumption-001", "voucher-hub-001"],
  reason: "작업용 가정과 확정하지 말아야 할 정책 사실을 candidate metadata에 명시한다."
});

const proposal = {
  schemaVersion: "aawp/spec-patch-proposal/v1" as const,
  operations
};
const candidate = materializeSpecRevisionCandidate({
  sourceDocument: source,
  contract,
  proposal
});

function roleWorkspaceFindings(document: unknown): SpecRevisionFinding[] {
  const findings: SpecRevisionFinding[] = [];
  if (typeof document !== "object" || document === null || Array.isArray(document)) {
    return [{ code: "ROLE_WORKSPACE_DOCUMENT_INVALID", message: "candidate must be an object" }];
  }
  const value = document as JsonRecord;
  const screenRecords = value.screens as JsonRecord[];
  const screenById = new Map(screenRecords.map((item) => [String(item.id), item]));
  for (const screenId of priorityScreens) {
    const target = screenById.get(screenId);
    if (target === undefined) {
      findings.push({
        code: "ROLE_WORKSPACE_PRIORITY_SCREEN_MISSING",
        message: `${screenId} is missing`
      });
      continue;
    }
    const states = new Set((target.states as JsonRecord[]).map((state) => String(state.state)));
    for (const required of standardStates.map((state) => state.state)) {
      if (!states.has(required)) {
        findings.push({
          code: "ROLE_WORKSPACE_STATE_MISSING",
          message: `${screenId} is missing state ${required}`,
          pointer: `/screens/${screenRecords.indexOf(target)}/states`
        });
      }
    }
  }
  const navModel = value.navModel as JsonRecord;
  if (!Array.isArray(navModel.workAreas) || navModel.workAreas.length !== 8) {
    findings.push({
      code: "ROLE_WORKSPACE_NAV_INVALID",
      message: "exactly 8 work areas are required"
    });
  }
  const storyboards = value.demoStoryboard as JsonRecord[];
  const storyboard = storyboards.find((item) => item.id === "voucher-role-handoff-poc");
  if (JSON.stringify(storyboard?.priorityScreens) !== JSON.stringify(priorityScreens)) {
    findings.push({
      code: "ROLE_WORKSPACE_STORYBOARD_INVALID",
      message: "15-screen priority order changed"
    });
  }
  return findings;
}

const profile = createHeavyProductionSpecValidator(source);
const verdict = verifySpecRevision({
  sourceDocument: source,
  candidate,
  contract,
  validator: (document) => [...profile(document), ...roleWorkspaceFindings(document)]
});
const childDocument = candidate.document as JsonRecord;
const summary = {
  schemaVersion: "aawp/spec-revision-summary/v1",
  candidateId: candidate.candidateId,
  status: candidate.status,
  parentArtifactId: candidate.parentArtifactId,
  parentDigest: candidate.parentDigest,
  contentDigest: candidate.contentDigest,
  contractDigest: candidate.contractDigest,
  operationCount: candidate.operations.length,
  changedPointers: candidate.changedPointers,
  counts: {
    screensBefore: screens.length,
    screensAfter: (childDocument.screens as unknown[]).length,
    componentsBefore: components.length,
    componentsAfter: (childDocument.components as unknown[]).length,
    actorsBefore: actors.length,
    actorsAfter: (childDocument.actors as unknown[]).length
  },
  priorityScreens,
  verifierStatus: verdict.status,
  findingCount: verdict.findings.length
};

await mkdir(outputDirectory, { recursive: true });
const formatJson = (value: unknown): Promise<string> =>
  format(JSON.stringify(value), {
    parser: "json",
    printWidth: 100,
    singleQuote: false,
    trailingComma: "none"
  });
await Promise.all([
  writeFile(resolve(outputDirectory, "patch-proposal.json"), await formatJson(proposal)),
  writeFile(
    resolve(outputDirectory, "refined-production-spec.role-workspaces.candidate.json"),
    await formatJson(childDocument)
  ),
  writeFile(resolve(outputDirectory, "revision-summary.json"), await formatJson(summary)),
  writeFile(resolve(outputDirectory, "revision-verdict.json"), await formatJson(verdict))
]);

console.log(JSON.stringify(summary, null, 2));
if (verdict.status !== "passed") process.exitCode = 1;
