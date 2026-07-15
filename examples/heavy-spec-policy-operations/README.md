# 정책·유통·발행·준비자산 demo

`refined-production-spec.json`의 102개 화면 중 사용자 요청에 해당하는 관리 콘솔·발행사 콘솔 22개 화면만 선택한 static demo다.

- Source SHA-256: `b4b50cd9c1d2321c8936126c00c3ff242bb88ba5445c26abfffc03187993df33`
- Selection: `selection-manifest.json`
- 정책 6개, 유통 7개, 발행·준비자산 9개
- Spec의 흐름·논리적 일관성 교정은 범위에서 제외한다. 해당 책임은 `spec-feedback-to-spec`에 둔다.

`bundle-manifest.json`은 정책, 유통, 발행·준비자산을 세 개의 선택 가능한 bundle로 제공한다. Bundle 안에서는 관리 콘솔과 발행사 콘솔 surface를 분리하고 각 화면을 `screen-artifacts/<screen-id>.json`으로 보존한다. Viewer는 screen content를 하나의 공통 panel로 합치지 않는다.

Bundle selector는 결과 화면을 고르는 플랫폼 navigation이다. 각 iframe 안에는 source `navModel`의 240px 관리 콘솔 또는 발행사 콘솔 rail이 별도로 존재한다. Source `interactionModel`이 선택된 screen을 가리키면 CTA와 rail이 부모 viewer에 `aawp:demo-navigate` event를 보내 실제 화면을 전환한다. Source screen이 selection 밖이면 범위 밖 안내를 표시하고, 목적지를 확인할 수 없으면 임의 연결하지 않고 `specFeedback`에 기록한다.

Platform navigation은 제품 rail 옆의 두 번째 panel이 아니라 preview 상단의 bundle/surface/screen switcher로 렌더링한다. `독립 화면 열기`는 run snapshot 안의 절대 screen URL을 사용하고 standalone screen의 CTA는 target standalone screen으로 직접 연결된다.

독립 제품 화면은 `screen.copy.title`을 제목으로 사용하며 route, purpose, dataNeeds, component 이름과 feedback count 같은 authoring metadata를 노출하지 않는다. 해당 정보는 screen artifact와 Studio inspector에만 남는다.

각 screen artifact의 route, surface, title, purpose, layout, components, states, copy와 dataNeeds는 source screen object와 일치한다. 공통 `source-contracts.json`이 pinned design token과 선택 화면이 사용하는 component purpose·props·variants·states를 중복 없이 보존한다. 화면에 보이는 운영 수치와 record는 상호작용 확인용 예시 데이터이며 권위값이 아니다. 외부 network는 호출하지 않는다.

`presentation-contract.yaml`은 사용자 제공 Stitch token과 style guidance를 보존한다. Generator가 `design-tokens.css`를 만들며 screen artifact에는 presentation digest와 `aawp-console-surface@0.2.0`이 기록된다. Hanken Grotesk와 JetBrains Mono가 실행 환경에 없으면 외부 font network 요청 없이 system fallback을 사용한다. 상태 배지 아이콘은 [Lucide](https://lucide.dev/)의 ISC 라이선스 자산을 snapshot에 포함해 외부 요청 없이 표시한다.

자동 검증은 source screen deep equality, 45개 component adapter coverage, design/presentation digest와 source-defined navigation resolution을 확인한다. 모든 component prop의 field-level 노출과 Figma pixel geometry 전수 검증은 아직 포함하지 않으므로 이 결과를 22개 화면의 완전한 production UI라고 부르지 않는다.

```bash
npm run build
npm run generate --prefix examples/heavy-spec-policy-operations
npm test --prefix examples/heavy-spec-policy-operations
```

`generate`는 source SHA-256을 확인한 뒤 bundle manifest와 22개 screen artifact를 다시 만든다.

AAWP Studio에서는 이 directory를 `--demo-source`로 지정한다. 새 run은 offboarded snapshot으로 저장되고 `Onboard demo`를 선택한 경우에만 URL과 preview에서 제공된다. `Delete demo`는 snapshot만 삭제하며 이 source, input fixture와 run/event는 보존한다.
