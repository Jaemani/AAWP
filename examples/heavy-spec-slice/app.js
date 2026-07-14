const screenIds = ["home-wallet", "pay-qr", "admin-policy-list"];

const getScreenFromHash = () => {
  const value = window.location.hash.slice(1);
  return screenIds.includes(value) ? value : "home-wallet";
};

const showScreen = (screenId, updateHash = true) => {
  const nextScreen = screenIds.includes(screenId) ? screenId : "home-wallet";

  document.querySelectorAll("[data-screen]").forEach((screen) => {
    const active = screen.dataset.screen === nextScreen;
    screen.classList.toggle("active", active);
    screen.setAttribute("aria-hidden", String(!active));
  });

  document.querySelectorAll(".screen-switcher [data-target]").forEach((button) => {
    const active = button.dataset.target === nextScreen;
    button.classList.toggle("active", active);
    button.setAttribute("aria-current", active ? "page" : "false");
  });

  if (updateHash && window.location.hash !== `#${nextScreen}`) {
    window.history.pushState(null, "", `#${nextScreen}`);
  }
};

document.querySelectorAll("[data-target]").forEach((button) => {
  button.addEventListener("click", () => showScreen(button.dataset.target));
});

document.querySelectorAll("[data-navigate]").forEach((button) => {
  button.addEventListener("click", () => showScreen(button.dataset.navigate));
});

window.addEventListener("hashchange", () => showScreen(getScreenFromHash(), false));

const pocketSheet = document.querySelector("#pocket-sheet");
const openPockets = document.querySelector("#open-pockets");
const closePockets = document.querySelector("#close-pockets");

const setPocketSheetOpen = (open) => {
  pocketSheet.hidden = !open;
  openPockets.setAttribute("aria-expanded", String(open));
  if (open) closePockets.focus();
};

openPockets.addEventListener("click", () => setPocketSheetOpen(true));
closePockets.addEventListener("click", () => setPocketSheetOpen(false));

const payButton = document.querySelector("#pay-button");
const payHelper = document.querySelector("#pay-helper");
const payStep = document.querySelector("#pay-step");
const doneStep = document.querySelector("#done-step");
const payResult = document.querySelector("#pay-result");

payButton.addEventListener("click", () => {
  if (payButton.dataset.status === "confirmed") {
    showScreen("home-wallet");
    return;
  }

  payButton.disabled = true;
  payButton.textContent = "결제 요청 중…";
  payHelper.textContent = "승인 응답을 기다리고 있어요";
  payStep.classList.add("current");

  window.setTimeout(() => {
    payStep.classList.remove("current");
    payStep.classList.add("done");
    payStep.querySelector("i").innerHTML = '<svg><use href="#i-check"></use></svg>';
    doneStep.classList.add("done");
    doneStep.querySelector("i").innerHTML = '<svg><use href="#i-check"></use></svg>';
    payResult.hidden = false;
    payButton.disabled = false;
    payButton.dataset.status = "confirmed";
    payButton.textContent = "월렛 홈으로 돌아가기";
    payHelper.textContent = "거래번호 PAY-20260714-2041";
  }, 650);
});

const searchInput = document.querySelector("#policy-search");
const approvalFilter = document.querySelector("#approval-filter");
const lifecycleFilter = document.querySelector("#lifecycle-filter");
const categoryFilter = document.querySelector("#category-filter");
const policyCount = document.querySelector("#policy-count");
const policyRows = [...document.querySelectorAll("[data-policy]")];

const applyPolicyFilters = () => {
  const query = searchInput.value.trim().toLocaleLowerCase("ko-KR");
  let visibleCount = 0;

  policyRows.forEach((row) => {
    const searchableText = row.textContent.toLocaleLowerCase("ko-KR");
    const visible =
      (!query || searchableText.includes(query)) &&
      (approvalFilter.value === "all" || row.dataset.approval === approvalFilter.value) &&
      (lifecycleFilter.value === "all" || row.dataset.lifecycle === lifecycleFilter.value) &&
      (categoryFilter.value === "all" || row.dataset.category === categoryFilter.value);

    row.hidden = !visible;
    if (visible) visibleCount += 1;
  });

  policyCount.textContent = `${visibleCount}개 정책`;
};

[searchInput, approvalFilter, lifecycleFilter, categoryFilter].forEach((control) => {
  control.addEventListener(control === searchInput ? "input" : "change", applyPolicyFilters);
});

const policyDrawer = document.querySelector("#policy-detail");
const closePolicy = document.querySelector("#close-policy");

const drawerCopyByPolicy = {
  "pol-youth-2026": ["2026 청년기본소득", "승인·활성·신규 발행 필요 정책입니다."],
  "pol-topup-anyang": ["안양사랑 충전 정책", "승인·활성 상태의 충전 정책입니다."],
  "pol-postpartum": ["산후조리 지원금", "최종 승인 전이라 실행이 차단된 정책입니다."],
  "pol-transport": ["청소년 교통비 지원", "만료되어 신규 실행이 차단된 정책입니다."]
};

document.querySelectorAll("[data-policy-id]").forEach((button) => {
  button.addEventListener("click", () => {
    const [title, description] = drawerCopyByPolicy[button.dataset.policyId];
    policyDrawer.querySelector("h2").textContent = title;
    policyDrawer.querySelector(":scope > p").textContent = description;
    policyDrawer.hidden = false;
    closePolicy.focus();
  });
});

closePolicy.addEventListener("click", () => {
  policyDrawer.hidden = true;
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!pocketSheet.hidden) setPocketSheetOpen(false);
  if (!policyDrawer.hidden) policyDrawer.hidden = true;
});

showScreen(getScreenFromHash(), false);
