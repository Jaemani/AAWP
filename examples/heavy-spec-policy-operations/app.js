const bundleList = document.getElementById("bundle-list");
const surfaceSelect = document.getElementById("surface-select");
const screenSelect = document.getElementById("screen-select");
const frame = document.getElementById("screen-frame");
const deviceFrame = document.getElementById("device-frame");
const errorMessage = document.getElementById("error-message");
const viewerNotice = document.getElementById("viewer-notice");

let manifest;
let selectedBundleId;
let selectedSurfaceId;
let selectedScreenId;
let noticeTimer;

function clear(node) {
  node.replaceChildren();
}

function text(tag, value, className) {
  const node = document.createElement(tag);
  node.textContent = value;
  if (className) node.className = className;
  return node;
}

function selectedBundle() {
  return manifest.bundles.find((bundle) => bundle.id === selectedBundleId) ?? manifest.bundles[0];
}

function screenById(screenId) {
  return manifest.screens.find((screen) => screen.id === screenId);
}

function surfaceById(surfaceId) {
  return manifest.surfaces.find((surface) => surface.id === surfaceId);
}

function groupLabels(screen) {
  return screen.groupIds
    .map((groupId) => manifest.groups.find((group) => group.id === groupId)?.label)
    .filter(Boolean)
    .join(" · ");
}

function availableSurfaces(bundle) {
  const bundleScreens = new Set(bundle.screenIds);
  return manifest.surfaces.filter((surface) =>
    surface.screenIds.some((id) => bundleScreens.has(id))
  );
}

function renderBundles() {
  clear(bundleList);
  for (const bundle of manifest.bundles) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `bundle-tab${bundle.id === selectedBundleId ? " active" : ""}`;
    button.setAttribute("role", "listitem");
    button.append(
      text("strong", bundle.title),
      text("small", `${bundle.screenIds.length} screens`)
    );
    button.addEventListener("click", () => selectBundle(bundle.id));
    bundleList.append(button);
  }
}

function renderSurfaces() {
  clear(surfaceSelect);
  const bundle = selectedBundle();
  for (const surface of availableSurfaces(bundle)) {
    const count = surface.screenIds.filter((id) => bundle.screenIds.includes(id)).length;
    const option = text("option", `${surface.label} · ${count}`);
    option.value = surface.id;
    option.selected = surface.id === selectedSurfaceId;
    surfaceSelect.append(option);
  }
}

function renderScreens() {
  clear(screenSelect);
  const bundle = selectedBundle();
  for (const screenId of bundle.screenIds) {
    const screen = screenById(screenId);
    if (!screen || screen.surfaceId !== selectedSurfaceId) continue;
    const option = text("option", screen.title);
    option.value = screen.id;
    option.selected = screen.id === selectedScreenId;
    screenSelect.append(option);
  }
}

function screenEntry(screen) {
  return `./screen.html?artifact=${encodeURIComponent(screen.artifactPath)}`;
}

function renderPreview() {
  const screen = screenById(selectedScreenId);
  if (!screen) return;
  const surface = surfaceById(screen.surfaceId);
  document.getElementById("selected-surface").textContent = surface.label;
  document.getElementById("selected-group").textContent = groupLabels(screen);
  document.getElementById("selected-screen-title").textContent = screen.title;
  document.getElementById("selected-screen-route").textContent = screen.route;
  const entry = screenEntry(screen);
  frame.src = entry;
  document.getElementById("screen-open-link").href = new URL(entry, location.href).href;
  deviceFrame.dataset.formFactor = surface.formFactor;
  history.replaceState({}, "", `#${screen.id}`);
}

function render() {
  const bundle = selectedBundle();
  document.getElementById("selected-bundle-title").textContent = bundle.title;
  document.getElementById("selected-bundle-description").textContent = bundle.description ?? "";
  renderBundles();
  renderSurfaces();
  renderScreens();
  renderPreview();
}

function selectBundle(bundleId) {
  selectedBundleId = bundleId;
  const bundle = selectedBundle();
  const surface = availableSurfaces(bundle)[0];
  selectedSurfaceId = surface.id;
  selectedScreenId = bundle.screenIds.find((id) => screenById(id)?.surfaceId === surface.id);
  render();
}

function selectScreen(screenId) {
  const screen = screenById(screenId);
  if (!screen) return;
  selectedScreenId = screen.id;
  selectedSurfaceId = screen.surfaceId;
  const owner = manifest.bundles.find((bundle) => bundle.screenIds.includes(screen.id));
  if (owner) selectedBundleId = owner.id;
  render();
}

function showNotice(message) {
  window.clearTimeout(noticeTimer);
  viewerNotice.textContent = message;
  viewerNotice.hidden = false;
  noticeTimer = window.setTimeout(() => {
    viewerNotice.hidden = true;
  }, 3200);
}

async function start() {
  const response = await fetch("./bundle-manifest.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`Bundle manifest를 불러오지 못했습니다: ${response.status}`);
  manifest = await response.json();
  document.getElementById("manifest-status").textContent =
    `Manifest ${manifest.digest.slice(0, 10)}`;
  document.getElementById("request-text").textContent = manifest.requestText;
  const hashScreen = screenById(location.hash.slice(1));
  if (hashScreen) {
    selectedScreenId = hashScreen.id;
    selectedSurfaceId = hashScreen.surfaceId;
    selectedBundleId = manifest.bundles.find((bundle) =>
      bundle.screenIds.includes(hashScreen.id)
    )?.id;
  } else {
    selectedBundleId = manifest.bundles[0].id;
    const bundle = selectedBundle();
    selectedScreenId = bundle.screenIds[0];
    selectedSurfaceId = screenById(selectedScreenId).surfaceId;
  }
  render();
}

surfaceSelect.addEventListener("change", () => {
  selectedSurfaceId = surfaceSelect.value;
  selectedScreenId = selectedBundle().screenIds.find(
    (id) => screenById(id)?.surfaceId === selectedSurfaceId
  );
  render();
});
screenSelect.addEventListener("change", () => selectScreen(screenSelect.value));
window.addEventListener("hashchange", () => {
  const screen = screenById(location.hash.slice(1));
  if (screen && screen.id !== selectedScreenId) selectScreen(screen.id);
});
window.addEventListener("message", (event) => {
  if (event.origin !== location.origin || event.source !== frame.contentWindow) return;
  const message = event.data;
  if (!message || message.type !== "aawp:demo-navigate") return;
  const target = screenById(message.screenId);
  if (!target) {
    showNotice("요청한 화면이 현재 데모 묶음에 없습니다.");
    return;
  }
  selectScreen(target.id);
  showNotice(`${target.title}(으)로 이동했습니다.`);
});

start().catch((error) => {
  errorMessage.hidden = false;
  errorMessage.textContent = error.message;
});
