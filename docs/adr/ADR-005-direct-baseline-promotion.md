# ADR-005: Direct Baseline 없이 Workflow Promotion 금지

## 상태

승인

## 결정

workflow template은 같은 frozen verifier와 budget에서 DIRECT 기준선과 비교되어야 promotion될 수 있다.

## 대안

- agent count 또는 graph complexity를 성공 지표로 사용: 제품 품질과 무관하다.
- workflow만 평가: 오버헤드가 가치보다 큰 경우를 놓친다.

## 결과

M0부터 direct-v0 benchmark를 유지하고, 품질·비용·지연·scope violation을 함께 기록한다.
