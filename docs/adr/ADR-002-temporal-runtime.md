# ADR-002: 기본 내구 런타임은 Temporal

## 상태

승인

## 결정

생산 기본 런타임은 Temporal TypeScript SDK다. M1은 실제 Temporal adapter를 만들지 않고 `RuntimePort` 경계를 둔다.

## 대안

- DBOS: Postgres 중심 운영에 강하지만 workflow ecosystem과 visibility가 Temporal보다 제한적이다.
- Restate: virtual object/service communication에 강하지만 AAWP의 artifact graph 중심 계약에는 보조 선택이다.

## 결과

AAWP는 자체 분산 scheduler를 만들지 않는다. Temporal, DBOS, Restate는 같은 `RuntimePort` 뒤에 둘 수 있어야 한다.
