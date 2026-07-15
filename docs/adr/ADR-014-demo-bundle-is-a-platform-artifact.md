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

Compiler는 ID·route·artifact path 중복, dangling reference, surface/group membership 불일치와 bundle에 속하지 않은 screen을 거부한다. Preview shell은 manifest만 읽어 bundle → surface → screen을 탐색하며 screen content를 합성하지 않는다. 각 screen artifact가 source layout, route, state와 authority를 소유한다.

## 책임 경계

- Resolver: 자연어 요청을 group/screen 후보로 해석
- `spec-to-demo`: scope contract와 screen artifact 생성
- 플랫폼: bundle manifest validation, navigation, form-factor preview와 lifecycle
- Screen builder: 선택한 화면 하나의 source contract 구현
- Verifier: screen별 acceptance와 bundle reference 완전성 검증

## 결과와 재검토 조건

Workflow와 input은 domain에 맞게 바뀔 수 있지만 결과 viewer는 같은 manifest를 사용한다. Mobile이 추가돼도 새 viewer를 만들지 않고 surface `formFactor=mobile`과 독립 entry point를 추가한다. 여러 bundle 사이의 cross-screen flow playback이 필요해지면 manifest v2가 아니라 별도 flow artifact를 먼저 검토한다.
