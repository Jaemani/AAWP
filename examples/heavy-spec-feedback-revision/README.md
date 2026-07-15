# Heavy spec feedback revision input

이 디렉터리는 담당자별 화면그룹 피드백을 `spec-feedback-to-spec` 입력 계약으로 컴파일한 예제다. 원본과 피드백 원문은 저장소 root에 byte-identical input artifact로 보존한다.

- Source byte SHA-256: `b4b50cd9c1d2321c8936126c00c3ff242bb88ba5445c26abfffc03187993df33`
- Source canonical digest: `7031b9f0b51bddb06d7b9f8dc1377de583a5cea7aa452e908792553be4ffad55`
- Feedback byte SHA-256: `6349a245b07725a307f888c89f744a52214d4cb1b849aaf542af98ab78a0bb16`
- Profile: `gyeonggi-integrated-wallet-production-spec/v1`

`feedback-intent.json`은 13개 stable feedback ID, 변경 가능한 root와 삭제 금지를 고정한다. `designTokens`와 `extendedDesign`은 required pointer지만 변경 authority에는 포함하지 않아 이번 정보구조 개편이 브랜드 재설계로 번지지 않게 한다.

현재 단계에서는 source baseline과 intent compile만 검증한다. Patch candidate는 별도 파일로 생성하고 원본을 덮어쓰지 않으며, independent verdict와 사용자 승인 전에는 promoted spec으로 취급하지 않는다.

피드백 원문이 참조하는 `audit_2026-07-14/*.png`는 현재 저장소에 없다. 따라서 intent는 피드백 텍스트와 pinned spec을 근거로 컴파일했으며, 해당 정적 이미지에 대한 독립 시각 대조를 완료했다고 주장하지 않는다.

```bash
npm run validate:heavy-spec -- refined-production-spec.json
npm test -- --run workflows/templates/spec-feedback-to-spec/src/heavy-production-spec-profile.test.ts
```
