# M10 Preview 계약과 임시 환경 구현 계약

## 목표

S1 Demo artifact를 실제 DB/API가 연결된 것처럼 보이게 확장하지 않고, canonical Spec의 S2 의미를 실행 가능한 계약과 blocker로 분리한다.

## 필수 산출물

- `aawp/data-contract/v1`
- `aawp/api-contract/v1`
- `aawp/preview-blocker-routing/v1`
- `PreviewEnvironmentPort`
- Ready contract만 받는 local ephemeral adapter

## 불변 조건

1. Source child Spec의 path와 byte/canonical digest를 기록한다.
2. `confirmed/assumed/unresolved/conflicting/deprecated`를 임의 승격하지 않는다.
3. Logical entity에서 physical table을 추론하지 않는다.
4. Logical command에서 HTTP/RPC transport나 status code를 추론하지 않는다.
5. S2 blocker가 하나라도 있으면 environment provision을 거부한다.
6. 임시 DB reference는 opaque하며 filesystem/connection secret을 UI에 노출하지 않는다.
7. Resource write는 expected version을 요구하고 command result는 idempotency key를 검증한다.

## 범위 밖

- Production DB topology와 migration
- 실제 PII·첨부 저장소
- Production API authentication/authorization
- Remote preview deployment와 secret broker
- `spec-to-preview` 공개 workflow 승격

## 통과 기준

- Compiler와 adapter unit test
- TypeScript project reference build
- Blocked Spec의 fail-closed provision test
- Ready fixture의 version conflict, idempotent replay, expiry test
