# M7 `spec-to-demo` 구현 결과

기준일은 2026년 7월 15일이다. M7은 다섯 구조의 spec fixture를 scope/requirement/acceptance contract로 compile하고, public brief와 hidden executable source를 분리하며, React/Vite scaffold·coherent builder·verification/repair/delivery·revision benchmark를 하나의 template package로 연결했다. 7월 15일에는 topic/flow 단위 scope selection을 보강했다.

## 완료 범위

- TypeBox 기반 spec document와 spec-to-demo input schema
- artifact/scope/duplicate/max-screen fail-closed validation
- topic/flow `screenGroups`, 사용자 원문 provenance와 structured `scopeSelection`
- unresolved 자연어, unknown group과 invalid group screen reference fail-closed validation
- stable requirement ID, source span과 immutable contract digest
- DOM, navigation, state, network, visual과 a11y acceptance obligation
- public implementation brief와 hidden Playwright source package 분리
- source package digest와 실제 OCI image digest의 별도 binding
- runtime-owned key/value/phase fixture protocol과 missing/duplicate/undeclared 거부
- deterministic React/Vite scaffold와 runtime-owned immutable files
- 한 번의 model gateway 호출을 사용하는 coherent workspace writer
- builder package/runtime file write와 incomplete requirement claim 거부
- build/unit/public E2E/hidden E2E/screenshot/a11y verification plan
- failure-class 기반 bounded repair controller
- evidence tenant/run/branch/product/verifier binding을 확인하는 delivery bundle
- 한 checkout requirement 변경의 explainable cache/revision benchmark
- platform-owned `aawp/demo-bundle/v1` manifest compiler와 `spec-to-demo` output binding

## Fixture와 테스트 증거

| Fixture    | 구조적 차이                                   |
| ---------- | --------------------------------------------- |
| checkout   | 두 screen navigation과 confirmation content   |
| settings   | local state와 visible save feedback           |
| dashboard  | filter interaction과 responsive visual        |
| onboarding | navigation과 accessibility oracle             |
| catalog    | typed search와 runtime fixture/network oracle |

집중 테스트는 다음을 확인한다.

- 다섯 fixture의 deterministic contract/acceptance/scaffold 준비
- 문구 변경 뒤 stable requirement ID 유지와 contract digest 변경
- requirement-only scope selection
- topic/flow group expansion과 사용자 요청 원문 provenance
- unknown·invalid group, unresolved request와 group 확장 후 max-screen fail-closed
- hidden source와 oracle이 builder prompt에 포함되지 않음
- single model invocation과 runtime file write 차단
- fixture protocol completeness
- verifier check completeness와 read-only product 의미
- repair round/repeated finding hard stop
- delivery evidence binding
- revision에서 unrelated 3개 node reuse, 영향 9개 node rerun과 broad regression

## 검증 결과

- M7 focused Vitest: 4개 test file, 18개 test 통과
- package export boundary에서 `compileSpecContracts` 확인
- 전체 Vitest: 45개 test file, 230개 test 통과
- `npm ci`, build, typecheck, lint, format check, schema generation과 whitespace 검사 통과
- 기존 `spec-to-demo` WIR check 성공, simulate 2회 출력 byte-identical

## Heavy spec selection evidence

`refined-production-spec.json` 102개 화면 중 사용자 요청 “정책, 유통, 발행, 준비 관련 페이지 만들어줘”를 다음 22개 화면으로 해소했다.

| Group         | 화면 수 | 선택 기준                                           |
| ------------- | ------: | --------------------------------------------------- |
| 정책          |       6 | 정책 목록·작성·충전·바우처·조건·효과                |
| 유통          |       7 | 현황·대사·대상자·정산·관할 종료·환전·거래 추적      |
| 발행·준비자산 |       9 | 발행 계획·실행·원장·한도·준비금·증명·대사·소각 정산 |

- Source SHA-256: `b4b50cd9c1d2321c8936126c00c3ff242bb88ba5445c26abfffc03187993df33`
- Selection: `examples/heavy-spec-policy-operations/selection-manifest.json`
- Input: `examples/heavy-spec-policy-operations.input.json`
- Demo: `examples/heavy-spec-policy-operations/`
- Bundle: 정책 6개, 유통 7개, 발행·준비자산 9개를 별도 선택 collection으로 제공
- Surface: 관리 콘솔 13개와 발행사 콘솔 9개를 분리하고 screen별 독립 artifact path를 부여
- Fixture 검증: source hash와 102-screen 원본, exact 22 IDs, 6/7/9 group count, 13/9 surface membership, 각 artifact와 source screen의 deep equality, JavaScript syntax, 외부 network 부재

이 demo는 선택 경계, bundle navigation과 source-preserving screen artifact를 확인하기 위한 source-pinned static evidence다. Spec 내부의 흐름·논리적 일관성은 수정하지 않았고, source에 없는 운영 수치도 추가하지 않는다. 이 결과를 model-backed production workflow의 first-pass 품질이나 direct baseline 대비 우위 증거로 사용하지 않는다.

## 남은 operational proof

현재 완료는 template compiler와 실행 계약이다. Hidden source는 Playwright에서 실행 가능하지만 OCI image build, 실제 browser run, screenshot baseline 승인, axe 결과 publish를 아직 수행하지 않았다. Coherent builder test도 fake provider를 사용하므로 실제 모델 first-pass 품질 측정이 아니다.

따라서 다섯 fixture demo의 실제 build/E2E evidence와 동일 frozen verifier를 사용한 DIRECT 대조 cohort가 나오기 전에는 M7 운영 완료 또는 workflow 우위를 선언하지 않는다. 다음 작업은 source package image builder adapter, generated workspace materializer와 browser evidence publisher를 붙이는 것이다.
