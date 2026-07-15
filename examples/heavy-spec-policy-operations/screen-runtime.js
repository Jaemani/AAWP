const root = document.getElementById("screen-root");

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function sourceControl(component) {
  const card = element("article", "component-card");
  const head = element("div", "component-head");
  head.append(element("span", "component-type", "SPEC COMPONENT"));
  head.append(element("strong", "component-name", component));
  card.append(head);
  if (/Picker|Selector|Filter|SearchField/.test(component)) {
    const control = element("button", "control select-control", "선택 항목을 확인하세요");
    control.type = "button";
    card.append(control);
  } else if (/Table|Registry|Ledger|AuditTrail/.test(component)) {
    const rows = element("div", "table-skeleton");
    for (const label of ["식별자", "근거", "상태"]) rows.append(element("span", "", label));
    card.append(rows);
  } else if (/Stepper|Chain|Workflow|RunPanel|Console/.test(component)) {
    const steps = element("ol", "step-list");
    for (const label of ["입력 확인", "권한·조건 검증", "결과 기록"]) {
      steps.append(element("li", "", label));
    }
    card.append(steps);
  } else if (/Form|Editor|Builder|Binder|Panel/.test(component)) {
    const fields = element("div", "field-skeleton");
    fields.append(element("span", "", "Source-defined field"));
    fields.append(element("span", "", "Source-defined value"));
    card.append(fields);
  } else {
    card.append(
      element("p", "component-note", "이 component의 구체 데이터는 source contract가 제공합니다.")
    );
  }
  return card;
}

function renderCopy(copy) {
  const section = element("section", "spec-section copy-section");
  section.append(element("h2", "section-title", "Defined UI copy"));
  const list = element("div", "copy-list");
  for (const item of copy) {
    const row = element("div", "copy-row");
    row.append(element("code", "", item.key));
    row.append(element("span", "", item.text));
    list.append(row);
  }
  section.append(list);
  return section;
}

function renderScreen(artifact) {
  const screen = artifact.screen;
  document.title = screen.title;
  document.body.dataset.surface = screen.surface;
  root.replaceChildren();

  const chrome = element("header", "surface-chrome");
  const identity = element("div", "surface-identity");
  identity.append(element("span", "surface-label", screen.surface));
  identity.append(element("strong", "", screen.title));
  chrome.append(identity);
  chrome.append(element("span", "audience", screen.audience));
  root.append(chrome);

  const page = element("div", "page");
  const intro = element("section", "screen-intro");
  const route = element("code", "route", screen.route);
  intro.append(route);
  intro.append(element("h1", "", screen.title));
  intro.append(element("p", "purpose", screen.purpose));
  page.append(intro);

  const stateBar = element("section", "state-bar");
  const stateLabel = element("label", "state-picker");
  stateLabel.append(element("span", "", "화면 상태"));
  const select = element("select", "");
  const stateDescription = element("p", "state-description");
  for (const state of screen.states) {
    const option = element("option", "", state.state);
    option.value = state.state;
    select.append(option);
  }
  const updateState = () => {
    const state = screen.states.find((item) => item.state === select.value) ?? screen.states[0];
    stateDescription.textContent = state?.description ?? "";
  };
  select.addEventListener("change", updateState);
  stateLabel.append(select);
  stateBar.append(stateLabel, stateDescription);
  page.append(stateBar);

  const layout = element("section", "layout-contract");
  layout.append(element("span", "eyebrow", "SOURCE LAYOUT"));
  layout.append(element("p", "", screen.layout));
  page.append(layout);

  const componentSection = element("section", "spec-section");
  const componentHead = element("div", "section-head");
  componentHead.append(element("h2", "section-title", "Screen composition"));
  componentHead.append(element("span", "count", `${screen.components.length} components`));
  componentSection.append(componentHead);
  const components = element("div", "component-grid");
  for (const component of screen.components) components.append(sourceControl(component));
  componentSection.append(components);
  page.append(componentSection);
  page.append(renderCopy(screen.copy));

  const contract = element("details", "data-contract");
  const summary = element("summary", "", `Data contract · ${screen.dataNeeds.length} requirements`);
  const list = element("ol", "data-list");
  for (const dataNeed of screen.dataNeeds) list.append(element("li", "", dataNeed));
  contract.append(summary, list);
  page.append(contract);

  const provenance = element("footer", "provenance");
  provenance.append(element("span", "", artifact.source.pointer));
  provenance.append(element("code", "", artifact.source.screenDigest.slice(0, 16)));
  page.append(provenance);
  root.append(page);
  updateState();
}

async function start() {
  const path = new URLSearchParams(location.search).get("artifact");
  if (!path || !/^screen-artifacts\/[A-Za-z0-9-]+\.json$/.test(path)) {
    throw new Error("유효한 screen artifact가 지정되지 않았습니다.");
  }
  const response = await fetch(`./${path}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Screen artifact를 불러오지 못했습니다: ${response.status}`);
  renderScreen(await response.json());
}

start().catch((error) => {
  root.replaceChildren(element("p", "error", error.message));
});
