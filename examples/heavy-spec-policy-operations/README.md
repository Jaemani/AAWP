# 정책·유통·발행·준비자산 demo

`refined-production-spec.json`의 102개 화면 중 사용자 요청에 해당하는 관리 콘솔·발행사 콘솔 22개 화면만 선택한 static demo다.

- Source SHA-256: `b4b50cd9c1d2321c8936126c00c3ff242bb88ba5445c26abfffc03187993df33`
- Selection: `selection-manifest.json`
- 정책 6개, 유통 7개, 발행·준비자산 9개
- Spec의 흐름·논리적 일관성 교정은 범위에서 제외한다. 해당 책임은 `spec-feedback-to-spec`에 둔다.

`bundle-manifest.json`은 정책, 유통, 발행·준비자산을 세 개의 선택 가능한 bundle로 제공한다. Bundle 안에서는 관리 콘솔과 발행사 콘솔 surface를 분리하고 각 화면을 `screen-artifacts/<screen-id>.json`으로 보존한다. Viewer는 screen content를 하나의 공통 panel로 합치지 않는다.

각 screen artifact의 route, surface, title, purpose, layout, components, states, copy와 dataNeeds는 source screen object와 일치한다. Source에 없는 운영 수치나 record를 추가하지 않으며 외부 network를 호출하지 않는다.

```bash
npm run build
npm run generate --prefix examples/heavy-spec-policy-operations
npm test --prefix examples/heavy-spec-policy-operations
```

`generate`는 source SHA-256을 확인한 뒤 bundle manifest와 22개 screen artifact를 다시 만든다.

AAWP Studio에서는 이 directory를 `--demo-source`로 지정한다. 새 run은 offboarded snapshot으로 저장되고 `Onboard demo`를 선택한 경우에만 URL과 preview에서 제공된다. `Delete demo`는 snapshot만 삭제하며 이 source, input fixture와 run/event는 보존한다.
