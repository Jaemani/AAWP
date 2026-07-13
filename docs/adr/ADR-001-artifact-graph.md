# ADR-001: 제품 중심은 Artifact Graph

## 상태

승인

## 결정

AAWP의 제품 중심은 에이전트 수나 대화 transcript가 아니라 content-addressed artifact graph다.

## 대안

- 대화 메모리 중심: 구현은 쉽지만 재현, diff, 영향 분석이 약하다.
- step journal 중심: 실행 복구에는 좋지만 산출물 재사용과 release 판정의 주체 분리가 흐려진다.

## 결과

각 workflow run은 입력, 중간 산출물, 검증 증거, 출력의 lineage를 남긴다. 저장 비용은 늘지만 변경 영향과 promotion 판단이 명확해진다.
