# ADR-020: Preview 환경보다 Data/API 계약과 blocker routing을 먼저 고정한다

- 상태: accepted
- 일자: 2026-07-16

## 문제

S1 Demo는 화면과 흐름을 검증할 수 있지만 DB/API를 연결하는 S2 Preview는 데이터 소유권, command 권한, 상태 전이, 동시성, idempotency와 PII 저장 결정을 요구한다. Spec에 빈칸이 있는 상태에서 AI가 PostgreSQL table이나 HTTP endpoint를 먼저 만들면 미확정 업무 결정을 구현 세부사항으로 굳히고, 화면 mock이 실제 backend처럼 보이게 된다.

## 고려한 대안

1. Demo 뒤에 바로 framework별 CRUD와 DB schema를 생성한다. 빠르지만 미확정 책임과 물리 구조를 임의 확정한다.
2. 모든 물리 결정을 사람이 끝낼 때까지 Preview 구현을 전부 미룬다. 안전하지만 계약 compiler와 실행 격리를 먼저 검증할 수 없다.
3. Logical `DataContract`와 `ApiContract`를 만들고 S2 finding을 소유자별로 routing한다. Ready 계약만 generic ephemeral harness에 provision하고 실제 DB 제품·table·transport는 unresolved로 보존한다.

## 결정

3번을 선택한다.

- `@awf/preview-contracts`가 canonical entity, query, command와 screen binding을 source digest에 고정한다.
- `DataContract`는 논리 entity와 field source를 보존하지만 DB 제품, table, index, PII 저장소를 추론하지 않는다.
- `ApiContract`는 query/command, capability, transition, resource version과 idempotency 정책을 보존하지만 HTTP/RPC/event transport와 status code를 추론하지 않는다.
- 모든 S2 finding은 `data`, `api`, `authority`, `environment`, `product-decision` 중 하나 이상으로 routing된다. 질문과 owner가 있는 finding은 product decision에도 남는다.
- `PreviewEnvironmentPort`는 contract digest, lease, network policy와 opaque database reference만 공개한다.
- 첫 local adapter는 PGlite를 사용한다. Contract registry, append-only resource version, idempotency result와 audit evidence를 검증하는 임시 harness이며 production schema가 아니다.
- Data/API contract 중 하나라도 blocked이거나 blocker ID가 남으면 provision을 거부한다.

## 결과와 한계

DB/API 기반을 실제로 실행·테스트할 수 있으면서도 물리 구현을 확정한 것처럼 꾸미지 않는다. 현재 청년기본소득 child Spec은 14개 S2 blocker 때문에 contract는 생성되지만 environment는 생성되지 않는다. 이것이 의도된 결과다.

PGlite adapter는 production database, multi-tenant isolation, secret broker, remote network policy 또는 배포 환경을 증명하지 않는다. 실제 Preview adapter는 같은 port 뒤에 추가하고 contract digest와 blocker gate를 그대로 지켜야 한다.

## 검증

- Logical entity와 unresolved physical storage 보존
- Query resource/return field와 capability normalization
- S2 blocker의 복수 owner routing
- Blocked contract provision 거부
- Resource version compare-and-swap
- 동일 idempotency replay와 다른 request digest 충돌
- Lease expiry와 opaque database reference
