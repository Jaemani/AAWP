# ADR-011: Value Router는 DIRECT를 기본값으로 shadow 평가한다

## 상태

승인

## 결정

Workflow 선택은 에이전트 수나 task label이 아니라 durability, 독립 병렬성·검증성, 승인, artifact reuse, side-effect risk에서 shared context, coordination, latency와 낮은 복잡도를 뺀 설명 가능한 점수로 결정한다.

점수가 1 미만이면 checkpoint 없는 DIRECT, 1 이상 3 미만이면 minimal checkpoint DIRECT다. 3 이상일 때만 닫힌 scope는 CONTRACT, 열린 goal은 EXPLORER를 선택한다. Workflow budget이 0이면 점수와 무관하게 DIRECT다.

학습형 router로 전환하기 전 recommendation은 shadow로 기록한다. Operator가 선택한 production mode를 그대로 실행하고 recommendation, outcome reward와 regret만 append한다.

## 결과

라우터 오류나 불충분한 가치 신호가 workflow 확대로 이어지지 않는다. 모든 decision은 feature digest, 개별 weighted contribution과 policy version으로 설명 가능하다. Shadow 데이터가 충분해지기 전에는 추천이 production routing을 자동 변경하지 않는다.
