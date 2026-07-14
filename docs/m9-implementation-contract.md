# M9 Studio·운영 강화 구현 계약

기준일은 2026년 7월 14일이다. 이 문서는 M9 구현과 테스트의 규범이다.

## 경계

M9의 진실원은 기존 WIR, append-only run event, artifact lineage, immutable evidence bundle과 revision state다. `@awf/control-plane`은 이 데이터를 변경하지 않는 projection과 검증된 편집 후보를 만들고, `@awf/studio`는 projection을 HTML로 표시한다.

Studio는 별도 workflow schema, run state 또는 hidden verifier cache를 소유하지 않는다. 실제 publish, 승인, pause, resume, cancel, secret 변경은 M9 UI의 직접 쓰기 대상이 아니다. UI는 권한 검사를 거쳐 runtime/API가 처리할 command intent만 만든다.

## 제공 기능

1. canonical WIR JSON import/export와 compiler 검증
2. node·edge·contract edit operation과 손실 없는 round-trip
3. stable entity ID 기반 semantic diff
4. revision changed root, downstream closure와 cache action impact preview
5. run timeline, approval inbox, budget 사용량, routing trace와 operator control projection
6. artifact lineage와 verifier evidence projection
7. hidden verifier 상세의 projection-time 차단
8. tenant metadata backup, integrity digest와 lineage 보존 restore
9. delete를 직접 수행하지 않는 retention plan
10. 구조적 redaction을 거친 audit export와 quota evaluation

## 불변 조건

- 유효한 WIR의 import/export digest는 동일해야 한다.
- edit 결과는 compiler error가 있으면 publishable이 아니다.
- diff 배열은 입력 순서와 무관하게 결정적으로 정렬한다.
- impact preview는 `@awf/impact-engine`의 결정을 다시 구현하지 않고 그대로 사용한다.
- hidden verifier bundle은 기본 audience에 verifier image, policy digest, finding, evidence를 노출하지 않는다.
- backup은 한 tenant만 포함하고 event sequence, artifact provenance와 evidence digest를 검증한다.
- restore는 외부 side effect와 object CAS 덮어쓰기를 수행하지 않는다.
- redaction은 key 기반 제거 후에만 audit digest를 만든다.

## 의도적으로 제외한 범위

- canvas drag/drop layout을 workflow 의미로 저장하는 기능
- browser에서 직접 production database를 수정하는 기능
- secret 원문 열람 또는 backup 포함
- object CAS binary 자체의 복제 도구
- runtime command 실행과 인증 서버
- learned router와 benchmark cohort dashboard

object CAS binary backup, PostgreSQL point-in-time recovery와 Temporal namespace backup은 `infra/backup/README.md`의 운영 절차로 분리한다.

## 완료 증거

- editor round-trip과 invalid edit test
- semantic diff golden test
- impact closure preview test
- event projection과 approval resolution test
- hidden evidence non-disclosure test
- backup/restore lineage equivalence와 tamper rejection test
- retention protection, audit redaction과 quota test
- Studio render smoke test
