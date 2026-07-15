const root = document.getElementById("screen-root");
const toast = document.getElementById("toast");
const params = new URLSearchParams(location.search);
let manifest;
let versionId;
let roleId;
let screenId;
let currentRole;
let currentScreen;
let toastTimer;

const roleActors = {
  policy: ["김정책", "정책 운영 담당"],
  roster: ["이명부", "사업·명부 담당"],
  approval: ["박결재", "결재 책임관"],
  payout: ["최지급", "지급 실행 담당"],
  issuance: ["정발행", "발행 계획 담당"],
  settlement: ["윤정산", "정산 운영 담당"],
  audit: ["한감사", "감사 담당"],
  access: ["오권한", "계정·권한 담당"]
};

const roleRows = {
  policy: [
    ["청년 지역화폐 지급 바우처", "보완 필요", "정책 담당", "오늘 14:20"],
    ["2026 생활안정 지원", "검토 중", "복지정책과", "오늘 11:05"],
    ["소상공인 소비지원", "승인 완료", "지역경제과", "어제 17:40"]
  ],
  roster: [
    ["청년 바우처 1차 명부", "검증 오류 12건", "8,420명", "오늘 13:42"],
    ["생활안정 2차 명부", "상신 대기", "3,108명", "오늘 10:15"],
    ["소비지원 추가 명부", "승인 완료", "1,902명", "어제 16:30"]
  ],
  approval: [
    ["청년 바우처 정책 승인", "정책 결재", "보완 요청", "30분 전"],
    ["생활안정 2차 명부", "명부 결재", "검토 대기", "1시간 전"],
    ["발행계획 IP-2026-0715", "발행 승인", "승인 대기", "어제"]
  ],
  payout: [
    ["청년 바우처 1차 지급", "실행 준비", "8,408명", "Gate 4/4"],
    ["생활안정 2차 지급", "재원 확인 중", "3,108명", "Gate 3/4"],
    ["소비지원 실패 재처리", "부분 실패", "17명", "재처리 가능"]
  ],
  issuance: [
    ["IP-2026-0715", "신규 발행 필요", "25.0억 원", "작성 중"],
    ["IP-2026-0708", "서명 대기", "12.8억 원", "승인 완료"],
    ["IP-2026-0630", "실행 완료", "8.4억 원", "원장 반영"]
  ],
  settlement: [
    ["2026-07-15 정산", "대사 완료", "18.2억 원", "예외 3건"],
    ["2026-07-14 정산", "지급 완료", "21.7억 원", "예외 없음"],
    ["가맹점 이의제기", "검토 필요", "420,000원", "2시간 전"]
  ],
  audit: [
    ["정책 보완 요청", "박결재", "정책 결재", "오늘 14:20"],
    ["명부 v3 상신", "이명부", "명부 관리", "오늘 13:42"],
    ["권한 범위 변경", "오권한", "계정·권한", "어제 18:05"]
  ],
  access: [
    ["김정책", "정책 운영 담당", "경기도 전역", "활성"],
    ["박결재", "결재 책임관", "정책·명부", "활성"],
    ["최지급", "지급 실행 담당", "지급 업무", "재인증 필요"]
  ]
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function copy(key, fallback) {
  const items = Array.isArray(currentScreen.copy) ? currentScreen.copy : [];
  return items.find((item) => item.key === key)?.text ?? fallback;
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = window.setTimeout(() => {
    toast.hidden = true;
  }, 3000);
}

function badge(label, tone = "") {
  return el("span", `badge ${tone}`.trim(), label);
}

function button(label, tone = "", onClick = () => showToast(`${label} 요청을 기록했습니다.`)) {
  const node = el("button", `button ${tone}`.trim(), label);
  node.type = "button";
  node.addEventListener("click", onClick);
  return node;
}

function sibling(index) {
  return currentRole.versions[versionId].screenIds[index];
}

function navigate(nextScreenId) {
  if (!nextScreenId) {
    showToast("이 역할의 추가 테스트 화면은 선택하지 않았습니다.");
    return;
  }
  if (window.parent !== window) {
    window.parent.postMessage(
      { type: "aawp:demo-navigate", screenId: nextScreenId },
      location.origin
    );
  } else {
    const next = new URL(location.href);
    next.searchParams.set("screen", nextScreenId);
    location.href = next;
  }
}

function field(label, value, options = {}) {
  const wrapper = el("label", `field${options.full ? " full" : ""}`);
  wrapper.append(el("span", "", label));
  const input = document.createElement(options.multiline ? "textarea" : "input");
  input.value = value;
  if (options.readonly) input.readOnly = true;
  wrapper.append(input);
  if (options.hint) wrapper.append(el("small", "", options.hint));
  return wrapper;
}

function panel(title, body, action) {
  const node = el("section", "panel");
  const head = el("header", "panel-head");
  head.append(el("h3", "", title));
  if (action) head.append(action);
  node.append(head, body);
  return node;
}

function pageHead(description, actions = []) {
  const head = el("div", "page-head");
  const copyNode = el("div");
  copyNode.append(el("h2", "", copy("title", currentScreen.title)), el("p", "", description));
  const actionNode = el("div", "actions");
  actionNode.append(...actions);
  head.append(copyNode, actionNode);
  return head;
}

function metrics() {
  const values = {
    policy: [
      ["처리 필요", "6건", "2건 보완"],
      ["검토 중", "4건", "오늘 3건"],
      ["승인 완료", "18건", "이번 달"],
      ["만료 예정", "2건", "30일 이내"]
    ],
    roster: [
      ["검증 중", "2건", "12개 오류"],
      ["상신 대기", "1건", "3,108명"],
      ["승인 완료", "9건", "이번 달"],
      ["전체 대상", "13,430명", "중복 제외"]
    ],
    approval: [
      ["결재 대기", "7건", "정책 3 · 명부 2"],
      ["보완 회신", "2건", "오늘 도착"],
      ["오늘 처리", "5건", "평균 42분"],
      ["기한 임박", "1건", "2시간 남음"]
    ],
    payout: [
      ["실행 준비", "1건", "Gate 통과"],
      ["진행 중", "2건", "11,516명"],
      ["부분 실패", "17명", "재처리 가능"],
      ["지급 완료", "38.4억", "오늘"]
    ],
    issuance: [
      ["작성 중", "3건", "신규 발행"],
      ["승인 대기", "2건", "25.0억 원"],
      ["서명 대기", "1건", "최종 서명"],
      ["실행 완료", "14건", "이번 달"]
    ],
    settlement: [
      ["오늘 정산", "18.2억", "대사 완료"],
      ["예외", "3건", "검토 필요"],
      ["지급 대기", "42곳", "15:00 예정"],
      ["정산율", "99.8%", "최근 7일"]
    ],
    audit: [
      ["오늘 활동", "142건", "정상"],
      ["민감 작업", "8건", "전부 승인"],
      ["검토 필요", "2건", "권한 변경"],
      ["보존 상태", "정상", "무결성 확인"]
    ],
    access: [
      ["활성 계정", "84명", "오늘 +2"],
      ["재인증 필요", "3명", "24시간 내"],
      ["권한 요청", "5건", "결재 대기"],
      ["휴면 예정", "2명", "7일 이내"]
    ]
  }[roleId];
  const grid = el("div", "metric-grid");
  for (const [label, value, note] of values) {
    const item = el("div", "metric");
    item.append(el("span", "", label), el("strong", "", value), el("small", "", note));
    grid.append(item);
  }
  return grid;
}

function renderList() {
  const descriptions = {
    policy: "내가 검토하거나 다음 행동을 해야 하는 정책 업무를 확인합니다.",
    roster: "회차별 명부 검증 상태와 다음 담당자에게 넘길 작업을 확인합니다.",
    approval: "정책, 명부와 발행 결재를 구분해 처리합니다.",
    payout: "지급 gate와 재인증 상태를 확인한 뒤 실행 작업을 엽니다.",
    issuance: "신규 발행이 필요한 사업의 계획과 승인 상태를 확인합니다.",
    settlement: "정산 대사와 예외 업무를 우선순위대로 확인합니다.",
    audit: "관리자 활동과 민감 작업의 승인 근거를 조회합니다.",
    access: "계정 상태와 역할·관할 권한 요청을 관리합니다."
  };
  const body = el("div");
  body.append(
    pageHead(descriptions[roleId], [
      button(roleId === "audit" ? "감사 내보내기" : "새로고침", "soft")
    ]),
    metrics()
  );
  const table = document.createElement("table");
  const headers = {
    policy: ["정책 업무", "상태", "담당", "최근 변경"],
    roster: ["명부 업무", "검증 상태", "대상", "최근 변경"],
    approval: ["결재 안건", "구분", "상태", "도착"],
    payout: ["지급 업무", "상태", "대상", "준비상태"],
    issuance: ["발행 계획", "구분", "규모", "상태"],
    settlement: ["정산 업무", "상태", "금액", "예외"],
    audit: ["활동", "실행자", "업무영역", "시각"],
    access: ["사용자", "역할", "관할", "상태"]
  }[roleId];
  const head = document.createElement("thead");
  const headerRow = document.createElement("tr");
  for (const label of [...headers, ""]) headerRow.append(el("th", "", label));
  head.append(headerRow);
  const tableBody = document.createElement("tbody");
  for (const [rowIndex, row] of roleRows[roleId].entries()) {
    const tr = document.createElement("tr");
    row.forEach((value, index) => {
      const cell = el("td");
      if (index === 0)
        cell.append(
          el("strong", "", value),
          el("small", "", rowIndex === 0 ? "우선 처리" : "정상 처리")
        );
      else if (index === 1 || index === 3)
        cell.append(
          badge(
            value,
            value.includes("완료") || value.includes("활성")
              ? "success"
              : value.includes("오류") || value.includes("실패")
                ? "danger"
                : "pending"
          )
        );
      else cell.textContent = value;
      tr.append(cell);
    });
    const actionCell = el("td");
    const open = el("button", "row-action", "열기");
    open.type = "button";
    open.addEventListener("click", () => navigate(sibling(1)));
    actionCell.append(open);
    tr.append(actionCell);
    tableBody.append(tr);
  }
  table.append(head, tableBody);
  const filters = el("div", "filters");
  filters.append(button("상태 전체", "filter"), button("내 처리 필요", "filter"));
  body.append(
    panel(roleId === "audit" ? "활동 기록" : "업무 목록", el("div", "table-wrap"), filters)
  );
  body.querySelector(".table-wrap").append(table);
  return body;
}

function checkList() {
  const labels = {
    policy: [
      "정책 근거와 대상 조건",
      "재원·유통 단위",
      "결재선과 시행 일정",
      "미확정 정책 사실 분리"
    ],
    roster: ["파일 형식과 필수 열", "중복·자격 검증", "오류 대상 수정", "확정 버전 상신"],
    approval: ["요청자와 권한", "정책·명부 근거", "영향 범위", "결재 의견 기록"],
    payout: ["정책 승인 상태", "명부 승인 상태", "재원과 발행 준비", "실행자 재인증"],
    issuance: ["승인된 정책 참조", "발행 한도와 준비금", "승인과 최종 서명 분리", "실행 권한 확인"],
    settlement: ["원장 대사", "가맹점 지급액", "예외 사유", "결재 근거"],
    audit: ["실행자 신원", "변경 전·후", "승인 근거", "보존 무결성"],
    access: ["요청자 본인 확인", "업무상 필요", "직무분리 충돌", "만료일과 재검토"]
  }[roleId];
  const list = el("div", "check-list");
  labels.forEach((label, index) => {
    const row = el("div", "check-row");
    row.append(el("span", "check-icon", "✓"));
    const content = el("div", "check-copy");
    content.append(
      el("strong", "", label),
      el("small", "", index === labels.length - 1 ? "실행 전 최종 확인" : "검증 완료")
    );
    row.append(
      content,
      badge(
        index === labels.length - 1 && roleId === "payout" ? "재인증 필요" : "확인",
        index === labels.length - 1 && roleId === "payout" ? "pending" : "success"
      )
    );
    list.append(row);
  });
  return list;
}

function renderDetail() {
  const form = el("div", "form-grid");
  const values = {
    policy: [
      "사업명",
      "청년 지역화폐 지급 바우처",
      "담당 부서",
      "복지정책과",
      "적용 대상",
      "확정 명부 대상자",
      "시행 메모",
      "정확한 연령·금액·일정은 정책 확정 후 입력"
    ],
    roster: [
      "명부명",
      "청년 바우처 1차 명부",
      "대상 인원",
      "8,420명",
      "검증 결과",
      "오류 12건 · 중복 0건",
      "확정 메모",
      "오류 수정 후 v3로 상신 예정"
    ],
    approval: [
      "결재 안건",
      "청년 바우처 정책 승인",
      "요청 부서",
      "복지정책과",
      "검토 결과",
      "보완 필요",
      "결재 의견",
      "미확정 지급액과 시행일을 확정해 재상신하세요."
    ],
    payout: [
      "지급 회차",
      "청년 바우처 1차",
      "지급 대상",
      "8,408명",
      "예상 금액",
      "정책 확정 후 계산",
      "실행 메모",
      "실패 대상만 별도 재처리하며 중복 지급을 차단합니다."
    ],
    issuance: [
      "발행 계획",
      "IP-2026-0715",
      "연결 사업",
      "청년 바우처 1차",
      "예상 발행액",
      "2,500,000,000원",
      "승인 메모",
      "발행 승인 후 최종 서명자에게 별도 인계합니다."
    ],
    settlement: [
      "예외 유형",
      "가맹점 지급액 불일치",
      "대상",
      "경기상점 외 2곳",
      "차이 금액",
      "420,000원",
      "처리 메모",
      "원장 대사 근거를 첨부하고 결재를 요청합니다."
    ],
    audit: [
      "조회 범위",
      "정책·명부·지급",
      "기간",
      "2026-07-15",
      "민감 작업",
      "권한 변경 2건",
      "검토 메모",
      "변경 전후 권한과 승인 근거를 함께 확인합니다."
    ],
    access: [
      "대상 사용자",
      "최지급",
      "부여 역할",
      "지급 실행 담당",
      "관할 범위",
      "지급 업무",
      "승인 메모",
      "재인증 후 90일 동안 지급 실행 권한을 부여합니다."
    ]
  }[roleId];
  for (let index = 0; index < values.length; index += 2) {
    form.append(
      field(values[index], values[index + 1], {
        multiline: index === values.length - 2,
        full: index === values.length - 2
      })
    );
  }
  const primaryLabels = {
    policy: "검토 완료 후 상신",
    roster: "확정 버전 상신",
    approval: "보완 요청",
    payout: "재인증 후 지급 시작",
    issuance: "발행 승인 요청",
    settlement: "예외 결재 요청",
    audit: "검토 완료 기록",
    access: "권한 부여 요청"
  };
  const status = el("div", "status-banner");
  status.hidden = true;
  const submit = button(primaryLabels[roleId], "primary", () => {
    status.textContent = `${primaryLabels[roleId]} 요청이 기록됐습니다. 다음 담당자에게 인계합니다.`;
    status.hidden = false;
    showToast("요청을 처리했습니다. 실행자와 시각을 기록했습니다.");
  });
  const left = el("div");
  left.append(panel("업무 정보", form));
  const right = el("div");
  right.append(panel("실행 전 확인", checkList()));
  const grid = el("div", "detail-grid");
  grid.append(left, right);
  const body = el("div");
  body.append(
    pageHead("업무 근거와 준비상태를 확인하고 허용된 다음 행동만 실행합니다.", [
      button("목록으로", "", () => navigate(sibling(0))),
      submit
    ]),
    status,
    grid
  );
  return body;
}

function renderRail() {
  const rail = el("aside", "rail");
  const brand = el("div", "brand");
  const brandCopy = el("div");
  brandCopy.append(el("strong", "", "경기 정책관리"), el("small", "", "관리 콘솔"));
  brand.append(el("span", "brand-mark", "G"), brandCopy);
  rail.append(brand, el("span", "rail-label", "업무 영역"));
  const nav = el("nav", "role-nav");
  for (const role of manifest.roles) {
    const item = el("button", role.id === roleId ? "active" : "");
    item.type = "button";
    item.title = role.label;
    item.append(el("span", "", role.label));
    item.addEventListener("click", () => {
      if (window.parent !== window)
        window.parent.postMessage({ type: "aawp:select-role", roleId: role.id }, location.origin);
      else {
        const nextScreen = role.versions[versionId].screenIds[0];
        if (!nextScreen) return showToast("이 버전에는 전용 화면이 없습니다.");
        const next = new URL(location.href);
        next.searchParams.set("role", role.id);
        next.searchParams.set("screen", nextScreen);
        location.href = next;
      }
    });
    nav.append(item);
  }
  const [name, roleLabel] = roleActors[roleId];
  const actor = el("div", "actor");
  const actorCopy = el("div");
  actorCopy.append(el("strong", "", name), el("small", "", `${roleLabel} · 경기도`));
  actor.append(el("span", "avatar", name.slice(0, 1)), actorCopy);
  rail.append(nav, actor);
  return rail;
}

function render() {
  document.title = copy("title", currentScreen.title);
  const shell = el("div", "shell");
  shell.append(renderRail());
  const workspace = el("div", "workspace");
  const chrome = el("header", "chrome");
  const heading = el("div");
  heading.append(
    el("span", "breadcrumb", currentRole.label),
    el("h1", "", copy("title", currentScreen.title))
  );
  const badges = el("div", "chrome-badges");
  badges.append(
    badge("예시 데이터"),
    badge("세션 확인됨", "success"),
    badge("경기도 전역", "authority")
  );
  chrome.append(heading, badges);
  const page = el("main", "page");
  const listLike = new Set([
    "admin-policy-list",
    "admin-roster-work-list",
    "admin-approval-inbox",
    "admin-payout-work-list",
    "admin-issuance-plans",
    "admin-settlement-dashboard",
    "admin-audit-log",
    "admin-account-management"
  ]).has(screenId);
  page.append(listLike ? renderList() : renderDetail());
  workspace.append(chrome, page);
  shell.append(workspace);
  root.replaceChildren(shell);
}

async function start() {
  const response = await fetch("./comparison-manifest.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`manifest load failed: ${response.status}`);
  manifest = await response.json();
  versionId = params.get("version") ?? "baseline";
  roleId = params.get("role") ?? "policy";
  screenId = params.get("screen");
  currentRole = manifest.roles.find((item) => item.id === roleId);
  currentScreen = manifest.screens[versionId]?.find((item) => item.id === screenId);
  if (!currentRole || !currentScreen) throw new Error("선택한 담당자 화면을 찾을 수 없습니다.");
  render();
}

start().catch((error) => {
  const empty = el("div", "empty");
  empty.append(el("strong", "", "화면을 열지 못했습니다."), el("p", "", error.message));
  root.replaceChildren(empty);
});
