const root = document.getElementById("screen-root");

let artifact;
let toastTimer;

const componentAdapterKinds = Object.freeze({
  AccessibleStatusRow: "status",
  AdminAuthPanel: "authentication",
  ApprovalChainStepper: "approval",
  ApprovalPolicyPicker: "approval",
  ApproverSelector: "approval",
  AuditTrailRow: "audit",
  AuthorityScopeBadge: "authority",
  BurnSettlementPolicyEditor: "form",
  CirculationPolicyComposer: "form",
  CirculationUnitPicker: "selector",
  CirculationWalletPanel: "wallet",
  ConsoleNavRail: "navigation",
  ConvertibilityRulePanel: "form",
  CustomerFundsSafeguardingPanel: "governance",
  EligibilityRuleBuilder: "builder",
  InstrumentClassificationMappingPanel: "governance",
  InternalLedgerStatusPanel: "ledger",
  IssuanceExecutionPanel: "execution",
  IssuanceLimitPanel: "form",
  IssuancePlanForm: "form",
  IssuancePlanTable: "table",
  IssuerConsoleNavRail: "navigation",
  JurisdictionExitPanel: "form",
  LedgerTable: "table",
  OnchainWalletProvisioningPanel: "wallet",
  OperationPlanPanel: "form",
  PermissionGate: "authority",
  PolicyConditionBinder: "selector",
  PolicyEffectMetricCard: "metric",
  PolicyLifecycleTable: "table",
  PooledAccountPanel: "account",
  ProofOfReserveRegistry: "table",
  ReconciliationPanel: "reconciliation",
  RedeemBurnConsole: "execution",
  ReserveAssetRegistry: "table",
  ReserveBackingPanel: "governance",
  ReserveIssuanceMatchPanel: "reconciliation",
  RosterBuilderPanel: "builder",
  SearchField: "search",
  SessionActorBadge: "authority",
  SettlementBatchRunPanel: "execution",
  SignerIdentityBinder: "approval",
  TopupPolicyPanel: "form",
  TransactionTraceTable: "table",
  VoucherPolicySetupPanel: "form"
});

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function copy(key, fallback = key) {
  return artifact.screen.copy.find((item) => item.key === key)?.text ?? fallback;
}

function affordance(suffix) {
  return artifact.interactions.affordances.find((item) => item.id.endsWith(`.${suffix}`));
}

function showToast(message, tone = "info") {
  const toast = document.getElementById("demo-toast");
  window.clearTimeout(toastTimer);
  toast.className = `demo-toast ${tone}`;
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = window.setTimeout(() => {
    toast.hidden = true;
  }, 3400);
}

function showDrawer(title, body, feedback) {
  document.getElementById("drawer-title").textContent = title;
  document
    .getElementById("drawer-body")
    .replaceChildren(
      el("p", "drawer-copy", body),
      feedback ? el("p", "spec-feedback", feedback) : el("span")
    );
  document.getElementById("demo-drawer").hidden = false;
}

function navigate(resolution, interactionId) {
  if (resolution.kind === "selected-screen") {
    if (window.parent !== window) {
      window.parent.postMessage(
        { type: "aawp:demo-navigate", screenId: resolution.screenId, interactionId },
        location.origin
      );
    } else {
      location.href = `./screen.html?artifact=${encodeURIComponent(
        `screen-artifacts/${resolution.screenId}.json`
      )}`;
    }
    return;
  }
  const message = resolution.reason ?? "원본 spec에서 이동 목적지를 확인할 수 없습니다.";
  showDrawer(
    resolution.kind === "out-of-scope-screen" ? "이번 데모 범위 밖" : "Spec feedback",
    message,
    resolution.kind === "unresolved-navigation"
      ? `interaction: ${interactionId} · source target: ${resolution.target}`
      : `source screen: ${resolution.screenId}`
  );
}

function runAction(action, options = {}) {
  if (!action) {
    showToast("이 요소의 interaction을 원본 spec에서 찾지 못했습니다.", "warning");
    return;
  }
  if (action.action === "navigate") {
    navigate(action.resolution, action.id);
    return;
  }
  if (action.action === "openSheet") {
    showDrawer(options.title ?? "상세 정보", action.expected, `source target: ${action.target}`);
    return;
  }
  if (action.action === "setLocalState") {
    if (options.drawer) showDrawer(options.title ?? "상세 정보", action.expected);
    else showToast(options.message ?? action.expected);
    return;
  }
  showToast("처리 중…");
  window.setTimeout(() => {
    showToast(
      options.success ?? "요청이 처리됐습니다. 실행자와 처리 시각을 기록했습니다.",
      "success"
    );
    const banner = document.getElementById("action-status");
    if (banner) {
      banner.hidden = false;
      banner.textContent = options.success ?? action.expected;
    }
  }, 420);
}

function actionButton(label, suffix, variant = "secondary", options = {}) {
  const button = el("button", `button ${variant}`, label);
  button.type = "button";
  button.dataset.interaction = suffix;
  button.addEventListener("click", () => {
    options.before?.();
    runAction(affordance(suffix), options);
  });
  return button;
}

function field(label, value, options = {}) {
  const wrapper = el("label", "field");
  wrapper.append(el("span", "field-label", label));
  const input = document.createElement(options.multiline ? "textarea" : "input");
  if (!options.multiline) input.type = options.type ?? "text";
  input.value = value;
  if (options.readonly) input.readOnly = true;
  if (options.placeholder) input.placeholder = options.placeholder;
  wrapper.append(input);
  if (options.hint) wrapper.append(el("small", "field-hint", options.hint));
  return wrapper;
}

function selectField(label, values, interactionSuffix) {
  const wrapper = el("label", "field");
  wrapper.append(el("span", "field-label", label));
  const select = el("select");
  for (const value of values) {
    const option = el("option", "", value);
    option.value = value;
    select.append(option);
  }
  if (interactionSuffix) {
    select.addEventListener("change", () =>
      runAction(affordance(interactionSuffix), { message: `${label}: ${select.value}` })
    );
  }
  wrapper.append(select);
  return wrapper;
}

function card(title, body, className = "") {
  const node = el("section", `panel ${className}`.trim());
  const head = el("div", "panel-head");
  head.append(el("h2", "", title));
  node.append(head);
  if (typeof body === "string") node.append(el("p", "panel-copy", body));
  else if (body) node.append(body);
  return node;
}

function badgeIcon(tone) {
  const iconNames = {
    success: "check",
    pending: "clock",
    danger: "triangle-alert",
    authority: "shield-check",
    neutral: "info"
  };
  const icon = el("span", "badge-icon");
  icon.setAttribute("aria-hidden", "true");
  icon.style.setProperty(
    "--badge-icon-source",
    `url("./icons/${iconNames[tone] ?? iconNames.neutral}.svg")`
  );
  return icon;
}

function badge(text, tone = "neutral") {
  const node = el("span", `badge ${tone}`);
  node.append(badgeIcon(tone), el("span", "", text));
  return node;
}

function metric(label, value, note, tone = "") {
  const node = el("article", `metric ${tone}`.trim());
  node.append(el("span", "metric-label", label), el("strong", "", value));
  if (note) node.append(el("small", "", note));
  return node;
}

function table(headers, rows, rowClick) {
  const wrap = el("div", "table-wrap");
  const tableNode = el("table");
  const thead = el("thead");
  const headerRow = el("tr");
  for (const header of headers) headerRow.append(el("th", "", header));
  thead.append(headerRow);
  const tbody = el("tbody");
  rows.forEach((row, index) => {
    const tr = el("tr", rowClick ? "clickable" : "");
    row.forEach((cell) => {
      const td = el("td");
      if (cell instanceof Node) td.append(cell);
      else td.textContent = cell;
      tr.append(td);
    });
    if (rowClick) tr.addEventListener("click", () => rowClick(index, row));
    tbody.append(tr);
  });
  tableNode.append(thead, tbody);
  wrap.append(tableNode);
  return wrap;
}

function formGrid(...children) {
  const grid = el("div", "form-grid");
  grid.append(...children);
  return grid;
}

function actionRow(...children) {
  const row = el("div", "action-row");
  row.append(...children);
  return row;
}

function statusBanner(text, tone = "info") {
  const node = el("div", `status-banner ${tone}`);
  node.append(el("span", "status-icon", tone === "success" ? "✓" : "i"), el("p", "", text));
  return node;
}

function filterBar(...children) {
  const bar = el("div", "filter-bar");
  bar.append(...children);
  return bar;
}

function approvalPanel() {
  const body = el("div", "approval-chain");
  for (const [role, name, state] of [
    ["작성", "정책 운영 담당자", "완료"],
    ["검토", "준법 책임자", "대기"],
    ["승인", "관할 승인자", "대기"]
  ]) {
    const row = el("div", "approval-step");
    row.append(
      badge(role, state === "완료" ? "success" : "pending"),
      el("strong", "", name),
      el("small", "", state)
    );
    body.append(row);
  }
  return card("결재선", body, "approval-panel");
}

function renderPolicyList() {
  const content = el("div", "screen-stack");
  const rows = [
    [
      "청년기본소득 2026",
      "상품권 정책",
      "청년기회과",
      "경기도",
      badge("승인 · 활성", "success"),
      "ip-youth-2026"
    ],
    ["지역화폐 충전 정책", "충전 정책", "지역금융과", "안양시", badge("결재 대기", "pending"), "—"],
    [
      "소상공인 소비지원",
      "일반 정책",
      "민생경제과",
      "수원시",
      badge("실행 차단", "danger"),
      "ip-local-031"
    ]
  ];
  const tableNode = table(
    ["정책명", "정책 구분", "담당부서", "유통 단위", "상태", "발행계획 참조"],
    rows,
    (index) =>
      runAction(affordance("versionCompare"), {
        drawer: true,
        title: `${rows[index][0]} · 버전 이력`
      })
  );
  content.append(
    filterBar(
      selectField(
        copy("approvalStatusFilter"),
        ["전체", "승인", "결재 대기", "반려"],
        "approvalStatusFilter"
      ),
      selectField(
        copy("lifecycleStatusFilter"),
        ["전체", "활성", "만료", "대체됨"],
        "lifecycleStatusFilter"
      ),
      selectField(
        copy("executionStatusFilter"),
        ["전체", "실행 가능", "실행 차단"],
        "executionStatusFilter"
      ),
      selectField(
        copy("policyCategoryFilter"),
        ["전체", "일반 정책", "충전 정책", "상품권 정책"],
        "policyCategoryFilter"
      )
    ),
    actionRow(
      actionButton(copy("newPolicyCta"), "newPolicy", "primary"),
      actionButton(copy("topupEntryCta"), "newTopupPolicy"),
      actionButton(copy("voucherEntryCta"), "newVoucherPolicy")
    ),
    card("정책 목록", tableNode)
  );
  return content;
}

function renderComposer() {
  const content = el("div", "composer-layout");
  const main = el("div", "screen-stack");
  const stepBody = el("div", "step-body");
  const steps = [
    "stepIssuance",
    "stepEligibility",
    "stepUsage",
    "stepRecovery",
    "stepCirculation",
    "stepConvertibility"
  ];
  const renderStep = (index) => {
    const forms = [
      formGrid(
        selectField("신규 발행 필요", ["필요", "기존 발행량 사용"], "toggleNeedsNewIssuance"),
        field("정책 목적", "지역 청년의 생활 안정 지원")
      ),
      formGrid(
        selectField(
          "대상 조건 세트",
          ["경기도 청년 · 승인됨", "안양시 거주자 · 승인됨"],
          "selectEligibilityConditionSet"
        ),
        field("조건 요약", "만 24세 · 경기도 3년 이상 거주", { readonly: true })
      ),
      formGrid(
        selectField(
          "사용 조건 세트",
          ["경기도 생활업종 · 승인됨", "전통시장 업종 · 승인됨"],
          "selectUsageConditionSet"
        ),
        field("허용 코드", "MCC 5411, 5499 · UNSPSC 50", { readonly: true })
      ),
      formGrid(
        selectField("회수 방법", ["기간 종료 후 정책재원 회수", "상환으로 종결"]),
        field("유예 기간", "30일")
      ),
      formGrid(
        selectField("유통 단위", ["경기도", "안양시", "수원시"], "selectExistingCirculationUnit"),
        field("집합계좌", "경기도 정책자금 전용계좌 · 권한 확인됨", { readonly: true })
      ),
      formGrid(
        selectField("상환 허용", ["정책 조건에 따름", "허용하지 않음"]),
        field("일일 상환 한도", "300,000원")
      )
    ];
    stepBody.replaceChildren(forms[index]);
  };
  const stepper = el("div", "stepper");
  steps.forEach((key, index) => {
    const button = el("button", index === 0 ? "active" : "", copy(key));
    button.type = "button";
    button.addEventListener("click", () => {
      [...stepper.children].forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      renderStep(index);
      runAction(affordance("step"), { message: copy(key) });
    });
    stepper.append(button);
  });
  renderStep(0);
  main.append(
    card("정책 구성", stepper),
    card("선택 단계 입력", stepBody),
    statusBanner(copy("conditionSetOnlyNote")),
    actionRow(
      actionButton("조건 빌더에서 수정", "openConditionBuilder"),
      actionButton(copy("submitCta"), "submit", "primary", { success: copy("successMsg") })
    )
  );
  content.append(main, approvalPanel());
  return content;
}

function renderTopupPolicy() {
  const main = el("div", "two-column");
  const left = el("div", "screen-stack");
  left.append(
    card(
      "충전 정책 기본정보",
      formGrid(
        field("정책명", "경기 통합월렛 충전 정책"),
        selectField("유통 단위", ["경기도", "안양시"], "selectCirculationUnit")
      )
    ),
    card(
      "대상 및 사용 조건",
      formGrid(
        selectField(
          copy("eligibilitySetLabel"),
          ["경기도 주민 · 승인됨", "강화 KYC · 승인됨"],
          "selectEligibilityConditionSet"
        ),
        selectField(
          copy("usageSetLabel"),
          ["생활업종 · 승인됨", "제한 없음 · 승인됨"],
          "selectUsageConditionSet"
        )
      )
    ),
    card(
      "충전 한도",
      formGrid(
        field("1일 한도", "500,000원"),
        field("월 한도", "2,000,000원"),
        selectField(copy("autoTopupLabel"), ["허용", "허용 안 함"], "editLimits")
      )
    )
  );
  const right = el("div", "screen-stack");
  right.append(
    statusBanner("고객충전금 계좌 운용 권한 확인됨", "success"),
    card(
      "고객충전금 계좌",
      table(
        ["계좌", "용도", "권한"],
        [["신한 110-***-221", "고객충전금 분리예치", badge("확인됨", "success")]]
      )
    ),
    actionButton("법적 구조 근거 보기", "reviewCustomerFundsSafeguarding"),
    approvalPanel(),
    actionButton(copy("submitCta"), "submit", "primary", { success: copy("successMsg") })
  );
  main.append(left, right);
  return main;
}

function renderVoucherPolicy() {
  const layout = el("div", "composer-layout");
  const main = el("div", "screen-stack");
  const sections = [
    "sectionBasics",
    "sectionTargetAmount",
    "sectionUsage",
    "sectionCirculationUnit",
    "sectionFunding",
    "sectionExecution",
    "sectionLifecycle",
    "sectionApproval",
    "sectionReview"
  ];
  const accordion = el("div", "form-sections");
  sections.forEach((key, index) => {
    const details = el("details", "form-section");
    if (index < 2) details.open = true;
    details.append(el("summary", "", copy(key)));
    const body = el("div", "form-section-body");
    if (index === 0)
      body.append(
        formGrid(
          field("정책명", "2026 청년기본소득 상품권"),
          field("시행 기간", "2026.07.01 — 2026.12.31")
        )
      );
    else if (index === 1)
      body.append(
        formGrid(
          selectField(
            "대상 조건",
            ["경기도 만 24세 청년 · 승인됨"],
            "selectEligibilityForGrantRow"
          ),
          field("1인 지급액", "250,000원")
        )
      );
    else if (index === 2)
      body.append(
        selectField("사용 조건", ["경기도 생활업종 · 승인됨"], "selectUsageConditionSet")
      );
    else if (index === 3)
      body.append(selectField("유통 단위", ["경기도"], "selectCirculationUnit"));
    else if (index === 4)
      body.append(
        selectField("재원/집합계좌", ["경기도 정책자금 계좌 · 선택 가능"], "selectPooledAccount")
      );
    else if (index === 5)
      body.append(
        selectField(
          "지급 실행 방식",
          ["명부 바로 지급", "신청 후 지급"],
          "selectPayoutExecutionMode"
        )
      );
    else if (index === 6) body.append(statusBanner(copy("fixedLifecycleNote")));
    else if (index === 7)
      body.append(selectField("결재 정책", ["정책 3단계 결재"], "configureApproval"));
    else body.append(statusBanner(copy("reviewAmountSummary"), "success"));
    details.append(body);
    accordion.append(details);
  });
  main.append(
    accordion,
    actionRow(
      actionButton(copy("emptyConditionCta"), "openConditionBuilderFromEmpty"),
      actionButton(copy("submitCta"), "submit", "primary", { success: copy("successMsg") })
    )
  );
  layout.append(main, approvalPanel());
  return layout;
}

function renderConditionBuilder() {
  const node = el("div", "condition-layout");
  const tabs = el("div", "vertical-tabs");
  const canvas = card("대상 조건 규칙", null, "builder-canvas");
  const setTab = (usage) => {
    [...tabs.children].forEach((item) =>
      item.classList.toggle("active", item.dataset.tab === (usage ? "usage" : "eligibility"))
    );
    canvas.querySelector("h2").textContent = usage ? "사용 조건 규칙" : "대상 조건 규칙";
    const rules = el("div", "rule-list");
    for (const [name, operator, value] of usage
      ? [
          ["허용 업종코드", "포함", "MCC 5411 · 식료품점"],
          ["허용 품목코드", "포함", "UNSPSC 50 · 식품"]
        ]
      : [
          ["연령", "이상", "24세"],
          ["거주지", "일치", "경기도"],
          ["거주기간", "이상", "3년"]
        ]) {
      const rule = el("div", "rule-row");
      rule.append(
        field("속성", name, { readonly: true }),
        field("연산자", operator, { readonly: true }),
        field("값", value)
      );
      rules.append(rule);
    }
    canvas.querySelector(".rule-list")?.remove();
    canvas.append(rules, actionButton("규칙 추가", "addRule"));
  };
  [
    ["eligibility", copy("tabEligibility")],
    ["usage", copy("tabUsage")]
  ].forEach(([id, label]) => {
    const button = el("button", id === "eligibility" ? "active" : "", label);
    button.dataset.tab = id;
    button.type = "button";
    button.addEventListener("click", () => {
      setTab(id === "usage");
      runAction(affordance("tabSwitch"), { message: `${label} 탭` });
    });
    tabs.append(button);
  });
  const codes = card("표준 코드 선택", null, "code-panel");
  codes.append(
    field("코드 검색", "", { placeholder: "업종·품목 검색" }),
    table(
      ["코드", "표시명"],
      [
        ["5411", "식료품점"],
        ["5812", "음식점"],
        ["5010", "식품"]
      ]
    )
  );
  setTab(false);
  node.append(tabs, canvas, codes);
  const stack = el("div", "screen-stack");
  stack.append(
    node,
    actionRow(
      actionButton(copy("saveCta"), "saveEligibility", "primary", { success: copy("successMsg") })
    )
  );
  return stack;
}

function renderEffectDashboard() {
  const stack = el("div", "screen-stack");
  const metrics = el("div", "metric-grid");
  [
    ["대상자 수", "128,420명", "+4.2%"],
    ["지급 총액", "321.0억원", "누적"],
    [copy("metricPosDiscount"), "18.4억원", "이번 달"],
    [copy("metricPayback"), "7.8억원", "이번 달"],
    [copy("metricVoucherGrant"), "96.2억원", "이번 달"],
    ["사용률", "68.4%", "+2.1%p"],
    ["회수액", "3.2억원", "정산 완료"],
    [copy("metricUnusedExpiry"), "12.7억원", "30일 이내"]
  ].forEach((item) => metrics.append(metric(...item)));
  stack.append(
    filterBar(
      selectField("정책", ["전체 정책", "청년기본소득 2026"], "policyFilter"),
      selectField("유통 단위", ["전체", "경기도", "안양시"], "unitFilter"),
      actionButton("새로고침", "refresh")
    ),
    metrics,
    statusBanner(copy("asOfNote").replace("{asOf}", "2026.07.15 10:30"))
  );
  return stack;
}

function renderCirculationDashboard() {
  const stack = el("div", "screen-stack");
  const metrics = el("div", "metric-grid four");
  [
    ["유통 잔액", "482.1억원", "as-of 10:30"],
    ["지급의무 합계", "479.8억원", "InternalLedger"],
    ["오늘 거래", "18,204건", "+8.1%"],
    ["대사 상태", "일치", "최근 10:28"]
  ].forEach((item) => metrics.append(metric(...item)));
  stack.append(
    filterBar(selectField("유통 단위", ["경기도", "안양시", "수원시"], "unitPicker")),
    metrics
  );
  const grid = el("div", "two-column");
  grid.append(
    card(
      "유통 지갑",
      table(["네트워크", "주소", "상태"], [["Polygon", "0x71C…09A2", badge("발급됨", "success")]])
    ),
    card(
      "InternalLedger",
      table(
        ["원장", "부채 합계", "대사"],
        [["il-cu-gyeonggi", "47,980,000,000원", badge("일치", "success")]]
      )
    )
  );
  stack.append(
    grid,
    actionRow(
      actionButton("집합계좌 미리보기", "openPooledAccountPreview"),
      actionButton("지갑 발급 상태", "openWalletProvisioningStatus"),
      actionButton("InternalLedger 상태", "openInternalLedgerStatus")
    )
  );
  return stack;
}

function renderCirculationReconciliation() {
  const stack = el("div", "screen-stack");
  stack.append(
    filterBar(
      selectField("유통 단위", ["경기도", "안양시"]),
      selectField("대사 기준일", ["2026.07.15", "2026.07.14"])
    ),
    statusBanner(copy("noManualEdit"))
  );
  const equations = el("div", "reconciliation-grid");
  [
    [copy("liabilitySection"), "47,980,000,000원", "47,980,000,000원"],
    [copy("fundingSection"), "48,200,000,000원", "47,980,000,000원"]
  ].forEach(([title, left, right]) => {
    const body = el("div", "equation");
    body.append(
      metric("원장 기준", left),
      el("strong", "equation-mark", "="),
      metric("검증 기준", right),
      badge("일치", "success")
    );
    stack.append(card(title, body));
  });
  stack.append(
    actionRow(
      actionButton("지급의무 검증", "verifyLiabilityCommit", "primary"),
      actionButton("대사 실행", "runReconciliation"),
      actionButton("감사 sign-off", "signOff"),
      actionButton("불일치 에스컬레이션", "escalate", "danger")
    )
  );
  return stack;
}

function renderRosterBuilder() {
  const layout = el("div", "two-column");
  const left = el("div", "screen-stack");
  left.append(
    card(
      "운영계획",
      formGrid(
        selectField("정책", ["청년기본소득 2026"], "pickPolicyForPlan"),
        field("지급 예정일", "2026.07.25"),
        field("회차", "2회차"),
        field("수령 동의", "자동 수령")
      )
    ),
    card(
      "후보 명부",
      table(
        ["구분", "후보", "조건 통과", "제외"],
        [
          ["시스템 조건 평가", "132,840명", "128,420명", "4,420명"],
          ["업로드 보정", "1,204명", "1,180명", "24명"]
        ]
      )
    )
  );
  const right = el("div", "screen-stack");
  right.append(
    card("지급 예상", el("div", "metric-grid one")),
    approvalPanel(),
    actionButton(copy("confirmCta"), "confirm", "primary")
  );
  right.querySelector(".metric-grid").append(metric("확정 대상", "129,600명", "예상 총액 324억원"));
  layout.append(left, right);
  return layout;
}

function renderSettlementBatch() {
  const stack = el("div", "screen-stack");
  stack.append(
    statusBanner(copy("closedBoundaryNote")),
    card(
      "정산 배치",
      table(
        ["배치", "유통 단위", "거래", "정산액", "상태"],
        [
          ["sb-20260715-01", "경기도", "12,840건", "18.2억원", badge("실행 가능", "success")],
          ["sb-20260715-02", "안양시", "2,140건", "3.1억원", badge("검토 필요", "pending")]
        ]
      )
    ),
    actionRow(
      actionButton(copy("runBatchCta"), "runBatch", "primary"),
      actionButton(copy("recordPaybackCta"), "recordPostPurchasePaybackBatch")
    )
  );
  return stack;
}

function renderJurisdictionExit() {
  const stack = el("div", "screen-stack");
  stack.append(
    statusBanner(copy("notMigrationNote")),
    card(
      "대상자 및 잔액",
      formGrid(
        field("사용자", "김경기 · w-anyang-0001"),
        field("출발 유통 단위", "안양시", { readonly: true }),
        field("정책자금 잔액", "82,000원", { readonly: true }),
        field("충전 원금", "50,000원", { readonly: true })
      )
    ),
    card(
      "종결 방식",
      formGrid(
        selectField(
          copy("outcomeLabel"),
          [copy("redeemOutcome"), copy("continueUseOutcome"), copy("recoverOutcome")],
          "selectOutcome"
        ),
        field("처리 사유", "전출에 따른 자격 상실")
      )
    ),
    actionRow(
      actionButton("정책자금 회수 결재", "recoverPolicyFund", "danger"),
      actionButton("상환으로 종결", "redeemRemainingBalance", "primary"),
      actionButton("계속 사용", "continueUse")
    )
  );
  return stack;
}

function renderRedeem() {
  const layout = el("div", "two-column");
  const left = el("div", "screen-stack");
  left.append(
    card(
      "상환 요청",
      formGrid(
        field("요청 ID", "rdm-20260715-0184"),
        field("사용자", "김경기"),
        field("상환액", "82,000원"),
        field("유통 단위", "안양시", { readonly: true })
      )
    ),
    statusBanner(copy("fundingSource"))
  );
  const right = el("div", "screen-stack");
  right.append(
    card(
      "집행 게이트",
      table(
        ["확인 항목", "결과"],
        [
          ["결재 완료", badge("확인", "success")],
          ["계좌 운용 권한", badge("확인", "success")],
          ["원장 대사", badge("일치", "success")]
        ]
      )
    ),
    actionButton(copy("executeCta"), "execute", "primary")
  );
  layout.append(left, right);
  return layout;
}

function renderTransactionTrace() {
  const stack = el("div", "screen-stack");
  stack.append(
    filterBar(
      field("거래 검색", "", { placeholder: "거래 ID · 사용자 · 가맹점" }),
      selectField("상품권", ["전체", "청년기본소득", "충전금"], "filter")
    ),
    card(
      "거래 결과",
      table(
        ["거래 ID", "일시", "가맹점", "상품권", "금액", "상태"],
        [
          [
            "tx-841203",
            "07.15 10:24",
            "경기마트 안양점",
            "청년기본소득",
            "28,400원",
            badge("완료", "success")
          ],
          [
            "tx-841198",
            "07.15 10:18",
            "우리약국",
            "충전금",
            "12,000원",
            badge("검증 중", "pending")
          ]
        ],
        () => runAction(affordance("rowDetail"), { title: copy("detailSheetTitle") })
      )
    )
  );
  return stack;
}

function renderIssuancePlans() {
  const stack = el("div", "screen-stack");
  stack.append(
    statusBanner(copy("authorityBadge")),
    filterBar(
      field("검색", "", { placeholder: copy("searchPlaceholder") }),
      selectField("상태", ["전체", "초안", "결재 중", "승인"])
    ),
    actionRow(actionButton(copy("newPlanCta"), "newPlan", "primary"))
  );
  stack.append(
    card(
      copy("unplannedSectionTitle"),
      table(
        ["정책", "유통 단위", "예상 공급량", "승인"],
        [["청년기본소득 2026", "경기도", "324억원", badge("정책 승인", "success")]],
        () => runAction(affordance("createFromUnplannedPolicy"))
      )
    )
  );
  stack.append(
    card(
      "발행 계획",
      table(
        ["계획 ID", "사업명", "발행주체", "공급량", "상태"],
        [
          [
            "ip-youth-2026",
            "청년기본소득 2026",
            "경기지역화폐 발행사",
            "324억원",
            badge("결재 중", "pending")
          ],
          [
            "ip-local-031",
            "소상공인 소비지원",
            "경기지역화폐 발행사",
            "120억원",
            badge("승인", "success")
          ]
        ],
        () => runAction(affordance("rowSelect"))
      )
    )
  );
  return stack;
}

function renderIssuancePlan() {
  const layout = el("div", "composer-layout");
  const main = el("div", "screen-stack");
  main.append(
    card(
      "발행 계획",
      formGrid(
        selectField(copy("fieldPolicyRef"), ["청년기본소득 2026 · 승인됨"], "selectPolicyRef"),
        field(copy("fieldIssuer"), "경기지역화폐 발행사"),
        field(copy("fieldLicenseRef"), "license-gg-2026-01"),
        field(copy("fieldUnit"), "경기도"),
        field(copy("fieldSupply"), "32,400,000,000원"),
        field("발행 기간", "2026.07.20 — 2026.12.31")
      )
    ),
    card(
      copy("burnPolicyTitle"),
      formGrid(field("회수 유예 기간", "30일"), field("소각 후보 생성", "유예기간 종료 후"))
    ),
    statusBanner(copy("authorizationGate")),
    actionRow(
      actionButton("선행조건 확인", "verifyPrerequisites"),
      actionButton("결재 상신", "submitForApproval", "primary")
    )
  );
  layout.append(main, approvalPanel());
  return layout;
}

function renderIssuanceExecute() {
  const stack = el("div", "screen-stack");
  const metrics = el("div", "metric-grid three");
  metrics.append(
    metric("계획 공급량", "324억원", "ip-youth-2026"),
    metric("준비자산", "331억원", "102.2%"),
    metric("발행 후 한도", "68.4%", "한도 내")
  );
  stack.append(
    statusBanner(copy("authorityBadge")),
    metrics,
    card(
      "실행 전 검증",
      table(
        ["게이트", "근거", "상태"],
        [
          ["발행 인가", "license-gg-2026-01", badge("유효", "success")],
          ["상품 분류", "mapping-v12", badge("mint 허용", "success")],
          ["준비자산", "reserve-match-0715", badge("충분", "success")],
          ["masterMinter", "key-mm-02", badge("서명 대기", "pending")]
        ]
      )
    ),
    actionRow(
      actionButton("선행조건 재확인", "recheck"),
      actionButton("Step-up 인증", "stepUp"),
      actionButton("masterMinter 서명", "masterMinterSign"),
      actionButton(copy("executeCta"), "execute", "primary", { success: copy("successMsg") }),
      actionButton("발행 원장 보기", "viewLedger")
    )
  );
  return stack;
}

function renderLedger() {
  const stack = el("div", "screen-stack");
  stack.append(
    statusBanner(copy("authorityBadge")),
    filterBar(
      selectField(copy("filterActionType"), ["전체", "mint", "burn"], "filter"),
      field("계획 ID", "", { placeholder: "ip-*" }),
      field("기간", "2026.07.01 — 2026.07.15")
    ),
    card(
      "발행 원장",
      table(
        [
          "행위",
          copy("colUnit"),
          copy("colTx"),
          "수량",
          copy("colExecutor"),
          copy("colApprovalId")
        ],
        [
          [
            badge("mint", "success"),
            "경기도",
            "mint-0192 · 0xa81…22c",
            "324억원",
            "박발행",
            "apr-mint-192"
          ],
          [
            badge("burn", "neutral"),
            "안양시",
            "burn-0041 · 0x19d…a08",
            "4.2억원",
            "이정산",
            "apr-burn-041"
          ]
        ],
        (index) =>
          runAction(affordance(index === 0 ? "mintApprovalDeeplink" : "burnApprovalDeeplink"))
      )
    )
  );
  return stack;
}

function renderIssuanceLimit() {
  const layout = el("div", "two-column");
  const left = el("div", "screen-stack");
  const metrics = el("div", "metric-grid two");
  metrics.append(
    metric("현재 발행한도", "1,200억원", "version 8"),
    metric("현재 발행량", "821억원", "68.4% 사용")
  );
  left.append(
    metrics,
    card(
      "한도 변경",
      formGrid(
        field("변경 한도", "1,350억원"),
        field("시행일", "2026.08.01"),
        field("변경 사유", "하반기 정책 지급 확대", { multiline: true })
      )
    )
  );
  const right = el("div", "screen-stack");
  right.append(
    card(
      "준비자산 커버리지",
      table(["준비자산", "평가액", "비율"], [["현금성 예치", "1,381억원", "102.3%"]])
    ),
    approvalPanel(),
    actionButton(copy("changeCta"), "submitChange", "primary")
  );
  layout.append(left, right);
  return layout;
}

function renderReserves() {
  const stack = el("div", "screen-stack");
  const metrics = el("div", "metric-grid three");
  metrics.append(
    metric("준비자산 평가액", "1,381억원", "as-of 09:00"),
    metric("발행량", "821억원", "커버리지 168.2%"),
    metric("증빙 만료 예정", "1건", "7일 이내")
  );
  stack.append(
    statusBanner(copy("authorityBadge")),
    metrics,
    card(
      "준비자산 등록부",
      table(
        ["자산", "법적 보유 구조", "보관기관", "평가액", "PoR"],
        [
          ["운영예치금 A", "분리예치", "경기은행", "820억원", badge("검증됨", "success")],
          ["단기국채 신탁", "전통 수탁", "대한수탁", "561억원", badge("갱신 예정", "pending")]
        ]
      )
    ),
    card(
      copy("matchingHeader"),
      table(
        ["발행 계획", "매칭 준비자산", "공급량", "커버리지"],
        [["ip-youth-2026", "운영예치금 A", "324억원", "104.3%"]]
      )
    ),
    actionRow(
      actionButton(copy("changeCta"), "submitChange", "primary"),
      actionButton(copy("porLink"), "viewPorRegistry")
    )
  );
  return stack;
}

function renderPor() {
  const stack = el("div", "screen-stack");
  stack.append(
    statusBanner(copy("authorityBadge")),
    filterBar(
      selectField("운용사", ["전체", "경기은행", "대한수탁"], "filter"),
      selectField("PoR 방식", ["전체", copy("methodOnchain"), copy("methodOffchain")], "filter")
    ),
    card(
      "준비금 증빙",
      table(
        ["준비금", "방식", "최근 검증", "유효기간", "상태"],
        [
          [
            "운영예치금 A",
            copy("methodOnchain"),
            "2026.07.15 09:00",
            "실시간",
            badge("정상", "success")
          ],
          [
            "단기국채 신탁",
            copy("methodOffchain"),
            "2026.07.01",
            "2026.07.22",
            badge("갱신 예정", "pending")
          ]
        ]
      )
    ),
    actionRow(
      actionButton(copy("recordVerificationCta"), "recordVerification", "primary"),
      actionButton(copy("syncOnchainCta"), "syncOnchain"),
      actionButton(copy("backToReserves"), "backToReserves")
    )
  );
  return stack;
}

function renderBackingReconciliation() {
  const stack = el("div", "screen-stack");
  stack.append(
    statusBanner(copy("authorityBadge")),
    filterBar(
      selectField("기간", ["2026.07", "2026.06"], "filter"),
      selectField("유통 단위", ["전체", "경기도", "안양시"], "filter")
    )
  );
  const equation = el("div", "equation large");
  equation.append(
    metric("발행량", "821억원"),
    el("strong", "equation-mark", "≤"),
    metric("오프체인 준비자산", "1,381억원"),
    badge("충족", "success")
  );
  stack.append(
    card(copy("equation"), equation),
    card(
      "대사 근거",
      table(
        ["근거", "참조", "검증"],
        [
          ["발행 원장", "ledger-snapshot-0715", badge("확정", "success")],
          ["준비금 PoR", "por-report-0715", badge("검증됨", "success")]
        ]
      )
    ),
    actionRow(
      actionButton("다시 계산", "refreshReadOnly"),
      actionButton(copy("signoff"), "signOff", "primary"),
      actionButton(copy("porModuleLink"), "viewPorRegistry")
    )
  );
  return stack;
}

function renderBurnSettlement() {
  const stack = el("div", "screen-stack");
  stack.append(
    statusBanner(copy("policyBoundary")),
    card(
      "소각 후보",
      table(
        ["유통 단위", copy("colIssuedTotal"), copy("colRedeemedTotal"), copy("colBurnGap"), "상태"],
        [
          ["안양시", "42.0억원", "37.8억원", "4.2억원", badge("실행 가능", "success")],
          ["수원시", "31.0억원", "29.4억원", "1.6억원", badge("유예기간", "pending")]
        ]
      )
    ),
    card(
      "실행 게이트",
      table(
        ["게이트", "상태"],
        [
          ["결재", badge("완료", "success")],
          ["InternalLedger 대사", badge("일치", "success")],
          ["준비자산 대사", badge("일치", "success")],
          ["masterMinter", badge("서명 대기", "pending")]
        ]
      )
    ),
    actionRow(
      actionButton("대사 재확인", "recheck"),
      actionButton("Step-up 인증", "stepUp"),
      actionButton("masterMinter 서명", "masterMinterSign"),
      actionButton(copy("executeCta"), "execute", "danger"),
      actionButton("발행 원장 보기", "viewLedger")
    )
  );
  return stack;
}

const renderers = {
  "admin-policy-list": renderPolicyList,
  "admin-circulation-policy-composer": renderComposer,
  "admin-circulation-topup-policy": renderTopupPolicy,
  "admin-voucher-policy-setup": renderVoucherPolicy,
  "admin-condition-builder": renderConditionBuilder,
  "admin-policy-effect-dashboard": renderEffectDashboard,
  "admin-circulation-dashboard": renderCirculationDashboard,
  "admin-circulation-reconciliation": renderCirculationReconciliation,
  "admin-roster-builder": renderRosterBuilder,
  "admin-settlement-batch": renderSettlementBatch,
  "admin-jurisdiction-exit": renderJurisdictionExit,
  "admin-redeem-console": renderRedeem,
  "admin-transaction-trace": renderTransactionTrace,
  "admin-issuance-plans": renderIssuancePlans,
  "admin-issuance-plan": renderIssuancePlan,
  "admin-issuance-execute": renderIssuanceExecute,
  "admin-issuance-ledger": renderLedger,
  "admin-issuance-limit": renderIssuanceLimit,
  "admin-issuance-reserves": renderReserves,
  "admin-issuance-por": renderPor,
  "admin-backing-reconciliation": renderBackingReconciliation,
  "admin-supply-burn-settlement": renderBurnSettlement
};

function renderRail() {
  const rail = el("aside", "console-rail");
  const brand = el("div", "console-brand");
  const brandCopy = el("div", "console-brand-copy");
  brandCopy.append(
    el(
      "strong",
      "",
      artifact.screen.surface === "발행사 콘솔(웹)" ? "경기 월렛 발행관리" : "경기 정책관리"
    ),
    el("small", "", artifact.screen.surface === "발행사 콘솔(웹)" ? "발행사 콘솔" : "관리 콘솔")
  );
  brand.append(el("span", "console-brand-mark", "G"), brandCopy);
  rail.append(
    brand,
    el(
      "span",
      "rail-section-label",
      artifact.screen.surface === "발행사 콘솔(웹)" ? "ISSUER CONSOLE" : "ADMIN CONSOLE"
    )
  );
  const nav = el("nav", "product-nav");
  for (const item of artifact.navigation?.items ?? []) {
    const button = el("button", item.target === artifact.screen.id ? "active" : "");
    button.type = "button";
    const navIcon = el("span", "nav-icon");
    navIcon.setAttribute("aria-hidden", "true");
    navIcon.style.setProperty("--nav-icon-source", `url("./icons/${item.icon}.svg")`);
    button.append(navIcon, el("span", "", item.label));
    if (item.resolution.kind === "out-of-scope-screen") button.append(el("small", "", "범위 밖"));
    button.addEventListener("click", () => navigate(item.resolution, `nav.${item.target}`));
    nav.append(button);
  }
  rail.append(nav);
  const actor = el("div", "rail-actor");
  const actorCopy = el("div", "rail-actor-copy");
  actorCopy.append(
    el("strong", "", artifact.screen.surface === "발행사 콘솔(웹)" ? "발행 관리자" : "김정책"),
    el(
      "small",
      "",
      artifact.screen.surface === "발행사 콘솔(웹)" ? "발행 권한 · 경기도" : "정책총괄 · 경기도"
    )
  );
  actor.append(
    el("span", "avatar", artifact.screen.surface === "발행사 콘솔(웹)" ? "발" : "관"),
    actorCopy
  );
  rail.append(actor);
  return rail;
}

function renderScreen() {
  const productTitle = copy("title", artifact.screen.title);
  document.title = productTitle;
  root.replaceChildren();
  const shell = el("div", "console-shell");
  shell.append(renderRail());
  const workspace = el("div", "console-workspace");
  const chrome = el("header", "console-chrome");
  const chromeCopy = el("div", "chrome-copy");
  chromeCopy.append(
    el("span", "breadcrumb", artifact.screen.surface.replace("(웹)", "")),
    el("h1", "chrome-title", productTitle)
  );
  chrome.append(chromeCopy, el("div", "chrome-badges"));
  const missingAdapters = artifact.screen.components.filter(
    (componentName) => componentAdapterKinds[componentName] === undefined
  );
  if (missingAdapters.length) {
    throw new Error(`지원하지 않는 source component: ${missingAdapters.join(", ")}`);
  }
  chrome
    .querySelector(".chrome-badges")
    .append(
      badge("예시 데이터"),
      badge("세션 확인됨", "success"),
      badge(
        artifact.screen.surface === "발행사 콘솔(웹)" ? "발행 권한 영역" : "경기도 전역",
        "authority"
      )
    );
  const page = el("main", "console-page");
  const actionStatus = el("div", "status-banner success", "");
  actionStatus.id = "action-status";
  actionStatus.hidden = true;
  page.append(actionStatus);
  const renderer = renderers[artifact.screen.id];
  page.append(
    renderer
      ? renderer()
      : statusBanner("이 화면의 demo renderer가 아직 준비되지 않았습니다.", "warning")
  );
  workspace.append(chrome, page);
  shell.append(workspace);
  root.append(shell);

  const drawer = el("aside", "demo-drawer");
  drawer.id = "demo-drawer";
  drawer.hidden = true;
  const drawerHead = el("header", "drawer-head");
  const drawerTitle = el("h2", "", "상세 정보");
  drawerTitle.id = "drawer-title";
  const close = el("button", "icon-button", "×");
  close.type = "button";
  close.setAttribute("aria-label", "패널 닫기");
  close.addEventListener("click", () => {
    drawer.hidden = true;
  });
  drawerHead.append(drawerTitle, close);
  const drawerBody = el("div", "drawer-body");
  drawerBody.id = "drawer-body";
  drawer.append(drawerHead, drawerBody);
  root.append(drawer);
  const toast = el("div", "demo-toast");
  toast.id = "demo-toast";
  toast.hidden = true;
  toast.setAttribute("role", "status");
  root.append(toast);
}

async function start() {
  const path = new URLSearchParams(location.search).get("artifact");
  if (!path || !/^screen-artifacts\/[A-Za-z0-9-]+\.json$/.test(path)) {
    throw new Error("유효한 screen artifact가 지정되지 않았습니다.");
  }
  const response = await fetch(`./${path}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Screen artifact를 불러오지 못했습니다: ${response.status}`);
  artifact = await response.json();
  renderScreen();
}

start().catch((error) => {
  root.replaceChildren(el("p", "error", error.message));
});
