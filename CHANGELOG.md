# 변경 기록

형식은 사용자·운영자에게 영향을 주는 변경을 중심으로 기록한다. 아직 안정 release 전이므로 날짜별 update note를 사용한다.

## 2026-07-15

### 독립 demo 검사와 form layout QA

- Snapshot이 있으면 onboard/offboard 상태를 변경하지 않고 새 탭에서 여는 `Open demo`와 `/runs/<runId>/demo-preview/` local inspection 경로를 추가했다.
- 공개 `/demo/`의 onboard gate는 유지하고 preview에도 동일한 run 검증, path traversal·marker 차단과 delete lifecycle을 적용했다.
- `DESIGN.md`를 1.2.0으로 올려 native select/input 48px geometry, field/action 간격, text·금액 overflow와 Playwright 1440px/390px 검증을 명시했다.
- Pilot에서 확인된 select 45.33px 대 date input 48px 불일치, 금액 card overflow와 sticky action의 field 겹침을 교정했다.

### `DESIGN.md` compact detail refinement

- 동일 source의 기존/신규 pilot을 Playwright 1440px·390px에서 비교해 panel 수, page height, border, typography와 identity 차이를 측정했다.
- `DESIGN.md`를 1.3.0으로 올려 제품 shell에서 AAWP identity를 금지하고 source product identity, compact governance header와 panel head/body/action anatomy를 명시했다.
- Configuration의 연령·상한·일정 같은 문맥을 큰 KPI tile로 만들지 않고 key-value row로 표현하며, 기본 구성을 context + form + evidence로 제한했다.
- Focused configuration의 1180px content 폭, `surface-strong` hairline, 18px panel title, 13–14px dense text와 1440×1100 first-viewport 목표를 추가했다.

### Browser-gated detail refinement

- `DESIGN.md`를 1.4.0으로 올려 두 pilot의 정확한 세 panel layout, panel 내부 action footer, mobile 390px 폭·2400px 높이 한계와 text glyph icon 금지를 명시했다.
- 공용 Playwright layout QA를 CLI와 `spec-to-demo` release verifier가 함께 사용하도록 연결했다. Input/select 높이, 비의도 overflow, field/action overlap, action divider와 pilot page height를 snapshot 승격 전에 검사한다.
- 1.3.0 결과를 새 verifier로 재검증해 Unicode navigation icon이 실제로 release를 실패시키는 것을 확인했다.
- `file://`에서 script가 실행되지 않은 빈 shell과 hash-only navigation state를 검사해 false pass한 오류를 수정했다. Verifier는 임시 local HTTP server와 화면별 fresh navigation을 사용한다.
- `DESIGN.md` 1.5.0에 canonical product brand, policy pilot의 panel별 정보 책임, 사용자용 projection copy와 구조용 영문 label 금지를 추가했다.
- `DESIGN.md` 1.6.0에 dark authority rail, 2-column focused layout과 panel role marker를 추가하고 computed rail color·desktop/mobile geometry·48px control 높이를 release acceptance로 검증한다.
- 1.45MB heavy spec 전체를 두 화면 builder context에 넣어 stream disconnect와 약 90만 input token을 유발하던 구조를 수정했다. Request 생성 시 선택 screen과 직접 참조 actor/component/interaction만 deterministic projection으로 고정하고 원본 digest는 별도 provenance로 보존한다.
- Build model이 독립 verifier를 sandbox 안에서 반복 실행하며 localhost/Chromium 권한 오류를 추적하던 책임 중복을 제거했다. Builder는 artifact 문법만 확인하고 종료하며 Playwright와 release 판정은 등록된 `verify-release` node만 수행한다.
- Builder 종료 전에 실행하는 browserless public artifact checker를 추가했다. 네 필수 파일·JavaScript 문법·manifest schema, 선택 화면의 canonical ID/hash route·정확한 source copy·canonical product identity·제품 UI로 노출된 구조용 영문 label, `DESIGN.md`의 rail token·240px desktop shell·1280px/600px breakpoint를 한 번에 검사하고 누락 위치를 짧게 보고한다.
- 독립 release verifier는 public checker와 분리된 상태로 실제 HTTP/Playwright layout·interaction acceptance를 계속 소유한다.
- `DESIGN.md` 1.7.0을 YAML front matter의 portable token과 `Overview → Colors → Typography → Layout → Elevation → Components → Do's and Don'ts → Agent Instructions`의 결정 중심 prose로 재구성했다. 380줄/25KB에서 204줄/14KB로 줄이고, primary/authority 색 사용 의도, flat card, 정보 밀도, responsive edge case와 금지 규칙을 명시했다.
- 구조용 영문 `evidence` 노출을 금지하면서 payout pilot 제목에는 `권한·실행 evidence`를 요구하던 1.6.0의 내부 모순을 `권한·실행 근거`로 교정했다.
- 동일 source의 1.4.0/1.7.0 결과를 같은 viewport에서 비교하고 `DESIGN.md` 1.8.0에 box와 badge의 사용 경계를 추가했다. 일반 key-value는 flat divider row, badge는 짧은 상태 label만 사용하며 긴 문장·금액·ID를 pill로 감싸거나 navigation에 장식 점을 만드는 것을 금지했다.
- Empty/loading/error의 layout 유지, 중복 action disable, 복구 action과 live status 규칙을 추가하고 root `AGENTS.md`가 `spec-to-demo`의 유일한 시각 입력으로 `DESIGN.md`를 명시하도록 연결했다.
- Public checker가 JavaScript template interpolation의 비가시 `data-panel-role` 값을 visible authoring label로 오인하던 문제를 수정하고 회귀 test를 추가했다.
- Layout QA가 Studio의 HTTP 404 `demo_not_found` JSON을 빈 정상 화면으로 통과시키던 문제를 수정해 navigation status가 성공이 아니면 실패하도록 했다.
- `DESIGN.md` 1.9.0에서 지급 summary를 desktop 2×2/mobile 1-column metric으로 고정하고 금액 줄바꿈, raw `payoutFormula`·내부 schema 이름과 추상적인 `권위 행위` badge를 금지했다. Layout QA와 public checker가 이 조건을 실행 가능하게 검사한다.
- `DESIGN.md` 1.10.0에서 mobile 2–4 route는 모두 동시에 보여야 하고, 더 큰 묶음은 명시적인 menu/overflow control을 가져야 한다고 규정했다. 표시 없는 horizontal scroll 뒤에 요청 화면을 숨기는 구현은 release verifier가 거부한다.
- Layout QA가 screen-reader용으로 clip된 canonical route를 1px overflow로 오판하던 문제를 고쳤다. 반대로 실제 product navigation link가 scroll container 밖에 가려지는 경우는 ancestor clip 영역까지 계산해 실패시킨다.
- Detail pilot release는 정적 `running` 문자열 존재만 보지 않는다. 정책 필수값 오류→정상 상신과 지급의 초기 차단→발행 검토 요청→재인증→확인→실행 중→terminal result를 실제 browser action으로 검증한다.
- 실패 run에 정상적인 static demo 파일이 남아 있으면 상태를 바꾸지 않고 `Failed candidate · inspection only` snapshot으로 보존한다. Studio iframe과 `Open demo`에서 볼 수 있지만 onboard는 거부한다.
- Execution timeline의 event offset과 node duration을 모두 초(`s`) 단위로 통일했다. Snapshot materialization도 `ms` 대신 `s`로 표시한다.
- `DESIGN.md` 변경만으로 model workflow를 자동 재실행하지 않는 운영 규칙을 추가했다. 명시적 재생성 시에도 고정된 대표 2–3화면 cohort만 사용한다.
- Token coverage는 `required` node의 보고 여부로 판정하고 `optional` node usage는 있을 때 합산하도록 교정했다. 초기 verifier 통과로 optional repair가 model을 호출하지 않은 run도 실제 build usage를 `measured/complete`로 표시한다.

### 단일 run root와 self-contained workflow

- 모든 local history를 `runs/history.jsonl`, 최신 record·input·log·artifact·demo를 `runs/<runId>/`에 저장하도록 기본 경로를 통일했다.
- 세 legacy `.awf` history의 22개 run과 15개 demo snapshot을 원본 삭제 없이 통합하는 importer를 추가했다.
- `spec-to-demo` 0.3.0을 WIR, execution manifest, `WORKFLOW.md`, 독립 verifier가 한 bundle을 이루는 대화 비의존 실행 단위로 만들었다.
- Request 생성 command가 source spec을 `runs/requests/<id>`에 고정하고 source와 `DESIGN.md` byte SHA-256을 기록한다.
- `DESIGN.md` 1.1.0에 기존 presentation token, web/mobile composition, interaction과 접근성 규칙을 흡수했다.
- 새 demo builder의 디자인 입력을 `DESIGN.md` 하나로 제한하고 이전 demo/CSS, presentation contract와 visual reference 사용을 verifier에서 거부한다.
- File artifact가 `base: executionDirectory`를 선언해 `runs/<runId>` 내부에 저장될 수 있도록 하고 root 탈출을 거부한다.
- `ModelInvoked`를 실제 LLM process 시작 시점에, usage와 duration은 새 `ModelCompleted` 종료 event에 기록한다.
- Metadata store가 먼저 run directory를 만든 경우 executor가 `EEXIST`로 실패하던 통합 root 충돌을 수정했다.

### AAWP Studio identity와 실행 console

- 제품 표기를 `AAWP Studio`와 `Adaptive Artifact Workflow Platform`으로 통일했다.
- workflow ID인 `spec-to-demo`를 제품 subtitle에서 제거했다.
- 화면 위계를 workflow 실행 → run 기록 → 선택 결과로 정리했다.
- WIR node와 output port를 실제 local process argv에 1:1로 연결하는 strict execution manifest를 추가했다.
- 실행기가 없으면 Run을 비활성화하고 simulation record를 만들지 않으며, 실행 중에는 running snapshot과 node 상태를 5초마다 갱신한다.
- `/?run=<runId>` dashboard deep link, run별 demo preview/open/delete를 추가했다.
- demo snapshot 삭제 후에도 append-only run/event 기록은 보존한다.
- 새 demo snapshot을 기본 offboard 상태로 만들고 `Onboard demo`, `Offboard demo`, `Delete demo` lifecycle을 추가했다.
- Offboard는 URL 제공만 중단하며 Delete도 input file, source와 run/event를 변경하지 않는다.
- 새 demo를 onboard하면 이전 active demo를 자동으로 offboard해 한 번에 하나의 run URL만 공개한다.
- Simulation event에 run 시작 기준 monotonic `elapsedMs`와 node `durationMs`를 기록해 sequence와 시간이 역전되던 오류를 수정했다.
- Studio의 primary timeline을 실제 `Execution timeline`으로 교체하고 과거 `DETERMINISTIC_SIMULATION` 기록은 `legacy`로 표시한다.
- Run별 end-to-end wall clock, input validation, 실제 process 실행과 결과 snapshot materialization 시간을 분리해 측정한다.
- Codex JSONL과 `AAWP_EVENT model_usage`에서 input/cached/output/reasoning token을 합산하고, LLM node의 usage 누락을 실패 처리한다.
- 모든 node가 비모델로 명시된 실제 execution에서만 `0 tokens · 0 calls`를 measured로 허용한다.
- Run별 input, stdout/stderr 로그, 실제 file/stdout artifact hash와 executor 경로를 `runs/<runId>`에 보존한다.
- Run ID를 trace ID로 사용하고 workflow, input, trace digest를 한곳에서 역추적할 수 있게 했다.

### `spec-to-demo` 범위 선택

- 기존 screen/requirement selector에 구조화된 `scopeSelection`을 추가했다.
- 정규화된 spec의 `screenGroups`가 `topic`과 `flow` 묶음을 선언할 수 있다.
- 사용자 요청 원문, 선택한 group과 최종 screen/requirement 집합을 scope contract에 기록한다.
- 자연어 요청이 명시적 ID로 해소되지 않았거나 group이 잘못된 경우 compile을 fail-closed한다.
- Selection 누락을 전체 화면 요청으로 해석하지 않고 명시적 all selection을 요구한다.
- 102-screen production spec에서 “정책, 유통, 발행, 준비” 요청을 정책 6개, 유통 7개, 발행·준비자산 9개의 명시적 22-screen selection manifest로 고정한 demo fixture를 추가했다.
- 이 fixture는 source spec의 흐름·논리 교정을 하지 않는다. 해당 책임은 별도 `spec-feedback-to-spec` workflow 경계로 남겼다.

### Demo bundle과 screen 보존

- `@awf/demo-bundle`과 `aawp/demo-bundle/v1`을 추가해 bundle, surface, topic/flow group과 독립 screen artifact를 platform contract로 만들었다.
- 22-screen demo를 정책, 유통, 발행·준비자산 세 bundle로 나누고 관리 콘솔 13개와 발행사 콘솔 9개 surface를 분리했다.
- 기존 4개 공통 layout과 임의 mock 수치를 제거하고 각 screen artifact가 source screen의 layout, components, states, copy와 dataNeeds를 그대로 보존하게 했다.
- Viewer는 bundle → surface → screen을 전환하며 web/mobile/tablet form factor를 같은 manifest로 처리한다.
- 관리 콘솔·발행사 콘솔 screen 안에 source-defined 240px product nav rail과 authority chrome을 복원했다.
- Screen artifact가 source navigation, affordance, reachable state, resolution과 spec feedback을 함께 보존한다.
- 정책 작성 CTA, 조건 빌더 이동, 발행 계획 → 상세, 발행 실행 → 원장, 준비자산 ↔ PoR 등 source에 명시된 screen transition을 실제로 연결했다.
- Source target이 selection 밖이면 범위 안내를 표시하고, 불명확하면 임의 해석 대신 feedback으로 남긴다.
- 22개 screen별 table, form, filter, stepper, drawer와 submit feedback을 demo interaction으로 구현했다. 표시 수치는 예시 데이터로 구분한다.
- Stitch에서 전달된 `Gyeonggi Integrated Wallet` presentation contract를 pinned YAML과 생성 CSS token으로 추가하고 console adapter를 `0.2.0`으로 올렸다.
- Bundle·surface·screen 선택을 상단 switcher로 옮겨 AAWP 결과 navigator와 제품의 240px console rail이 이중 좌측 패널로 보이던 문제를 제거했다.
- Studio preview sandbox에 self-origin popup 권한을 제한적으로 추가하고 독립 화면 URL을 절대 주소로 만들어 `독립 화면 열기`가 nested preview에서도 동작하게 했다.
- 독립 화면에서 source CTA를 누르면 bundle viewer로 돌아가지 않고 target screen의 독립 주소로 직접 전환한다.
- 상태 배지는 semantic foreground/background token과 로컬에 포함한 Lucide 아이콘을 함께 사용한다.
- 제품 화면에서 route, purpose와 spec feedback count 같은 authoring metadata를 제거하고 `screen.copy.title`을 사용자용 제목으로 사용한다.
- 사용자가 선택한 `run_bf24…` 정책 콘솔을 pinned visual reference contract로 추가하고, generic console adapter `0.3.0`에 짙은 authority rail, 단일 shell, 흰 governance header와 고밀도 업무 패턴을 복원했다.
- Navigation의 문자 placeholder를 source icon name과 대응하는 로컬 Lucide asset으로 교체했다.

### `spec-feedback-to-spec`

- Pinned source와 feedback을 allowed JSON Pointer contract로 compile하는 새 workflow template을 추가했다.
- Add/replace/remove patch materialization, source drift·권한 이탈·unknown feedback·no-op 거부를 구현했다.
- Domain profile validator와 required pointer 검증을 통과하고 사람 승인을 받은 candidate만 새 spec artifact로 승격한다.
- 원본 spec은 직접 수정하지 않으며 WIR check와 focused test를 추가했다.
- 102-screen 경기 통합월렛 spec용 profile validator를 추가해 root·stable ID·route·component/actor/nav/interaction 참조, 기존 entity 보존과 admin/issuer authority root 분리를 검사한다.
- 담당자별 화면그룹 피드백을 13개 stable feedback ID, allowed JSON Pointer root와 삭제 금지를 가진 intent artifact로 컴파일했다.
- 76개 typed patch operation으로 102-screen 원본을 보존한 110-screen role-workspace child candidate를 만들고 structural/profile verifier를 통과했다.
- 기존 `admin-roster-builder`를 명부 업로드·검증으로 재사용하고 나머지 필수 업무 화면 8개, 역할별 navigation, 분리된 policy/roster/payout/issuance state와 첫 PoC 15화면 storyboard를 추가했다.
- Candidate는 승인하지 않았으며 원본, 디자인 계약과 관련 없는 소비자·가맹점 화면을 변경하지 않는다.
- 완전한 child spec 내부 `meta.revision`에 parent/contract digest, 13개 feedback ID와 candidate 상태를 넣고 실행 입력을 이 단일 문서로 고정했다.
- 원본/feedback candidate를 8개 담당 업무별 1–2화면으로 전환하는 비교 demo를 추가했다. 원본에 없는 지급 전용 화면은 임의 생성하지 않고 gap으로 표시한다.

### 문서

- 루트 README를 플랫폼 핵심과 현재 증명 경계 중심으로 재구성했다.
- 사용자 가이드, 핵심 개념, ADR index, 공개 참고 자료와 오류·교정 기록을 추가했다.

## 2026-07-14

- M1–M9 compiler, artifact/event plane, Temporal adapter, gateway, impact engine, verifier control, `spec-to-demo`, value router와 Studio projection을 구현했다.
- heavy production spec에서 102개 중 3개 대표 화면 demo slice를 만들고 run ID별 snapshot으로 제공했다.
- 전체 자동 검증 기준 43개 test file, 220개 test를 통과했다.
