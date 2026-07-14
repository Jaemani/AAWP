# M2 구현 결과

기준일은 2026년 7월 14일이다. M2는 Artifact, Event, Lineage Plane의 저장 의미와 reference implementation을 완성했다.

## 완료 범위

- PostgreSQL tenant, workflow version, run branch, event, artifact, provenance edge, cache migration
- immutable workflow version·branch·artifact·edge와 append-only event trigger
- run row lock과 expected sequence를 사용하는 `awf_append_event`
- generation compare-and-swap를 사용하는 `awf_promote_branch`
- streaming upload, atomic publish, deduplication, read corruption 검사를 지원하는 local object CAS
- transitive ancestor·descendant와 `supersedes`를 지원하는 in-memory artifact lineage
- canonical payload snapshot과 projection rebuild를 지원하는 in-memory run event store
- model, environment, verifier policy와 tenant를 구분하는 fingerprint cache

## 완료 기준과 증거

| M2 완료 기준                                        | 구현 증거                                                                                                   |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Content-addressed artifacts are stored and verified | local CAS의 SHA-256 identity, expected hash, interrupted upload cleanup, read corruption test               |
| Run events are append-only and ordered              | PostgreSQL trigger와 serialized append function, in-memory monotonic sequence·duplicate key·projection test |
| Artifact lineage is queryable                       | ancestor·descendant traversal과 supersedes edge test                                                        |
| Cross-tenant cache access is rejected               | composite tenant foreign key의 PostgreSQL 실행 test와 in-memory cross-tenant miss test                      |

PostgreSQL migration은 문자열 검사에 그치지 않고 PGlite 0.5.4의 embedded PostgreSQL에서 실행했다. 실제 migration 적용, immutable event update 거부, duplicate event key, stale branch generation, cross-tenant cache foreign key를 검증했다.

## 검증 결과

- Vitest: 11개 test file, 88개 test 통과
- M2 신규 test: 19개
- build, typecheck, lint, format check, schema generation 통과
- package export boundary에서 `@awf/artifact-store`, `@awf/lineage` 확인

## M3 경계와 남은 위험

M2는 local CAS와 in-memory reference store를 제공한다. 실제 S3/MinIO adapter, PostgreSQL repository adapter, connection pool과 migration runner는 배포 구성과 함께 추가해야 한다. 다음 M3는 이 저장 계약 위에 Temporal workflow/activity mapping, wait·approval·signal, retry·cancellation과 worker-kill recovery를 구현한다.
