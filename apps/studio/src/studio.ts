import {
  projectWorkflowGraph,
  type ArtifactLineageProjection,
  type EvidenceProjection,
  type RevisionImpactPreview,
  type RunControlProjection,
  type WorkflowEditorDocument,
  type WorkflowSemanticDiff
} from "@awf/control-plane";
import { canonicalize } from "@awf/ir";

export interface StudioViewModel {
  document: WorkflowEditorDocument;
  graph: ReturnType<typeof projectWorkflowGraph>;
  initialInputJson: string;
  semanticDiff?: WorkflowSemanticDiff;
  impactPreview?: RevisionImpactPreview;
  run?: RunControlProjection;
  lineage?: ArtifactLineageProjection;
  evidence?: EvidenceProjection[];
}

export function createStudioView(input: {
  document: WorkflowEditorDocument;
  initialInputs?: unknown;
  semanticDiff?: WorkflowSemanticDiff;
  impactPreview?: RevisionImpactPreview;
  run?: RunControlProjection;
  lineage?: ArtifactLineageProjection;
  evidence?: EvidenceProjection[];
}): StudioViewModel {
  return {
    ...input,
    initialInputJson: canonicalize(input.initialInputs ?? {}),
    graph: projectWorkflowGraph(input.document.workflow)
  };
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function list(items: string[], empty: string): string {
  return items.length === 0
    ? `<p class="muted">${escapeHtml(empty)}</p>`
    : `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function renderDiff(diff: WorkflowSemanticDiff | undefined): string {
  if (diff === undefined) return '<p class="muted">비교할 workflow version이 없습니다.</p>';
  return list(
    diff.changes.map(
      (change) =>
        `${change.impact.toUpperCase()} · ${change.entityType}/${change.entityId} · ${change.kind} · ${change.changedPaths.join(", ")}`
    ),
    "semantic change가 없습니다."
  );
}

function renderImpact(preview: RevisionImpactPreview | undefined): string {
  if (preview === undefined) return '<p class="muted">revision 후보가 없습니다.</p>';
  return `<div class="metrics">
    <span><b>${preview.summary.changedRoots}</b> roots</span>
    <span><b>${preview.summary.rerunNodes}</b> rerun</span>
    <span><b>${preview.summary.reusedNodes}</b> reuse</span>
    <span class="${preview.summary.unsafe ? "danger" : "ok"}">${preview.summary.unsafe ? "unsafe" : "safe"}</span>
  </div>${list(
    preview.impact.decisions.map(
      (item) =>
        `${item.nodeId}: ${item.action} (${item.reasons.map((reason) => reason.code).join(", ") || "unchanged"})`
    ),
    "impact decision이 없습니다."
  )}`;
}

function renderRun(run: RunControlProjection | undefined): string {
  if (run === undefined) return '<p class="muted">선택한 run이 없습니다.</p>';
  return `<div class="metrics">
    <span><b>${escapeHtml(run.status)}</b> status</span>
    <span><b>$${run.budget.costUsd.toFixed(4)}</b> cost</span>
    <span><b>${run.budget.tokens}</b> tokens</span>
    <span><b>${run.approvals.filter((item) => item.status === "pending").length}</b> pending approvals</span>
  </div>
  <ol class="timeline">${run.timeline
    .map(
      (item) =>
        `<li><time>${escapeHtml(item.occurredAt)}</time><span>${escapeHtml(item.label)}</span></li>`
    )
    .join("")}</ol>
  <h3>Operator intents</h3>
  ${list(
    run.availableCommands.map(
      (item) => `${item.command}${item.approvalId === undefined ? "" : ` · ${item.approvalId}`}`
    ),
    "현재 실행 가능한 command가 없습니다."
  )}`;
}

function renderLineage(lineage: ArtifactLineageProjection | undefined): string {
  if (lineage === undefined) return '<p class="muted">lineage를 선택하지 않았습니다.</p>';
  return `<div class="artifact-grid">${lineage.artifacts
    .map(
      (artifact) => `<article>
        <strong>${escapeHtml(artifact.artifactId)}</strong>
        <small>${escapeHtml(artifact.semanticType)} · ${escapeHtml(artifact.sensitivity)}</small>
        <code>${escapeHtml(artifact.contentHash)}</code>
      </article>`
    )
    .join("")}</div>
    <h3>Edges</h3>
    ${list(
      lineage.edges.map(
        (edge) => `${edge.parentArtifactId} → ${edge.childArtifactId} (${edge.edgeType})`
      ),
      "lineage edge가 없습니다."
    )}`;
}

function renderEvidence(evidence: EvidenceProjection[] | undefined): string {
  if (evidence === undefined) return '<p class="muted">evidence bundle을 선택하지 않았습니다.</p>';
  return evidence
    .map(
      (bundle) => `<article class="evidence ${bundle.redacted ? "redacted" : ""}">
        <strong>${escapeHtml(bundle.verifierId)}</strong>
        <span>${escapeHtml(bundle.outcome)}</span>
        <small>${bundle.redacted ? "hidden details redacted" : `${bundle.findings?.length ?? 0} findings`}</small>
      </article>`
    )
    .join("");
}

export function renderStudioHtml(view: StudioViewModel): string {
  const graphNodes = view.graph.nodes
    .map(
      (node) => `<button class="node" type="button" data-node-id="${escapeHtml(node.id)}">
        <strong>${escapeHtml(node.id)}</strong>
        <span>${escapeHtml(node.kind)} · ${escapeHtml(node.owner.role)}</span>
        <small>$${node.worstCaseCostUsd.toFixed(4)} worst case</small>
      </button>`
    )
    .join("");
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AWF Studio · ${escapeHtml(view.graph.workflowId)}</title>
  <style>
    :root { color-scheme: dark; font-family: ui-sans-serif, system-ui, sans-serif; background:#0a0f1d; color:#e8edf8; }
    * { box-sizing:border-box; }
    body { margin:0; }
    header { position:sticky; top:0; z-index:2; display:flex; justify-content:space-between; gap:1rem; padding:1rem 1.5rem; background:#10182aee; border-bottom:1px solid #25314a; backdrop-filter:blur(12px); }
    header h1 { margin:0; font-size:1.1rem; } header p { margin:.2rem 0 0; color:#9cabc6; }
    .digest { max-width:38vw; overflow:hidden; text-overflow:ellipsis; font:12px ui-monospace, monospace; color:#7dd3fc; }
    main { display:grid; grid-template-columns:minmax(0, 1.35fr) minmax(320px, .65fr); gap:1rem; padding:1rem; }
    section { min-width:0; padding:1rem; border:1px solid #25314a; border-radius:12px; background:#111a2c; }
    h2 { margin:0 0 .8rem; font-size:.95rem; color:#bfdbfe; } h3 { font-size:.8rem; color:#9cabc6; text-transform:uppercase; letter-spacing:.08em; }
    .span-2 { grid-column:1 / -1; } .graph { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:.7rem; }
    .node { display:flex; flex-direction:column; gap:.35rem; padding:.8rem; text-align:left; color:inherit; background:#17233a; border:1px solid #31415f; border-radius:9px; cursor:pointer; }
    .node:hover,.node:focus-visible { border-color:#38bdf8; outline:none; } .node span,.node small,.muted { color:#9cabc6; }
    .node[data-run-status="completed"] { border-color:#22c55e; } .node[data-run-status="running"] { border-color:#38bdf8; } .node[data-run-status="failed"] { border-color:#ef4444; }
    textarea { width:100%; min-height:260px; resize:vertical; padding:.8rem; color:#dbeafe; background:#09111f; border:1px solid #31415f; border-radius:8px; font:12px/1.5 ui-monospace, monospace; }
    #contract-editor { min-height:180px; } #run-input { min-height:150px; } .actions { display:flex; gap:.5rem; margin-top:.6rem; }
    .actions button { padding:.55rem .8rem; color:#08111f; background:#7dd3fc; border:0; border-radius:7px; font-weight:700; cursor:pointer; }
    .actions button.secondary { color:#dbeafe; background:#24334f; }
    .metrics { display:flex; flex-wrap:wrap; gap:.5rem; margin-bottom:.8rem; } .metrics span { padding:.4rem .6rem; background:#17233a; border-radius:6px; }
    .ok { color:#86efac; } .danger { color:#fca5a5; } ul { padding-left:1.2rem; } li { margin:.35rem 0; }
    .timeline { list-style:none; padding:0; } .timeline li { display:grid; grid-template-columns:190px 1fr; gap:.7rem; border-left:2px solid #31415f; padding:.2rem 0 .7rem .7rem; } time { color:#7c8aa4; font:11px ui-monospace,monospace; }
    .artifact-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(210px,1fr)); gap:.6rem; } .artifact-grid article,.evidence { display:flex; flex-direction:column; gap:.3rem; padding:.7rem; background:#17233a; border-radius:8px; }
    code { overflow:hidden; text-overflow:ellipsis; color:#7dd3fc; } .evidence.redacted { border:1px dashed #b45309; }
    #editor-status { min-height:1.2rem; color:#9cabc6; }
    .execution { display:grid; grid-template-columns:minmax(260px,.7fr) minmax(220px,.55fr) minmax(360px,1.4fr); gap:1rem; }
    .run-history { display:flex; flex-direction:column; gap:.5rem; max-height:360px; overflow:auto; }
    .run-history button { display:flex; flex-direction:column; gap:.2rem; padding:.65rem; text-align:left; color:inherit; background:#17233a; border:1px solid #31415f; border-radius:8px; cursor:pointer; }
    .run-history button:hover,.run-history button:focus-visible { border-color:#38bdf8; outline:none; }
    .node-states { display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:.5rem; margin-bottom:.8rem; }
    .node-states article { display:flex; justify-content:space-between; gap:.5rem; padding:.55rem; background:#17233a; border-radius:7px; }
    .run-output { max-height:240px; overflow:auto; padding:.7rem; background:#09111f; border-radius:8px; font:11px/1.5 ui-monospace,monospace; white-space:pre-wrap; }
    .mode-notice { padding:.65rem; border:1px solid #b45309; border-radius:8px; color:#fdba74; background:#43140755; }
    @media (max-width:900px) { main { grid-template-columns:1fr; } .span-2 { grid-column:auto; } .digest { display:none; } }
    @media (max-width:1100px) { .execution { grid-template-columns:1fr; } }
  </style>
</head>
<body>
  <header>
    <div><h1>Adaptive Artifact Workflow Studio</h1><p>${escapeHtml(view.graph.workflowId)} · ${escapeHtml(view.graph.version)} · ${escapeHtml(view.graph.mode)}</p></div>
    <div class="digest" title="${escapeHtml(view.document.digest)}">WIR ${escapeHtml(view.document.digest)}</div>
  </header>
  <main>
    <section class="span-2"><h2>Workflow graph</h2><div class="graph">${graphNodes}</div><h3>Edges</h3>${list(
      view.graph.edges.map((edge) => edge.label),
      "edge가 없습니다."
    )}</section>
    <section class="span-2">
      <h2>Workflow dry-run & history</h2>
      <p class="mode-notice">현재 WIR에는 executable binding이 없습니다. 아래 실행은 실제 Temporal·tool·model 호출이 아닌 <b>DETERMINISTIC_SIMULATION</b>이며 기록은 로컬 append-only JSONL에 보존됩니다.</p>
      <div class="execution">
        <div>
          <h3>Run input</h3>
          <textarea id="run-input" spellcheck="false">${escapeHtml(view.initialInputJson)}</textarea>
          <div class="actions"><button id="run-workflow" type="button">Run dry-run</button><button id="refresh-runs" class="secondary" type="button">Refresh</button></div>
          <p id="run-status" class="muted" aria-live="polite">실행할 입력을 확인하세요.</p>
        </div>
        <div><h3>Run history</h3><div id="run-history" class="run-history"><p class="muted">기록을 불러오는 중입니다.</p></div></div>
        <div>
          <h3>Selected run</h3>
          <div id="run-metrics" class="metrics"><span>선택한 run 없음</span></div>
          <div id="node-states" class="node-states"></div>
          <ol id="run-timeline" class="timeline"></ol>
          <h3>Outputs</h3><pre id="run-output" class="run-output">{}</pre>
        </div>
      </div>
    </section>
    <section><h2>Canonical WIR editor</h2><textarea id="wir-editor" spellcheck="false">${escapeHtml(view.document.canonicalJson)}</textarea><div class="actions"><button id="canonicalize" type="button">Canonicalize candidate</button><button id="reset" class="secondary" type="button">Reset</button></div><p id="editor-status" aria-live="polite">편집 결과는 compiler 검증 전까지 publish되지 않습니다.</p></section>
    <section><h2>Node contract editor</h2><p class="muted">graph node를 선택하세요. 적용 시 canonical WIR 후보만 변경됩니다.</p><textarea id="contract-editor" spellcheck="false" disabled></textarea><div class="actions"><button id="apply-contract" type="button" disabled>Apply to candidate</button></div></section>
    <section><h2>Semantic diff</h2>${renderDiff(view.semanticDiff)}</section>
    <section><h2>Revision impact preview</h2>${renderImpact(view.impactPreview)}</section>
    <section><h2>Run artifacts</h2><div id="run-artifacts"><p class="muted">run을 선택하면 artifact 기록이 표시됩니다.</p></div></section>
    <section><h2>Persisted lineage</h2>${renderLineage(view.lineage)}</section>
    <section><h2>Verifier evidence</h2>${renderEvidence(view.evidence)}</section>
  </main>
  <script>
    (() => {
      const original = ${JSON.stringify(view.document.canonicalJson).replaceAll("<", "\\u003c")};
      const wir = document.getElementById("wir-editor");
      const contract = document.getElementById("contract-editor");
      const apply = document.getElementById("apply-contract");
      const status = document.getElementById("editor-status");
      const runInput = document.getElementById("run-input");
      const runStatus = document.getElementById("run-status");
      const runHistory = document.getElementById("run-history");
      const runMetrics = document.getElementById("run-metrics");
      const nodeStates = document.getElementById("node-states");
      const runTimeline = document.getElementById("run-timeline");
      const runOutput = document.getElementById("run-output");
      const runArtifacts = document.getElementById("run-artifacts");
      let selectedNodeId = null;
      const stable = (value) => Array.isArray(value) ? value.map(stable) : value && typeof value === "object"
        ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
      const parse = () => JSON.parse(wir.value);
      const clear = (element) => { while (element.firstChild) element.removeChild(element.firstChild); };
      const element = (tag, text, className) => {
        const item = document.createElement(tag);
        if (text !== undefined) item.textContent = text;
        if (className) item.className = className;
        return item;
      };
      const renderSelectedRun = (record) => {
        clear(runMetrics);
        [record.status, record.executionMode, String(record.events.length) + " events", String(record.artifacts.length) + " artifacts"]
          .forEach((value) => { const span = element("span"); const strong = element("b", value); span.appendChild(strong); runMetrics.appendChild(span); });
        clear(nodeStates);
        Object.entries(record.nodeStates).sort(([left], [right]) => left.localeCompare(right)).forEach(([nodeId, state]) => {
          const card = element("article"); card.appendChild(element("strong", nodeId)); card.appendChild(element("span", state)); nodeStates.appendChild(card);
          const graphNode = document.querySelector('[data-node-id="' + CSS.escape(nodeId) + '"]');
          if (graphNode) graphNode.dataset.runStatus = state;
        });
        clear(runTimeline);
        record.events.forEach((event) => {
          const row = element("li"); row.appendChild(element("time", event.occurredAt));
          const payload = event.payload && typeof event.payload === "object" ? event.payload : {};
          row.appendChild(element("span", String(event.sequence) + ". " + event.type + (payload.nodeId ? " · " + payload.nodeId : "")));
          runTimeline.appendChild(row);
        });
        runOutput.textContent = JSON.stringify(record.error || record.outputs || {}, null, 2);
        clear(runArtifacts);
        if (record.artifacts.length === 0) runArtifacts.appendChild(element("p", "artifact 기록이 없습니다.", "muted"));
        record.artifacts.forEach((artifact) => {
          const card = element("article", undefined, "evidence"); card.appendChild(element("strong", artifact.artifactId));
          card.appendChild(element("span", artifact.nodeId + " / " + artifact.port)); card.appendChild(element("code", artifact.contentHash)); runArtifacts.appendChild(card);
        });
      };
      const selectRun = async (runId) => {
        runStatus.textContent = runId + " 기록을 불러오는 중입니다.";
        const response = await fetch("/api/runs/" + encodeURIComponent(runId));
        if (!response.ok) throw new Error("run record request failed: " + response.status);
        const record = await response.json(); renderSelectedRun(record); runStatus.textContent = runId + " · " + record.status;
      };
      const loadRuns = async (selectLatest) => {
        const response = await fetch("/api/runs");
        if (!response.ok) throw new Error("run history request failed: " + response.status);
        const payload = await response.json(); clear(runHistory);
        if (payload.runs.length === 0) runHistory.appendChild(element("p", "아직 실행 기록이 없습니다.", "muted"));
        payload.runs.forEach((run) => {
          const button = element("button"); button.type = "button"; button.appendChild(element("strong", run.runId));
          button.appendChild(element("span", run.status + " · " + run.eventCount + " events"));
          button.appendChild(element("small", run.createdAt)); button.addEventListener("click", () => selectRun(run.runId).catch((error) => runStatus.textContent = error.message));
          runHistory.appendChild(button);
        });
        if (selectLatest && payload.runs[0]) await selectRun(payload.runs[0].runId);
      };
      const showNode = () => {
        if (!selectedNodeId) return;
        const node = parse().nodes.find((item) => item.id === selectedNodeId);
        contract.value = JSON.stringify(stable(node), null, 2);
        contract.disabled = !node;
        apply.disabled = !node;
      };
      document.querySelectorAll("[data-node-id]").forEach((button) => button.addEventListener("click", () => {
        selectedNodeId = button.dataset.nodeId;
        try { showNode(); status.textContent = selectedNodeId + " contract selected"; }
        catch (error) { status.textContent = error.message; }
      }));
      document.getElementById("canonicalize").addEventListener("click", () => {
        try {
          wir.value = JSON.stringify(stable(parse()));
          showNode();
          status.textContent = "Canonical candidate created; server-side compiler validation is still required.";
          window.dispatchEvent(new CustomEvent("awf:workflow-candidate", { detail: { canonicalJson: wir.value } }));
        } catch (error) { status.textContent = error.message; }
      });
      document.getElementById("reset").addEventListener("click", () => {
        wir.value = original; selectedNodeId = null; contract.value = ""; contract.disabled = true; apply.disabled = true;
        status.textContent = "Candidate reset to source WIR.";
      });
      apply.addEventListener("click", () => {
        try {
          const workflow = parse();
          const replacement = JSON.parse(contract.value);
          if (replacement.id !== selectedNodeId) throw new Error("node id cannot change in contract editor");
          workflow.nodes = workflow.nodes.map((item) => item.id === selectedNodeId ? replacement : item);
          wir.value = JSON.stringify(stable(workflow));
          status.textContent = "Node contract applied to candidate; compiler validation is still required.";
        } catch (error) { status.textContent = error.message; }
      });
      document.getElementById("run-workflow").addEventListener("click", async () => {
        const button = document.getElementById("run-workflow"); button.disabled = true; runStatus.textContent = "Dry-run 실행 중…";
        try {
          const inputs = JSON.parse(runInput.value);
          const response = await fetch("/api/runs", { method:"POST", headers:{ "content-type":"application/json" }, body:JSON.stringify({ inputs }) });
          const record = await response.json(); if (!response.ok) throw new Error(record.message || "run failed");
          renderSelectedRun(record); await loadRuns(false); runStatus.textContent = record.runId + " · " + record.status;
        } catch (error) { runStatus.textContent = error.message; }
        finally { button.disabled = false; }
      });
      document.getElementById("refresh-runs").addEventListener("click", () => loadRuns(false).catch((error) => runStatus.textContent = error.message));
      loadRuns(true).catch((error) => runStatus.textContent = error.message);
    })();
  </script>
</body>
</html>`;
}
