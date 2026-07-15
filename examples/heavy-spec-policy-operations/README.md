# 정책·유통·발행·준비자산 demo

`refined-production-spec.json`의 102개 화면 중 사용자 요청에 해당하는 관리 콘솔·발행사 콘솔 22개 화면만 선택한 static demo다.

- Source SHA-256: `b4b50cd9c1d2321c8936126c00c3ff242bb88ba5445c26abfffc03187993df33`
- Selection: `selection-manifest.json`
- 정책 6개, 유통 7개, 발행·준비자산 9개
- Spec의 흐름·논리적 일관성 교정은 범위에서 제외한다. 해당 책임은 `spec-feedback-to-spec`에 둔다.

화면별 route, title, purpose, copy와 authority boundary는 source spec을 따른다. Demo mock data는 권위 데이터가 아닌 projection 예시이며 외부 network를 호출하지 않는다.

```bash
npm test --prefix examples/heavy-spec-policy-operations
```

AAWP Studio에서는 이 directory를 `--demo-source`로 지정한다. 새 run은 offboarded snapshot으로 저장되고 `Onboard demo`를 선택한 경우에만 URL과 preview에서 제공된다. `Delete demo`는 snapshot만 삭제하며 이 source, input fixture와 run/event는 보존한다.
