import { projectWorkflowGraph, type WorkflowEditorDocument } from "@awf/control-plane";
import { canonicalize } from "@awf/ir";

export interface StudioViewModel {
  document: WorkflowEditorDocument;
  graph: ReturnType<typeof projectWorkflowGraph>;
  initialInputJson: string;
}

export function createStudioView(input: {
  document: WorkflowEditorDocument;
  initialInputs?: unknown;
}): StudioViewModel {
  return {
    document: input.document,
    graph: projectWorkflowGraph(input.document.workflow),
    initialInputJson: canonicalize(input.initialInputs ?? {})
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

export function renderStudioHtml(view: StudioViewModel): string {
  const graphNodes = view.graph.nodes
    .map(
      (node, index) => `${index === 0 ? "" : '<span class="arrow" aria-hidden="true">→</span>'}
        <div class="workflow-node" data-node-id="${escapeHtml(node.id)}">
          <span class="node-state"></span>
          <div><strong>${escapeHtml(node.id)}</strong><small>${escapeHtml(node.kind)}</small></div>
        </div>`
    )
    .join("");

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AWF · ${escapeHtml(view.graph.workflowId)}</title>
  <style>
    :root { font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color:#171717; background:#f6f7f8; font-synthesis:none; }
    * { box-sizing:border-box; }
    body { margin:0; min-width:320px; }
    button,textarea { font:inherit; }
    header { height:64px; display:flex; align-items:center; justify-content:space-between; padding:0 28px; background:#fff; border-bottom:1px solid #e5e7eb; }
    .identity { display:flex; align-items:center; gap:14px; min-width:0; }
    .logo { display:grid; place-items:center; width:32px; height:32px; color:#fff; background:#171717; border-radius:8px; font-size:12px; font-weight:800; }
    h1 { margin:0; font-size:15px; font-weight:650; } .subtitle { margin-top:2px; color:#737373; font-size:12px; }
    .mode { flex:none; padding:5px 9px; color:#92400e; background:#fffbeb; border:1px solid #fde68a; border-radius:999px; font-size:11px; font-weight:650; }
    .toolbar { display:flex; align-items:flex-start; justify-content:space-between; gap:24px; padding:22px 28px; background:#fff; border-bottom:1px solid #e5e7eb; }
    .toolbar-copy h2 { margin:0 0 5px; font-size:20px; letter-spacing:-.02em; } .toolbar-copy p { margin:0; color:#737373; font-size:13px; }
    .run-control { display:flex; align-items:flex-start; gap:10px; }
    .run-button { min-width:140px; padding:10px 17px; color:#fff; background:#171717; border:1px solid #171717; border-radius:8px; font-weight:650; cursor:pointer; }
    .run-button:hover { background:#333; } .run-button:focus-visible { outline:3px solid #bfdbfe; outline-offset:2px; } .run-button:disabled { cursor:wait; opacity:.55; }
    details.input { position:relative; } details.input summary { padding:10px 12px; color:#525252; background:#fff; border:1px solid #d4d4d4; border-radius:8px; font-size:13px; cursor:pointer; list-style:none; }
    details.input[open] summary { border-radius:8px 8px 0 0; } details.input textarea { position:absolute; z-index:5; right:0; width:420px; height:180px; padding:12px; color:#e5e7eb; background:#171717; border:0; border-radius:8px 0 8px 8px; resize:vertical; font:12px/1.5 ui-monospace,SFMono-Regular,monospace; }
    #run-message { min-height:18px; margin:8px 28px 0; color:#737373; font-size:12px; }
    .workflow-strip { display:flex; align-items:center; gap:12px; margin:18px 28px; padding:14px 16px; overflow-x:auto; background:#fff; border:1px solid #e5e7eb; border-radius:10px; }
    .workflow-node { display:flex; align-items:center; gap:9px; min-width:max-content; padding:6px 9px; border-radius:7px; }
    .workflow-node strong,.workflow-node small { display:block; } .workflow-node strong { font-size:12px; } .workflow-node small { margin-top:2px; color:#a3a3a3; font-size:10px; }
    .node-state { width:8px; height:8px; background:#d4d4d4; border-radius:50%; }
    .workflow-node[data-run-status="completed"] .node-state { background:#16a34a; } .workflow-node[data-run-status="failed"] .node-state { background:#dc2626; } .workflow-node[data-run-status="running"] .node-state { background:#2563eb; box-shadow:0 0 0 4px #dbeafe; }
    .arrow { color:#d4d4d4; }
    main { display:grid; grid-template-columns:310px minmax(0,1fr); min-height:calc(100vh - 238px); margin:0 28px 28px; overflow:hidden; background:#fff; border:1px solid #e5e7eb; border-radius:10px; }
    aside { border-right:1px solid #e5e7eb; } .panel-title { display:flex; align-items:center; justify-content:space-between; height:48px; padding:0 16px; border-bottom:1px solid #e5e7eb; font-size:12px; font-weight:650; }
    #run-count { color:#a3a3a3; font-weight:500; } .history { max-height:calc(100vh - 287px); overflow:auto; }
    .history-empty { padding:40px 20px; color:#a3a3a3; text-align:center; font-size:13px; }
    .run-row { display:grid; grid-template-columns:10px minmax(0,1fr); gap:10px; width:100%; padding:13px 16px; text-align:left; color:inherit; background:#fff; border:0; border-bottom:1px solid #f0f0f0; cursor:pointer; }
    .run-row:hover { background:#fafafa; } .run-row.active { background:#f5f5f5; box-shadow:inset 3px 0 #171717; } .run-row:focus-visible { outline:2px solid #93c5fd; outline-offset:-2px; }
    .status-dot { width:8px; height:8px; margin-top:4px; background:#16a34a; border-radius:50%; } .status-dot.failed { background:#dc2626; }
    .run-row strong,.run-row small { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; } .run-row strong { font:11px ui-monospace,SFMono-Regular,monospace; } .run-row small { margin-top:5px; color:#a3a3a3; font-size:10px; }
    .detail { min-width:0; } .empty-detail { display:grid; min-height:420px; place-items:center; color:#a3a3a3; font-size:13px; }
    #run-detail[hidden] { display:none; }
    .detail-head { display:flex; align-items:flex-start; justify-content:space-between; gap:20px; padding:20px 22px; border-bottom:1px solid #e5e7eb; }
    .detail-head h2 { margin:0; font:14px ui-monospace,SFMono-Regular,monospace; } .detail-head p { margin:5px 0 0; color:#a3a3a3; font-size:11px; }
    .status-label { padding:4px 8px; color:#166534; background:#f0fdf4; border-radius:999px; font-size:11px; font-weight:650; } .status-label.failed { color:#991b1b; background:#fef2f2; }
    .summary { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); border-bottom:1px solid #e5e7eb; } .summary div { padding:15px 22px; border-right:1px solid #f0f0f0; } .summary div:last-child { border:0; }
    .summary span,.summary strong { display:block; } .summary span { color:#a3a3a3; font-size:10px; text-transform:uppercase; letter-spacing:.06em; } .summary strong { margin-top:5px; font-size:13px; }
    .detail-grid { display:grid; grid-template-columns:minmax(0,1fr) minmax(300px,.7fr); }
    section { min-width:0; padding:20px 22px; border-bottom:1px solid #e5e7eb; } section:nth-child(odd) { border-right:1px solid #e5e7eb; } section h3 { margin:0 0 13px; color:#737373; font-size:11px; text-transform:uppercase; letter-spacing:.06em; }
    .nodes { display:flex; flex-wrap:wrap; gap:8px; } .node-record { display:flex; align-items:center; gap:7px; padding:7px 9px; background:#f5f5f5; border-radius:6px; font-size:11px; } .node-record i { width:7px; height:7px; background:#16a34a; border-radius:50%; } .node-record.failed i { background:#dc2626; }
    .timeline { margin:0; padding:0; list-style:none; } .timeline li { display:grid; grid-template-columns:34px 90px minmax(0,1fr); gap:10px; padding:7px 0; border-bottom:1px solid #f5f5f5; font-size:11px; } .timeline li:last-child { border:0; } .sequence,.time { color:#a3a3a3; font:10px ui-monospace,SFMono-Regular,monospace; }
    .artifacts { display:flex; flex-direction:column; gap:8px; } .artifact { min-width:0; padding:9px 10px; background:#f8fafc; border:1px solid #e5e7eb; border-radius:6px; } .artifact strong,.artifact small,.artifact code { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; } .artifact strong { font-size:11px; } .artifact small { margin:3px 0 6px; color:#a3a3a3; font-size:10px; } .artifact code { color:#737373; font-size:9px; }
    pre { max-height:300px; margin:0; overflow:auto; padding:12px; color:#e5e7eb; background:#171717; border-radius:7px; font:11px/1.5 ui-monospace,SFMono-Regular,monospace; white-space:pre-wrap; }
    @media (max-width:850px) { header,.toolbar { padding-left:16px; padding-right:16px; } .toolbar { align-items:stretch; flex-direction:column; } .run-control { justify-content:space-between; } #run-message,.workflow-strip,main { margin-left:16px; margin-right:16px; } main { grid-template-columns:1fr; } aside { border-right:0; border-bottom:1px solid #e5e7eb; } .history { max-height:230px; } .detail-grid { grid-template-columns:1fr; } section:nth-child(odd) { border-right:0; } .summary { grid-template-columns:repeat(2,1fr); } details.input textarea { right:auto; left:0; width:min(420px,calc(100vw - 32px)); } }
  </style>
</head>
<body>
  <header>
    <div class="identity"><div class="logo">AWF</div><div><h1>${escapeHtml(view.graph.workflowId)}</h1><div class="subtitle">v${escapeHtml(view.graph.version)} · ${escapeHtml(view.graph.mode)}</div></div></div>
    <span class="mode">Local simulation</span>
  </header>
  <div class="toolbar">
    <div class="toolbar-copy"><h2>Workflow runs</h2><p>실행하고, 결과를 기록으로 확인합니다.</p></div>
    <div class="run-control">
      <details class="input"><summary>Input</summary><textarea id="run-input" spellcheck="false">${escapeHtml(view.initialInputJson)}</textarea></details>
      <button id="run-workflow" class="run-button" type="button">Run workflow</button>
    </div>
  </div>
  <p id="run-message" aria-live="polite">외부 tool과 model을 호출하지 않는 deterministic simulation입니다.</p>
  <div class="workflow-strip" aria-label="Workflow nodes">${graphNodes}</div>
  <main>
    <aside><div class="panel-title"><span>Run history</span><span id="run-count">0</span></div><div id="run-history" class="history"><div class="history-empty">기록을 불러오는 중입니다.</div></div></aside>
    <div class="detail">
      <div id="empty-detail" class="empty-detail">Run workflow를 눌러 첫 기록을 만드세요.</div>
      <div id="run-detail" hidden>
        <div class="detail-head"><div><h2 id="selected-run-id"></h2><p id="selected-run-time"></p></div><span id="selected-status" class="status-label"></span></div>
        <div class="summary"><div><span>Mode</span><strong id="selected-mode"></strong></div><div><span>Events</span><strong id="selected-events"></strong></div><div><span>Artifacts</span><strong id="selected-artifacts"></strong></div><div><span>Duration</span><strong id="selected-duration"></strong></div></div>
        <div class="detail-grid">
          <section><h3>Nodes</h3><div id="node-records" class="nodes"></div></section>
          <section><h3>Artifacts</h3><div id="artifact-records" class="artifacts"></div></section>
          <section><h3>Event timeline</h3><ol id="event-timeline" class="timeline"></ol></section>
          <section><h3>Output</h3><pre id="run-output">{}</pre></section>
        </div>
      </div>
    </div>
  </main>
  <script>
    (() => {
      const runButton = document.getElementById("run-workflow");
      const runInput = document.getElementById("run-input");
      const message = document.getElementById("run-message");
      const history = document.getElementById("run-history");
      const runCount = document.getElementById("run-count");
      const emptyDetail = document.getElementById("empty-detail");
      const detail = document.getElementById("run-detail");
      const nodeRecords = document.getElementById("node-records");
      const artifactRecords = document.getElementById("artifact-records");
      const timeline = document.getElementById("event-timeline");
      let selectedRunId = null;

      const clear = (target) => { while (target.firstChild) target.removeChild(target.firstChild); };
      const make = (tag, text, className) => { const item = document.createElement(tag); if (text !== undefined) item.textContent = text; if (className) item.className = className; return item; };
      const shortTime = (value) => new Date(value).toLocaleTimeString([], { hour:"2-digit", minute:"2-digit", second:"2-digit" });
      const markSelected = () => document.querySelectorAll("[data-run-id]").forEach((row) => row.classList.toggle("active", row.dataset.runId === selectedRunId));
      const updateGraph = (states) => document.querySelectorAll("[data-node-id]").forEach((node) => { node.dataset.runStatus = states[node.dataset.nodeId] || "waiting"; });

      const renderRun = (record) => {
        selectedRunId = record.runId; markSelected(); updateGraph(record.nodeStates);
        emptyDetail.hidden = true; detail.hidden = false;
        document.getElementById("selected-run-id").textContent = record.runId;
        document.getElementById("selected-run-time").textContent = record.createdAt;
        const status = document.getElementById("selected-status"); status.textContent = record.status; status.className = "status-label" + (record.status === "failed" ? " failed" : "");
        document.getElementById("selected-mode").textContent = record.executionMode;
        document.getElementById("selected-events").textContent = String(record.events.length);
        document.getElementById("selected-artifacts").textContent = String(record.artifacts.length);
        document.getElementById("selected-duration").textContent = String(Math.max(0, new Date(record.completedAt) - new Date(record.createdAt))) + " ms";
        clear(nodeRecords);
        Object.entries(record.nodeStates).sort(([a],[b]) => a.localeCompare(b)).forEach(([nodeId,state]) => { const card = make("div", undefined, "node-record" + (state === "failed" ? " failed" : "")); card.appendChild(make("i")); card.appendChild(make("span", nodeId + " · " + state)); nodeRecords.appendChild(card); });
        clear(artifactRecords);
        if (!record.artifacts.length) artifactRecords.appendChild(make("div", "No artifacts", "history-empty"));
        record.artifacts.forEach((artifact) => { const card = make("div", undefined, "artifact"); card.appendChild(make("strong", artifact.artifactId)); card.appendChild(make("small", artifact.nodeId + " / " + artifact.port)); card.appendChild(make("code", artifact.contentHash)); artifactRecords.appendChild(card); });
        clear(timeline);
        record.events.forEach((event) => { const payload = event.payload && typeof event.payload === "object" ? event.payload : {}; const row = make("li"); row.appendChild(make("span", "#" + event.sequence, "sequence")); row.appendChild(make("time", shortTime(event.occurredAt), "time")); row.appendChild(make("span", event.type + (payload.nodeId ? " · " + payload.nodeId : ""))); timeline.appendChild(row); });
        document.getElementById("run-output").textContent = JSON.stringify(record.error || record.outputs || {}, null, 2);
      };

      const selectRun = async (runId) => {
        const response = await fetch("/api/runs/" + encodeURIComponent(runId));
        if (!response.ok) throw new Error("기록을 불러오지 못했습니다.");
        renderRun(await response.json());
      };

      const loadHistory = async (selectLatest) => {
        const response = await fetch("/api/runs");
        if (!response.ok) throw new Error("실행 기록을 불러오지 못했습니다.");
        const payload = await response.json(); clear(history); runCount.textContent = String(payload.runs.length);
        if (!payload.runs.length) history.appendChild(make("div", "아직 실행 기록이 없습니다.", "history-empty"));
        payload.runs.forEach((run) => { const row = make("button", undefined, "run-row"); row.type = "button"; row.dataset.runId = run.runId; const dot = make("span", undefined, "status-dot" + (run.status === "failed" ? " failed" : "")); const copy = make("span"); copy.appendChild(make("strong", run.runId)); copy.appendChild(make("small", run.status + " · " + shortTime(run.createdAt))); row.appendChild(dot); row.appendChild(copy); row.addEventListener("click", () => selectRun(run.runId).catch((error) => message.textContent = error.message)); history.appendChild(row); });
        markSelected(); if (selectLatest && payload.runs[0]) await selectRun(payload.runs[0].runId);
      };

      runButton.addEventListener("click", async () => {
        runButton.disabled = true; message.textContent = "Workflow 실행 중…";
        try { const inputs = JSON.parse(runInput.value); const response = await fetch("/api/runs", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({inputs}) }); const record = await response.json(); if (!response.ok) throw new Error(record.message || "실행하지 못했습니다."); renderRun(record); await loadHistory(false); message.textContent = record.runId + " 기록 완료"; }
        catch (error) { message.textContent = error.message; }
        finally { runButton.disabled = false; }
      });

      loadHistory(true).catch((error) => message.textContent = error.message);
      setInterval(() => loadHistory(false).catch(() => {}), 5000);
    })();
  </script>
</body>
</html>`;
}
