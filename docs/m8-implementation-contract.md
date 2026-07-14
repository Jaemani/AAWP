# M8 구현 계약

이 문서는 Workflow Value Router와 EXPLORER planning의 M8 규범이다.

## Feature extraction

- Raw feature는 context token, shared coupling, 독립 branch 수, verifier coverage, 예상 duration, approval, side-effect risk, recovery, artifact reuse, latency, budget와 scope closure다.
- 0~1 feature와 count/budget은 유효 범위를 벗어나면 거부한다.
- Count와 duration은 고정 scale로 정규화하고 source feature digest를 decision에 보존한다.
- Durability는 recovery와 long duration의 큰 값, coordination overhead는 parallelism과 shared coupling의 결합으로 계산한다.

## Rule-based routing

`workflow_gain`은 계획서의 다음 가중치를 그대로 사용한다.

- durability `+2.0`
- independent parallelism `+1.8`
- independent verifiability `+1.8`
- audit/approval `+1.5`
- artifact reuse `+1.5`
- side-effect risk `+1.2`
- shared context `-2.0`
- coordination overhead `-1.5`
- latency sensitivity `-1.2`
- low task complexity `-1.0`

Decision은 mode, checkpoint level, score, feature digest, `value-router/v1`과 절댓값 순 contribution을 반환한다. Score 1 미만은 DIRECT, 1~3은 minimal checkpoint DIRECT, 3 이상은 scope closure에 따라 CONTRACT 또는 EXPLORER다. `maxBudgetUsd=0`은 DIRECT hard override다.

## Execution templates

- DIRECT는 strong executor와 deterministic verifier만 사용하고 한 round로 끝난다.
- CONTRACT는 contract compiler, coherent executor, independent verifier와 bounded repair를 사용한다.
- EXPLORER는 versioned planner, independent artifact branch, evidence synthesis와 adversarial verifier를 사용한다.
- Template 반환값은 clone이므로 caller mutation이 registry 원본을 바꾸지 못한다.

## Versioned EXPLORER plan

- Plan은 goal contract digest, immutable version, parent digest, reason, branch와 evidence artifact를 가진다.
- Branch는 question, 전용 artifact partition, output schema digest, 예상 정보 이득, cost hard limit과 status를 선언한다.
- 두 branch가 같은 mutable artifact partition을 사용할 수 없다.
- Plan update는 expected version CAS를 사용하고 parent plan을 변경하지 않는다.
- Pending→running→completed/cancelled의 단방향 status만 허용한다.
- 다음 branch는 minimum information gain, 총 cost와 branch count 안에서 gain/cost 순으로 고른다.

## Shadow evaluation

- Recommendation은 operator production decision을 변경하지 않는다.
- Observation은 recommended, operator, 실제 executed mode, feature/policy와 timestamp를 기록한다.
- 양쪽 outcome이 있을 때 quality에서 normalized cost, latency, scope violation과 human intervention penalty를 빼 reward와 regret를 계산한다.
- Scope violation penalty는 기본적으로 cost와 latency보다 크다.

## 비보장 범위

- Feature는 caller가 제공하며 자동 task classifier나 learned model은 아직 없다.
- Normalization scale과 weight는 v1 heuristic이며 충분한 동일-cohort run 없이 우위를 주장하지 않는다.
- Shadow store는 in-memory reference다. Production event/CAS repository adapter와 offline counterfactual evaluator는 후속 작업이다.
- EXPLORER branch worker, synthesis model과 adversarial verifier 실제 실행은 runtime template adapter가 연결해야 한다.
