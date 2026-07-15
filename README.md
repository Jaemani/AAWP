# Adaptive Artifact Workflow Platform

AAWP는 AI 작업을 **typed workflow compiler, durable runtime, incremental artifact graph, independent verifier**로 실행·복구·검증하는 플랫폼이다. 목표는 agent 수를 늘리는 것이 아니라, 어떤 입력과 권한으로 무엇을 만들었고 변경 시 어디까지 다시 실행해야 하는지를 증명하는 것이다.

## 핵심

- 모든 작성 방식은 versioned Workflow IR(WIR)로 수렴하며 실행 전에 타입, 권한, 예산과 그래프 오류를 검사한다.
- 실행 결과는 대화 문자열이 아니라 content-addressed artifact와 append-only event로 남는다.
- revision은 영향받은 downstream node만 다시 실행하고 나머지는 fingerprint cache로 재사용한다.
- builder와 release verifier의 소유권·실행 경계를 분리한다.
- 작은 작업은 `DIRECT`, 닫힌 계약은 `CONTRACT`, 열린 조사는 `EXPLORER`로 실행한다.
- workflow는 동일 조건의 direct baseline보다 품질, 비용·지연 또는 내구성·통제에서 이득을 입증해야 승격한다.

AAWP는 범용 connector 중심 자동화 제품과 경쟁하는 integration catalog가 아니다. 외부 connector는 adapter로 재사용하고, 코어는 typed contracts, artifact lineage, revision impact, durable recovery와 evidence-owned release에 집중한다. `spec-to-demo`는 이 코어를 검증하는 첫 vertical workflow일 뿐 플랫폼의 정체성이 아니다.

## 현재 구현

WIR·compiler, artifact/event plane, Temporal runtime adapter, model/tool/verifier gateway, revision impact engine, value router, platform-owned demo bundle, `spec-to-demo`, `spec-feedback-to-spec`, direct benchmark harness와 local AAWP Studio가 있다. Studio의 실행 버튼은 별도 execution manifest로 WIR node마다 실제 local process가 등록된 경우에만 활성화된다. 이 경로는 입력 검증부터 process, verifier와 snapshot까지의 end-to-end 시간, node 로그, 실제 artifact와 provider token usage를 run별로 보존한다. 원본/feedback child spec을 8개 담당 업무별로 비교하는 검토 fixture도 있다. `spec-feedback-to-spec`의 production model activity와 Studio diff/approval UI, 실제 hidden verifier image 운영과 반복 cohort 우위 증명은 아직 완료되지 않았다.

## 시작하기

Node.js 24 이상과 npm 11 이상이 필요하다.

```bash
npm ci
npm run build
npm test
node apps/cli/dist/index.js check examples/spec-to-demo.wir.yaml
node apps/cli/dist/index.js simulate examples/spec-to-demo.wir.yaml \
  --input examples/spec-to-demo.input.json
```

AAWP Studio 실행:

```bash
node apps/studio/dist/server.js \
  --workflow examples/spec-to-demo.wir.yaml \
  --executor path/to/execution-manifest.json \
  --input examples/heavy-spec-slice.input.json \
  --runs .awf/studio-runs.jsonl \
  --demo-source examples/heavy-spec-slice \
  --demo-root .awf/demos \
  --port 4173
```

`http://127.0.0.1:4173/`에서 workflow, 실행 위치·명령, live node 상태, run 기록과 결과를 확인한다. `--executor`가 없으면 Studio는 read-only이며 Run을 비활성화하고, simulation 성공 기록을 대신 만들지 않는다. 모델 node는 Codex JSONL 또는 `AAWP_EVENT` usage evidence가 없으면 실패한다. 모델 호출 없는 dry-run은 Studio Run이 아니라 위의 명시적 `awf simulate` 명령으로만 실행한다.

담당자별 원본/feedback candidate 비교 demo는 `examples/heavy-spec-role-comparison`에 있다. Candidate 실행 입력은 부모 내용을 모두 포함한 child JSON 한 파일이며 proposal·verdict는 감사 sidecar다.

## 문서

- [Demo 디자인 표준](DESIGN.md): source fidelity, web/mobile shell, component·interaction·접근성과 검증 기준
- [사용자 가이드](docs/user-guide.md): 설치, Studio, 실행, 결과 관리, 화면·플로우 선택과 version 사용법
- [핵심 개념과 구조](docs/core-concepts.md): 다른 workflow 방식과의 차이, 구조와 선택 이유
- [`spec-feedback-to-spec` 가이드](docs/spec-feedback-to-spec.md): feedback contract, patch, 검증과 승인 경계
- [`spec-feedback-to-spec` 구현 결과](docs/spec-feedback-to-spec-implementation-report.md): 완료 범위, test와 미증명 경계
- [Architecture decisions](docs/adr/README.md): 대안, 결정과 trade-off
- [변경 기록](CHANGELOG.md): 사용자·운영자 관점의 update notes
- [오류·교정 기록](docs/lessons-and-corrections.md): 유의미한 실수, 영향과 재발 방지
- [운영 문서](docs/operations/studio.md): local Studio API와 운영 경계
- [구현 계획](agentic_workflow_framework_implementation_plan_ko.md)과 [starter backlog](agentic_workflow_framework_starter_backlog.yaml)
- [공개 참고 자료](docs/references.md), [dependency snapshot](docs/dependency-sources.md), [clean-room provenance](docs/provenance-matrix.yaml)

Milestone별 계약과 증거는 `docs/m*-implementation-contract.md`, `docs/m*-implementation-report.md`에 있다.

## 저장소 구조

- `apps/cli`, `apps/studio`: CLI와 local run console
- `packages/*`: IR, compiler, runtime, storage, gateway, demo bundle과 control plane
- `workflows/templates/*`: domain workflow template
- `examples/*`: WIR, input과 결과 fixture
- `benchmarks/*`: direct baseline과 workflow 비교 harness
- `docs/adr`, `docs/operations`: 의사결정과 runbook

## 품질 게이트

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
```

테스트 통과는 구현 일관성의 증거이지 workflow 품질 우위의 증거는 아니다. Template 승격에는 동일 verifier·환경·예산을 사용한 direct baseline 비교가 별도로 필요하다.
