# M10 Preview 계약과 임시 환경 구현 결과

## 완료

- `@awf/preview-contracts`: Data/API contract compiler, blocker routing, environment port
- `@awf/preview-runtime`: PGlite ephemeral adapter
- `spec-feedback-to-spec` verifier output에 `data-contract.json`, `api-contract.json`, `preview-blocker-routing.json` 연결
- Generic Preview DB의 contract registry, immutable resource version, idempotency result 저장
- Lease expiry, explicit destroy와 opaque local database reference

## 청년기본소득 candidate 적용 결과

`specrepair_f577b9f5e54ea5d803459f01`의 단일 child Spec과 gap report를 입력으로 사용했다.

- Logical entities: 14
- Queries: 8
- Commands: 12
- Screen data bindings: 8
- Unresolved API contracts: 2
- S2 blockers: 14
- Result: `blocked`; Preview environment 미생성

Blocker는 권한표와 다중 권한 진입 UX, 실제 신청·명부 원천, 데이터 소유권, API 오류·중복 응답, PII 저장, 누락 transition과 concurrency 계약으로 보존됐다. DB/API 값을 임의로 보완하지 않았다.

## 검증

- Focused test: 3 files, 13 tests passed
- Preview package tests: 2 files, 6 tests passed
- TypeScript project build passed

전체 repository gate와 remote push 결과는 최종 handoff에서 별도로 기록한다.

## 미증명 경계

이 결과는 local contract harness의 정확성을 증명한다. Production PostgreSQL 운영, 실제 API gateway, authorization enforcement, PII 저장과 remote ephemeral deployment는 증명하지 않는다. 따라서 `spec-to-preview`는 아직 executable catalog entry로 승격하지 않는다.
