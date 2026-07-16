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

WIR·compiler, artifact/event plane, Temporal runtime adapter, model/tool/verifier gateway, revision impact engine, value router, platform-owned demo bundle, `spec-to-demo`, `spec-feedback-to-spec`, Preview contract compiler, direct benchmark harness와 local AAWP Studio가 있다. Studio는 versioned workflow catalog를 읽고 execution manifest로 WIR node마다 실제 local process가 등록된 workflow만 실행한다. `spec-to-demo`는 source spec, 명시적 screen 집합과 요청 원문을 pinned request로 만든 뒤 `codex exec → inspect → bounded repair → verify`를 실행한다. `spec-feedback-to-spec`은 baseline/feedback digest를 고정하고 model proposal, deterministic materialization, structural·semantic verification을 거쳐 단일 immutable child Spec candidate를 만든다. 두 경로 모두 end-to-end 시간, node 로그, 실제 artifact와 provider token usage를 프로젝트 루트 `runs/<runId>/`에 보존한다. Studio diff/사람 승인·promotion UI, production hidden verifier image 운영과 반복 cohort 우위 증명은 아직 완료되지 않았다.

S2 Preview 기반은 logical `DataContract`·`ApiContract`, blocker routing과 `PreviewEnvironmentPort`로 분리돼 있다. 미확정 DB/API 결정을 구현값으로 꾸미지 않으며 blocker가 0인 계약만 PGlite local ephemeral harness에 provision한다. 이는 production DB/API가 아니라 resource version·idempotency·lease 경계를 검증하는 adapter다. `spec-to-preview`는 아직 catalog executable이 아니다.

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

AAWP Studio:

```bash
npm run studio
```

`http://127.0.0.1:4173/`에서 workflow를 선택한다. `spec-to-demo`는 프로젝트 내부의 source spec 상대경로, 쉼표/줄바꿈으로 구분한 screen ID와 요청문을 입력하고 `Run spec-to-demo`를 누른다. Studio가 request artifact를 만들고 실제 executor를 시작하므로 별도 대화나 request JSON 작성은 필요하지 않다. 실행 위치 기본 표시는 checkout에 독립적인 `Project workspace`이며 실제 cwd와 argv는 접힌 기술 상세에서만 확인한다.

실행 정의는 [workflow catalog](workflows/catalog.json), [WIR](workflows/templates/spec-to-demo/workflow.wir.yaml), [execution manifest](workflows/templates/spec-to-demo/execution.manifest.json), [자급식 실행 지침](workflows/templates/spec-to-demo/WORKFLOW.md), browserless public artifact checker와 독립 release verifier로 구성된다. Demo의 유일한 디자인 입력은 [DESIGN.md](DESIGN.md)다. 이 문서는 YAML token과 intent·금지 규칙·responsive decision을 함께 제공하며 이전 demo, presentation contract나 대화 기억을 사용하지 않는다.

Request 생성기는 기본적으로 요청 화면과 직접 참조 정의만 deterministic projection으로 고정해 heavy source 전체를 model context에 넣지 않는다. Projection과 원본 digest를 모두 보존하며 전체 source 실행은 진단용 `--full-source`에서만 명시한다.

모든 실행은 `runs/history.jsonl`과 `runs/<runId>/`에 저장된다. 실행 manifest가 없으면 Studio는 해당 workflow의 Run을 비활성화하고 simulation 성공 기록을 대신 만들지 않는다. 모델 node는 Codex JSONL 또는 `AAWP_EVENT` usage evidence가 없으면 실패한다. Token summary는 K/M으로 압축하지만 정확한 input/cached/output/reasoning 값은 run record와 tooltip에 남는다. 모델 호출 없는 dry-run은 Studio Run이 아니라 위의 명시적 `awf simulate` 명령으로만 실행한다.

담당자별 원본/feedback candidate 비교 demo는 `examples/heavy-spec-role-comparison`에 있다. Candidate 실행 입력은 부모 내용을 모두 포함한 child JSON 한 파일이며 proposal·verdict는 감사 sidecar다.

## 문서

- [Demo 디자인 표준](DESIGN.md): source fidelity, web/mobile shell, component·interaction·접근성과 검증 기준
- [사용자 가이드](docs/user-guide.md): 설치, Studio, 실행, 결과 관리, 화면·플로우 선택과 version 사용법
- [핵심 개념과 구조](docs/core-concepts.md): 다른 workflow 방식과의 차이, 구조와 선택 이유
- [`spec-feedback-to-spec` 가이드](docs/spec-feedback-to-spec.md): feedback contract, patch, 검증과 승인 경계
- [`spec-feedback-to-spec` 구현 결과](docs/spec-feedback-to-spec-implementation-report.md): 완료 범위, test와 미증명 경계
- [Preview 계약 구현 결과](docs/m10-preview-contracts-implementation-report.md): Data/API 계약, blocker routing과 임시 DB 경계
- [Architecture decisions](docs/adr/README.md): 대안, 결정과 trade-off
- [변경 기록](CHANGELOG.md): 사용자·운영자 관점의 update notes
- [오류·교정 기록](docs/lessons-and-corrections.md): 유의미한 실수, 영향과 재발 방지
- [운영 문서](docs/operations/studio.md): local Studio API와 운영 경계
- [공개 참고 자료](docs/references.md), [dependency snapshot](docs/dependency-sources.md), [clean-room provenance](docs/provenance-matrix.yaml)

Milestone별 계약과 증거는 `docs/m*-implementation-contract.md`, `docs/m*-implementation-report.md`에 있다.

## 저장소 구조

- `apps/cli`, `apps/studio`: CLI와 local run console
- `packages/*`: IR, compiler, runtime, storage, gateway, demo bundle과 control plane
- `workflows/templates/*`: domain workflow template
- `runs/`: local request, append-only history, node log, artifact와 demo snapshot의 단일 영속 root
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
