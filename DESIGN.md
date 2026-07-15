# AAWP Demo Design Standard

- 상태: active
- 버전: 1.1.0
- 기준일: 2026-07-15
- 적용 범위: AAWP workflow가 생성하는 web/mobile demo artifact
- 비적용 범위: AAWP Studio control console 자체

## 1. 목적

AAWP demo는 spec 내용을 보여주는 문서 viewer가 아니라 사용자가 실제 제품처럼 탐색하고 핵심 업무를 수행할 수 있는 실행 가능한 결과물이어야 한다. 여러 화면을 요청해도 화면 내용을 한 panel에 합치지 않으며, 각 화면의 actor·route·layout·state와 interaction을 보존한다.

현재 web console의 기준 인상은 다음과 같다.

> 신뢰도 높은 공공 금융 서비스의 절제된 시각 언어와, 빠르게 판단하고 실행할 수 있는 고밀도 governance console.

## 2. 진실원과 입력 격리

Demo builder가 읽을 수 있는 디자인 입력은 이 문서 하나다. 충돌 시 아래 순서로 판단한다.

1. Pinned source spec: 화면의 업무 의미, actor, authority, route, copy, state, data와 interaction
2. 이 문서: 색상, typography, spacing, shell, composition, responsive, interaction과 접근성
3. Browser 기본 동작: 이 문서가 정의하지 않은 native control의 세부 rendering

Source spec의 layout/component 이름은 필요한 업무 구조를 설명할 뿐 별도 디자인 시스템이 아니다. 다음 자료는 provenance와 과거 결과 비교용이며 demo builder 입력으로 사용하지 않는다.

- 기존 `presentation-contract.yaml`, `visual-reference-contract.yaml`, `design-tokens.css`
- 이전 run의 HTML, CSS, screenshot과 demo artifact
- 대화에서만 전달된 디자인 설명이나 에이전트의 기억
- source spec 밖의 제품 화면과 임의 example dashboard

Spec이 불명확하면 임의 UX로 메우지 않고 demo 밖의 `specFeedback`에 기록한다. Manifest는 `DESIGN.md`의 path, version, SHA-256 digest를 기록하고 다른 디자인 계약 digest를 기록하지 않는다.

## 3. 핵심 원칙

### 3.1 한 화면, 한 업무 맥락

- 서로 다른 route를 한 dashboard panel에 합치지 않는다.
- 화면 묶음은 navigation collection이지 합성 화면이 아니다.
- 사용자가 요청한 화면마다 독립 URL과 screen artifact를 제공한다.
- 연결 대상이 요청 범위 안이면 CTA와 navigation으로 실제 전환한다.
- 범위 밖이면 범위 밖임을 알리고, 불명확하면 임의 연결하지 않는다.

### 3.2 Authority가 항상 보인다

- Admin/Issuer web은 짙은 authority rail을 사용한다.
- 현재 역할, 조직 또는 실행 권한을 header나 rail에서 확인할 수 있어야 한다.
- 일반 status와 authority state를 같은 badge 의미로 섞지 않는다.
- 위험하거나 되돌리기 어려운 실행은 primary action과 별도 확인 단계를 갖는다.

### 3.3 정보는 조밀하되 층위는 단순하다

- 기본 제품 shell은 rail, governance header, page content의 세 층만 사용한다.
- 카드 안에 불필요한 카드나 outline을 반복하지 않는다.
- Metrics는 판단에 필요한 경우에만 사용하고 최대 4개를 기본으로 한다.
- 표, form, stepper, drawer는 화면의 실제 업무 유형에 따라 선택한다.
- 긴 설명보다 label, value, status, evidence와 action을 우선한다.

### 3.4 증거와 행동이 함께 보인다

- 실행 화면은 대상, 금액·건수, 현재 상태, 영향과 다음 행동을 한 viewport 안에서 파악할 수 있어야 한다.
- 승인·발행·지급 같은 단계는 진행 상태와 완료 evidence를 함께 보여준다.
- 예시 데이터는 `예시` 또는 `PoC`임을 명시하고 권위값처럼 표시하지 않는다.
- ID, hash, audit reference는 JetBrains Mono 계열로 사람용 정보와 구분한다.

### 3.5 Product UI에 authoring metadata를 노출하지 않는다

다음 정보는 Studio/artifact inspector가 소유하며 제품 화면에 표시하지 않는다.

- route 문자열
- screen ID
- purpose, dataNeeds
- component type이나 prop 이름
- feedback count와 진단 문구
- source spec 원문 설명

제품 화면 제목은 source의 사용자용 `copy.title`을 사용한다.

## 4. Web console composition

### 4.1 기본 shell

| 영역                 | 기준                                                           |
| -------------------- | -------------------------------------------------------------- |
| Workspace background | `surface #f8f9fb`, 장식 없는 조용한 배경                       |
| Authority rail       | 240px, `authority #0A2540`, viewport 높이 고정                 |
| Active navigation    | `primary-container #2368D9`, icon + text                       |
| Governance header    | 최소 72px, 흰 배경, breadcrumb/title + compact authority state |
| Page padding         | desktop 24px/28px, mobile 18px/14px                            |
| Content              | full fluid width, 불필요한 중앙 marketing card 금지            |

제품 rail은 하나만 둔다. Bundle·surface·screen 선택기는 제품 rail 옆에 두 번째 좌측 panel로 배치하지 않고 preview 바깥의 상단 switcher가 소유한다.

### 4.4 Mobile composition

- Consumer/Merchant 화면은 20px side gutter와 16/24px vertical rhythm을 사용한다.
- Primary CTA는 최소 56px, 모든 touch target은 최소 44×44px다.
- 핵심 잔액·상태를 먼저 보여주고 ledger 세부 정보는 progressive disclosure로 제공한다.
- Tablet에서는 독립 card를 최대 2-column으로 전환하되 transaction amount와 상태를 자르지 않는다.
- Bottom sheet는 상단 20px radius와 명확한 modal elevation을 사용한다.
- Mobile 화면에 web authority rail을 축소 삽입하지 않는다. Actor와 surface에 맞는 mobile navigation을 사용한다.

### 4.2 Page header

- 왼쪽: 사용자용 제목과 한 줄 설명
- 오른쪽: 화면의 primary/secondary action
- 화면 title은 22px 내외, body는 16px 기준을 사용한다.
- 내부 구현 ID나 route를 subtitle로 사용하지 않는다.

### 4.3 Content patterns

#### List / work queue

- Filter bar → table → 선택 detail drawer 순서를 기본으로 한다.
- Table row는 최소 44px이며 수치와 status를 잘라내지 않는다.
- Row 전체 또는 명시적 action으로 detail에 진입한다.

#### Configuration / policy form

- Context/effective version → sectioned form → validation summary → submit 순서로 구성한다.
- 관련 필드는 한 section에 묶되 label과 value를 별도 panel로 과도하게 분할하지 않는다.
- 저장과 승인 요청을 구분하고, validation 오류는 해당 field와 summary에 함께 표시한다.

#### Approval / review

- 제출 내용, 변경점, evidence, 결재 계보와 의사결정을 분리한다.
- 승인/반려는 같은 시각적 무게로 두지 않는다. Primary action은 정상 진행, destructive action은 danger semantic을 사용한다.

#### Execution / payout / issuance

- 실행 전 대상·금액·건수·권한·준비 상태를 요약한다.
- 실제 실행 action은 확인 단계와 결과 state를 가진다.
- 성공, 일부 실패, 재처리 가능 상태를 semantic token과 텍스트로 함께 구분한다.

#### Audit / evidence

- 시간순 event, actor, action, reference를 한 행에서 읽을 수 있어야 한다.
- Technical reference는 mono typography를 사용하고 copy action을 제공할 수 있다.

## 5. Visual language

이 절의 token이 canonical source다. 구현은 CSS custom property로 옮길 수 있지만 이름·값·semantic pairing을 임의 변경하지 않는다.

### 5.1 색상

- Critical primary action: `primary-container #2368D9`
- Authority surface: `#0A2540`
- 일반 본문: `on-surface #191C1E`
- Border: `surface-strong #E5E8EB` 또는 `outline-variant #C2C6D6`
- 상태는 반드시 matching foreground/background token pair를 사용한다.

상태를 색상만으로 표현하지 않는다. Badge는 icon, text와 semantic pair를 함께 사용한다.

```yaml
surface: "#f8f9fb"
surface-dim: "#d8dadc"
surface-bright: "#f8f9fb"
surface-container-lowest: "#ffffff"
surface-container-low: "#f2f4f6"
surface-container: "#eceef0"
surface-container-high: "#e6e8ea"
surface-container-highest: "#e0e3e5"
on-surface: "#191c1e"
on-surface-variant: "#424753"
inverse-surface: "#2d3133"
inverse-on-surface: "#eff1f3"
outline: "#737785"
outline-variant: "#c2c6d6"
primary: "#0050b5"
on-primary: "#ffffff"
primary-container: "#2368d9"
on-primary-container: "#edefff"
primary-tint: "#eaf2ff"
secondary: "#595f69"
on-secondary: "#ffffff"
secondary-container: "#dae0ec"
on-secondary-container: "#5d636e"
tertiary: "#3f5774"
on-tertiary: "#ffffff"
tertiary-container: "#586f8e"
on-tertiary-container: "#eaf1ff"
error: "#ba1a1a"
on-error: "#ffffff"
error-container: "#ffdad6"
on-error-container: "#93000a"
ink-muted: "#566579"
ink-subtle: "#6b7684"
surface-strong: "#e5e8eb"
authority-fg: "#0a2540"
authority-bg: "#e6edf5"
high-contrast-focus: "#111827"
verified-fg: "#00796b"
verified-bg: "#e4f7f4"
pending-fg: "#9a4d00"
pending-bg: "#fff2de"
danger-fg: "#c02131"
danger-bg: "#ffe8eb"
decision-fg: "#4e5968"
decision-bg: "#eef1f4"
approved-fg: "#0b7a53"
approved-bg: "#e7f7ef"
convertible-fg: "#174ea6"
convertible-bg: "#e8f0fe"
```

### 5.2 Typography

- 기본: Hanken Grotesk, 없으면 system sans fallback
- Technical ID: JetBrains Mono, 없으면 system mono fallback
- 금액·건수: tabular figures
- 금융 금액은 ellipsis로 자르지 않는다.
- 대문자 eyebrow는 authority나 section label처럼 제한된 용도로만 사용한다.

| Role            | Family         | Size | Weight | Line height |
| --------------- | -------------- | ---: | -----: | ----------: |
| balance-display | Hanken Grotesk | 34px |    700 |         1.2 |
| metric          | Hanken Grotesk | 28px |    700 |         1.3 |
| title           | Hanken Grotesk | 22px |    700 |         1.4 |
| body            | Hanken Grotesk | 16px |    400 |         1.5 |
| label           | Hanken Grotesk | 15px |    600 |         1.0 |
| table-cell      | Hanken Grotesk | 14px |    400 |         1.4 |
| caption         | Hanken Grotesk | 13px |    400 |         1.4 |
| mono            | JetBrains Mono | 13px |    500 |         1.0 |

### 5.3 Shape와 depth

- Card/container: 8–12px radius
- Button/input: 12px radius
- Badge: pill
- Web console은 강한 그림자 대신 tonal layer와 낮은 대비 border로 깊이를 표현한다.
- Modal/sheet/drawer만 주변 panel보다 명확한 elevation을 갖는다.

### 5.4 Spacing

- 4px grid를 사용한다.
- 주요 간격: 8, 12, 16, 24, 32px
- Card padding: 16–18px
- 모든 pointer/touch target: 최소 44×44px
- Desktop table row: 최소 44px

Canonical spacing token은 `base 4px`, `gutter-mobile 20px`, `padding-card 16px`, `height-cta 56px`, `height-row 44px`, `padding-col 12px`, `nav-rail-width 240px`다. Radius token은 `sm 4px`, `default 8px`, `md 12px`, `lg 16px`, `xl 24px`, `full 9999px`다.

## 6. Responsive behavior

- 1280px 미만: 240px rail을 72–76px icon rail로 축소한다.
- 820px 미만: 2-column grid를 1-column으로 reflow한다.
- 600px 미만: rail을 상단 horizontal product navigation으로 전환한다.
- Mobile page gutter는 14–20px 범위를 유지한다.
- 기능을 숨겨 반응형을 해결하지 않는다. Secondary metadata만 단계적으로 축약한다.
- 모든 form, table 대안과 primary action은 keyboard와 touch로 사용할 수 있어야 한다.

## 7. Interaction standard

- Rail, tab, breadcrumb와 primary CTA의 현재/hover/focus/disabled 상태를 구현한다.
- Navigation은 요청 범위 안의 실제 screen으로 이동해야 한다.
- Form은 값 변경, validation, submit feedback이 동작해야 한다.
- 실행 action은 confirmation → running → terminal result를 표현한다.
- Drawer, modal, toast는 닫기와 keyboard focus 경계를 제공한다.
- 가짜 성공을 기본 상태로 표시하지 않는다. 사용자의 action 뒤에 상태가 전이된다.

## 8. Bundle viewer와 제품 화면 경계

- Viewer: bundle, surface, screen 선택과 viewport control
- Product shell: actor별 rail, header, 업무 navigation과 screen interaction
- Viewer와 제품 shell은 동일 축의 persistent navigation을 중복하지 않는다.
- 독립 화면 URL에서도 제품 shell과 interaction이 유지되어야 한다.
- Screen 간 이동은 bundle viewer와 standalone URL 양쪽에서 같은 target ID로 해결한다.

## 9. 접근성

- Focus ring: 최소 2px, `high-contrast-focus #111827`
- 일반 text 대비: WCAG AA 목표
- Status와 결과는 색상 외 text/icon을 포함한다.
- Icon-only control은 accessible name을 가진다.
- Form label과 error는 programmatic association을 갖는다.
- Keyboard로 rail, filter, table action, drawer와 primary flow를 완료할 수 있어야 한다.

## 10. Demo acceptance checklist

### Source fidelity

- 선택한 screen ID, actor, route와 surface가 source와 일치한다.
- Panel, copy, state와 action을 다른 화면과 합치지 않았다.
- Source 밖의 업무 사실과 권위 수치를 추가하지 않았다.
- Authoring metadata가 제품 DOM에 노출되지 않는다.

### Visual consistency

- Authority rail, white governance header와 단일 shell을 유지한다.
- `DESIGN.md` 1.1.0 path와 SHA-256 digest를 artifact에 기록한다.
- Manifest에 legacy presentation/visual reference 입력을 기록하지 않는다.
- Primary, status, danger와 authority color의 의미가 일관된다.
- 4px grid, 최소 44px target과 radius 규칙을 지킨다.

### Interaction

- Product navigation과 주요 CTA가 선택 범위 안 화면으로 이어진다.
- 핵심 form 또는 실행 action이 실제 state transition을 만든다.
- 범위 밖/불명확 target을 임의 연결하지 않는다.
- Standalone screen URL에서도 같은 core interaction이 동작한다.

### Responsive and accessibility

- 1440px desktop, 1024px collapsed rail, 390px mobile reflow를 확인한다.
- Overflow, 잘린 금액, 겹친 panel과 이중 navigation이 없다.
- Keyboard focus, accessible name, semantic status를 확인한다.

## 11. Pilot pages

이 문서 1.1.0의 첫 검증 화면은 다음 두 개다.

1. `admin-voucher-policy-setup`: configuration/form hierarchy, validation과 submit state
2. `admin-payout-execution`: authority, execution confirmation, running/result state와 cross-screen navigation

두 화면은 하나의 합성 dashboard가 아니라 같은 제품 shell 안의 독립 screen으로 제공한다. 테스트 결과가 통과한 뒤 이 기준을 다른 policy/roster/issuance/audit 화면으로 확장한다.

## 12. 변경 관리

- 이 문서의 의미·composition 규칙 변경은 문서 version을 올린다.
- Token 또는 shell/composition 변경은 이 문서 version을 올린다.
- 한 화면의 source 변경은 spec revision으로 처리하며 디자인 문서에 업무 예외를 추가하지 않는다.
- Demo artifact는 source spec digest와 design contract path/version/digest를 기록해야 한다.
- Workflow 실행 manifest는 허용 디자인 입력을 `DESIGN.md` 하나로 선언하고 legacy 디자인 파일 접근을 금지해야 한다.
