# M2 구현 계약

이 문서는 Artifact, Event, Lineage Plane의 M2 규범이다. M2는 durable scheduler를 구현하지 않으며, M3가 사용할 불변 저장 계약과 reference implementation을 제공한다.

## 저장 경계

- PostgreSQL migration은 tenant, workflow version, run, immutable branch, append-only event, artifact, provenance edge, fingerprint cache를 정의한다.
- branch promotion은 `expected_generation`을 받는 compare-and-swap 함수로만 수행한다.
- artifact와 workflow version은 UPDATE와 DELETE를 거부한다.
- event는 run별 sequence와 event key가 유일하며 UPDATE와 DELETE를 거부한다.
- artifact edge와 cache foreign key는 tenant ID를 함께 사용해 cross-tenant 연결을 거부한다.

## Object CAS

- object identity는 lowercase SHA-256 hex digest다.
- upload는 임시 파일에 쓰고 digest와 size를 확정한 뒤 atomic rename한다.
- 호출자가 제공한 expected digest가 다르면 object를 publish하지 않는다.
- upload source가 중간에 실패하면 임시 파일을 제거한다.
- 같은 bytes는 같은 URI로 deduplicate한다.
- read 시 bytes를 다시 hash해 corruption을 탐지한다.

## Artifact lineage

- artifact metadata와 provenance edge는 publish 후 불변이다.
- provenance 방향은 input/previous artifact에서 새 artifact로 향한다.
- `supersedes`는 이전 artifact에서 새 artifact로 향한다.
- parent artifact는 새 artifact보다 먼저 존재해야 하며 같은 tenant여야 한다.
- ancestor와 descendant traversal은 stable ID 순서로 반환한다.

## Run event

- sequence는 tenant와 run 범위에서 1부터 단조 증가한다.
- append는 선택적인 expected next sequence를 받아 concurrent writer 충돌을 드러낸다.
- event key 중복은 idempotent success로 숨기지 않고 명시적 오류로 반환한다.
- 저장 payload는 canonical JSON snapshot이며 호출자가 나중에 바꿀 수 없다.
- projection은 저장된 event 전체를 sequence 순으로 fold해 재구축할 수 있다.

## Fingerprint cache

- fingerprint는 canonical node definition, workflow digest, port 순서의 input content hash, prompt, model revision과 inference parameters, tool/schema version, environment, policy, secret reference ID, workspace tree, verifier policy를 포함한다.
- secret 값은 입력 타입에 존재하지 않는다.
- model revision, environment digest, verifier policy digest 중 하나라도 바뀌면 miss다.
- cache lookup은 tenant와 sensitivity가 일치해야 하며 다른 tenant의 존재를 반환하지 않는다.
