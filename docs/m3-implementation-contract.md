# M3 구현 계약

이 문서는 Temporal durable runtime의 M3 규범이다. M3는 model·tool 구현을 소유하지 않고 M4 executor를 activity로 호출하는 실행 경계만 제공한다.

## RuntimePort

- `RuntimePort.start`는 tenant, stable run ID, immutable WIR, fixture input을 받아 durable handle을 반환한다.
- handle은 result, signal, cancel만 노출하며 backend-specific handle을 외부 계약에 노출하지 않는다.
- Temporal adapter는 실행 전 WIR과 fixture를 검증한다.
- Temporal workflow ID는 `(tenantId, runId)`의 canonical digest로 만들며 외부 handle에는 원래 run ID를 유지한다.

## Workflow와 activity 경계

- Temporal workflow code는 시간, randomness, filesystem, network와 Node API를 직접 사용하지 않는다.
- WIR graph의 ready node는 stable UTF-16 ID 순서로 선택한다.
- 실제 deterministic/model/tool/subworkflow/map/reduce/judge/side-effect 실행은 모두 activity다.
- wait node는 durable timer가 끝난 뒤 activity를 실행한다.
- approval node는 stable signal로 승인 또는 거절을 받은 뒤 activity를 실행하거나 non-retryable failure로 종료한다.
- workflow output은 선언 edge에서만 조립한다.

## Retry, timeout, cancellation

- start-to-close timeout과 maximum attempts는 node budget에서 가져온다.
- 알려진 오류 class 중 `retryPolicy.retryableClasses`에 없는 class는 non-retryable이다.
- fixed backoff coefficient는 1, exponential은 2다.
- workflow cancellation은 실행 중 activity에 전달되며 NodeExecutor는 AbortSignal을 받는다.
- authorization·validation failure는 기본적으로 retry하지 않고 capacity·transient failure는 WIR에 선언된 경우에만 retry한다.

## Side effect와 replay

- side-effect activity request는 `{tenantId}:{runId}:{nodeId}:{operation}` 형식의 stable idempotency key를 가진다.
- target adapter는 이 key로 effect를 deduplicate해야 한다. Temporal activity completion만으로 외부 effect exactly-once를 주장하지 않는다.
- workflow worker가 재시작되어도 history에 완료된 activity는 다시 실행하지 않는다.
- code change marker를 workflow history에 기록해 호환성 없는 변경을 명시적으로 관리한다.
