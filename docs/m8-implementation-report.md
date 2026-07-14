# M8 Value Router·EXPLORER 구현 결과

기준일은 2026년 7월 14일이다. M8은 설명 가능한 rule-based Value Router, 세 실행 template, immutable EXPLORER plan과 production decision을 바꾸지 않는 shadow evaluator를 구현했다.

## 완료 범위

- raw routing feature validation과 deterministic normalization
- 계획서 가중치를 그대로 사용하는 `workflow_gain`
- DIRECT none/minimal checkpoint, CONTRACT와 EXPLORER threshold
- zero workflow budget DIRECT override
- feature digest, policy version과 per-feature contribution trace
- DIRECT, CONTRACT와 EXPLORER execution template registry
- branch별 artifact partition과 information-gain/cost 계약
- immutable plan v1→v2, expected-version conflict와 status transition 검사
- cost/branch/gain hard limit 안의 다음 branch 선택
- operator mode를 그대로 실행하는 shadow observation
- quality/cost/latency/scope/human intervention reward와 regret

## 완료 기준과 증거

| M8 완료 기준                                 | 구현 증거                                                                |
| -------------------------------------------- | ------------------------------------------------------------------------ |
| Small coupled work remains DIRECT            | 높은 shared context와 latency task가 checkpoint 없는 DIRECT인 test       |
| Closed/open high-value work splits correctly | 동일 high-value feature에서 CONTRACT/EXPLORER가 scope flag로 갈리는 test |
| Plans are immutable and bounded              | v1 보존, v2 parent digest, stale CAS·partition conflict·reopen 거부 test |
| Branch selection records information value   | gain/cost 정렬과 cost·branch·minimum-gain hard limit test                |
| Shadow mode cannot change production         | recommendation EXPLORER여도 executed mode가 operator DIRECT인 test       |

## 검증 결과

- M8 focused Vitest: 3개 test file, 10개 test 통과
- package export boundary에서 `routeTask` 확인
- 전체 Vitest: 34개 test file, 200개 test 통과
- `npm ci`, build, typecheck, lint, format, schema generation, whitespace 검사 통과

## M9 경계와 남은 위험

M8은 heuristic v1이다. Feature 입력의 정확성과 normalization scale은 실제 cohort로 calibration하지 않았다. Shadow observation은 두 arm의 비교 가능한 outcome이 있을 때만 regret를 계산하며, counterfactual을 임의로 추정하지 않는다.

M9 control plane은 routing trace, plan version, artifact evidence와 revision impact를 읽기 전용으로 보여주고 operator 선택을 별도 권한으로 기록해야 한다. Learned router 전환은 direct/contract/explorer 동일 cohort가 충분히 쌓인 뒤 별도 ADR로 결정한다.
