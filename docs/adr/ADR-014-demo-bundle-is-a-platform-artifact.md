# ADR-014: demo bundle은 workflow UI가 아니라 플랫폼 artifact다

- 상태: accepted
- 기준일: 2026-07-15

## 문제

사용자는 하나의 화면뿐 아니라 “정책 관련 화면”, “발행 플로우”, “모바일 onboarding 전체”처럼 여러 화면 묶음을 요청한다. 화면 선택만 contract로 고정하고 결과 packaging을 builder에 맡기면 builder가 서로 다른 화면·surface를 하나의 공통 panel에 합치거나 route·actor 경계를 잃을 수 있다.

## 고려한 대안

1. 각 workflow가 자체 gallery와 navigation을 구현한다. 빠르지만 manifest, URL, mobile preview와 검증 규칙이 workflow마다 달라져 채택하지 않았다.
2. 선택된 화면을 하나의 큰 demo page로 합친다. 화면별 layout·surface·authority를 훼손하므로 채택하지 않았다.
3. 플랫폼이 generic demo bundle artifact를 소유하고 workflow는 manifest와 독립 screen artifact를 만든다. Workflow input의 유연성과 결과의 일관성을 동시에 유지하므로 채택했다.

## 결정

`@awf/demo-bundle`이 `aawp/demo-bundle/v1` manifest를 compile한다.

- `bundle`: 사용자가 선택·전환하는 화면 collection
- `surface`: web, mobile, tablet 또는 other form factor와 actor boundary
- `group`: topic 또는 flow 기반 화면 집합
- `screen`: 고유 route, surface, group과 독립 artifact path

Compiler는 ID·route·artifact path 중복, dangling reference, surface/group membership 불일치와 bundle에 속하지 않은 screen을 거부한다. Preview shell은 manifest만 읽어 bundle → surface → screen을 탐색하며 screen content를 합성하지 않는다. 이 navigation은 여러 결과를 고르는 플랫폼 UX일 뿐 제품 화면의 navigation을 대체하지 않는다. 각 screen artifact가 source layout, route, state와 authority를 소유한다.

Screen artifact는 source screen object 외에 다음 실행 projection을 가진다.

- pinned `designTokens` snapshot과 화면이 참조한 component definition의 purpose·props·variants·states
- 해당 surface의 `navModel.shells`에서 가져온 product navigation
- 해당 screen의 `interactionModel.affordances`와 reachable state
- 현재 bundle에서 목적지를 실행할 수 있는지 나타내는 resolution
- 원본 spec에서 목적지를 확인할 수 없을 때의 `specFeedback`

제품 renderer는 source에 `ConsoleNavRail` 또는 `IssuerConsoleNavRail`이 있으면 실제 240px rail과 console chrome을 구현한다. Component 이름을 설명 카드로 출력하는 spec inspector는 demo로 간주하지 않는다. 선택된 screen으로 향하는 CTA는 screen artifact 사이를 이동하고, source에 있지만 selection 밖인 목적지는 범위 밖으로 표시한다. Source target이 불명확하면 버튼을 제거하거나 임의 연결하지 않고 feedback을 남긴다.

Source는 palette, typography, spacing, radius, mood와 component semantic contract를 제공하지만 Figma geometry, icon asset, CSS implementation까지 제공하지 않는다. 따라서 pixel renderer는 AAWP가 versioned console/mobile surface adapter로 소유한다. Adapter는 source token을 우선 적용하고 component definition의 props·variants·states를 누락 없이 투영한다. 이 adapter가 바뀌면 같은 input의 시각 결과가 달라질 수 있으므로 screen artifact가 adapter ID와 version을 고정한다.

## 책임 경계

- Resolver: 자연어 요청을 group/screen 후보로 해석
- `spec-to-demo`: scope contract와 screen artifact 생성
- 플랫폼: bundle manifest validation, 결과 묶음 navigation, form-factor preview와 lifecycle
- Screen builder: 선택한 화면 하나의 source contract 구현
- Product shell adapter: source navigation·interaction을 screen 전환과 local demo state로 연결
- Verifier: screen별 acceptance와 bundle reference 완전성 검증

## 결과와 재검토 조건

Workflow와 input은 domain에 맞게 바뀔 수 있지만 결과 viewer는 같은 manifest를 사용한다. Mobile이 추가돼도 새 viewer를 만들지 않고 surface `formFactor=mobile`과 독립 entry point를 추가한다. Source가 명시한 CTA와 navigation은 현재 manifest의 screen ID로 해결해 bundle 경계를 넘어 전환할 수 있다. 별도의 guided playback이나 사용자 시나리오 순서가 필요해질 때만 flow artifact를 검토한다.
