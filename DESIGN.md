---
name: Gyeonggi Integrated Wallet
version: 1.10.0
status: active
scope: AAWP workflow가 생성하는 web/mobile product demo artifact
colors:
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
  outline: "#737785"
  outline-variant: "#c2c6d6"
  surface-strong: "#e5e8eb"
  primary: "#0050b5"
  on-primary: "#ffffff"
  primary-container: "#2368d9"
  on-primary-container: "#edefff"
  primary-tint: "#eaf2ff"
  authority-fg: "#0a2540"
  authority-bg: "#e6edf5"
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
  high-contrast-focus: "#111827"
typography:
  balance-display: { fontFamily: Hanken Grotesk, fontSize: 34px, fontWeight: 700, lineHeight: 1.2 }
  metric: { fontFamily: Hanken Grotesk, fontSize: 28px, fontWeight: 700, lineHeight: 1.3 }
  title: { fontFamily: Hanken Grotesk, fontSize: 22px, fontWeight: 700, lineHeight: 1.4 }
  body: { fontFamily: Hanken Grotesk, fontSize: 16px, fontWeight: 400, lineHeight: 1.5 }
  label: { fontFamily: Hanken Grotesk, fontSize: 15px, fontWeight: 600, lineHeight: 1 }
  table-cell: { fontFamily: Hanken Grotesk, fontSize: 14px, fontWeight: 400, lineHeight: 1.4 }
  caption: { fontFamily: Hanken Grotesk, fontSize: 13px, fontWeight: 400, lineHeight: 1.4 }
  mono: { fontFamily: JetBrains Mono, fontSize: 13px, fontWeight: 500, lineHeight: 1 }
rounded: { sm: 4px, default: 8px, md: 12px, lg: 16px, xl: 24px, full: 9999px }
spacing:
  base: 4px
  gutter-mobile: 20px
  padding-card: 16px
  height-cta: 56px
  height-row: 44px
  padding-col: 12px
  nav-rail-width: 240px
  space-xs: 8px
  space-sm: 12px
  space-md: 16px
  space-lg: 24px
  space-xl: 32px
---

# Gyeonggi Integrated Wallet Design Standard

## Overview

AAWP demo는 spec을 설명하는 문서 viewer가 아니라 사용자가 실제 제품처럼 탐색하고 핵심 업무를 수행하는 product UI다. 화면 묶음은 navigation collection이며 서로 다른 route의 내용을 한 dashboard에 합치지 않는다.

시각 방향은 **Corporate Minimalism**이다. 공공 금융 서비스의 신뢰성과 fintech의 명료함을 결합하되, 장식·gradient·illustration 없이 flat surface, 낮은 대비의 1px border와 단순한 층위를 사용한다. Admin/Issuer web은 금융 terminal에 가까운 고밀도 governance console이고 Consumer/Merchant mobile은 여백과 읽기 편한 상태 설명을 우선한다.

모든 선택은 “빠른 판단, 권한 인지, 오류 없는 실행”에 기여해야 한다. Token이 허용하더라도 이 목적과 무관한 색, card, badge, shadow 또는 빈 공간을 추가하지 않는다.

## Colors

- `primary-container #2368D9`는 화면에서 가장 중요한 정상 진행 CTA 한 개에 우선 사용한다. 배경 tint, 정보 banner, divider, 장식 또는 여러 동급 CTA에 반복하지 않는다.
- `authority-fg #0A2540`은 Admin/Issuer rail과 authority context에만 사용한다. 일반 card 배경이나 consumer surface에 확장하지 않는다.
- 일반 surface는 흰색과 neutral tonal layer를 사용한다. Panel을 구분하려고 임의의 pastel 배경을 만들지 않는다.
- Status는 반드시 matching foreground/background pair와 text를 함께 쓴다. `verified`, `pending`, `danger`, `decision`, `approved`, `convertible` 의미를 서로 바꾸지 않는다.
- Error와 부족 상태는 danger pair, 대기·확인 필요는 pending pair를 사용한다. 색만으로 상태를 전달하지 않는다.
- 일반 text는 `on-surface`, 보조 설명은 `on-surface-variant` 또는 `ink-muted`를 사용한다. WCAG AA 대비를 목표로 한다.

## Typography

- Hanken Grotesk를 기본으로 하고 없으면 system sans로 fallback한다. ID, hash, audit reference와 idempotency key만 JetBrains Mono 계열을 사용한다.
- Page title만 22–24px/700을 사용한다. Panel title은 18px/1.3, body는 14–16px, field/key label은 13–15px를 사용한다. 모든 text를 16px bold로 만들지 않는다.
- 금액과 건수는 tabular figures를 사용하며 ellipsis로 자르지 않는다. 좁으면 column을 reflow하거나 metric을 18px 이상 범위에서 축소한다.
- 긴 한국어 label, badge와 technical ID는 container 안에서 wrap한다. 줄바꿈은 다음 row를 밀어내야 하며 겹치면 안 된다.
- 대문자 eyebrow는 authority 또는 section label처럼 짧은 보조 정보에만 사용한다.

## Layout

### Source와 화면 경계

- Pinned source spec은 actor, authority, route, copy, state, data와 interaction의 진실원이다. 이 문서는 visual decision만 소유한다.
- 요청한 screen마다 canonical `#<screenId>` 주소와 독립 product screen을 만든다. 범위 안 target만 연결하고 범위 밖 target은 안내하며 source logic을 임의 수정하지 않는다.
- Product UI에는 route, screen ID, purpose, dataNeeds, component/prop 이름, feedback 진단과 raw spec prose를 노출하지 않는다.

### Admin/Issuer web shell

- Shell은 정확히 authority rail, governance header, page content의 세 층이다.
- Desktop rail은 240px, `#0A2540`, viewport 높이로 유지한다. Gyeonggi pilot rail 상단에는 `Gyeonggi Integrated Wallet`과 `관리 콘솔`을 함께 표시한다. `관리 콘솔`만 product brand처럼 쓰지 않는다.
- Header는 흰색, 최소 72px이며 breadcrumb/title, 한 줄 설명과 compact authority state만 둔다. Title을 별도 hero에서 반복하지 않는다.
- Page는 20–28px padding, `surface #f8f9fb`, 장식 없는 fluid content를 사용한다. Focused form content는 `min(1180px, 100%)`에 가깝게 제한한다.
- Product rail은 하나만 둔다. Bundle/screen selector는 preview 바깥에 두며 같은 축에 두 번째 persistent panel을 만들지 않는다.

### Information composition

- 정보는 조밀하되 rail/header/content, panel head/body/action의 층위를 넘겨 중첩하지 않는다.
- 일반 key-value 정보는 흰 surface의 flat row와 1px bottom divider가 기본이다. 판단을 돕는 status group이나 metric이 아닌데 각 row를 회색 box로 만들지 않는다.
- Context는 compact 44px 이상 key-value row를 사용한다. 설명성 값과 일정·연령·상한을 큰 KPI tile로 만들지 않는다.
- Metric은 실제 비교가 필요한 금액·건수에만 사용하고 최대 4개다. 좁은 한 행에 4개를 밀어 넣지 않는다.
- `admin-payout-execution`의 네 summary metric은 1440px focused content에서 2×2, mobile에서 1-column이다. 금액 한 개가 두 줄로 갈라지는 4-column row를 사용하지 않는다.
- 실행 화면은 대상, 금액·건수, 권한, 준비 상태, 영향과 다음 action을 desktop 첫 viewport 안에서 파악할 수 있어야 한다.

### Responsive behavior

- `<1280px`: 240px rail을 72–76px icon rail로 줄인다.
- `<820px`: 2-column content를 1-column으로 reflow한다.
- `<600px`: rail을 상단 horizontal product navigation으로 전환한다. Web rail을 축소해 옆에 남기지 않는다.
- Mobile에서 선택 범위가 2–4개 route라면 모든 항목을 같은 navigation 영역 안에 동시에 보이게 한다. 5개 이상이면 명시적인 menu/overflow control을 제공한다. 표시 없는 horizontal scroll 뒤에 route를 숨기지 않으며 현재 route와 이동 가능한 route를 구분한다.
- 390px mobile은 14–20px gutter, document width 390px 이하, 44px 이상 touch target과 56px primary CTA를 유지한다.
- Mobile은 desktop panel을 의미 순서대로 쌓되 같은 정보를 반복하지 않는다. 기능을 숨겨 반응형을 해결하지 않는다.
- Tablet card는 최대 2-column이며 금액과 status를 자르지 않는다.

## Elevation

- Web panel/card는 기본적으로 `surface-container-lowest`, `surface-strong #E5E8EB` 1px border, 10px radius를 사용한다.
- Card에 box shadow를 사용하지 않는다. Hierarchy는 tonal layer, border와 spacing으로 만든다.
- Modal, sheet, drawer와 floating feedback만 주변 panel보다 분명한 shadow를 가질 수 있다.
- Panel 안에 같은 시각 무게의 card를 반복 중첩하지 않는다. Row가 필요하면 neutral fill과 8px radius를 사용한다.

## Components

### Buttons and status

- Primary button은 solid primary + white text, Secondary는 neutral/white surface + subtle border다. Secondary를 primary와 같은 fill/weight로 만들지 않는다.
- Button group gap은 desktop 최소 8px, mobile vertical 12px다. Destructive action은 danger semantic을 사용하며 정상 primary 옆에 같은 무게로 두지 않는다.
- Badge는 pill, label weight와 text를 사용한다. 실제 icon library asset이 있을 때만 icon을 추가한다. Unicode, emoji, 한자, 점 또는 삼각형을 icon placeholder로 쓰지 않는다.
- Badge는 `확인됨`, `검토 필요`, `실행 중`처럼 짧은 상태 label에만 쓴다. 문장, 금액, 공식, ID 또는 설명 전체를 pill 안에 넣지 않는다.

### Forms and tables

- 한 줄 `input`과 `select`는 `box-sizing: border-box`, 정확히 48px, 24px line-height와 같은 상하 padding을 사용한다.
- `select`는 `appearance: none`, local chevron과 오른쪽 42px 여유를 사용한다. Text가 화살표 아래로 들어가면 안 된다.
- Field label-control gap은 8px, field gap은 최소 16px, textarea는 최소 96px다. Action footer는 마지막 field/help/error와 최소 16px 떨어진다.
- Validation은 field와 summary에 연결한다. Sticky action이 content를 덮을 가능성이 있으면 static flow를 사용한다.
- Table row는 최소 44px이며 숫자와 status를 자르지 않는다. Filter → table → selected detail 순서를 기본으로 한다.

### Panels and interaction

- Panel은 head/body/optional action footer로 구성하고 각 구역은 16px 안팎 padding과 hairline divider를 사용한다.
- Rail, tab, button, input에는 current/hover/focus/disabled state를 구현한다. Focus ring은 최소 2px `high-contrast-focus`다.
- Form은 edit → validation → submit feedback이 동작해야 한다. 실행 action은 confirmation → running → terminal result를 표현한다.
- Empty state는 원인과 가능한 다음 action을 함께 보여주고, 큰 빈 surface 중앙에 `데이터 없음`만 두지 않는다.
- Loading/running state는 기존 layout을 유지하고 반복 action을 disable하며 `aria-live` status를 제공한다. Error는 영향을 받은 field/panel 가까이에 복구 action과 함께 표시한다.
- Drawer/modal/toast는 닫기, keyboard focus 경계와 accessible name을 가진다. 가짜 성공을 기본 상태로 표시하지 않는다.

### Pilot compositions

`admin-voucher-policy-setup`은 정확히 세 panel을 사용한다.

- 왼쪽 위 `정책·회차`, `data-panel-role="context"`: 공식 대상, 데모 회차 대상, 지급 계산, 분기·연간 상한의 네 compact row
- 왼쪽 아래 `작성 항목`, `data-panel-role="form"`: 사업명, 명부 기준일, 지급 예정일, 지급 방식, 미사용 금액 처리 기준, 근거와 panel footer action
- 오른쪽 `검토 증거`, `data-panel-role="evidence"`: 명부 기준일, 지급 예정일, 발행 필요 판단, 종료 처리와 review status

`admin-payout-execution`도 정확히 세 panel을 사용한다.

- 왼쪽 위 `지급 요약`, `data-panel-role="summary"`: 대상, 총액, 예산과 판단에 필요한 compact metrics
- 왼쪽 아래 `준비 gate`, `data-panel-role="gate"`: 준비 상태와 confirmation/실행 action footer
- 오른쪽 `권한·실행 근거`, `data-panel-role="evidence"`: 권한, 실행 조건, 멱등성·처리 원칙과 terminal evidence

Desktop grid는 `minmax(0, 2fr) minmax(320px, 1fr)`에 가깝다. 왼쪽 두 panel을 세로로 두고 오른쪽 evidence panel 하나를 둔다. 1440px에서 전체 page 1200px 이하, 390px에서 중복 없이 2400px 이하를 목표로 한다.

## Do's and Don'ts

### Do

- Source의 사용자용 copy를 정확히 보존하고 긴 text·금액·ID까지 실제 viewport에서 확인한다.
- 현재 actor, 조직 또는 실행 권한을 header나 rail에서 항상 확인 가능하게 한다.
- 하나의 primary action, 조용한 secondary action과 명확한 danger action으로 우선순위를 만든다.
- `min-width: 0`, `max-width: 100%`, wrap/reflow를 명시해 overflow를 예방한다.
- 선택 범위 안의 navigation과 CTA를 실제 screen/state로 연결한다.
- Example/PoC 값은 예시임을 표시하고 authoritative value처럼 보이지 않게 한다.

### Don't

- Gradient, decorative element, illustration, glass effect 또는 card shadow를 추가하지 않는다.
- Primary blue를 배경 tint, informational banner, divider 또는 여러 CTA에 장식적으로 사용하지 않는다.
- 모든 section을 card로 만들거나 card 안에 card를 중첩하지 않는다.
- 모든 key-value row를 회색 rounded box로 만들거나 긴 값을 status pill로 감싸지 않는다.
- Navigation에 의미 없는 dot, 원, 화살표 문자 또는 임의 CSS icon을 추가하지 않는다. Asset이 없으면 명확한 text-only item을 사용한다.
- 서로 다른 screen을 한 dashboard에 합치거나 desktop에서 세 panel을 같은 3-column으로 나열하지 않는다.
- `context`, `form`, `evidence`, `authoritative`, `read-only`, `payoutFormula=`, `needsNewIssuance`, `sameRoundAlreadyStarted` 같은 구조·schema 용어를 visible product copy로 쓰지 않는다.
- Authority context에는 source의 actor·role·organization을 표시한다. `권위 행위` 같은 추상적인 작성용 label을 제품 badge로 만들지 않는다.
- AAWP, workflow ID, run ID, screen count 또는 builder metadata를 product shell에 넣지 않는다.
- Source에 없는 업무 사실, 운영 수치, route 또는 성공 상태를 만들지 않는다.
- Financial amount를 truncate하거나 좁은 metric tile에 강제로 넣지 않는다.
- Mobile에서 desktop layout을 축소만 하거나 action을 숨기지 않는다.

## Agent Instructions

1. 디자인 입력은 이 `DESIGN.md` 하나다. 이전 run, screenshot, CSS, presentation/visual contract와 대화 기억을 읽지 않는다.
2. Source spec은 product meaning에만 사용한다. 불명확한 UX는 제품 화면에 발명하지 말고 manifest `specFeedback`에 기록한다.
3. 요청된 screen만 만들고 각 screen을 canonical `#<screenId>`로 연다. Screen bundle은 navigation이지 content merge가 아니다.
4. Static demo는 `index.html`, `app.js`, `styles.css`, `manifest.json` 네 파일로 만들고 모든 URL을 relative로 유지한다.
5. Manifest는 source와 이 문서의 path/version/digest, 정확한 screen set과 `designInputs: ["DESIGN.md"]`만 기록한다.
6. 구현 전 Overview와 Don't를 먼저 적용하고, 그다음 token을 사용한다. Token이 intent와 충돌하면 restraint와 명시적 금지 규칙을 우선한다.
7. 완료 전 public artifact checker를 실행해 canonical route, exact source copy, product identity, visible authoring label과 static contract를 수정한다.
8. Release verifier는 1440×1100과 390×844에서 panel geometry, page height, overflow, 모든 요청 route의 product navigation 노출, 48px controls, interaction과 accessibility를 독립 판정한다. Verifier를 builder 안에서 실행하거나 수정하지 않는다.

이 문서의 변경은 version을 올린다. 한 화면의 업무 변경은 spec revision이며 여기에 예외를 추가하지 않는다.
