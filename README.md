# Adaptive Artifact Workflow Platform

AAWP는 typed workflow compiler, durable runtime port, content-addressed artifact graph와 독립 verifier를 결합하는 workflow platform이다. 여러 agent를 호출하는 것 자체보다 실행 가능성, 복구, 증분 재실행과 검증 가능한 결과를 우선한다.

현재 저장소에는 WIR 타입·스키마와 compiler, artifact/event plane, local runtime, tool·verifier gateway, revision impact engine, `spec-to-demo` vertical slice, benchmark harness와 local Studio가 구현되어 있다.

## Quick start

요구 사항은 Node.js 24 이상과 npm 11 이상이다.

```bash
npm ci
npm run build
npm test
```

WIR을 model 호출 없이 검사하고 simulation하려면 CLI를 사용한다.

```bash
node apps/cli/dist/index.js check examples/spec-to-demo.wir.yaml
node apps/cli/dist/index.js simulate examples/spec-to-demo.wir.yaml \
  --input examples/spec-to-demo.input.json
```

## Studio

Studio는 workflow 실행, append-only run 기록과 run별 결과 preview에 집중한 local console이다.

```bash
node apps/studio/dist/server.js \
  --workflow examples/spec-to-demo.wir.yaml \
  --input examples/heavy-spec-slice.input.json \
  --runs .awf/studio-runs.jsonl \
  --demo-source examples/heavy-spec-slice \
  --demo-root .awf/demos \
  --port 4173
```

브라우저에서 `http://127.0.0.1:4173/`을 연다. 선택한 실행의 dashboard 주소는 `/?run=<runId>`, 독립 결과 주소는 `/runs/<runId>/demo/`다. 결과 snapshot을 삭제해도 run과 event 기록은 보존된다.

현재 Studio 실행은 `DETERMINISTIC_SIMULATION`이다. 실제 model, tool이나 Temporal activity를 호출하지 않으며 production 권한·승인·취소 제어도 제공하지 않는다.

## Documentation

- [Architecture plan](docs/architecture-plan.md)
- [Studio operations](docs/operations/studio.md)
- [M9 implementation report](docs/m9-implementation-report.md)
- [Implementation plan (Korean)](agentic_workflow_framework_implementation_plan_ko.md)
- [Starter backlog](agentic_workflow_framework_starter_backlog.yaml)

각 milestone의 구현 계약과 결과는 `docs/m*-implementation-contract.md`, `docs/m*-implementation-report.md`에 있다. 기술 출처와 clean-room provenance는 [provenance matrix](docs/provenance-matrix.yaml)에 기록한다.

## Repository layout

- `apps/cli`, `apps/studio`: CLI와 local run console
- `packages/*`: IR, compiler, runtime, storage, gateway와 control-plane packages
- `workflows/templates/*`: reusable workflow templates
- `examples/*`: 실행 가능한 WIR과 input fixture
- `benchmarks/*`: direct baseline과 workflow 비교 harness
- `docs/adr`, `docs/operations`: architecture decisions와 runbooks

## Quality gates

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
```

workflow template은 동일한 verifier와 자원 상한을 사용하는 direct baseline보다 품질, 비용·지연 또는 내구성·감사·통제에서 측정 가능한 이득을 보여야 승격할 수 있다.
