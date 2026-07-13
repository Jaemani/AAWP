# ADR-004: Artifact는 Content-Addressed

## 상태

승인

## 결정

artifact identity는 바이트 content digest와 metadata lineage로 표현한다.

## 대안

- 경로 기반 artifact: 단순하지만 overwrite와 rollback 위험이 크다.
- run-local ID만 사용: 저장은 쉽지만 cross-run reuse가 어렵다.

## 결과

cache, verifier evidence, revision impact는 digest를 기준으로 계산한다. hash corruption 검사를 필수로 둔다.
