# M3 구현 결과

기준일은 2026년 7월 14일이다. M3는 WIR 실행을 Temporal workflow와 activity에 매핑하고 장애 후 재개, timer, approval signal, retry 분류, cancellation과 side-effect 중복 전달 경계를 구현했다.

## 완료 범위

- backend 구현을 감추는 `RuntimePort.start`와 `RuntimeRunHandle`
- WIR·fixture 선검증과 `(tenantId, runId)` 복합 identity
- stable node 순서와 edge 기반 input·output 조립
- node budget 기반 activity timeout·attempt와 선언 오류 class 기반 retry
- durable timer와 `resolveApproval` signal
- activity cancellation을 `NodeExecutor`의 `AbortSignal`로 전달
- node 실행 activity와 event projection activity 분리
- side-effect의 stable idempotency key
- workflow code change marker와 completed history replay
- Temporal worker 생성 함수와 model·tool에 독립적인 executor port

## 완료 기준과 증거

| M3 완료 기준                                     | 구현 증거                                                                                                |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Worker-kill recovery test passes                 | 실행 중 activity를 worker shutdown으로 중단하고 새 worker가 다음 attempt에서 완료하는 실제 Temporal test |
| Completed node effects are not repeated          | node 완료 후 projection delivery 중 worker를 종료해 projection만 재시도되고 node 실행 횟수는 1인 test    |
| Wait and approval survive process restarts       | timer·approval 대기 상태에서 첫 worker를 종료하고 두 번째 worker로 같은 history를 재개하는 test          |
| Cancellation and retry classification tests pass | 실행 중 activity의 abort 확인, `AUTHORIZATION` 1회 종료, 선언된 `CAPACITY` 2회차 성공 test               |

추가로 외부 effect 적용 직후 completion이 유실된 상황을 모사해 동일 idempotency key가 다시 전달되고 target-side deduplication으로 effect가 한 번만 적용되는지 검증했다. 서로 다른 tenant가 같은 run ID를 동시에 사용해도 Temporal workflow identity가 충돌하지 않는 test도 포함한다.

## 실행 의미

Temporal workflow는 순서, history, timer와 signal만 소유한다. deterministic, model, tool, subworkflow, map, reduce, judge와 side-effect의 실제 동작은 모두 `NodeExecutor` activity가 소유한다. node 완료 뒤의 event 반영은 별도 `NodeProjectionSink` activity라서 projection 전달 실패가 이미 완료된 node effect를 다시 실행시키지 않는다.

Temporal activity는 at-least-once다. 따라서 이 구현은 외부 effect의 exactly-once를 주장하지 않는다. side-effect target과 projection sink가 각각 전달받는 stable key를 저장하고 중복을 제거해야 한다.

## 검증 결과

- Vitest: 12개 test file, 98개 test 통과
- M3 Temporal integration test: 10개
- Temporal CLI 1.8.0, local Temporal Server 1.31.2
- build, typecheck, lint, format check, schema generation 통과
- sample `awf check`와 byte-identical simulate 회귀 통과
- 현재 workflow bundle로 completed history replay 통과

## M4 경계와 남은 위험

M3의 `NodeExecutor`는 실행 계약이며 model provider, MCP·CLI tool, sandbox, capability·secret 검사와 structured output gateway는 M4가 구현한다. `NodeProjectionSink`도 M2 event store와 production PostgreSQL을 잇는 배포 adapter가 아직 필요하다.

WIR v1에는 immutable child workflow reference와 input mapping 계약이 없으므로 `subworkflow` node는 현재 일반 activity executor로 전달한다. 해당 계약이 추가되기 전에는 Temporal child workflow를 암묵적으로 생성하지 않는다.

통합 test는 in-memory local Temporal server를 사용한다. production namespace, TLS, search attribute, task queue topology, remote cluster 장애와 retention은 배포 milestone에서 검증해야 한다. workflow 변경에는 `patched("awf-m3-wir-runner-v1")` marker를 넣었지만, 다음 workflow 의미 변경부터는 이전 bundle history corpus를 포함한 replay matrix를 release gate로 유지해야 한다.
