# ADR-018: Run root와 workflow 실행 지침을 self-contained 경계로 둔다

- 상태: accepted
- 일자: 2026-07-15

## 문제

Studio instance마다 `.awf/studio-runs.jsonl`, 별도 pilot JSONL과 서로 다른 demo root를 사용하자 과거 run이 삭제된 것처럼 보였다. 또한 실제 demo prompt가 대화에서 합의한 시각 기준, 기존 presentation/visual reference와 이전 demo 경로를 직접 언급해 workflow file만으로 같은 작업을 재현할 수 없었다.

변경할 수 없는 조건은 다음과 같다.

- Run ID가 input, event, log, artifact와 demo를 하나의 경계로 묶어야 한다.
- 새로운 agent는 대화 기록 없이 versioned repository asset만 읽고 실행할 수 있어야 한다.
- Source spec의 업무 의미와 demo 디자인의 진실원을 분리해야 한다.
- Demo 삭제는 재현 증거와 source input을 삭제하지 않아야 한다.

## 고려한 대안

1. Workflow별 JSONL과 demo root를 계속 분리하고 Studio에서 여러 store를 조회한다. 격리는 쉽지만 누락된 store가 다시 보이지 않고 run ID의 물리 경계가 없다.
2. 모든 local state를 즉시 PostgreSQL/object storage로 옮긴다. 생산 방향에는 맞지만 local workflow 개발의 파일 가시성과 단순성을 잃는다.
3. 프로젝트 루트 `runs/` 아래에 공통 history와 run directory를 두고, workflow마다 WIR·execution manifest·실행 지침을 versioned bundle로 제공한다.
4. Prompt를 계속 실행 시점에 agent가 작성한다. 유연하지만 대화와 작성자에 의존하고 입력 provenance를 증명할 수 없다.

## 결정

3번을 선택한다.

- `runs/history.jsonl`은 모든 local workflow의 append-only snapshot store다.
- `runs/<runId>/run.json`, `input.json`, `logs/`, `artifacts/`, `demo/`가 한 run의 최신 projection과 evidence를 보존한다.
- `runs/requests/<requestId>`는 원본 입력 사본과 digest가 포함된 request를 보존한다.
- Local executor file output은 `base: executionDirectory`로 run directory 내부에 고정할 수 있고 탈출 경로를 거부한다.
- Demo snapshot은 `artifacts/demo`에서 `demo/`로 materialize하며 onboard/offboard/delete는 snapshot에만 작용한다.
- Legacy `.awf` 데이터는 삭제하지 않고 importer로 통합한다.

실행 가능한 domain workflow는 다음을 함께 version control한다.

1. `workflow.wir.yaml`: typed graph, capability, budget와 release policy
2. `execution.manifest.json`: node별 실제 argv, timeout, token tracking과 output binding
3. `WORKFLOW.md`: 입력 해석, 허용 지식, 출력 구조와 acceptance 절차
4. 독립 verifier

`spec-to-demo` 0.3.0은 source spec을 업무 의미에만 사용하고 `DESIGN.md` 1.1.0을 유일한 디자인 입력으로 사용한다. 필요한 presentation token, web/mobile shell, interaction과 접근성 규칙을 이 문서에 흡수한다. 기존 presentation contract, visual reference, 이전 demo/CSS와 대화 기억은 builder 입력에서 제외한다. Manifest는 source와 `DESIGN.md` byte digest를 기록하며 금지된 legacy design field를 포함하면 verifier가 실패한다.

## 결과와 한계

Studio 하나에서 기존 run과 새 run을 함께 조회하고 filesystem에서 run ID만으로 exact input, log, artifact와 served snapshot을 찾을 수 있다. 다른 agent도 request 생성 command와 세 workflow bundle 파일만으로 동일 execution boundary를 얻는다.

`runs/`는 local 개발용이며 git에 runtime data를 commit하지 않는다. Production metadata transaction, object CAS, tenant isolation과 retention은 PostgreSQL/object storage implementation이 담당해야 한다. `DESIGN.md` 단일 입력은 디자인 provenance를 명확히 하지만, 문서 자체가 충분한지는 독립적인 화면 cohort와 시각 QA로 계속 평가해야 한다.

## 검증

- 세 legacy JSONL에서 22개 run과 demo snapshot을 `runs/`로 원본 보존 import
- `runs/<runId>`가 이미 생성된 상태의 executor 시작 회귀 test
- execution-directory output의 run root 탈출 거부와 artifact hash test
- `ModelInvoked` 시작/`ModelCompleted` 종료 timing test
- MD-only manifest의 forbidden legacy design input, exact screen set와 digest verifier
