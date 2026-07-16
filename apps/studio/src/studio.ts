import { projectWorkflowGraph, type WorkflowEditorDocument } from "@awf/control-plane";
import { canonicalize } from "@awf/ir";
import type { StudioExecutionDescriptor } from "./executor.js";

export interface StudioViewModel {
  document: WorkflowEditorDocument;
  graph: ReturnType<typeof projectWorkflowGraph>;
  initialInputJson: string;
  execution?: StudioExecutionDescriptor;
}

export function createStudioView(input: {
  document: WorkflowEditorDocument;
  initialInputs?: unknown;
  execution?: StudioExecutionDescriptor;
}): StudioViewModel {
  return {
    document: input.document,
    graph: projectWorkflowGraph(input.document.workflow),
    initialInputJson: canonicalize(input.initialInputs ?? {}),
    ...(input.execution === undefined ? {} : { execution: input.execution })
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
  const executable = view.execution !== undefined;
  const executionLocation = executable
    ? `${view.execution!.workingDirectory} · ${view.execution!.steps.length} local process steps`
    : "실행 manifest가 없습니다. 이 화면은 simulation으로 대체 실행하지 않습니다.";
  const executionCommands = executable
    ? view.execution!.steps.map((step) => `${step.nodeId}: ${step.command.join(" ")}`).join("\n")
    : "";
  const graphNodes = view.graph.nodes
    .map(
      (node, index) => `
        <div class="workflow-node" data-node-id="${escapeHtml(node.id)}">
          <span class="node-index">${String(index + 1).padStart(2, "0")}</span>
          <div class="node-copy"><strong>${escapeHtml(node.id)}</strong><small>${escapeHtml(node.kind)}</small></div>
          <span class="node-state">Waiting</span>
        </div>`
    )
    .join("");

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AAWP Studio · ${escapeHtml(view.graph.workflowId)}</title>
  <style>
    :root {
      font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      color:#172033;
      background:#f3f5f8;
      font-synthesis:none;
      --ink:#172033;
      --muted:#667085;
      --subtle:#98a2b3;
      --line:#dfe4ea;
      --line-soft:#edf0f3;
      --panel:#fff;
      --panel-soft:#f8fafc;
      --accent:#2759d7;
      --accent-dark:#1f49b5;
      --accent-soft:#eef3ff;
      --success:#087a55;
      --success-soft:#eaf8f2;
      --danger:#b42318;
      --danger-soft:#fff0ee;
      --warning:#9a5b13;
      --warning-soft:#fff6e7;
      --shadow:0 1px 2px rgb(16 24 40 / 4%),0 12px 32px rgb(16 24 40 / 5%);
    }
    * { box-sizing:border-box; }
    html { min-width:320px; background:#f3f5f8; }
    body { min-width:320px; min-height:100vh; margin:0; background:linear-gradient(180deg,#f8fafc 0,#f3f5f8 260px); }
    button,textarea { font:inherit; }
    button,a,summary { -webkit-tap-highlight-color:transparent; }
    [hidden] { display:none!important; }
    button:focus-visible,a:focus-visible,summary:focus-visible,textarea:focus-visible { outline:3px solid rgb(39 89 215 / 24%); outline-offset:2px; }
    .topbar { position:sticky; z-index:20; top:0; border-bottom:1px solid rgb(223 228 234 / 90%); background:rgb(255 255 255 / 92%); backdrop-filter:blur(14px); }
    .topbar-inner { display:flex; width:min(1600px,100%); min-height:68px; align-items:center; justify-content:space-between; gap:24px; margin:0 auto; padding:0 32px; }
    .identity { display:flex; min-width:0; align-items:center; gap:12px; }
    .logo { display:grid; width:42px; height:36px; flex:0 0 auto; place-items:center; border-radius:10px; color:#fff; background:#172033; box-shadow:inset 0 0 0 1px rgb(255 255 255 / 8%); font-size:10px; font-weight:800; letter-spacing:.04em; }
    .product-name,.product-context { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .product-name { font-size:13px; font-weight:720; letter-spacing:-.01em; }
    .product-context { margin-top:3px; color:var(--muted); font:11px ui-monospace,SFMono-Regular,Menlo,monospace; }
    .mode { display:inline-flex; min-height:28px; flex:none; align-items:center; gap:7px; padding:0 10px; border:1px solid #f0d8af; border-radius:999px; color:var(--warning); background:var(--warning-soft); font-size:10px; font-weight:700; letter-spacing:.02em; }
    .mode::before { width:6px; height:6px; border-radius:50%; background:#d88b2b; content:""; }
    .mode.executable { border-color:#b7dfcf; color:var(--success); background:var(--success-soft); }
    .mode.executable::before { background:var(--success); }
    .page-shell { width:min(1600px,100%); margin:0 auto; padding:28px 32px 40px; }
    .control-hero { display:flex; align-items:center; justify-content:space-between; gap:28px; padding:24px 26px; border:1px solid var(--line); border-radius:16px; background:var(--panel); box-shadow:var(--shadow); }
    .eyebrow { display:block; margin-bottom:8px; color:var(--accent); font-size:10px; font-weight:760; letter-spacing:.11em; text-transform:uppercase; }
    .toolbar-copy h1 { margin:0; color:var(--ink); font-size:24px; font-weight:730; letter-spacing:-.035em; }
    .toolbar-copy p { max-width:640px; margin:7px 0 0; color:var(--muted); font-size:12px; line-height:1.55; }
    .run-control { display:flex; flex:0 0 auto; align-items:center; gap:9px; }
    .run-button { min-width:146px; min-height:42px; padding:0 18px; border:1px solid var(--accent); border-radius:9px; color:#fff; background:var(--accent); box-shadow:0 1px 2px rgb(39 89 215 / 24%); font-size:12px; font-weight:720; cursor:pointer; transition:background 140ms ease,transform 140ms ease; }
    .run-button:hover { background:var(--accent-dark); }
    .run-button:active { transform:translateY(1px); }
    .run-button:disabled { cursor:wait; opacity:.68; transform:none; }
    details.input { position:relative; }
    details.input summary { display:flex; min-height:42px; align-items:center; padding:0 13px; border:1px solid #cfd6df; border-radius:9px; color:#475467; background:#fff; font-size:11px; font-weight:650; cursor:pointer; list-style:none; }
    details.input summary::-webkit-details-marker { display:none; }
    details.input[open] summary { border-color:#aeb8c6; border-radius:9px 9px 0 0; }
    details.input textarea { position:absolute; z-index:15; top:41px; right:0; width:min(520px,calc(100vw - 64px)); height:240px; padding:15px; resize:vertical; border:1px solid #273244; border-radius:9px 0 9px 9px; color:#dce5f1; background:#172033; box-shadow:0 18px 40px rgb(16 24 40 / 24%); font:11px/1.65 ui-monospace,SFMono-Regular,Menlo,monospace; }
    .run-message { min-height:18px; margin:10px 4px 0; color:var(--muted); font-size:11px; }
    .run-message[data-tone="working"] { color:var(--accent); }
    .run-message[data-tone="success"] { color:var(--success); }
    .run-message[data-tone="error"] { color:var(--danger); }
    .execution-contract { display:flex; min-height:46px; align-items:center; justify-content:space-between; gap:18px; margin:10px 4px 0; padding:9px 12px; border:1px solid var(--line); border-radius:9px; background:rgb(255 255 255 / 72%); }
    .execution-contract[data-executable="false"] { border-color:#efc7c2; background:var(--danger-soft); }
    .execution-contract span,.execution-contract code { display:block; }
    .execution-contract span { margin-bottom:3px; color:var(--muted); font-size:8px; font-weight:720; letter-spacing:.07em; text-transform:uppercase; }
    .execution-contract code { color:#344054; font:9px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace; overflow-wrap:anywhere; }
    .execution-contract details { flex:none; }
    .execution-contract summary { color:var(--accent); font-size:9px; font-weight:700; cursor:pointer; }
    .execution-contract pre { position:absolute; z-index:16; right:34px; width:min(760px,calc(100vw - 68px)); max-height:260px; margin-top:8px; box-shadow:0 18px 40px rgb(16 24 40 / 24%); }
    .workflow-panel { margin-top:18px; overflow:hidden; border:1px solid var(--line); border-radius:14px; background:var(--panel); box-shadow:0 1px 2px rgb(16 24 40 / 3%); }
    .workflow-title { display:flex; min-height:52px; align-items:center; justify-content:space-between; gap:16px; padding:0 18px; border-bottom:1px solid var(--line-soft); }
    .workflow-title strong { font-size:12px; font-weight:700; }
    .workflow-title span { color:var(--muted); font-size:10px; }
    .workflow-strip { display:grid; grid-auto-columns:minmax(220px,1fr); grid-auto-flow:column; gap:10px; overflow-x:auto; padding:14px; background:var(--panel-soft); }
    .workflow-node { display:grid; min-width:220px; grid-template-columns:30px minmax(0,1fr) auto; align-items:center; gap:10px; padding:12px; border:1px solid var(--line); border-radius:10px; background:#fff; }
    .node-index { display:grid; width:30px; height:30px; place-items:center; border-radius:8px; color:#6f7b8d; background:#f1f4f7; font:10px ui-monospace,SFMono-Regular,Menlo,monospace; }
    .node-copy { min-width:0; }
    .node-copy strong,.node-copy small { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .node-copy strong { font-size:11px; font-weight:690; }
    .node-copy small { margin-top:3px; color:var(--muted); font-size:9px; }
    .node-state { padding:4px 7px; border-radius:999px; color:#667085; background:#f2f4f7; font-size:8px; font-weight:720; text-transform:uppercase; letter-spacing:.04em; }
    .workflow-node[data-run-status="running"] { border-color:#b9c9f5; box-shadow:0 0 0 3px var(--accent-soft); }
    .workflow-node[data-run-status="running"] .node-state { color:var(--accent); background:var(--accent-soft); }
    .workflow-node[data-run-status="completed"] .node-state { color:var(--success); background:var(--success-soft); }
    .workflow-node[data-run-status="failed"] .node-state { color:var(--danger); background:var(--danger-soft); }
    .workspace { display:grid; min-height:660px; grid-template-columns:300px minmax(0,1fr); margin-top:18px; overflow:hidden; border:1px solid var(--line); border-radius:14px; background:var(--panel); box-shadow:var(--shadow); }
    .run-rail { min-width:0; border-right:1px solid var(--line); background:#fafbfc; }
    .panel-title { display:flex; min-height:56px; align-items:center; justify-content:space-between; padding:0 16px; border-bottom:1px solid var(--line); font-size:11px; font-weight:700; }
    #run-count { display:grid; min-width:23px; height:23px; place-items:center; padding:0 6px; border-radius:999px; color:#667085; background:#eef1f4; font-size:9px; font-weight:700; }
    .history { max-height:calc(100vh - 220px); overflow:auto; padding:8px; scrollbar-width:thin; }
    .history-empty { padding:40px 20px; color:var(--subtle); text-align:center; font-size:11px; line-height:1.6; }
    .run-row { display:grid; width:100%; grid-template-columns:9px minmax(0,1fr); align-items:start; gap:10px; margin-bottom:3px; padding:11px 10px; border:1px solid transparent; border-radius:9px; color:inherit; background:transparent; text-align:left; cursor:pointer; }
    .run-row:hover { background:#f2f4f7; }
    .run-row.active { border-color:#d9e2f8; background:#fff; box-shadow:0 1px 3px rgb(16 24 40 / 6%),inset 3px 0 var(--accent); }
    .status-dot { width:7px; height:7px; margin-top:5px; border-radius:50%; background:var(--success); box-shadow:0 0 0 3px var(--success-soft); }
    .status-dot.running { background:var(--accent); box-shadow:0 0 0 3px var(--accent-soft); }
    .status-dot.failed { background:var(--danger); box-shadow:0 0 0 3px var(--danger-soft); }
    .run-copy { min-width:0; }
    .run-row-head { display:flex; min-width:0; align-items:center; gap:7px; }
    .run-row strong { min-width:0; flex:1; overflow:hidden; color:#344054; font:10px ui-monospace,SFMono-Regular,Menlo,monospace; text-overflow:ellipsis; white-space:nowrap; }
    .run-row small { display:block; margin-top:5px; overflow:hidden; color:var(--muted); font-size:9px; text-overflow:ellipsis; white-space:nowrap; }
    .run-demo-badge { flex:none; padding:3px 6px; border-radius:999px; color:#667085; background:#eef1f4; font-size:7px; font-weight:760; letter-spacing:.04em; text-transform:uppercase; }
    .run-demo-badge.onboarded { color:var(--success); background:var(--success-soft); }
    .detail { min-width:0; background:#fff; }
    .empty-detail { display:grid; min-height:520px; place-items:center; padding:40px; text-align:center; }
    .empty-state strong,.empty-state span { display:block; }
    .empty-state strong { color:#344054; font-size:14px; }
    .empty-state span { max-width:340px; margin-top:7px; color:var(--muted); font-size:11px; line-height:1.55; }
    #run-detail[hidden] { display:none; }
    .detail-head { display:flex; align-items:center; justify-content:space-between; gap:24px; padding:20px 22px; border-bottom:1px solid var(--line); }
    .detail-heading { min-width:0; }
    .detail-kicker { display:block; margin-bottom:6px; color:var(--accent); font-size:8px; font-weight:760; letter-spacing:.1em; text-transform:uppercase; }
    .detail-head h2 { margin:0; overflow:hidden; color:#273244; font:12px ui-monospace,SFMono-Regular,Menlo,monospace; text-overflow:ellipsis; white-space:nowrap; }
    .detail-head p { margin:6px 0 0; color:var(--muted); font-size:10px; }
    .detail-actions { display:flex; flex:none; align-items:center; gap:8px; }
    .demo-open,.demo-lifecycle,.delete-result { display:inline-flex; min-height:34px; align-items:center; justify-content:center; padding:0 11px; border-radius:8px; font-size:10px; font-weight:680; text-decoration:none; }
    .demo-open { border:1px solid var(--accent); color:#fff; background:var(--accent); }
    .demo-open:hover { background:var(--accent-dark); }
    .demo-lifecycle { border:1px solid #b8c6eb; color:var(--accent); background:#fff; cursor:pointer; }
    .demo-lifecycle:hover { background:var(--accent-soft); }
    .delete-result { border:1px solid transparent; color:var(--danger); background:transparent; cursor:pointer; }
    .delete-result:hover { background:var(--danger-soft); }
    .demo-lifecycle:disabled,.delete-result:disabled { cursor:wait; opacity:.55; }
    .status-label { padding:5px 8px; border-radius:999px; color:var(--success); background:var(--success-soft); font-size:8px; font-weight:760; letter-spacing:.04em; text-transform:uppercase; }
    .status-label.running { color:var(--accent); background:var(--accent-soft); }
    .status-label.failed { color:var(--danger); background:var(--danger-soft); }
    .summary { display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); padding:14px 22px; gap:8px; border-bottom:1px solid var(--line); background:#fcfcfd; }
    .summary div { padding:10px 12px; border:1px solid var(--line-soft); border-radius:9px; background:#fff; }
    .summary span,.summary strong { display:block; }
    .summary span { color:var(--muted); font-size:8px; font-weight:680; letter-spacing:.06em; text-transform:uppercase; }
    .summary strong { margin-top:5px; overflow:hidden; color:#344054; font-size:11px; text-overflow:ellipsis; white-space:nowrap; }
    .demo-result { min-width:0; padding:22px; border-bottom:1px solid var(--line); }
    .demo-result-head { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; margin-bottom:13px; }
    .demo-result-head h3 { margin:0; color:#344054; font-size:12px; }
    .demo-result-head p { margin:5px 0 0; color:var(--muted); font:9px ui-monospace,SFMono-Regular,Menlo,monospace; overflow-wrap:anywhere; }
    .preview-label { color:var(--subtle); font-size:9px; }
    .preview-shell { padding:12px; border:1px solid #d9dee6; border-radius:12px; background:#e9edf2; }
    .demo-frame { display:block; width:100%; height:640px; border:0; border-radius:8px; background:#fff; box-shadow:0 1px 5px rgb(16 24 40 / 12%); }
    .demo-empty { display:grid; min-height:140px; place-items:center; padding:24px; border:1px dashed #cbd3dd; border-radius:10px; color:var(--muted); background:var(--panel-soft); text-align:center; font-size:11px; }
    .detail-grid { display:grid; grid-template-columns:minmax(0,1fr) minmax(320px,.78fr); }
    .detail-grid section { min-width:0; padding:20px 22px; border-bottom:1px solid var(--line); }
    .detail-grid section:nth-child(2),.detail-grid section:nth-child(4) { border-right:1px solid var(--line); }
    .detail-grid .trace-contract-section { grid-column:1 / -1; border-right:0; background:#fcfcfd; }
    .detail-grid h3 { margin:0 0 13px; color:#667085; font-size:9px; font-weight:760; letter-spacing:.08em; text-transform:uppercase; }
    .section-heading { margin-bottom:13px; }
    .section-heading h3 { margin-bottom:4px; }
    .section-heading p { margin:0; color:var(--subtle); font-size:8px; line-height:1.5; }
    .trace-contract { display:grid; grid-template-columns:1.05fr repeat(3,minmax(0,1fr)); gap:8px; }
    .trace-contract div { min-width:0; padding:10px 11px; border:1px solid var(--line-soft); border-radius:8px; background:#fff; }
    .trace-contract span,.trace-contract code { display:block; }
    .trace-contract span { margin-bottom:5px; color:var(--muted); font-size:8px; font-weight:680; letter-spacing:.05em; text-transform:uppercase; }
    .trace-contract code { overflow:hidden; color:#475467; font-size:8px; text-overflow:ellipsis; white-space:nowrap; }
    .nodes { display:flex; flex-wrap:wrap; gap:7px; }
    .node-record { display:flex; align-items:center; gap:7px; padding:7px 9px; border:1px solid var(--line-soft); border-radius:7px; color:#475467; background:#fafbfc; font-size:9px; }
    .node-record i { width:6px; height:6px; border-radius:50%; background:var(--success); }
    .node-record.failed i { background:var(--danger); }
    .timeline { margin:0; padding:0; list-style:none; }
    .timeline li { display:grid; grid-template-columns:30px 70px minmax(0,1fr); gap:8px; padding:8px 0; border-bottom:1px solid var(--line-soft); color:#475467; font-size:9px; }
    .timeline li:last-child { border:0; }
    .sequence,.time { color:var(--subtle); font:8px ui-monospace,SFMono-Regular,Menlo,monospace; }
    .artifacts { display:flex; flex-direction:column; gap:7px; }
    .artifact { min-width:0; padding:9px 10px; border:1px solid var(--line-soft); border-radius:8px; background:#fafbfc; }
    .artifact strong,.artifact small,.artifact code { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .artifact strong { color:#344054; font-size:9px; }
    .artifact small { margin:3px 0 6px; color:var(--muted); font-size:8px; }
    .artifact code { color:#7a8699; font-size:8px; }
    pre { max-height:300px; margin:0; overflow:auto; padding:13px; border-radius:8px; color:#dce5f1; background:#172033; font:9px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace; white-space:pre-wrap; }
    @media (max-width:1050px) {
      .workspace { grid-template-columns:260px minmax(0,1fr); }
      .summary { grid-template-columns:repeat(3,1fr); }
      .trace-contract { grid-template-columns:repeat(2,minmax(0,1fr)); }
      .demo-frame { height:560px; }
    }
    @media (max-width:820px) {
      .topbar-inner,.page-shell { padding-right:18px; padding-left:18px; }
      .control-hero { align-items:stretch; flex-direction:column; }
      .run-control { justify-content:space-between; }
      .workspace { grid-template-columns:1fr; }
      .run-rail { border-right:0; border-bottom:1px solid var(--line); }
      .history { display:flex; max-height:190px; gap:4px; overflow:auto; }
      .run-row { min-width:230px; margin:0; }
      .detail-grid { grid-template-columns:1fr; }
      .detail-grid section:nth-child(2),.detail-grid section:nth-child(4) { border-right:0; }
      .trace-contract-section { grid-column:auto; }
      .demo-frame { height:520px; }
    }
    @media (max-width:560px) {
      .topbar-inner { min-height:60px; padding-right:14px; padding-left:14px; }
      .product-context { max-width:190px; }
      .page-shell { padding:14px 12px 28px; }
      .control-hero { padding:20px; border-radius:12px; }
      .toolbar-copy h1 { font-size:21px; }
      .run-control { align-items:stretch; flex-direction:column-reverse; }
      .run-button,details.input summary { width:100%; justify-content:center; }
      details.input textarea { right:auto; left:0; width:calc(100vw - 64px); }
      .workflow-panel,.workspace { border-radius:12px; }
      .workflow-title { padding:0 14px; }
      .workflow-strip { grid-auto-columns:minmax(205px,1fr); }
      .detail-head { align-items:stretch; flex-direction:column; }
      .detail-actions { flex-wrap:wrap; }
      .summary { grid-template-columns:repeat(2,1fr); padding:12px; }
      .demo-result { padding:16px 12px; }
      .demo-result-head { align-items:flex-start; flex-direction:column; }
      .preview-shell { padding:6px; }
      .demo-frame { height:480px; }
      .detail-grid section { padding:18px 16px; }
    }
    @media (prefers-reduced-motion:reduce) {
      * { scroll-behavior:auto!important; transition-duration:.01ms!important; }
    }
  </style>
</head>
<body>
  <header class="topbar">
    <div class="topbar-inner">
      <div class="identity"><div class="logo">AAWP</div><div><span class="product-name">AAWP Studio</span><span class="product-context">Adaptive Artifact Workflow Platform</span></div></div>
      <span class="mode${executable ? " executable" : ""}">${executable ? "Local process" : "Not executable"}</span>
    </div>
  </header>
  <div class="page-shell">
    <section class="control-hero">
      <div class="toolbar-copy"><span class="eyebrow">Workflow execution</span><h1>Execute and inspect</h1><p>${escapeHtml(view.graph.workflowId)}의 등록된 실제 실행 단계를 시작하고 전체 wall-clock, node, artifact, model token과 결과를 추적합니다.</p></div>
      <div class="run-control">
        <details class="input"><summary>Run input</summary><textarea id="run-input" aria-label="Workflow run input" spellcheck="false">${escapeHtml(view.initialInputJson)}</textarea></details>
        <button id="run-workflow" class="run-button" type="button"${executable ? "" : " disabled"}>Run ${escapeHtml(view.graph.workflowId)}</button>
      </div>
    </section>
    <div class="execution-contract" data-executable="${String(executable)}"><div><span>Executes at</span><code>${escapeHtml(executionLocation)}</code></div><details${executable ? "" : " hidden"}><summary>Commands</summary><pre>${escapeHtml(executionCommands)}</pre></details></div>
    <p id="run-message" class="run-message" data-tone="${executable ? "neutral" : "error"}" aria-live="polite">${executable ? "실제 local process를 실행합니다. Codex JSONL과 AAWP usage event의 token을 합산합니다." : "실제 실행기가 없어 Run을 비활성화했습니다. 무효한 simulation 기록은 생성하지 않습니다."}</p>
    <div class="workflow-panel">
      <div class="workflow-title"><strong>Workflow</strong><span>${escapeHtml(view.graph.mode)} · ${escapeHtml(view.graph.nodes.length)} steps · execution order</span></div>
      <div class="workflow-strip" aria-label="Workflow nodes">${graphNodes}</div>
    </div>
    <main class="workspace">
      <aside class="run-rail"><div class="panel-title"><span>Runs</span><span id="run-count">0</span></div><div id="run-history" class="history"><div class="history-empty">실행 기록을 불러오는 중입니다.</div></div></aside>
      <div class="detail">
        <div id="empty-detail" class="empty-detail"><div class="empty-state"><strong>No run selected</strong><span>Run workflow를 실행하면 node 상태와 결과 preview가 여기에 표시됩니다.</span></div></div>
        <div id="run-detail" hidden>
          <div class="detail-head"><div class="detail-heading"><span class="detail-kicker">Run details</span><h2 id="selected-run-id"></h2><p id="selected-run-time"></p></div><div class="detail-actions"><span id="selected-status" class="status-label"></span><a id="open-demo" class="demo-open" target="_blank" rel="noopener noreferrer" hidden>Open demo</a><button id="toggle-demo" class="demo-lifecycle" type="button" hidden>Onboard demo</button><button id="delete-demo" class="delete-result" type="button" hidden>Delete demo</button></div></div>
          <div class="summary"><div><span>End-to-end time</span><strong id="selected-duration"></strong></div><div><span>Snapshot</span><strong id="selected-build-duration"></strong></div><div><span>Tokens</span><strong id="selected-tokens"></strong></div><div><span>Events</span><strong id="selected-events"></strong></div><div><span>Artifacts</span><strong id="selected-artifacts"></strong></div><div><span>Executor</span><strong id="selected-mode"></strong></div></div>
          <section id="demo-result" class="demo-result" hidden><div class="demo-result-head"><div><span class="detail-kicker">Result preview</span><h3>Web demo</h3><p id="demo-address"></p></div><span id="preview-label" class="preview-label">Isolated run snapshot</span></div><div class="preview-shell"><iframe id="demo-frame" class="demo-frame" title="Run demo preview" sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"></iframe><div id="demo-empty" class="demo-empty" hidden></div></div></section>
          <div class="detail-grid">
            <section class="trace-contract-section"><div class="section-heading"><h3>Traceability</h3><p>Run을 실제 executor, workflow, 고정 input과 execution event digest에 연결합니다.</p></div><div class="trace-contract"><div><span>Trace ID</span><code id="trace-id"></code></div><div><span>Workflow digest</span><code id="trace-workflow-digest"></code></div><div><span>Input digest</span><code id="trace-input-digest"></code></div><div><span>Trace digest</span><code id="trace-digest"></code></div></div></section>
            <section><h3>Nodes</h3><div id="node-records" class="nodes"></div></section>
            <section><h3>Artifacts</h3><div id="artifact-records" class="artifacts"></div></section>
            <section><div class="section-heading"><h3>Execution timeline</h3><p>실제 프로세스 실행을 run 시작 기준 monotonic clock으로 기록합니다. 과거 simulation run은 Mode에 별도로 표시됩니다.</p></div><ol id="event-timeline" class="timeline"></ol></section>
            <section><h3>Output</h3><pre id="run-output">{}</pre></section>
          </div>
        </div>
      </div>
    </main>
  </div>
  <script>
    (() => {
      const runButton = document.getElementById("run-workflow");
      const runInput = document.getElementById("run-input");
      const message = document.getElementById("run-message");
      const historyList = document.getElementById("run-history");
      const runCount = document.getElementById("run-count");
      const emptyDetail = document.getElementById("empty-detail");
      const detail = document.getElementById("run-detail");
      const nodeRecords = document.getElementById("node-records");
      const artifactRecords = document.getElementById("artifact-records");
      const timeline = document.getElementById("event-timeline");
      const demoResult = document.getElementById("demo-result");
      const openDemo = document.getElementById("open-demo");
      const toggleDemo = document.getElementById("toggle-demo");
      const deleteDemo = document.getElementById("delete-demo");
      const demoAddress = document.getElementById("demo-address");
      const previewLabel = document.getElementById("preview-label");
      const demoFrame = document.getElementById("demo-frame");
      const demoEmpty = document.getElementById("demo-empty");
      const runButtonLabel = ${canonicalize(`Run ${view.graph.workflowId}`)};
      let selectedRunId = null;
      let demoOnboarded = false;
      let selectedRunRunning = false;

      const clear = (target) => { while (target.firstChild) target.removeChild(target.firstChild); };
      const make = (tag, text, className) => { const item = document.createElement(tag); if (text !== undefined) item.textContent = text; if (className) item.className = className; return item; };
      const shortTime = (value) => new Date(value).toLocaleTimeString("ko-KR", { hour:"2-digit", minute:"2-digit", second:"2-digit" });
      const fullDateTime = (value) => new Date(value).toLocaleString("ko-KR", { dateStyle:"medium", timeStyle:"medium" });
      const formatSeconds = (value) => { const milliseconds = Number(value); if (!Number.isFinite(milliseconds)) return "—"; const seconds = milliseconds / 1000; const digits = seconds === 0 ? 0 : seconds < 1 ? 3 : seconds < 10 ? 2 : 1; return seconds.toFixed(digits).replace(/\.0$/, "") + " s"; };
      const formatTimelineDuration = (value) => { const milliseconds = Number(value); if (!Number.isFinite(milliseconds)) return "—"; const totalSeconds = milliseconds / 1000; const hours = Math.floor(totalSeconds / 3600); const minutes = Math.floor((totalSeconds % 3600) / 60); const remaining = totalSeconds - hours * 3600 - minutes * 60; const digits = remaining === 0 ? 0 : totalSeconds < 1 ? 3 : 1; const seconds = remaining.toFixed(digits).replace(/\.0$/, ""); return (hours > 0 ? hours + "h" : "") + (hours > 0 || minutes > 0 ? minutes + "m" : "") + seconds + "s"; };
      const formatDuration = (value) => { const milliseconds = Number(value); if (!Number.isFinite(milliseconds)) return "—"; if (milliseconds < 60000) return (milliseconds / 1000).toFixed(milliseconds < 10000 ? 3 : 1).replace(/0+$/, "").replace(/\.$/, "") + " s"; const seconds = Math.floor(milliseconds / 1000); const minutes = Math.floor(seconds / 60); const hours = Math.floor(minutes / 60); const remainingMinutes = minutes % 60; const remainingSeconds = seconds % 60; return hours > 0 ? hours + "h " + remainingMinutes + "m " + remainingSeconds + "s" : minutes + "m " + remainingSeconds + "s"; };
      const elapsedLabel = (value) => value === undefined ? "legacy" : "+" + formatTimelineDuration(value);
      const shortRunId = (value) => value.length > 22 ? value.slice(0, 12) + "…" + value.slice(-6) : value;
      const statusLabel = (value) => ({ waiting:"Waiting", scheduled:"Scheduled", running:"Running", completed:"Completed", failed:"Failed" })[value] || value;
      const setMessage = (text, tone = "neutral") => { message.textContent = text; message.dataset.tone = tone; };
      const syncRunUrl = (runId) => { const url = new URL(window.location.href); url.searchParams.set("run", runId); window.history.replaceState({}, "", url); };
      const markSelected = () => document.querySelectorAll("[data-run-id]").forEach((row) => {
        const active = row.dataset.runId === selectedRunId;
        row.classList.toggle("active", active);
        if (active) row.setAttribute("aria-current", "true"); else row.removeAttribute("aria-current");
      });
      const updateGraph = (states) => document.querySelectorAll("[data-node-id]").forEach((node) => {
        const state = states[node.dataset.nodeId] || "waiting";
        node.dataset.runStatus = state;
        const label = node.querySelector(".node-state");
        if (label) label.textContent = statusLabel(state);
      });
      const renderDemo = (record) => {
        if (!record.demo) { demoResult.hidden = true; openDemo.hidden = true; openDemo.removeAttribute("href"); toggleDemo.hidden = true; deleteDemo.hidden = true; demoFrame.src = "about:blank"; demoOnboarded = false; return; }
        const snapshotAvailable = record.demo.snapshotAvailable === true;
        const inspectionOnly = record.status !== "completed";
        demoOnboarded = snapshotAvailable && record.demo.onboarded === true;
        demoResult.hidden = false; openDemo.hidden = !snapshotAvailable; toggleDemo.hidden = !snapshotAvailable || inspectionOnly; deleteDemo.hidden = !snapshotAvailable;
        if (snapshotAvailable) openDemo.href = record.demo.previewUrl || "/runs/" + encodeURIComponent(record.runId) + "/demo-preview/"; else openDemo.removeAttribute("href");
        toggleDemo.textContent = demoOnboarded ? "Offboard demo" : "Onboard demo";
        demoEmpty.hidden = snapshotAvailable; demoFrame.hidden = !snapshotAvailable;
        demoEmpty.textContent = "Demo snapshot이 삭제되었습니다. Input, source와 실행 기록은 보존됩니다.";
        const inspectionUrl = record.demo.previewUrl || "/runs/" + encodeURIComponent(record.runId) + "/demo-preview/";
        previewLabel.textContent = inspectionOnly ? "Failed candidate · inspection only" : demoOnboarded ? "Onboarded snapshot" : "Stored inspection";
        demoAddress.textContent = (demoOnboarded ? record.demo.entryUrl : inspectionUrl) + " · " + record.demo.contentDigest.slice(0, 12) + " · " + (inspectionOnly ? "Failed candidate" : demoOnboarded ? "Onboarded" : snapshotAvailable ? "Stored inspection" : "Deleted");
        demoFrame.src = snapshotAvailable ? (demoOnboarded ? record.demo.entryUrl : inspectionUrl) : "about:blank";
      };

      const renderRun = (record) => {
        selectedRunId = record.runId; syncRunUrl(record.runId); markSelected(); updateGraph(record.nodeStates); renderDemo(record);
        emptyDetail.hidden = true; detail.hidden = false;
        document.getElementById("selected-run-id").textContent = record.runId;
        document.getElementById("selected-run-time").textContent = fullDateTime(record.createdAt);
        selectedRunRunning = record.status === "running";
        runButton.disabled = ${String(!executable)} || selectedRunRunning;
        const status = document.getElementById("selected-status"); status.textContent = statusLabel(record.status); status.className = "status-label" + (record.status === "failed" ? " failed" : record.status === "running" ? " running" : "");
        document.getElementById("selected-mode").textContent = record.executionMode === "LOCAL_PROCESS" ? "Local process · " + (record.executor?.stepCount ?? "?") + " steps" : record.executionMode + " · legacy";
        document.getElementById("selected-events").textContent = String(record.events.length);
        document.getElementById("selected-artifacts").textContent = String(record.artifacts.length);
        const finalElapsed = record.events.length ? record.events[record.events.length - 1].elapsedMs : undefined;
        const workflowDuration = record.metrics?.timing?.workflowDurationMs ?? (finalElapsed === undefined ? Math.max(0, new Date(record.completedAt) - new Date(record.createdAt)) : finalElapsed);
        const resultBuild = record.metrics?.timing?.resultBuild;
        const tokenUsage = record.metrics?.tokens;
        document.getElementById("selected-duration").textContent = record.status === "running" ? formatDuration(Date.now() - new Date(record.createdAt).getTime()) + " · running" : formatDuration(workflowDuration);
        document.getElementById("selected-build-duration").textContent = resultBuild?.status === "measured" ? formatSeconds(resultBuild.durationMs) + " · after execution" : "N/A";
        const tokenElement = document.getElementById("selected-tokens");
        tokenElement.textContent = !tokenUsage ? "legacy" : record.status === "running" && tokenUsage.status === "not_reported" ? "Tracking…" : tokenUsage.status === "not_reported" ? "Not reported" : tokenUsage.totalTokens.toLocaleString("ko-KR") + " · " + tokenUsage.modelInvocations + " calls";
        tokenElement.title = !tokenUsage ? "기존 run에는 token telemetry가 없습니다." : "input " + (tokenUsage.inputTokens ?? 0).toLocaleString("ko-KR") + " · cached " + (tokenUsage.cachedInputTokens ?? 0).toLocaleString("ko-KR") + " · output " + (tokenUsage.outputTokens ?? 0).toLocaleString("ko-KR") + " · reasoning " + (tokenUsage.reasoningOutputTokens ?? 0).toLocaleString("ko-KR") + " · coverage " + (tokenUsage.coverage || "legacy");
        const trace = record.metrics?.trace;
        document.getElementById("trace-id").textContent = trace?.traceId || record.runId;
        document.getElementById("trace-workflow-digest").textContent = trace?.workflowDigest || record.workflowDigest || "legacy";
        document.getElementById("trace-input-digest").textContent = trace?.inputDigest || record.inputDigest || "legacy";
        document.getElementById("trace-digest").textContent = trace?.traceDigest || record.traceDigest || "legacy";
        clear(nodeRecords);
        Object.entries(record.nodeStates).sort(([a],[b]) => a.localeCompare(b)).forEach(([nodeId,state]) => { const card = make("div", undefined, "node-record" + (state === "failed" ? " failed" : "")); card.appendChild(make("i")); card.appendChild(make("span", nodeId + " · " + state)); nodeRecords.appendChild(card); });
        clear(artifactRecords);
        if (!record.artifacts.length) artifactRecords.appendChild(make("div", "No artifacts", "history-empty"));
        record.artifacts.forEach((artifact) => { const card = make("div", undefined, "artifact"); card.appendChild(make("strong", artifact.artifactId)); card.appendChild(make("small", artifact.nodeId + " / " + artifact.port + (artifact.source ? " · " + artifact.source : ""))); if (artifact.path) card.appendChild(make("code", artifact.path)); card.appendChild(make("code", artifact.contentHash)); artifactRecords.appendChild(card); });
        clear(timeline);
        record.events.forEach((event) => { const payload = event.payload && typeof event.payload === "object" ? event.payload : {}; const row = make("li"); const timing = make("time", elapsedLabel(event.elapsedMs), "time"); timing.dateTime = event.occurredAt; timing.title = event.elapsedMs === undefined ? "기존 기록에는 이벤트별 monotonic timing이 없습니다. " + event.occurredAt : event.occurredAt; const duration = payload.durationMs === undefined ? "" : " · " + formatTimelineDuration(payload.durationMs); row.appendChild(make("span", "#" + event.sequence, "sequence")); row.appendChild(timing); row.appendChild(make("span", event.type + (payload.nodeId ? " · " + payload.nodeId : "") + duration)); timeline.appendChild(row); });
        document.getElementById("run-output").textContent = JSON.stringify(record.error || record.outputs || {}, null, 2);
      };

      const selectRun = async (runId) => {
        const response = await fetch("/api/runs/" + encodeURIComponent(runId));
        if (!response.ok) throw new Error("기록을 불러오지 못했습니다.");
        renderRun(await response.json());
      };

      const loadHistory = async ({ selectLatest = false, preferredRunId = null } = {}) => {
        const response = await fetch("/api/runs");
        if (!response.ok) throw new Error("실행 기록을 불러오지 못했습니다.");
        const payload = await response.json(); clear(historyList); runCount.textContent = String(payload.runs.length);
        if (!payload.runs.length) historyList.appendChild(make("div", "아직 실행 기록이 없습니다.", "history-empty"));
        payload.runs.forEach((run) => {
          const row = make("button", undefined, "run-row");
          row.type = "button"; row.dataset.runId = run.runId; row.title = run.runId; row.setAttribute("aria-label", run.runId + " 실행 기록 열기");
          const dot = make("span", undefined, "status-dot" + (run.status === "failed" ? " failed" : run.status === "running" ? " running" : ""));
          const copy = make("span", undefined, "run-copy");
          const head = make("span", undefined, "run-row-head");
          head.appendChild(make("strong", shortRunId(run.runId)));
          if (run.demo?.snapshotAvailable) head.appendChild(make("span", run.demo.onboarded ? "Onboarded" : "Stored", "run-demo-badge" + (run.demo.onboarded ? " onboarded" : "")));
          copy.appendChild(head);
          copy.appendChild(make("small", statusLabel(run.status) + " · " + shortTime(run.createdAt)));
          row.appendChild(dot); row.appendChild(copy);
          row.addEventListener("click", () => selectRun(run.runId).catch((error) => setMessage(error.message, "error")));
          historyList.appendChild(row);
        });
        markSelected();
        const targetRunId = preferredRunId || (selectLatest && payload.runs[0] ? payload.runs[0].runId : null);
        if (targetRunId && payload.runs.some((run) => run.runId === targetRunId)) await selectRun(targetRunId);
        else if (selectedRunId && payload.runs.some((run) => run.runId === selectedRunId)) await selectRun(selectedRunId);
        else if (preferredRunId) {
          setMessage("요청한 run ID를 찾지 못해 최신 기록을 표시합니다.", "error");
          if (payload.runs[0]) await selectRun(payload.runs[0].runId);
        }
      };

      runButton.addEventListener("click", async () => {
        const previousStates = Object.fromEntries(Array.from(document.querySelectorAll("[data-node-id]")).map((node) => [node.dataset.nodeId, node.dataset.runStatus || "waiting"]));
        const optimisticStates = Object.fromEntries(Object.keys(previousStates).map((nodeId, index) => [nodeId, index === 0 ? "running" : "waiting"]));
        runButton.disabled = true; runButton.textContent = "Running…"; runButton.setAttribute("aria-busy", "true"); updateGraph(optimisticStates); setMessage("Workflow를 실행하고 기록을 생성하는 중입니다…", "working");
        try { const inputs = JSON.parse(runInput.value); const response = await fetch("/api/runs", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({inputs}) }); const record = await response.json(); if (!response.ok) throw new Error(record.message || "실행하지 못했습니다."); renderRun(record); await loadHistory(); setMessage(record.status === "running" ? shortRunId(record.runId) + " 실제 workflow를 시작했습니다. 실행 중 event를 5초마다 갱신합니다." : shortRunId(record.runId) + " 실행과 결과 저장을 완료했습니다.", record.status === "running" ? "working" : "success"); }
        catch (error) { updateGraph(previousStates); setMessage(error.message, "error"); }
        finally { runButton.disabled = ${String(!executable)} || selectedRunRunning; runButton.textContent = runButtonLabel; runButton.setAttribute("aria-busy", "false"); }
      });

      toggleDemo.addEventListener("click", async () => {
        if (!selectedRunId) return;
        const action = demoOnboarded ? "offboard" : "onboard";
        toggleDemo.disabled = true;
        try { const response = await fetch("/api/runs/" + encodeURIComponent(selectedRunId) + "/demo/" + action, { method:"POST" }); const result = await response.json(); if (!response.ok) throw new Error(result.message || "Demo 상태를 변경하지 못했습니다."); await selectRun(selectedRunId); await loadHistory(); setMessage(shortRunId(selectedRunId) + (action === "onboard" ? " demo를 onboard했습니다." : " demo를 offboard했습니다. Snapshot은 보존됩니다."), "success"); }
        catch (error) { setMessage(error.message, "error"); }
        finally { toggleDemo.disabled = false; }
      });

      deleteDemo.addEventListener("click", async () => {
        if (!selectedRunId || !confirm("이 run의 demo snapshot을 삭제할까요? Input, source와 실행 기록은 남습니다.")) return;
        deleteDemo.disabled = true;
        try { const response = await fetch("/api/runs/" + encodeURIComponent(selectedRunId) + "/demo", { method:"DELETE" }); const result = await response.json(); if (!response.ok) throw new Error(result.message || "Demo를 삭제하지 못했습니다."); await selectRun(selectedRunId); await loadHistory(); setMessage(shortRunId(selectedRunId) + " demo snapshot을 삭제했습니다. Input, source와 실행 기록은 보존됩니다.", "success"); }
        catch (error) { setMessage(error.message, "error"); }
        finally { deleteDemo.disabled = false; }
      });

      const requestedRunId = new URLSearchParams(window.location.search).get("run");
      loadHistory({ selectLatest:true, preferredRunId:requestedRunId }).catch((error) => setMessage(error.message, "error"));
      setInterval(() => loadHistory().catch(() => {}), 5000);
    })();
  </script>
</body>
</html>`;
}
