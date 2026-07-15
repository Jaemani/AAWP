const versionSwitch = document.getElementById("version-switch");
const roleSelect = document.getElementById("role-select");
const screenSelect = document.getElementById("screen-select");
const frame = document.getElementById("screen-frame");
const gap = document.getElementById("gap");
const gapMessage = document.getElementById("gap-message");
const openScreen = document.getElementById("open-screen");
const notice = document.getElementById("notice");

let manifest;
let versionId = "baseline";
let roleId = "policy";
let screenId;
let noticeTimer;

function option(value, label, selected) {
  const node = document.createElement("option");
  node.value = value;
  node.textContent = label;
  node.selected = selected;
  return node;
}

function version() {
  return manifest.versions.find((item) => item.id === versionId);
}

function role() {
  return manifest.roles.find((item) => item.id === roleId) ?? manifest.roles[0];
}

function roleVersion() {
  return role().versions[versionId];
}

function screen() {
  return manifest.screens[versionId].find((item) => item.id === screenId);
}

function screenEntry() {
  const query = new URLSearchParams({ version: versionId, role: roleId, screen: screenId });
  return `./screen.html?${query}`;
}

function showNotice(message) {
  window.clearTimeout(noticeTimer);
  notice.textContent = message;
  notice.hidden = false;
  noticeTimer = window.setTimeout(() => {
    notice.hidden = true;
  }, 3000);
}

function syncHash() {
  const parts = [versionId, roleId, screenId ?? "gap"].map(encodeURIComponent);
  history.replaceState({}, "", `#${parts.join("/")}`);
}

function renderVersions() {
  versionSwitch.replaceChildren();
  for (const item of manifest.versions) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = item.id === versionId ? "active" : "";
    button.textContent = item.label;
    button.setAttribute("aria-pressed", String(item.id === versionId));
    button.addEventListener("click", () => selectVersion(item.id));
    versionSwitch.append(button);
  }
}

function renderRoles() {
  roleSelect.replaceChildren();
  for (const item of manifest.roles) {
    roleSelect.append(option(item.id, item.label, item.id === roleId));
  }
}

function renderScreens() {
  screenSelect.replaceChildren();
  const current = roleVersion();
  for (const id of current.screenIds) {
    const item = manifest.screens[versionId].find((candidate) => candidate.id === id);
    if (item) screenSelect.append(option(item.id, item.title, item.id === screenId));
  }
  screenSelect.disabled = current.screenIds.length === 0;
}

function renderFrame() {
  const current = roleVersion();
  const hasScreen = current.screenIds.length > 0 && screen();
  gap.hidden = Boolean(hasScreen);
  frame.hidden = !hasScreen;
  openScreen.hidden = !hasScreen;
  if (!hasScreen) {
    frame.src = "about:blank";
    gapMessage.textContent = current.gap ?? "선택한 버전에는 이 역할의 테스트 화면이 없습니다.";
    return;
  }
  const entry = screenEntry();
  frame.src = entry;
  openScreen.href = new URL(entry, location.href).href;
}

function render() {
  const currentRole = role();
  document.getElementById("role-title").textContent = currentRole.label;
  document.getElementById("role-description").textContent = currentRole.description;
  document.getElementById("source-state").textContent =
    versionId === "candidate" ? "Candidate · 단일 child spec" : "원본 spec · 변경 없음";
  renderVersions();
  renderRoles();
  renderScreens();
  renderFrame();
  syncHash();
}

function selectVersion(nextVersionId) {
  versionId = nextVersionId;
  const ids = roleVersion().screenIds;
  screenId = ids.includes(screenId) ? screenId : ids[0];
  render();
}

function selectRole(nextRoleId) {
  roleId = nextRoleId;
  screenId = roleVersion().screenIds[0];
  render();
}

async function start() {
  const response = await fetch("./comparison-manifest.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`비교 manifest를 불러오지 못했습니다: ${response.status}`);
  manifest = await response.json();
  const [hashVersion, hashRole, hashScreen] = location.hash
    .slice(1)
    .split("/")
    .map(decodeURIComponent);
  if (manifest.versions.some((item) => item.id === hashVersion)) versionId = hashVersion;
  if (manifest.roles.some((item) => item.id === hashRole)) roleId = hashRole;
  const available = roleVersion().screenIds;
  screenId = available.includes(hashScreen) ? hashScreen : available[0];
  render();
}

roleSelect.addEventListener("change", () => selectRole(roleSelect.value));
screenSelect.addEventListener("change", () => {
  screenId = screenSelect.value;
  render();
});
window.addEventListener("message", (event) => {
  if (event.origin !== location.origin || event.source !== frame.contentWindow) return;
  const message = event.data;
  if (
    message?.type === "aawp:select-role" &&
    manifest.roles.some((item) => item.id === message.roleId)
  ) {
    selectRole(message.roleId);
    showNotice(`${role().label} 화면으로 전환했습니다.`);
  }
  if (
    message?.type === "aawp:demo-navigate" &&
    roleVersion().screenIds.includes(message.screenId)
  ) {
    screenId = message.screenId;
    render();
  }
});

start().catch((error) => {
  const target = document.getElementById("error");
  target.hidden = false;
  target.textContent = error.message;
});
