# Heavy spec feedback revision input

이 디렉터리는 담당자별 화면그룹 피드백을 `spec-feedback-to-spec` 입력 계약으로 컴파일한 예제다. 원본과 피드백 원문은 저장소 root에 byte-identical input artifact로 보존한다.

- Source byte SHA-256: `b4b50cd9c1d2321c8936126c00c3ff242bb88ba5445c26abfffc03187993df33`
- Source canonical digest: `7031b9f0b51bddb06d7b9f8dc1377de583a5cea7aa452e908792553be4ffad55`
- Feedback byte SHA-256: `6349a245b07725a307f888c89f744a52214d4cb1b849aaf542af98ab78a0bb16`
- Profile: `gyeonggi-integrated-wallet-production-spec/v1`

`feedback-intent.json`은 13개 stable feedback ID, 변경 가능한 root와 삭제 금지를 고정한다. `designTokens`와 `extendedDesign`은 required pointer지만 변경 authority에는 포함하지 않아 이번 정보구조 개편이 브랜드 재설계로 번지지 않게 한다.

`generated/`에는 76개 typed operation으로 만든 immutable child candidate가 있다. 76번째 operation은 parent/contract digest, 13개 feedback ID, candidate 상태와 `executionInput=this_document`를 child의 `meta.revision`에 넣는다.

- Child spec: `refined-production-spec.role-workspaces.candidate.json`
- Candidate ID: `specrev_c811de6f…f0f1af`
- Child canonical digest: `766e965d…17806`
- Child file SHA-256: `ec017105…59598e`
- 변경: 기존 10개 화면 수정, 새 업무 화면 8개, component 14개, actor 2개 추가
- 결과: 110 screens, 154 components, 26 actors
- Verifier: `passed`, finding 0

명부 업로드·검증은 새 중복 화면을 만들지 않고 기존 stable ID `admin-roster-builder`를 큰 수정했다. 따라서 피드백의 필수 업무 화면 9개는 기존 화면 1개 재사용과 신규 8개로 구현된다.

Verdict가 통과했어도 candidate status는 `candidate`다. 원본을 덮어쓰지 않았고, 사용자 승인 전에는 promoted spec으로 취급하지 않는다. Production LLM activity가 아직 없으므로 이번 proposal은 현재 에이전트가 feedback intent를 구조화해 생성한 typed proposal이다.

실행·전달 대상은 Child spec 한 파일뿐이다. `patch-proposal.json`, `revision-summary.json`, `revision-verdict.json`은 감사와 재현용 sidecar이며 child를 읽는 runtime input이 아니다.

피드백 원문이 참조하는 `audit_2026-07-14/*.png`는 현재 저장소에 없다. 따라서 intent는 피드백 텍스트와 pinned spec을 근거로 컴파일했으며, 해당 정적 이미지에 대한 독립 시각 대조를 완료했다고 주장하지 않는다.

```bash
npm run validate:heavy-spec -- refined-production-spec.json
npm run generate:heavy-spec-revision
npm test -- --run workflows/templates/spec-feedback-to-spec/src/heavy-production-spec-profile.test.ts
```
