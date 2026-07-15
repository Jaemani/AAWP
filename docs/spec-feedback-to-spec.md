# `spec-feedback-to-spec` workflow

## 목적

Demo나 검토 과정에서 나온 feedback을 source spec에 반영하되 원본 file을 직접 덮어쓰지 않는다. 결과는 parent artifact, feedback provenance, patch, 검증 evidence와 승인 기록을 가진 immutable child spec artifact다.

## 실행 구조

```text
Source artifact + feedback intent
  → compile-feedback
  → propose-patch (LLM)
  → materialize-revision (deterministic)
  → verify-revision (independent)
  → approve-revision (human)
  → approved spec artifact
```

WIR은 `examples/spec-feedback-to-spec.wir.yaml`, TypeScript template은 `workflows/templates/spec-feedback-to-spec`에 있다.

## 공통 계약

`SpecFeedbackIntent`는 다음을 고정한다.

- source artifact ID와 canonical content digest
- 사용자 요청 원문과 stable feedback ID
- optional target JSON Pointer
- 변경 가능한 JSON Pointer prefix
- 삭제 허용 여부
- domain profile ID와 변경 후에도 존재해야 할 required pointer

LLM node는 `SpecPatchProposal`만 제안한다. 각 add/replace/remove operation은 target path, 관련 feedback ID와 reason을 포함한다. Runtime은 proposal을 그대로 신뢰하지 않고 authority와 source digest를 다시 검사한 후 결정적으로 적용한다.

## Spec 표준이 없을 때

플랫폼은 screen, API, policy 같은 domain field를 하나의 schema로 강제하지 않는다. JSON-compatible document와 revision semantics만 공통화한다. 조직별 표준은 profile validator로 추가한다.

예:

- JSON Schema 또는 TypeBox/Ajv validation
- 필수 top-level section과 stable ID 규칙
- screen route 중복 검사
- actor/authority reference integrity
- domain enum과 cross-reference 검사

표준이 약할수록 verifier가 할 수 있는 일도 줄어든다. 이 경우 결과는 “문법적으로 적용 가능한 candidate”이지 “논리적으로 올바른 spec”이라고 주장하지 않는다.

## DIRECT와 workflow 선택

- 오탈자·한 문장 교정: 강한 단일 실행자를 사용하는 `DIRECT` 가능
- 여러 requirement, 화면, 권한 또는 cross-reference 변경: `CONTRACT` workflow
- 목표 자체를 탐색하고 여러 대안을 비교: `EXPLORER` 후 candidate 생성

DIRECT여도 pinned source, typed patch, diff, validation과 immutable child artifact는 유지한다. Source file 직접 편집은 버전 관리 밖의 임시 문서에만 제한한다.

## 현재 구현 경계

완료:

- Intent/proposal schema
- Source drift와 authority validation
- JSON Pointer add/replace/remove subset
- Feedback provenance, changed pointer와 content digest
- Required pointer와 pluggable domain validator
- Independent verdict와 human approval gate
- WIR static validation과 unit test

미완료:

- Production model provider를 사용하는 patch proposal activity
- Studio diff, finding과 approval inbox UI
- Approved artifact의 external repository write adapter
- 현재 heavy spec 전용 semantic profile과 cross-reference verifier

따라서 현재 원본 heavy spec을 자동으로 안전하게 교정할 준비가 끝난 것은 아니다. Revision substrate와 workflow contract가 준비된 상태다.
