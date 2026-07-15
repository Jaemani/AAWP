# ADR-015: spec feedback은 원본 수정이 아니라 immutable revision을 만든다

- 상태: accepted
- 기준일: 2026-07-15

## 문제

Spec 형식은 조직과 제품마다 달라 범용 필드 표준을 강제하기 어렵다. 그렇다고 자연어 feedback으로 source file을 직접 고치면 어떤 원문·권한·feedback이 변경을 만들었는지 검증하거나 rollback하기 어렵다.

## 고려한 대안

1. 작은 변경은 항상 사람이 source를 직접 편집한다. 빠르지만 lineage와 재현성이 없어 중요한 spec의 기본 경로로 채택하지 않았다.
2. AAWP가 하나의 거대한 spec schema를 표준으로 정한다. 기존 spec을 수용하기 어렵고 domain semantics가 코어에 새므로 채택하지 않았다.
3. JSON-compatible document와 JSON Pointer 기반 patch contract만 공통화하고 domain validator를 profile port로 둔다. 최소 공통 semantics와 유연성을 함께 제공하므로 채택했다.

## 결정

`spec-feedback-to-spec`은 다음 순서로 실행한다.

```text
Pinned source + feedback
→ feedback/authority contract
→ LLM patch proposal
→ deterministic patch materialization
→ profile + integrity verification
→ human approval
→ approved child spec artifact
```

- Source artifact ID와 canonical digest가 다르면 중단한다.
- Patch는 허용된 JSON Pointer prefix 안에서만 실행한다.
- `remove`는 별도 authority 없이는 금지한다.
- 모든 operation은 하나 이상의 feedback ID와 reason을 가진다.
- 원본 document는 변경하지 않고 candidate가 parent digest와 changed pointers를 기록한다.
- 필수 pointer와 domain validator가 통과한 candidate만 승인할 수 있다.
- 승인된 artifact는 parent를 `supersedes`하는 새 content-addressed version이며 원본 경로를 덮어쓰지 않는다.

JSON Pointer 해석은 RFC 6901, add/replace/remove 의미는 RFC 6902의 제한된 subset을 참고하되 AAWP authority와 approval contract를 추가한다.

## DIRECT 사용 기준

오탈자처럼 영향이 작고 사람이 즉시 diff를 확인할 수 있는 변경은 `DIRECT` 실행자를 사용할 수 있다. 그러나 실행 방식이 DIRECT여도 pinned source, typed patch, validation과 immutable output 규칙은 생략하지 않는다. 여러 화면·요구사항·권한 경계를 바꾸거나 재검토가 필요한 변경은 `CONTRACT` workflow를 사용한다.

## 현재 한계

Template package는 contract, deterministic patch, verifier port와 approval gate를 구현한다. 실제 model provider로 자연어 feedback을 patch proposal로 생성하는 production activity와 Studio 전용 diff/approval UI는 아직 연결되지 않았다.
