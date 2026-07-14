# M5 구현 결과

기준일은 2026년 7월 14일이다. M5는 immutable revision branch, changed-root diff, downstream invalidation, explainable fingerprint cache plan과 candidate branch CAS promotion·rollback을 구현했다.

## 완료 범위

- immutable base·child revision snapshot과 explicit null deletion patch
- input artifact, contract consumer, node·edge·workflow envelope diff
- prompt, model, tool/schema, environment, policy, verifier와 workspace base change reason
- node-output dependency graph의 downstream invalidation closure
- observed read와 declared read 비교 및 undeclared-read mandatory rerun
- unmapped changed contract와 unknown instrumentation의 full fail-safe rerun
- broad regression mandatory rerun
- parent fingerprint reuse, exact cross-run cache reuse와 cache miss plan
- tenant, sensitivity와 verifier policy를 포함한 M2 fingerprint cache 연동
- stable per-node explanation과 reuse/rerun summary
- release gate 이후 generation CAS promotion과 이전 branch rollback
- production repository가 교체 가능한 revision reader와 branch CAS port

## 완료 기준과 증거

| M5 완료 기준                                         | 구현 증거                                                                                                        |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| A revision branch preserves the parent run unchanged | frozen parent snapshot에서 child patch 후 parent hash·contract가 유지되고 mutation이 거부되는 test               |
| Minimal downstream invalidation is computed          | `spec` input 변경 시 requirements→product→verify만 rerun하고 독립 assets node는 reuse하는 test                   |
| Every cache decision is explainable                  | parent hit, exact cache hit, verifier-policy miss, mandatory rerun과 fingerprint contradiction reason test       |
| Candidate promotion uses compare-and-swap            | 동일 expected generation의 두 candidate 중 하나만 승격되고 stale candidate가 active pointer를 바꾸지 못하는 test |

추가로 contract, tool/schema, model, environment, policy, verifier 변경과 undeclared read, broad regression, failed release candidate, rollback을 검증했다.

## 실행 의미

`diffRevisionStates`는 parent와 candidate snapshot에서 직접 변경 root를 만든다. `computeImpact`는 새 WIR edge만 따라 closure를 계산하며 조건부 edge도 안전하게 포함한다. Contract가 바뀌었는데 유효한 consumer가 없거나 instrumentation이 모르는 node를 보고하면 false negative를 피하기 위해 모든 node를 mandatory rerun한다.

`buildCachePlan`은 영향 계산과 fingerprint 증거를 별도로 받는다. 영향이 없는 node의 동일 parent fingerprint는 parent artifact를 재사용하고, candidate key가 M2 cache에서 정확히 일치하면 historical artifact를 재사용한다. Broad regression, undeclared read와 invalidation/fingerprint 모순은 cache보다 우선해 rerun한다.

## 검증 결과

- Vitest: 22개 test file, 145개 test 통과
- M5 신규 test: 19개
- build, typecheck, lint, format check, schema generation 통과
- package export boundary에서 impact engine 확인
- sample `awf check`와 byte-identical simulate 회귀 통과

## M6 경계와 남은 위험

M5는 in-memory revision·pointer reference store와 production port를 제공한다. PostgreSQL revision repository와 M2의 `awf_promote_branch`를 잇는 adapter, control API와 Temporal node scheduling 연동은 아직 없다.

Candidate fingerprint와 observed read는 caller가 제공한다. 실제 sandbox filesystem instrumentation이 누락되거나 adapter가 거짓 evidence를 제공하면 impact 정확도가 낮아지므로 production conformance와 event audit가 필요하다. Host-side read instrumentation을 완전히 신뢰할 수 없을 때는 broad regression 또는 full rerun 정책을 사용해야 한다.

Release gate는 현재 boolean input이며 M6 verifier evidence와 monotonic guard가 이 값을 소유해야 한다. M6가 연결되기 전에는 외부 caller가 release 통과를 자체 판정해선 안 된다.
