# ADR-017: Studio Run은 명시적 executable binding을 요구한다

- 상태: accepted
- 일자: 2026-07-15

## 문제

WIR은 실행 의미를 선언하지만 node의 실제 process·activity 구현을 포함하지 않는다. 기존 Studio는 이 공백을 `simulateDeterministic()`으로 채우고 이미 생성된 demo snapshot을 복사했다. 그 결과 실제 model/tool workflow가 수행되지 않았는데도 completed event, 수 ms duration과 `0 tokens`가 생성됐다.

## 고려한 대안

1. Simulator를 유지하고 문구만 더 강하게 표시한다. Dry-run에는 유용하지만 primary Run의 의미와 실제 작업 시간이 계속 분리된다.
2. Node ID를 관례적인 script 이름에 암묵 매핑한다. 빠르지만 누락, 다른 cwd와 output port 불일치를 실행 전 검출할 수 없다.
3. WIR과 별도의 typed execution manifest로 모든 node를 실제 argv에 1:1 binding한다. 설정이 하나 더 필요하지만 실행 가능성과 telemetry coverage를 시작 전에 판정할 수 있다.
4. 즉시 Temporal만 허용한다. 생산 목표에는 맞지만 local workflow 개발과 현재 Studio 검증을 불필요하게 막는다.

## 결정

3번을 선택한다. `aawp/local-execution-manifest/v1`은 workflow ID, working directory와 WIR 순서대로 모든 node의 argv, timeout, token policy, output source를 선언한다. Shell 문자열은 허용하지 않고 `spawn(..., { shell: false })`로 실행한다.

- Manifest가 없거나 node·port·순서가 맞지 않으면 Run은 fail-closed한다.
- Studio Run은 simulator로 fallback하지 않는다. Dry-run은 `awf simulate`로만 수행한다.
- Input과 stdout/stderr는 `.awf/executions/<runId>`에 보존한다.
- POST는 running snapshot을 먼저 반환하고 node 전이를 append-only JSONL snapshot으로 갱신한다.
- LLM node는 `tokenTracking: required`이며 Codex `turn.completed.usage` 또는 `AAWP_EVENT model_usage`가 없으면 실패한다.
- 모든 node가 `tokenTracking: none`인 실제 비모델 실행만 measured zero token을 가질 수 있다.
- UI의 end-to-end 시간은 validation, 실제 process, verifier와 snapshot 전체를 포함한다. Snapshot materialization은 build time으로 부르지 않는다.

## 결과와 한계

Local 개발에서도 버튼과 실행 기록이 실제 process에 대응하고, run ID로 input·command·log·artifact·usage를 역추적할 수 있다. 기존 simulation record는 삭제하지 않고 legacy로 표시한다.

현재 local executor는 단일 Studio process 안에서 실행된다. Server crash 뒤 자동 resume, 분산 lease, 승인·cancel과 외부 side-effect recovery는 Temporal runtime binding이 담당해야 하며 이 ADR이 그 기능을 대체하지 않는다.

## 검증

- Manifest 누락·불완전·LLM usage 누락 거부 test
- 실제 child process, run input, stdout/stderr, file hash와 token event test
- HTTP `202 running` → terminal state와 `409` 실행 경계 test
- deterministic local process smoke run에서 `LOCAL_PROCESS`, 실제 artifact ID, execution directory와 end-to-end duration 확인
