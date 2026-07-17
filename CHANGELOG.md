# 변경 기록

형식은 사용자·운영자에게 영향을 주는 변경을 중심으로 기록한다. 아직 안정 release 전이므로 날짜별 update note를 사용한다.

## 2026-07-17

### Compiled Demo 실행 계약과 최대 2회 단조 수정

- `spec-to-demo`를 0.7.3으로 올렸다. `compile-demo-scope`가 heavy canonical Spec을 builder에 직접 넘기지 않고 선택된 8개 화면의 flow, command, authority, state machine, API/data binding과 19개 executable browser evidence를 `demo-execution-contract.json`으로 고정한다.
- Builder는 compiled execution contract만 제품 입력으로 읽는다. 원본 Spec 경로 탐색과 이전 Demo 참조는 금지하며 `DESIGN.md`만 시각 입력으로 사용한다.
- 초기 검증 뒤 첫 bounded repair, 전체 acceptance 재검사, 조건부 두 번째 repair, 최종 독립 검증 순서로 workflow를 확장했다. 두 번째 repair는 이전 finding ID가 반복되지 않고 blocking finding 수가 감소할 때만 허용하며 세 번째 repair나 자동 전체 재생성은 없다.
- Repair 전 Demo snapshot을 보존한다. 모델 실패, 허용 write-set 이탈 또는 public contract 실패 시 candidate를 자동 복원한다. Layout finding은 `styles.css`만 수정할 수 있다.
- Browser verifier가 actor `<select>`의 option을 직접 클릭하던 오류, check마다 중복 navigation하던 구조와 assertion 메시지에 Playwright Locator를 직렬화해 메모리가 고갈되던 오류를 교정했다. 각 evidence check는 독립 Chromium context에서 실행하고 stable finding을 한 번에 수집한다.
- 청년기본소득 Excel 시나리오 확장 run `run_8f200844-2786-4ae1-b09d-aca120c313b8`은 8개 canonical route와 19개 browser evidence를 통과했다. 초기 업무 finding 4건은 첫 repair에서 닫혔고 새 overflow finding 2건만 남아 `4 → 2` 단조 감소가 확인된 뒤 CSS-only 두 번째 repair를 수행했다. 최종 S1 verdict는 passed다.
- 실제 측정은 13분 30.0초, model 3회, 총 2.68M tokens였다. 기능적 검증은 성공했지만 builder 비용은 여전히 높으므로 다음 최적화는 deterministic Demo shell/runtime과 모델 생성 데이터·행동 정의의 분리다.

### Canonical Demo 진입점과 legacy projection 차단

- `spec-to-demo` 0.6.0 selection contract가 `entryScreenId`, `activeDemoJourneyId`, deprecated screen과 structured conflict를 기록한다. 요청 배열 첫 항목을 기본 route로 간주하지 않는다.
- Deprecated screen이 requested/selected screen, active acceptance 또는 active storyboard에 남으면 model 호출 전에 `selection-conflict`로 실패한다. 여러 active journey에 선택 ID가 없는 경우도 동일하다.
- `spec-feedback-to-spec` 0.3.0 semantic compiler가 같은 모순을 child revision 단계에서 Demo blocker로 거부한다. Source projection은 관련 acceptance scenario·storyboard·현재 scope를 포함해 patch model이 legacy 의미를 놓치지 않게 한다.
- Demo verifier가 hash 없는 run 주소의 실제 초기 route를 열어 `#<entryScreenId>` 진입을 확인한다.
- 청년기본소득 공통 관리콘솔 교정은 Demo 파일을 직접 수정하지 않고 `기존 child + stable-ID feedback → 새 child → spec-to-demo`로만 수행한다.

### S1 전체 finding 수집과 Spec/Demo 오류 분리

- Verifier만 바뀐 경우 전체 model build를 반복하지 않도록 immutable Demo reverify 경로를 추가했다. Reverify는 source run status를 바꾸지 않고 Demo/input/verifier/workflow digest와 25개 evidence verdict를 별도 저장한다. Studio는 failed execution과 최신 S1 reverify pass를 함께 표시하고 검증된 snapshot만 onboard할 수 있다.
- `spec-to-demo` 0.5.3은 `input-preserved-on-error` 자체가 action surface를 요구한다는 assertion implication을 verifier에 반영했다. 명시적인 `action-specific-surface` 문자열이 없는 error check도 action을 열고 입력·오류·보존을 검증한다.
- `spec-to-demo` 0.5.2는 이미 보이는 action surface의 command를 verifier가 먼저 클릭하고 다시 submit하던 이중 실행을 제거했다. Submit 탐색을 surface 내부로 제한하고, 오류 trigger와 정상 submit 분리, action별 입력 소유권, duplicate rejection의 사후 증거, source-screen state 관측을 실행 계약으로 명시했다. Bounded repair도 동일한 workflow 계약을 읽는다.
- `spec-to-demo` 0.5.1은 browser evidence check를 첫 assertion에서 중단하지 않고 서로 격리해 모두 실행한 뒤 stable check ID별 finding으로 한 번에 보고한다. 한 번뿐인 bounded repair가 첫 결함만 보고 다음 결함에서 다시 실패하던 구조를 제거했다.
- Demo 역할 control이 button뿐 아니라 stable actor value를 가진 `select`여도 verifier가 실제 역할을 전환한다. 오류 입력 검증은 숨겨진 error message가 아니라 화면에 보이는 deterministic error trigger만 클릭한다.
- `navigates` browser assertion을 추가하고 screen-target action에 command form/state assertion을 붙이면 Spec revision을 거부한다. Verifier는 계측 marker 대신 click 뒤 canonical target hash로 실제 이동했는지 확인한다.
- 과거 detail pilot의 범용 `validation/confirm/running/success` 문자열 정규식을 release gate에서 제거했다. 상태 요구는 선택된 Spec의 executable evidence가 실제 행동으로 소유한다.
- `spec-feedback-to-spec` 0.2.1 semantic compiler가 여러 evidence check 사이의 `screenId + actorId + actionId` visibility 계약도 비교한다. 같은 역할의 같은 action을 한 check에서 `hidden`, 다른 check에서 visible/clickable로 요구하면 `ACCEPTANCE_ACTION_VISIBILITY_CONTRADICTED` Demo blocker로 거부한다.
- 청년기본소득 교정 child Spec은 파일 반입 positive check를 명부 운영자, negative hidden check를 명부 결재자로 분리했다. Spec revision은 통과했지만 실제 Demo evidence 전이므로 `S0 passed / S1 blocked / S2 blocked / S3 out-of-scope`를 유지한다.
- Scope compiler는 S1 flow/evidence가 요구하는 필수 screen과 선택된 허브가 링크하는 optional navigation target을 분리한다. 역할 진입 화면 하나를 추가했을 때 모든 업무 메뉴 10개가 필수 scope로 연쇄 확장되던 과잉 closure를 막고, out-of-scope navigation은 계약에 별도로 설명한다.

### Artifact workflow와 Demo lifecycle 분리

- Catalog에서 Demo를 출력하지 않는 workflow는 성공 뒤 `artifacts/demo/index.html` snapshot을 요구하지 않는다. `spec-feedback-to-spec`가 valid Spec artifact를 만든 뒤 Demo 파일 부재로 run 전체를 실패 처리하던 Studio 결합 오류를 고쳤다.
- 회귀 test는 Demo source가 없는 artifact-only workflow가 `completed`, snapshot materialization이 `not_applicable`, `demo` record가 없음으로 끝나는지 검증한다.

## 2026-07-16

### Spec-to-demo 의미 projection과 S1 click evidence

- Requested-screen projection을 v2로 올려 flow, authority, state machine, Data/API binding, acceptance, assumption, storyboard와 mock-data dependency를 보존한다.
- `compile-demo-scope` deterministic node가 필요한 결재·인계 화면 누락을 모델 호출 전에 `scope-expansion-required`로 차단하고 selection contract artifact를 남긴다.
- Prose-only acceptance는 더 이상 S1을 통과하지 않는다. Executable check가 정의돼도 실제 Demo click evidence 전에는 `DEMO_EVIDENCE_PENDING`으로 blocked다.
- Feedback parser가 `## FB-EVD-S1-001`처럼 heading level과 segment가 확장된 stable ID를 인식하도록 교정했다.

### Preview Data/API 계약과 fail-closed 임시 DB

- `@awf/preview-contracts`를 추가해 canonical Spec의 logical entity, query, command와 screen binding을 source digest에 고정하는 `DataContract`·`ApiContract`를 만든다.
- S2 finding을 `data`, `api`, `authority`, `environment`, `product-decision`으로 routing하고 owner/question을 보존한다.
- `PreviewEnvironmentPort`와 PGlite local adapter를 추가했다. Ready 계약에서만 contract registry, append-only resource version, idempotency replay와 lease expiry를 검증한다.
- Blocked 계약은 environment provision을 거부한다. DB 제품·물리 table·PII 저장소와 API transport/status code는 근거가 없으면 `unresolved`로 남는다.
- `spec-feedback-to-spec` verification output에 `data-contract.json`, `api-contract.json`, `preview-blocker-routing.json`을 연결했다.
- 청년기본소득 child Spec은 14 entities, 8 queries, 12 commands, 8 bindings으로 컴파일됐지만 S2 blocker 14건 때문에 Preview 환경을 만들지 않았다.

### Demo source 외 기간별 record 차단

- 3화면 청년기본소득 Demo에서 selected screen copy에 없는 `청소년 교통비 2026년 2분기` 행이 임의 생성됐음을 재검증으로 발견했다.
- Public checker와 independent verifier가 selected screen copy/request에 없는 `20XX년 N분기` product record를 차단하도록 보강했다.
- 완료된 결함 run은 수정하지 않고 offboard inspection evidence로 보존한다.

### Workflow catalog와 실제 웹 실행 입력

- `workflows/catalog.json`과 `GET /api/workflows`를 추가해 Studio에서 workflow를 선택할 수 있게 했다. `spec-to-demo`와 `spec-feedback-to-spec`은 각각 typed launcher와 execution manifest가 있을 때만 실행되며, manifest가 없는 workflow는 상태와 이유를 표시하고 Run을 비활성화한다.
- `spec-to-demo`의 raw JSON 입력을 source spec 상대경로, screen ID 집합과 요청 원문으로 구성된 typed launcher로 교체했다. Run 버튼은 새 pinned request를 만든 뒤 등록된 `codex exec → inspect → bounded repair → verify` local process를 실제 실행한다.
- Source path는 project workspace 내부 상대경로만 허용하고 `..`, 절대경로와 workspace 밖 symlink를 거부한다. 선택 screen projection, 원본 digest와 현재 `DESIGN.md` version/digest는 `runs/requests/<requestId>`에 보존한다.
- Run history를 workflow별로 필터링하고 `/?run=<runId>`가 해당 run의 workflow graph를 자동 복원하도록 했다.
- 기본 실행 위치를 checkout 절대경로 대신 `Project workspace · N local steps`로 표시한다. 실제 cwd와 argv는 `Technical details`와 run evidence에만 보존한다.
- Token summary를 `1.23K`, `925.8K`, `1.23M` 형식으로 압축했다. Input/cached/output/reasoning의 정확한 정수값과 telemetry coverage는 tooltip과 run record에 유지한다.
- `spec-feedback-to-spec` WIR node에 기능적 작업명과 구현 설명을 추가해 workflow strip이 기술 ID만 나열하지 않게 했다.

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
- `DESIGN.md` 1.10.1에서 Consumer/Merchant mobile header의 neutral surface는 유지하되 짧은 brand eyebrow 또는 작은 marker 한 곳에 전용 `brand-accent`를 사용하도록 명시했다. Header 전체나 screen title 전체를 blue로 채우는 것은 계속 금지한다.
- Layout QA가 screen-reader용으로 clip된 canonical route를 1px overflow로 오판하던 문제를 고쳤다. 반대로 실제 product navigation link가 scroll container 밖에 가려지는 경우는 ancestor clip 영역까지 계산해 실패시킨다.
- Detail pilot release는 정적 `running` 문자열 존재만 보지 않는다. 정책 필수값 오류→정상 상신과 지급의 초기 차단→발행 검토 요청→재인증→확인→실행 중→terminal result를 실제 browser action으로 검증한다.
- 실패 run에 정상적인 static demo 파일이 남아 있으면 상태를 바꾸지 않고 `Failed candidate · inspection only` snapshot으로 보존한다. Studio iframe과 `Open demo`에서 볼 수 있지만 onboard는 거부한다.
- Execution timeline의 event offset과 node duration을 `0.016s`, `4m55.6s`, `1h2m3.4s` 같은 가변 `h/m/s` 단위로 통일했다. Snapshot materialization은 `ms` 대신 `s`로 표시한다.
- 상단 `End-to-end time` 카드가 별도 formatter 때문에 `465.9 s`로 남던 회귀를 제거하고 execution timeline과 같은 `7m45.9s`, `1h2m3.4s` formatter를 사용하도록 통일했다.
- `RunCompleted`와 `RunFailed`는 event offset이 이미 전체 실행시간이므로 동일한 `durationMs`를 다시 붙이지 않는다. Timeline 종결 행은 `7m45.9s · RunFailed`처럼 한 번만 표시한다.
- Execution timeline은 이미 run 시작 기준 경과시간이라는 문맥이 분명하므로 각 offset 앞의 `+` 기호를 제거했다. 종결 행은 `7m45.9s · RunFailed`로 표시한다.
- 같은 표시 시각에 연속된 event는 첫 행에만 elapsed time을 표시한다. `ModelCompleted`/`VerifierCompleted`가 이미 node duration을 보여주면 뒤따르는 `NodeCompleted`에서는 같은 duration을 반복하지 않으며, duration source가 없는 deterministic node와 `NodeFailed`는 계속 자체 시간을 표시한다.
- WIR node에 optional `displayName`과 `description`을 추가했다. Studio의 workflow strip과 node 상태는 기능적 작업명과 구현 산출물 설명을 표시하고, execution timeline은 같은 설명을 node의 첫 event에만 붙인다. 기술 ID는 보조 정보와 tooltip으로 유지한다.
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
