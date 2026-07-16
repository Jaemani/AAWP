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
- `gyeonggi-integrated-wallet-production-spec/v1` heavy spec profile
- 102개 baseline screen, 140개 component, 24개 actor와 route/reference integrity 검증
- 기존 screen/actor/component 삭제와 admin/issuer authority root 결합 방지
- 담당자별 화면그룹 76-operation typed proposal, 110-screen immutable child candidate와 profile verdict
- Child spec 내부 `meta.revision`에 parent/contract digest, feedback ID, candidate 상태와 단일 실행 입력 경계 내장
- Studio typed launcher와 production Codex proposal activity
- S0~S3 maturity, Demo/Preview/Application blocker와 traceability report
- S1 acceptance의 stable browser `evidenceChecks`와 prose-only acceptance 차단
- 단일 child Spec과 별도로 logical `data-contract.json`, `api-contract.json`, `preview-blocker-routing.json` 생성

미완료:

- Studio diff, finding과 approval inbox UI
- Approved artifact의 external repository write adapter
- Heavy spec의 행정·법적 domain enum 전체와 자연어 논리 일관성 verifier
- 담당자별 화면그룹 child candidate의 사용자 승인과 promotion

Baseline 형식, 참조 무결성, typed patch 재적용, semantic maturity와 현재 candidate의 구조 계약을 검증한다. Production model proposal은 연결됐지만 model output 자체가 진실원은 아니다. Independent verification이 통과해도 현재 candidate는 검토 가능한 결과이지 승인된 spec을 의미하지 않는다.

Feedback heading은 Markdown level 2–6과 `FB-EVD-S1-001` 같은 계층형 stable ID를 허용한다. S1 scenario는 설명문만으로 통과하지 않으며 stable screen, actor, action, assertion과 필요한 state key를 가진 `evidenceChecks[]`를 선언해야 한다. 실제 click 실행과 selection별 판정은 `spec-to-demo` verifier가 소유한다.

Semantic compiler는 여러 evidence check 사이의 visibility도 비교한다. 동일한 `screenId + actorId + actionId`가 한 check에서는 `hidden`, 다른 check에서는 visible 또는 click-required이면 `ACCEPTANCE_ACTION_VISIBILITY_CONTRADICTED`로 revision을 거부한다. Negative check는 capability가 없는 actor, positive check는 권한 있는 actor를 사용해야 한다.

`scope.selectedScreensForS1Evidence`가 있으면 `scope.entryScreenId`는 그 집합의 canonical non-deprecated screen이어야 한다. 여러 storyboard journey를 보존할 때는 `scope.activeDemoJourneyId`를 명시한다. Deprecated screen이 selected screen, active acceptance 또는 active storyboard에 남으면 revision을 거부한다. Feedback source projection은 관련 acceptance scenario·storyboard와 현재 scope를 함께 제공하므로 model patch가 화면 object만 고치고 실행 projection을 놓치는 것을 줄인다.

Assertion은 action target type과 일치해야 한다. `targetType=screen`은 `navigates`로 target hash 이동을 검사하며 `action-specific-surface`, resource state/persistence, work-item, duplicate, input-error assertion을 함께 사용할 수 없다. Command action만 form surface와 resource 결과를 검증한다.

S2 계약은 candidate에서 결정적으로 컴파일되지만 blocker가 남으면 Preview 환경을 만들지 않는다. 물리 DB 제품·table·PII 저장소와 API transport는 근거가 없으면 `unresolved`다. 상세 경계는 [ADR-020](adr/ADR-020-preview-contracts-gate-environments.md)과 [M10 report](m10-preview-contracts-implementation-report.md)를 따른다.

담당자별 화면그룹 피드백에는 현재 에이전트가 구조화한 typed proposal과 child candidate가 추가됐다. 76개 operation으로 기존 10개 화면을 수정하고 새 업무 화면 8개를 추가했으며, 마지막 operation은 완전한 child 문서 안에 revision provenance를 내장한다. 기존 명부 화면 stable ID 하나는 필수 업로드·검증 화면으로 재사용한다. 구조 profile은 통과했지만 실제 click 감사 뒤 prose-only acceptance 3건이 새 S1 blocker로 재분류됐다. 이는 production model first-pass 품질을 증명하지 않으며 사용자 승인도 아직 없다.

전달·실행 단위는 `refined-production-spec.role-workspaces.candidate.json` 한 파일이다. 원본 전체와 변경 결과가 같은 문서에 있고 `meta.revision.executionInput="this_document"`다. Proposal, summary와 verdict는 patch 재현과 독립 검증을 위한 감사 sidecar이며 runtime이 child를 읽기 위해 필요하지 않다.

현재 pinned heavy spec은 다음 명령으로 검사한다.

```bash
npm run validate:heavy-spec -- refined-production-spec.json
npm run generate:heavy-spec-revision
```

원본 byte SHA-256은 `b4b50cd9…df33`, canonical digest는 `7031b9f0…ad55`다. Byte hash는 전달 파일 동일성을, canonical digest는 revision contract를 고정한다. 담당자별 피드백 intent와 provenance는 `examples/heavy-spec-feedback-revision`에 있다.
