const bundleList = document.getElementById("bundle-list");
const surfaceList = document.getElementById("surface-list");
const screenList = document.getElementById("screen-list");
const search = document.getElementById("screen-search");
const frame = document.getElementById("screen-frame");
const deviceFrame = document.getElementById("device-frame");
const errorMessage = document.getElementById("error-message");

let manifest;
let selectedBundleId;
let selectedSurfaceId;
let selectedScreenId;

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
    button.className = `bundle-card${bundle.id === selectedBundleId ? " active" : ""}`;
    button.setAttribute("role", "listitem");
    button.append(text("span", String(bundle.screenIds.length).padStart(2, "0"), "bundle-count"));
    const copy = document.createElement("span");
    copy.append(
      text("strong", bundle.title),
      text("small", bundle.description ?? "독립 화면 묶음")
    );
    button.append(copy);
    button.addEventListener("click", () => selectBundle(bundle.id));
    bundleList.append(button);
  }
}

function renderSurfaces() {
  clear(surfaceList);
  const bundle = selectedBundle();
  for (const surface of availableSurfaces(bundle)) {
    const count = surface.screenIds.filter((id) => bundle.screenIds.includes(id)).length;
    const button = document.createElement("button");
    button.type = "button";
    button.className = surface.id === selectedSurfaceId ? "active" : "";
    button.append(text("span", surface.label), text("small", `${surface.formFactor} · ${count}`));
    button.addEventListener("click", () => {
      selectedSurfaceId = surface.id;
      const first = bundle.screenIds.find((id) => screenById(id)?.surfaceId === surface.id);
      if (first) selectedScreenId = first;
      render();
    });
    surfaceList.append(button);
  }
}

function renderScreens() {
  clear(screenList);
  const query = search.value.trim().toLowerCase();
  const bundle = selectedBundle();
  const screens = bundle.screenIds
    .map(screenById)
    .filter((screen) => screen?.surfaceId === selectedSurfaceId)
    .filter((screen) =>
      `${screen.title} ${screen.route} ${screen.id}`.toLowerCase().includes(query)
    );
  const byGroup = new Map();
  for (const screen of screens) {
    const groupId = screen.groupIds[0];
    byGroup.set(groupId, [...(byGroup.get(groupId) ?? []), screen]);
  }
  for (const [groupId, groupScreens] of byGroup) {
    const section = document.createElement("section");
    section.className = "screen-group";
    const label = manifest.groups.find((group) => group.id === groupId)?.label ?? groupId;
    section.append(text("h3", label));
    for (const screen of groupScreens) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = screen.id === selectedScreenId ? "active" : "";
      button.append(text("strong", screen.title), text("small", screen.route));
      button.addEventListener("click", () => selectScreen(screen.id));
      section.append(button);
    }
    screenList.append(section);
  }
  if (!screens.length) screenList.append(text("p", "일치하는 화면이 없습니다.", "empty-search"));
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
  document.getElementById("screen-open-link").href = entry;
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
  search.value = "";
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

search.addEventListener("input", renderScreens);
window.addEventListener("hashchange", () => {
  const screen = screenById(location.hash.slice(1));
  if (screen && screen.id !== selectedScreenId) selectScreen(screen.id);
});

start().catch((error) => {
  errorMessage.hidden = false;
  errorMessage.textContent = error.message;
});
