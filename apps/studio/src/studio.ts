import {
  projectWorkflowGraph,
  type ArtifactLineageProjection,
  type EvidenceProjection,
  type RevisionImpactPreview,
  type RunControlProjection,
  type WorkflowEditorDocument,
  type WorkflowSemanticDiff
} from "@awf/control-plane";

export interface StudioViewModel {
  document: WorkflowEditorDocument;
  graph: ReturnType<typeof projectWorkflowGraph>;
  semanticDiff?: WorkflowSemanticDiff;
  impactPreview?: RevisionImpactPreview;
  run?: RunControlProjection;
  lineage?: ArtifactLineageProjection;
  evidence?: EvidenceProjection[];
}

export function createStudioView(input: {
  document: WorkflowEditorDocument;
  semanticDiff?: WorkflowSemanticDiff;
  impactPreview?: RevisionImpactPreview;
  run?: RunControlProjection;
  lineage?: ArtifactLineageProjection;
  evidence?: EvidenceProjection[];
}): StudioViewModel {
  return {
    ...input,
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
    textarea { width:100%; min-height:260px; resize:vertical; padding:.8rem; color:#dbeafe; background:#09111f; border:1px solid #31415f; border-radius:8px; font:12px/1.5 ui-monospace, monospace; }
    #contract-editor { min-height:180px; } .actions { display:flex; gap:.5rem; margin-top:.6rem; }
    .actions button { padding:.55rem .8rem; color:#08111f; background:#7dd3fc; border:0; border-radius:7px; font-weight:700; cursor:pointer; }
    .actions button.secondary { color:#dbeafe; background:#24334f; }
    .metrics { display:flex; flex-wrap:wrap; gap:.5rem; margin-bottom:.8rem; } .metrics span { padding:.4rem .6rem; background:#17233a; border-radius:6px; }
    .ok { color:#86efac; } .danger { color:#fca5a5; } ul { padding-left:1.2rem; } li { margin:.35rem 0; }
    .timeline { list-style:none; padding:0; } .timeline li { display:grid; grid-template-columns:190px 1fr; gap:.7rem; border-left:2px solid #31415f; padding:.2rem 0 .7rem .7rem; } time { color:#7c8aa4; font:11px ui-monospace,monospace; }
    .artifact-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(210px,1fr)); gap:.6rem; } .artifact-grid article,.evidence { display:flex; flex-direction:column; gap:.3rem; padding:.7rem; background:#17233a; border-radius:8px; }
    code { overflow:hidden; text-overflow:ellipsis; color:#7dd3fc; } .evidence.redacted { border:1px dashed #b45309; }
    #editor-status { min-height:1.2rem; color:#9cabc6; }
    @media (max-width:900px) { main { grid-template-columns:1fr; } .span-2 { grid-column:auto; } .digest { display:none; } }
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
    <section><h2>Canonical WIR editor</h2><textarea id="wir-editor" spellcheck="false">${escapeHtml(view.document.canonicalJson)}</textarea><div class="actions"><button id="canonicalize" type="button">Canonicalize candidate</button><button id="reset" class="secondary" type="button">Reset</button></div><p id="editor-status" aria-live="polite">편집 결과는 compiler 검증 전까지 publish되지 않습니다.</p></section>
    <section><h2>Node contract editor</h2><p class="muted">graph node를 선택하세요. 적용 시 canonical WIR 후보만 변경됩니다.</p><textarea id="contract-editor" spellcheck="false" disabled></textarea><div class="actions"><button id="apply-contract" type="button" disabled>Apply to candidate</button></div></section>
    <section><h2>Semantic diff</h2>${renderDiff(view.semanticDiff)}</section>
    <section><h2>Revision impact preview</h2>${renderImpact(view.impactPreview)}</section>
    <section class="span-2"><h2>Run timeline & approval inbox</h2>${renderRun(view.run)}</section>
    <section><h2>Artifact lineage</h2>${renderLineage(view.lineage)}</section>
    <section><h2>Verifier evidence</h2>${renderEvidence(view.evidence)}</section>
  </main>
  <script>
    (() => {
      const original = ${JSON.stringify(view.document.canonicalJson).replaceAll("<", "\\u003c")};
      const wir = document.getElementById("wir-editor");
      const contract = document.getElementById("contract-editor");
      const apply = document.getElementById("apply-contract");
      const status = document.getElementById("editor-status");
      let selectedNodeId = null;
      const stable = (value) => Array.isArray(value) ? value.map(stable) : value && typeof value === "object"
        ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
      const parse = () => JSON.parse(wir.value);
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
    })();
  </script>
</body>
</html>`;
}
