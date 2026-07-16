# `spec-feedback-to-spec` 구현 결과

기준일은 2026년 7월 16일이다. 범용 spec field schema를 강제하지 않고 JSON-compatible document에 적용할 revision semantics와 production 실행 경로를 구현했다.

## 완료 범위

- `SpecFeedbackIntent`와 `SpecPatchProposal` TypeBox schema
- Source artifact ID와 canonical digest pinning
- Stable feedback ID, target pointer, reason과 operation provenance
- Allowed JSON Pointer prefix와 remove authority
- JSON Pointer escape, array index와 prototype pollution 방어
- Add, replace, remove deterministic patch materialization
- Parent, contract, changed pointer와 content digest가 포함된 immutable candidate
- Required pointer와 pluggable domain profile validator
- Source에서 patch를 재실행해 candidate를 대조하는 independent verification
- Passed verdict와 human approval이 모두 있어야 하는 artifact promotion
- `spec-feedback-to-spec` CONTRACT WIR
- Studio typed launcher: baseline·feedback path, 목표 성숙도와 사용자 요청을 pinned request로 고정
- Local execution manifest: contract compile → production Codex proposal → deterministic materialization → independent verification
- S0 구조, S1 Demo, S2 Preview, S3 Application 성숙도와 stage별 blocker 분류
- Requirement·screen·flow·authority·state·API 의미 관계 검사와 traceability report
- 단일 immutable child Spec과 감사용 proposal·verdict·gap·impact·maturity sidecar
- Child Spec에서 logical Data/API contract와 Preview blocker routing을 결정적으로 컴파일
- `gyeonggi-integrated-wallet-production-spec/v1` profile과 baseline preservation 검사
- 담당자별 화면그룹 피드백 13개 stable ID intent artifact
- 76개 typed operation, 110-screen immutable child candidate와 finding 0 verdict
- 단일 child spec 내부의 self-describing `meta.revision` provenance와 `executionInput=this_document`
- 역할별 8개 work area, 첫 PoC 15화면 storyboard와 승인·지급·서명·실행 분리 state

## 청년기본소득 교정 실행 결과

Production proposal run `run_5af78c2f-012f-485d-9538-e7b51dd75207`은 candidate를 만들었지만 독립 verifier를 통과하지 못해 의도대로 `failed`로 종료됐다. 검증 finding만 허용한 제한 수리 결과는 `runs/revisions/specrepair_f577b9f5e54ea5d803459f01/child-spec.candidate.json` 한 파일로 보존했다.

- S0 구조: passed
- S1 Demo: 기존 정적 판정은 passed였으나 실제 click 감사와 executable acceptance 재평가에서 blocker 3건으로 blocked
- S2 Preview: S1과 별개인 DB/API blocker 14건으로 blocked
- S3 Application: out of scope
- Trace coverage: 85.7%
- Preview logical contract: entity 14개, query 8개, command 12개, screen binding 8개

S2 blocker는 권한·실제 데이터 원천·소유권·PII 저장·API 오류와 중복 응답·transition·concurrency 미결정을 가리킨다. 이를 임의 DB/API 값으로 메우지 않았고 Preview 환경도 만들지 않았다.

후속 evidence 교정 run `run_fe65f891-8fb4-402b-85fe-2085bdeaa56e`은 `run_4346ebc9-4af8-470d-bdd7-031186d23277`의 child Spec과 Demo 증거 피드백을 입력으로 사용해 2분 29.2초, 421,566 tokens에 완료됐다. 결과는 다음 단일 candidate와 sidecar로 보존한다.

- `runs/run_fe65f891-8fb4-402b-85fe-2085bdeaa56e/artifacts/spec-revision/child-spec.candidate.json`
- `runs/run_fe65f891-8fb4-402b-85fe-2085bdeaa56e/artifacts/spec-revision/revision-verdict.json`
- `runs/run_fe65f891-8fb4-402b-85fe-2085bdeaa56e/artifacts/spec-revision/gap-report.json`
- `runs/run_fe65f891-8fb4-402b-85fe-2085bdeaa56e/artifacts/spec-revision/maturity-verdict.json`

Revision verdict는 finding 0으로 passed다. 정책 결재함, 명부 검토, 역할 진입 navigation evidence는 모두 source screen의 `visible + navigates` 계약으로 교정됐고, 명부 파일 반입은 운영자에게 visible, 결재자에게 hidden으로 일관된다. 성숙도는 `S0 passed / S1 blocked / S2 blocked / S3 out-of-scope`다. S1 blocker는 실제 browser evidence 대기 1건이고 S2는 별도의 Preview open decision 7건과 그 S1 선행조건을 포함한다.

## Demo evidence 교정 실행

`run_242c896e-f714-44fa-a570-9454f20789d7`은 7화면·25개 evidence를 모두 실행했지만 `spec-to-demo` 0.5.1에서 17분 51.1초, 2,606,270 tokens 후 failed로 종료됐다. Initial inspect는 Demo 결함 13건을 한 번에 수집했으며 bounded repair 뒤에도 10건이 남았다. 분석 결과 일부 finding은 verifier가 이미 보이는 command를 클릭한 뒤 surface submit을 다시 눌러 상태를 이중 전이시킨 false negative였다.

이중 실행과 surface 밖 submit 선택을 고친 0.5.2의 `run_7b884b9d-825a-42a4-bd98-d0c92b7fe87d`은 13분 17.9초, 2,252,016 tokens를 사용했다. Initial finding은 4건으로 줄었고 repair가 실제 Demo 결함 2건을 닫았다. Final에 남은 2건은 `input-preserved-on-error`가 암시하는 숨은 surface를 verifier가 열지 않은 assertion implication 누락이었다. 같은 immutable Demo artifact는 implication을 교정한 independent verifier에서 25개 evidence 모두 passed했다. 과거 failed run status는 성공으로 덮어쓰지 않았고, 수정 semantics는 `spec-to-demo` 0.5.3으로 별도 버전화했다.

최신 pass는 `reverify_20260716183023855_e46d4a7b`로 정식 보존했다. 실행 시간은 36.8초, model invocation과 token 사용은 0이며 verdict는 `runs/reverifications/reverify_20260716183023855_e46d4a7b/verdict.json`에 있다. Snapshot digest `b7d5283f…cd4d`, Demo tree digest `8da941c3…d447`, verifier digest `fd5124c0…c8c`, workflow contract digest `b3be5b79…96a4`를 함께 고정했으므로 artifact를 수정하지 않은 현재 verifier 재판정임을 확인할 수 있다.

## 검증 결과

- Heavy spec profile + feedback intent + generated candidate focused test: 3개 file, 9개 test 통과
- 전체 repository test: 59개 file, 272개 test 통과
- 담당자별 원본/candidate 비교 fixture: 4개 contract test와 2개 browser JavaScript syntax check 통과
- `spec-to-demo`와 `spec-feedback-to-spec` WIR static check 통과
- Typecheck, lint, format과 전체 test gate 통과 여부는 최종 commit에서 다시 검증한다.

## 증명하지 않은 범위

- Heavy spec의 행정·법적 domain enum 전체와 자연어 논리 일관성 검사
- Production model patch proposal의 first-pass 통과 품질과 반복 성공률
- 담당자별 화면그룹 candidate의 사용자 승인과 promotion
- Studio diff, finding, approval inbox와 artifact promotion UI
- Git repository나 외부 document system에 승인 artifact를 쓰는 side-effect adapter

따라서 현재 구현은 실행 가능한 revision workflow, 의미 dependency projection, 실제 browser evidence를 요구하는 S1 판정과 fail-closed Preview 계약 기반까지다. 현재 child candidate는 S1을 통과하지 않았으며, Heavy spec을 항상 first-pass로 논리 교정하거나 production DB/API를 구현할 수 있다는 의미도 아니다.
