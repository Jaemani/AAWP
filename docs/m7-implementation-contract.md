# M7 구현 계약

이 문서는 `spec-to-demo` template의 M7 규범이다. Template 특수 규칙은 코어 compiler와 runtime에 넣지 않고 `@awf/spec-to-demo` workspace가 소유한다.

## 입력과 contract compiler

- 입력은 `specArtifactId`, 선택 scope, `web-react` profile, viewport와 screen/dependency/accessibility constraint를 가진다.
- Spec document는 stable document, screen, requirement source key와 원문 source span을 가진 구조화 artifact다.
- Input artifact ID와 document source artifact ID가 다르거나 screen/requirement key가 중복되면 compile을 거부한다.
- Scope selector는 screen ID, requirement key 또는 `screen/requirement`를 사용하며 unknown selector와 `maxScreens` 초과를 거부한다.
- Requirement ID는 `documentId + screenId + sourceKey`의 digest로 만들고 원문 변경과 분리한다.
- Scope, requirement와 acceptance contract는 canonical content digest를 가진다.

## Acceptance와 visibility

- Acceptance obligation은 requirement ID, route, precondition, user/external-system action과 DOM/navigation/state/network/visual/a11y oracle을 가진다.
- Public brief는 requirement 문장, 공개 criterion, route, write/dependency 범위, viewport, accessibility와 fixture protocol만 포함한다.
- Hidden package는 acceptance JSON, fixture protocol manifest, semantic-role Playwright source와 전용 package manifest를 포함한다.
- Hidden runner는 visual과 a11y obligation에 실행 tag를 붙이고 unsupported/missing fixture를 성공으로 처리하지 않는다.
- Hidden source package digest는 file content digest다. OCI image digest가 아니므로 `bindHiddenVerifierImage`는 실제 build 후 받은 pinned image reference만 M6 verifier definition으로 만든다.

## Fixture protocol

- Product와 verifier는 `awf/fixture/v1`과 `/__awf/fixtures/:key` endpoint 계약을 공유한다.
- Public brief에는 필요한 key만 공개하고 payload는 전달하지 않는다.
- Runtime fixture bundle은 key, phase, status와 payload schema를 사용한다.
- Acceptance가 선언한 fixture 누락, 중복과 미선언 fixture를 모두 거부한다.
- Hidden runner는 page navigation 전에 runtime fixture route를 설치한다.

## Scaffold와 coherent builder

- Runtime은 package, TypeScript/Vite config, entry point와 generated requirement module을 byte-stable하게 만든다.
- Runtime-owned file은 immutable이고 builder는 `src/**`와 `public-tests/**`의 mutable file만 쓸 수 있다.
- Package/dependency와 generated requirement module 변경은 거부한다.
- Builder는 public brief와 scaffold만 받는 한 번의 model gateway invocation으로 전체 workspace를 쓴다.
- Builder output은 JSON schema를 통과해야 하며 모든 public requirement ID 구현을 명시해야 한다.
- Hidden package, oracle과 fixture payload는 builder request에 포함하지 않는다.

## 검증, repair와 delivery

- Verification plan은 build, unit, public E2E, hidden E2E, screenshot과 accessibility check를 선언한다.
- 모든 verifier는 product read-only mount를 사용하고 build/hidden E2E는 broad regression이다.
- Repair controller는 M6 failure class와 allowed write를 재사용하며 round와 repeated finding hard limit을 가진다.
- Delivery bundle은 evidence schema와 digest를 재검증하고 tenant, run, branch, product digest, verifier identity, outcome, blocking finding과 required evidence를 확인한다.
- Product workspace에서 hidden source path가 발견되면 delivery를 거부한다.

## Revision benchmark

- Checkout confirmation requirement 하나만 바꾸는 immutable child revision을 사용한다.
- Requirement compile에서 builder와 unit/public/hidden/visual/a11y downstream만 invalidation한다.
- `assets`, `dependency-install`, `scaffold`는 parent fingerprint artifact를 재사용한다.
- `broad-smoke`는 cache evidence와 관계없이 mandatory rerun한다.
- Parent branch snapshot은 revision 후 byte-identical하게 남아야 한다.

## 현재 운영 증명 경계

- Template은 실행 가능한 Playwright source와 pinned-image binding 계약을 생성하지만 실제 OCI image를 빌드하지 않는다.
- Repository test는 fake model provider와 sandbox contract를 사용한다. 실제 모델 first-pass 성공률, browser screenshot baseline과 a11y 결과는 아직 측정하지 않았다.
- Generated React workspace의 `npm install`, browser 실행과 5개 fixture demo artifact publish는 후속 M7 operational harness에서 수행한다.
- 동일 frozen verifier를 사용하는 DIRECT 대조 실험 결과는 아직 없으므로 workflow 우위를 주장하지 않는다.
