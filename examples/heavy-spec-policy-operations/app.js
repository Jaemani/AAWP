const screens = [
  {
    id: "admin-policy-list",
    group: "정책",
    title: "정책 목록 · 생애주기 · 버전",
    route: "/admin/policy/list",
    kind: "table",
    action: "일반 정책 작성",
    summary: "승인·생애주기·실행 상태를 분리해 모든 정책과 버전 이력을 관리합니다.",
    facts: [
      ["전체 정책", "28"],
      ["승인 대기", "4"],
      ["실행 차단", "2"]
    ],
    records: [
      ["청년 교통지원", "일반 정책 · v3", "승인·활성"],
      ["경기 생활상품권", "상품권 정책 · v5", "승인 대기"],
      ["자동충전 기본한도", "충전 정책 · v2", "실행 차단"]
    ],
    boundary: "발행계획은 참조 ID만 표시하고 작성·승인은 발행사 콘솔에서 수행합니다."
  },
  {
    id: "admin-circulation-policy-composer",
    group: "정책",
    title: "정책 작성 — 대상·사용조건·재원·유통 단위",
    route: "/admin/policy/circulation/new",
    kind: "form",
    action: "결재 요청",
    summary: "승인된 조건 세트와 유통 단위를 연결해 일반 정책 초안을 작성합니다.",
    facts: [
      ["정책명", "청년 교통지원 2026"],
      ["유통 단위", "경기도 광역"],
      ["지급 방식", "명부 기준 자동 지급"]
    ],
    records: [
      ["대상 조건", "경기도 거주 · 만 19–34세", "확인됨"],
      ["사용 조건", "대중교통·공공자전거", "확인됨"],
      ["재원 계좌", "pa-policy-youth-01", "검토 필요"]
    ],
    boundary: "작성자는 chain, custody 방식이나 지갑 주소를 입력하지 않습니다."
  },
  {
    id: "admin-circulation-topup-policy",
    group: "정책",
    title: "충전 정책 관리",
    route: "/admin/circulation/topup-policy",
    kind: "form",
    action: "변경안 저장",
    summary: "충전 한도와 자동충전 허용 여부, 고객충전금 계좌 권한 상태를 관리합니다.",
    facts: [
      ["1회 한도", "500,000원"],
      ["월 한도", "2,000,000원"],
      ["자동충전", "허용"]
    ],
    records: [
      ["고객충전금 계좌", "cfa-customer-funds-01", "권한 확인"],
      ["대상 조건", "ecs-topup-default", "승인됨"],
      ["시행 버전", "topup-policy-v7", "적용 중"]
    ],
    boundary: "KYC 등급과 발행 인가·상품분류 mapping은 이 화면에서 선택하지 않습니다."
  },
  {
    id: "admin-voucher-policy-setup",
    group: "정책",
    title: "상품권 정책 설정",
    route: "/admin/policy/voucher/setup",
    kind: "form",
    action: "검토 후 상신",
    summary: "정해진 입력 섹션으로 정책지급 상품권 초안을 구성합니다.",
    facts: [
      ["정책명", "산후조리 지원금"],
      ["지급액", "500,000원"],
      ["실행 방식", "신청 승인 후 지급"]
    ],
    records: [
      ["대상 조건", "출생신고·거주 확인", "승인됨"],
      ["사용 조건", "산후조리·의료 업종", "승인됨"],
      ["유통 단위", "수원시", "선택됨"]
    ],
    boundary: "발행 가능성과 준비자산 조건은 정책 승인 후 IssuancePlan에서 독립 평가합니다."
  },
  {
    id: "admin-condition-builder",
    group: "정책",
    title: "조건 빌더 — 대상 조건 · 사용 조건",
    route: "/admin/policy/conditions",
    kind: "form",
    action: "조건 세트 저장",
    summary: "재사용 가능한 대상·사용 조건을 표준 코드와 함께 작성합니다.",
    facts: [
      ["조건 유형", "사용 조건"],
      ["업종 코드", "4111 · 교통"],
      ["품목 코드", "UNSPSC 78111800"]
    ],
    records: [
      ["지역", "경기도", "필수"],
      ["사용 시간", "00:00–24:00", "적용"],
      ["지급 방식", "direct-grant", "고정값"]
    ],
    boundary: "업종은 ISO 18245, 품목은 UNSPSC canonical code만 판정 근거로 저장합니다."
  },
  {
    id: "admin-policy-effect-dashboard",
    group: "정책",
    title: "정책 효과 대시보드",
    route: "/admin/policy/effects",
    kind: "dashboard",
    summary: "활성 정책의 대상자, 지급액, 사용률과 회수액을 as-of projection으로 확인합니다.",
    facts: [
      ["활성 정책", "16"],
      ["누적 지급액", "₩28.4B"],
      ["평균 사용률", "74.8%"]
    ],
    records: [
      ["청년 교통지원", "사용률 82% · 18,240명", "양호"],
      ["산후조리 지원금", "사용률 69% · 4,120명", "관찰"],
      ["전통시장 장려금", "사용률 61% · 8,903명", "점검"]
    ],
    boundary: "모든 수치는 원장·정산 집계 projection이며 실시간 권위값이 아닙니다."
  },
  {
    id: "admin-circulation-dashboard",
    group: "유통",
    title: "유통 현황 · 유통 지갑",
    route: "/admin/circulation/dashboard",
    kind: "dashboard",
    summary: "유통 단위별 잔액 집계와 시스템 발급 지갑·InternalLedger 상태를 조회합니다.",
    facts: [
      ["유통 단위", "31"],
      ["유통 잔액", "₩184.2B"],
      ["대사 일치", "29 / 31"]
    ],
    records: [
      ["경기도 광역", "ledger-gg-001 · 09:58", "일치"],
      ["수원시", "ledger-sw-014 · 09:55", "일치"],
      ["성남시", "ledger-sn-021 · 09:41", "검토"]
    ],
    boundary: "유통 단위 간 이전·순결제는 만들지 않고 각 단위 내부에서 종결합니다."
  },
  {
    id: "admin-circulation-reconciliation",
    group: "유통",
    title: "유통 단위 대사 · InternalLedger 검증",
    route: "/admin/circulation/reconciliation",
    kind: "ledger",
    action: "대사 다시 실행",
    summary: "시민 잔액 지급의무와 PooledAccount 재원 충분성을 분리 검증합니다.",
    facts: [
      ["지급의무 합계", "₩8.42B"],
      ["재원 잔액", "₩8.47B"],
      ["차이", "+₩50M"]
    ],
    records: [
      ["liability-proof-0715", "시민 잔액 합계", "일치"],
      ["reserve-proof-0715", "정책 재원 계좌", "일치"],
      ["batch-commit-9821", "마지막 배치", "확정"]
    ],
    boundary: "발행량과 오프체인 준비자산 대사는 발행사 콘솔에서 별도로 수행합니다."
  },
  {
    id: "admin-roster-builder",
    group: "유통",
    title: "대상 명부 확정 · 운영계획서",
    route: "/admin/circulation/rosters/build",
    kind: "workflow",
    action: "결재 상신",
    summary: "승인 정책을 참조해 운영계획과 후보 명부를 생성·검토합니다.",
    facts: [
      ["후보 대상", "18,420명"],
      ["제외", "180명"],
      ["예상 지급액", "₩9.12B"]
    ],
    records: [
      ["정책 연결", "policy-youth-2026-v3", "완료"],
      ["후보 명부 산출", "roster-0715-a", "완료"],
      ["운영계획 결재", "approval-op-482", "대기"]
    ],
    boundary: "명부 확정은 지급이 아니며 최종 지급 record는 별도 권위 workflow가 생성합니다."
  },
  {
    id: "admin-settlement-batch",
    group: "유통",
    title: "정산 배치 · 사후 환급 실행",
    route: "/admin/circulation/settlement-batch",
    kind: "workflow",
    action: "배치 검토",
    summary: "유통 단위별 정산 배치와 사후 환급 정책 실행 상태를 관리합니다.",
    facts: [
      ["배치 항목", "12,840"],
      ["정산 예정", "₩3.84B"],
      ["예외", "14"]
    ],
    records: [
      ["거래 집계", "batch-settle-0715", "완료"],
      ["환급 대상 판정", "1,284건", "완료"],
      ["결재·실행", "approval-st-199", "대기"]
    ],
    boundary: "모든 항목은 circulationUnitId와 targetPooledAccountRef에 귀속됩니다."
  },
  {
    id: "admin-jurisdiction-exit",
    group: "유통",
    title: "자격 상실 · 잔여 재원 정리",
    route: "/admin/circulation/jurisdiction-exit",
    kind: "workflow",
    action: "정리안 상신",
    summary: "관할 이탈 시 자격과 잔여 재원을 출발 유통 단위 안에서 종결합니다.",
    facts: [
      ["대상 회원", "user-482019"],
      ["잔여 재원", "84,200원"],
      ["처리안", "계속 사용"]
    ],
    records: [
      ["관할 이탈 확인", "2026.07.12 전출", "완료"],
      ["정책별 잔액 분류", "3개 상품권", "완료"],
      ["처리안 승인", "approval-exit-92", "대기"]
    ],
    boundary: "유통 단위 간 잔액 이전이나 순결제를 생성하지 않습니다."
  },
  {
    id: "admin-redeem-console",
    group: "유통",
    title: "상환(redeem) 집행",
    route: "/admin/circulation/redeem",
    kind: "workflow",
    action: "상환 집행",
    summary: "결재 완료된 요청의 InternalLedger 차감과 목적별 계좌 출금을 실행합니다.",
    facts: [
      ["요청 금액", "₩148.2M"],
      ["대상 건", "328"],
      ["계좌 권한", "확인됨"]
    ],
    records: [
      ["결재 완료", "approval-redeem-712", "완료"],
      ["재원 충분성", "pooled-account-44", "확인"],
      ["상환 실행", "idempotency-key 준비", "실행 가능"]
    ],
    boundary: "고객충전금 계좌 운용 권한이 확인되지 않으면 집행을 차단합니다."
  },
  {
    id: "admin-transaction-trace",
    group: "유통",
    title: "거래 추적 · 검색",
    route: "/admin/circulation/transactions",
    kind: "ledger",
    summary: "지갑·가맹점·기간·유통 단위와 판정 상태로 거래를 검색합니다.",
    facts: [
      ["조회 거래", "4,821"],
      ["승인", "4,702"],
      ["거절", "119"]
    ],
    records: [
      ["tx-98A1D2", "수원시 · 12,400원", "승인"],
      ["tx-98A1C8", "성남시 · 48,000원", "승인"],
      ["tx-98A17F", "경기도 광역 · 96,000원", "정책 거절"]
    ],
    boundary: "권위 원장은 결제·정산·발행 도메인이 소유하며 이 화면은 read-only입니다."
  },
  {
    id: "admin-issuance-plans",
    group: "발행 · 준비자산",
    title: "발행 계획 목록",
    route: "/issuer/issuance/plans",
    kind: "table",
    action: "발행 계획 작성",
    summary: "승인·활성·신규 발행 필요 정책을 후보로 조회하고 발행 계획을 관리합니다.",
    facts: [
      ["발행 후보", "7"],
      ["결재 진행", "3"],
      ["실행 가능", "2"]
    ],
    records: [
      ["ip-2026-018", "청년 교통지원 · ₩9.12B", "승인됨"],
      ["ip-2026-019", "산후조리 지원 · ₩2.06B", "결재 중"],
      ["policy-market-v4", "전통시장 장려금", "계획 필요"]
    ],
    boundary: "정책 승인 계보와 발행사 인가·결재 계보를 분리합니다."
  },
  {
    id: "admin-issuance-plan",
    group: "발행 · 준비자산",
    title: "발행 계획 · 작성 · 결재",
    route: "/issuer/issuance/plans/:planId",
    kind: "form",
    action: "발행 결재 요청",
    summary: "승인 정책을 참조해 공급량·준비자산·소각 정산 정책과 결재선을 구성합니다.",
    facts: [
      ["참조 정책", "policy-youth-2026-v3"],
      ["공급량", "₩9.12B"],
      ["유통 단위", "경기도 광역"]
    ],
    records: [
      ["발행 인가", "iauth-issuer-gg-02", "유효"],
      ["준비자산", "reserve-set-2026-07", "충분"],
      ["masterMinter", "서명자 2 / 3", "확인"]
    ],
    boundary: "소비자 잔액 projection과 유통 InternalLedger를 직접 수정하지 않습니다."
  },
  {
    id: "admin-issuance-execute",
    group: "발행 · 준비자산",
    title: "발행 실행 · mint 집행",
    route: "/issuer/issuance/plans/:planId/execute",
    kind: "workflow",
    action: "Mint 집행",
    summary: "결재 완료 계획의 인가·분류·준비자산·한도·서명을 재확인해 mint를 집행합니다.",
    facts: [
      ["계획", "ip-2026-018"],
      ["집행 금액", "₩9.12B"],
      ["승인 서명", "3 / 3"]
    ],
    records: [
      ["발행 인가·분류", "icm-e-money-v5", "통과"],
      ["준비자산·한도", "backing 104.8%", "통과"],
      ["온체인 서명", "masterMinter quorum", "집행 가능"]
    ],
    boundary: "실행 결과는 발행 원장에만 기록하며 시민 잔액을 직접 바꾸지 않습니다."
  },
  {
    id: "admin-issuance-ledger",
    group: "발행 · 준비자산",
    title: "발행 원장 열람",
    route: "/issuer/issuance/ledger",
    kind: "ledger",
    summary: "Mint와 공급 소각 결과, 실행자·결재·인가·서명 참조를 read-only로 조회합니다.",
    facts: [
      ["누적 발행", "₩214.8B"],
      ["누적 소각", "₩18.4B"],
      ["유효 공급", "₩196.4B"]
    ],
    records: [
      ["mint-20260715-018", "+₩9.12B · ip-2026-018", "확정"],
      ["burn-20260714-006", "-₩840M · bsp-019", "확정"],
      ["mint-20260713-017", "+₩2.06B · ip-2026-017", "확정"]
    ],
    boundary: "원장 행은 수정할 수 없고 모든 실행자·결재·서명 참조를 보존합니다."
  },
  {
    id: "admin-issuance-limit",
    group: "발행 · 준비자산",
    title: "발행한도 관리",
    route: "/issuer/issuance/limits",
    kind: "table",
    action: "한도 변경 요청",
    summary: "유통 단위별 발행가능한도와 준비자산 대비 적정성을 관리합니다.",
    facts: [
      ["총 한도", "₩260B"],
      ["사용 한도", "₩196.4B"],
      ["가용", "₩63.6B"]
    ],
    records: [
      ["경기도 광역", "한도 ₩120B · 사용 78%", "정상"],
      ["수원시", "한도 ₩36B · 사용 82%", "주의"],
      ["성남시", "한도 ₩28B · 사용 61%", "정상"]
    ],
    boundary: "한도 변경은 작성·발행사 전용 결재·발효 단계를 거칩니다."
  },
  {
    id: "admin-issuance-reserves",
    group: "발행 · 준비자산",
    title: "준비자산 관리",
    route: "/issuer/issuance/reserves",
    kind: "dashboard",
    action: "준비자산 변경 요청",
    summary: "오프체인 준비자산, 법적 보유 구조와 발행분 매칭을 결재된 버전으로 관리합니다.",
    facts: [
      ["준비자산", "₩205.8B"],
      ["유효 공급", "₩196.4B"],
      ["담보 비율", "104.8%"]
    ],
    records: [
      ["경기은행 별도예치", "₩142.0B · fiat-deposit", "확인"],
      ["공공 수탁 계정", "₩48.6B · custody", "확인"],
      ["평가금 자산", "₩15.2B · valuation", "검토"]
    ],
    boundary: "지갑 주소·chain·custodyType은 이 화면에서 입력하거나 저장하지 않습니다."
  },
  {
    id: "admin-issuance-por",
    group: "발행 · 준비자산",
    title: "준비금 증빙(PoR) 관리",
    route: "/issuer/issuance/por-registry",
    kind: "table",
    action: "증빙 방식 변경",
    summary: "준비금별 PoR 방식과 최신 검증 결과를 판정 근거로 관리합니다.",
    facts: [
      ["증빙 대상", "12"],
      ["검증 통과", "11"],
      ["재검증", "1"]
    ],
    records: [
      ["reserve-bank-01", "off-chain certificate · 07.15", "통과"],
      ["reserve-custody-03", "on-chain oracle · 07.15", "통과"],
      ["reserve-valuation-07", "off-chain certificate · 07.12", "재검증"]
    ],
    boundary: "PoR 방식은 증빙일 뿐 준비자산 자체를 온체인 보관 자산으로 바꾸지 않습니다."
  },
  {
    id: "admin-backing-reconciliation",
    group: "발행 · 준비자산",
    title: "발행량 ↔ 준비자산 대사",
    route: "/issuer/issuance/backing-report",
    kind: "ledger",
    action: "대사 갱신",
    summary: "발행 원장 총량과 오프체인 준비자산 충분성을 read-only로 대사합니다.",
    facts: [
      ["발행량", "₩196.4B"],
      ["준비자산", "₩205.8B"],
      ["초과 담보", "+₩9.4B"]
    ],
    records: [
      ["issuance-ledger-total", "₩196.4B · 10:02", "확정"],
      ["reserve-proof-total", "₩205.8B · 09:56", "확인"],
      ["backing-difference", "+4.8%", "충분"]
    ],
    boundary: "시민 잔액 지급의무 대사는 유통 InternalLedger 화면이 소유합니다."
  },
  {
    id: "admin-supply-burn-settlement",
    group: "발행 · 준비자산",
    title: "공급 소각 · 정산",
    route: "/issuer/issuance/supply-burn",
    kind: "workflow",
    action: "소각 결재 요청",
    summary: "상환·회수 기간과 대사·인가·서명을 확인해 공급측 burn 후보를 집행합니다.",
    facts: [
      ["소각 후보", "₩840M"],
      ["대상 계획", "3"],
      ["유예 종료", "2 / 3"]
    ],
    records: [
      ["상환·회수 기간", "ip-2025-044", "종료"],
      ["InternalLedger·준비자산", "proof set 0715", "일치"],
      ["결재·masterMinter", "approval-burn-82", "대기"]
    ],
    boundary: "정책 만료만으로 소각하지 않으며 유통 단위 간 이전·순결제를 만들지 않습니다."
  }
];

const groups = ["정책", "유통", "발행 · 준비자산"];
const navigation = document.getElementById("screen-navigation");
const content = document.getElementById("screen-content");
const title = document.getElementById("screen-title");
const summary = document.getElementById("screen-summary");
const breadcrumb = document.getElementById("screen-breadcrumb");
const status = document.getElementById("screen-status");
const headerAction = document.getElementById("screen-header-action");
const search = document.getElementById("screen-search");
const toast = document.getElementById("toast");

const tone = (value) =>
  value.includes("대기") ||
  value.includes("검토") ||
  value.includes("주의") ||
  value.includes("재검증")
    ? "pending"
    : value.includes("차단") || value.includes("거절")
      ? "danger"
      : "verified";

function renderNavigation(query = "") {
  const normalized = query.trim().toLowerCase();
  navigation.replaceChildren();
  for (const group of groups) {
    const matches = screens.filter(
      (screen) =>
        screen.group === group && `${screen.title} ${screen.id}`.toLowerCase().includes(normalized)
    );
    if (!matches.length) continue;
    const section = document.createElement("section");
    section.className = "nav-group";
    const heading = document.createElement("h2");
    heading.textContent = group;
    section.appendChild(heading);
    for (const screen of matches) {
      const link = document.createElement("a");
      link.href = `#${screen.id}`;
      link.dataset.screenId = screen.id;
      link.innerHTML = `<span>${screen.title}</span><small>${screen.route}</small>`;
      section.appendChild(link);
    }
    navigation.appendChild(section);
  }
}

function metricCards(screen) {
  return `<div class="metric-grid">${screen.facts.map(([label, value]) => `<article class="metric-card"><span>${label}</span><strong>${value}</strong><small>as-of projection</small></article>`).join("")}</div>`;
}

function recordTable(screen) {
  return `<div class="table-wrap"><table><thead><tr><th>항목</th><th>근거·요약</th><th>상태</th></tr></thead><tbody>${screen.records.map(([name, meta, state]) => `<tr><td><strong>${name}</strong></td><td>${meta}</td><td><span class="state ${tone(state)}">${state}</span></td></tr>`).join("")}</tbody></table></div>`;
}

function renderDashboard(screen) {
  const bars = screen.records
    .map(
      (record, index) =>
        `<div class="bar-row"><span>${record[0]}</span><div><i style="width:${82 - index * 13}%"></i></div><strong>${record[2]}</strong></div>`
    )
    .join("");
  return `${metricCards(screen)}<div class="content-grid"><section class="panel"><div class="panel-head"><div><span>Performance</span><h2>운영 현황</h2></div><small>최근 동기화 10:28</small></div><div class="bar-chart">${bars}</div></section><section class="panel"><div class="panel-head"><div><span>Records</span><h2>주요 항목</h2></div></div>${recordTable(screen)}</section></div>`;
}

function renderForm(screen) {
  const fields = screen.facts
    .map(
      ([label, value]) =>
        `<label class="field"><span>${label}</span><div>${value}</div><small>Source spec projection</small></label>`
    )
    .join("");
  const checks = screen.records
    .map(
      ([name, meta, state]) =>
        `<div class="check-row"><div><strong>${name}</strong><span>${meta}</span></div><span class="state ${tone(state)}">${state}</span></div>`
    )
    .join("");
  return `<div class="content-grid form-layout"><section class="panel"><div class="panel-head"><div><span>Configuration</span><h2>업무 입력</h2></div><small>필수 항목</small></div><div class="field-grid">${fields}</div></section><section class="panel"><div class="panel-head"><div><span>Validation</span><h2>연결 조건</h2></div></div><div class="check-list">${checks}</div></section></div>`;
}

function renderWorkflow(screen) {
  const steps = screen.records
    .map(
      ([name, meta, state], index) =>
        `<li><span class="step-index">${String(index + 1).padStart(2, "0")}</span><div><strong>${name}</strong><small>${meta}</small></div><span class="state ${tone(state)}">${state}</span></li>`
    )
    .join("");
  return `${metricCards(screen)}<div class="content-grid"><section class="panel"><div class="panel-head"><div><span>Workflow</span><h2>처리 단계</h2></div></div><ol class="workflow-steps">${steps}</ol></section><section class="panel context-panel"><div class="panel-head"><div><span>Evidence</span><h2>실행 전 확인</h2></div></div><div class="evidence"><div><strong>권한 범위</strong><span>현재 세션 actor와 관할을 확인했습니다.</span></div><div><strong>결재 참조</strong><span>ApprovalRequest와 idempotency key를 기록합니다.</span></div><div><strong>감사 기록</strong><span>처리자·승인자·일시를 별도 행으로 남깁니다.</span></div></div></section></div>`;
}

function renderTableScreen(screen) {
  return `${metricCards(screen)}<section class="panel full-panel"><div class="panel-head"><div><span>${screen.kind === "ledger" ? "Immutable records" : "Registry"}</span><h2>${screen.kind === "ledger" ? "원장·대사 기록" : "업무 목록"}</h2></div><div class="table-tools"><span>전체</span><span>최근 업데이트순</span></div></div>${recordTable(screen)}</section>`;
}

function showScreen(screenId, updateHash = true) {
  const screen = screens.find((item) => item.id === screenId) ?? screens[0];
  if (!screen) return;
  document.body.dataset.screenId = screen.id;
  title.textContent = screen.title;
  summary.textContent = screen.summary;
  breadcrumb.textContent = `${screen.group} / ${screen.route}`;
  status.innerHTML = `<div><strong>Authority boundary</strong><span>${screen.boundary}</span></div><code>${screen.id}</code>`;
  headerAction.replaceChildren();
  if (screen.action) {
    const button = document.createElement("button");
    button.className = "primary-action";
    button.textContent = screen.action;
    button.addEventListener("click", () =>
      showToast(`${screen.action} — demo 상태로 기록했습니다.`)
    );
    headerAction.appendChild(button);
  }
  content.innerHTML =
    screen.kind === "dashboard"
      ? renderDashboard(screen)
      : screen.kind === "form"
        ? renderForm(screen)
        : screen.kind === "workflow"
          ? renderWorkflow(screen)
          : renderTableScreen(screen);
  document
    .querySelectorAll("[data-screen-id]")
    .forEach((link) => link.classList.toggle("active", link.dataset.screenId === screen.id));
  if (updateHash) history.replaceState({}, "", `#${screen.id}`);
  document.querySelector(".content")?.scrollTo({ top: 0, behavior: "smooth" });
}

let toastTimer;
function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 2600);
}

search.addEventListener("input", () => {
  renderNavigation(search.value);
  const currentId = document.body.dataset.screenId;
  document
    .querySelectorAll("[data-screen-id]")
    .forEach((link) => link.classList.toggle("active", link.dataset.screenId === currentId));
});
window.addEventListener("hashchange", () => showScreen(location.hash.slice(1), false));

renderNavigation();
showScreen(location.hash.slice(1) || screens[0].id, false);
