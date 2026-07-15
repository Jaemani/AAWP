# 오류·교정 기록

실패를 숨기지 않고 사용자 영향, 원인, 교정과 재발 방지를 기록한다. 단순 typo나 테스트 중 의도된 failure는 제외한다.

## Studio가 기능을 많이 노출해 핵심 작업이 보이지 않았다

- 관찰: 초기 화면에서 editor, diff와 여러 control이 실행·기록보다 앞에 보여 사용자가 무엇을 만들었는지 파악하기 어려웠다.
- 원인: control-plane에 존재하는 기능을 한 화면에 모두 노출하면 유용할 것이라고 가정했다.
- 교정: 기본 console을 `Run workflow → Runs → Result`로 제한하고 editor·impact·approval은 API 또는 별도 관리 surface에 남겼다.
- 재발 방지: 새 control은 빈도, 권한과 실패 복구 필요성을 설명하지 못하면 기본 실행 화면에 추가하지 않는다.

## 실행 중 상태가 보이지 않았다

- 관찰: local simulation이 빠르게 완료되어 사용자가 눌렀는지, 아직 실행 중인지 알 수 없었다.
- 원인: 서버 최종 record만 렌더링하고 request 직후의 UI 상태를 모델링하지 않았다.
- 교정: button `aria-busy`, working message와 첫 node의 optimistic `Running` 상태를 추가했다.
- 재발 방지: production event stream 연결 전에도 requested, running, completed, failed 상태 전이를 UI contract test에 포함한다.

## 결과 주소와 lifecycle control이 없었다

- 관찰: 생성된 demo가 있어도 dashboard에서 바로 열거나 run ID로 공유하고 삭제하기 어려웠다.
- 원인: 실행 기록 projection을 먼저 구현하면서 파생 결과의 운영 lifecycle을 후순위로 뒀다.
- 교정: `/?run=<runId>`, `/runs/<runId>/demo/`, preview와 snapshot lifecycle을 추가했다. 새 snapshot은 기본 offboard 상태이며 `Onboard demo`만 URL 제공을 시작하고, `Offboard demo`는 파일을 보존한 채 제공을 중단하며, `Delete demo`는 snapshot만 삭제한다.
- 재발 방지: 새 artifact type은 생성뿐 아니라 조회, 주소 지정, retention과 재생성 경로를 함께 설계한다.

## Demo가 생성 즉시 모두 노출될 수 있었다

- 관찰: run마다 demo URL을 자동 활성화하면 보관 중인 파생 결과까지 동시에 제공되어 운영자가 공개 상태를 통제하기 어렵다.
- 원인: snapshot 생성과 serving activation을 하나의 publish 동작으로 취급했다.
- 교정: immutable snapshot 생성과 URL serving 상태를 분리하고 `.aawp-onboarded` marker로 명시적으로 전환한다.
- 재발 방지: 파생 artifact의 존재, 제공 상태와 삭제 상태를 서로 다른 lifecycle state로 모델링한다.

## 제품 이름과 workflow 이름을 혼합했다

- 관찰: `AWF`, `Adaptive Workflow Studio`와 `spec-to-demo`가 header identity에 함께 나타났다.
- 원인: 초기 WIR 실험 명칭과 제품 명칭을 분리하지 않았다.
- 교정: 제품은 `AAWP Studio / Adaptive Artifact Workflow Platform`으로 통일하고 workflow ID는 실행 내용에서만 표시한다.
- 재발 방지: product, surface, workflow template과 run identity를 서로 다른 UI field와 문서 용어로 유지한다.

## 화면 slice가 명시적 계약보다 예시 요구사항에 의존했다

- 관찰: heavy spec demo는 102개 화면 중 3개를 만들었지만 일반 사용자가 “정책 전체”나 “발행 플로우”를 요청하는 경계가 예시 input에 명확히 표현되지 않았다.
- 원인: M7 compiler는 exact screen/requirement selector를 지원했지만 semantic topic/flow taxonomy와 사용자 원문 provenance가 없었다.
- 교정: normalized spec `screenGroups`, structured `scopeSelection`과 fail-closed unresolved request를 추가했다.
- 재발 방지: domain workflow의 자연어 해석 결과는 prompt가 아니라 typed selection artifact로 저장한다.

## 선택한 22개 화면을 공통 panel template로 축약했다

- 관찰: screen ID 선택은 맞았지만 관리 콘솔 13개와 발행사 콘솔 9개를 같은 shell에 넣고, source의 22개 고유 layout을 dashboard/form/workflow/table 네 template로 축약했다. Source에 없는 운영 수치와 record도 임의로 추가해 panel 정보가 달라졌다.
- 원인: scope selection과 결과 bundle packaging을 같은 문제로 보고, 여러 화면을 빠르게 탐색하는 UX를 screen content 합성과 혼동했다.
- 교정: 공통 content template과 운영 수치를 source screen artifact에서 제거했다. Platform-owned bundle manifest, surface와 독립 screen artifact를 추가하고 source screen object를 그대로 packaging한다. 상호작용 확인용 값은 renderer의 `예시 데이터` presentation fixture로 분리한다.
- 재발 방지: 화면 묶음은 navigation collection으로만 취급한다. Screen builder는 screen별 route·surface·layout contract를 독립적으로 구현하며 bundle viewer는 content를 재해석하지 않는다.

## 독립 screen artifact를 spec inspector로 렌더링했다

- 관찰: Source screen object는 보존했지만 `ConsoleNavRail`, table, form과 approval component를 실제 UI가 아니라 `SPEC COMPONENT` 설명 카드로 표시했다. 그 결과 좌측 정책 콘솔 맥락과 버튼 연결이 사라지고 데모가 문서 viewer처럼 보였다.
- 원인: Source 보존을 “화면을 해석하지 않고 metadata만 출력하는 것”으로 과도하게 적용했다. 플랫폼 bundle navigation과 제품 navigation의 역할도 분리하지 못했다.
- 교정: Bundle selector는 바깥 collection UX로 유지하고 iframe 안에는 source surface의 240px rail, authority chrome과 screen별 composition을 복원했다. `interactionModel`의 navigate/local state/sheet/submit을 실행 projection으로 packaging하고 selected target만 연결했다. Selection 밖 목적지는 범위 안내, 불명확한 목적지는 Spec feedback으로 처리한다.
- 재발 방지: Demo acceptance에 product shell 존재, source CTA resolution, local interaction과 screen별 renderer coverage를 포함한다. Artifact deep equality만으로 시각적 역할 보존을 통과시키지 않는다.

## 결과 navigator와 제품 rail을 동시에 좌측 panel로 노출했다

- 관찰: 여러 화면을 선택할 AAWP navigator를 제품의 `ConsoleNavRail` 옆에 배치해 두 개의 좌측 panel이 보였다.
- 원인: Collection 탐색과 product navigation을 의미상 분리했지만 화면 배치까지 분리하지 않았다.
- 교정: Bundle·surface·screen 선택은 preview 상단 horizontal switcher로 이동하고 제품 iframe에는 source-defined rail 하나만 남겼다.
- 재발 방지: Web product가 자체 rail을 가진 경우 platform viewer는 같은 축에 persistent navigator를 추가하지 않는다.

## Nested preview에서 독립 화면 popup이 차단됐다

- 관찰: Demo viewer의 `독립 화면 열기`가 Studio iframe 안에서는 반응하지 않았다.
- 원인: Studio preview sandbox에 popup capability가 없었고 link가 상대 주소에 의존했다.
- 교정: Trusted local snapshot iframe에 self-origin popup과 sandbox 탈출 권한을 명시하고, 현재 run을 기준으로 절대 screen URL을 만든다.
- 재발 방지: Demo lifecycle test에 independent screen address와 preview sandbox capability를 함께 검사한다.

## 제품 화면에 spec authoring metadata를 노출했다

- 관찰: 독립 demo 상단에 route, 내부 screen title, 긴 purpose와 feedback count를 표시해 제품 화면보다 spec inspector처럼 보였다.
- 원인: Artifact 추적 정보를 제품 surface에도 유용한 설명으로 잘못 취급했다.
- 교정: 제품 화면은 `screen.copy.title`과 실제 업무 UI만 렌더링하고 route, purpose, dataNeeds, component 이름과 feedback 진단은 Studio의 artifact inspector가 소유한다.
- 재발 방지: Surface adapter 검증에서 `artifact.screen.route`와 `artifact.screen.purpose`의 제품 DOM 투영을 금지한다.

## Generic adapter 전환 중 검증된 시각 문법까지 교체했다

- 관찰: 3화면 slice의 정책 콘솔은 자연스러웠지만 22화면 adapter로 확장하면서 light rail, full-bleed workspace와 여러 겹의 panel로 바뀌어 제품 정체성과 정보 밀도가 약해졌다.
- 원인: 기능 구조를 일반화하는 작업과 visual baseline 교체를 하나의 변경으로 취급했다.
- 교정: `run_bf24…`와 동일한 repository fixture의 HTML/CSS digest를 `visual-reference-contract.yaml`에 고정하고, 시각 문법은 유지한 채 Stitch presentation token으로 색과 크기만 재매핑했다.
- 재발 방지: Screen artifact가 presentation digest와 visual reference digest를 함께 기록하며, adapter visual version을 독립적으로 올린다.

## Local simulation이 production workflow처럼 오해될 수 있었다

- 관찰: run과 event가 기록되므로 실제 model/tool workflow가 수행된 것으로 받아들일 여지가 있었다.
- 추가 오류: trace를 실행 뒤 한꺼번에 materialize하면서 모든 start event에 run 시작 시각을, 모든 completion event에 run 종료 시각을 대입했다. 그 결과 sequence가 증가하는데 timestamp가 과거로 돌아가는 기록이 생겼다.
- 교정: Studio badge와 run record에 `DETERMINISTIC_SIMULATION`을 명시하고, simulator event callback에서 monotonic offset을 수집한다. Studio는 wall-clock event log가 아닌 `Simulation trace`로 표시하며 timing 계약이 없는 기존 기록은 `legacy`로 구분한다.
- 남은 위험: production event source가 연결되기 전에는 demo 품질이나 workflow 우위를 Studio run 자체로 주장할 수 없다.

## 여러 demo가 동시에 onboard될 수 있었다

- 관찰: UI에 onboard/offboard lifecycle은 있었지만 store가 marker를 run별로 독립 관리해 여러 demo URL이 동시에 활성화됐다.
- 원인: 버튼 의미만 구현하고 `active demo ≤ 1` 불변식을 저장 계층에 두지 않았다.
- 교정: 새 run을 onboard할 때 동일 store의 기존 marker를 직렬화된 임계구역에서 제거하고, 두 snapshot을 순서대로 onboard하는 회귀 테스트를 추가했다.

## Run 기록이 시간·비용·계보를 충분히 설명하지 못했다

- 관찰: Event sequence와 최종 duration은 있었지만 결과를 만드는 단계가 얼마나 걸렸는지, model token을 사용했는지, 어떤 workflow/input/trace와 연결되는지 한눈에 확인하기 어려웠다.
- 원인: 실행 순서 투영을 먼저 구현하고 운영 계측을 최종 event 하나에 축약했다.
- 교정: Workflow, validation, deterministic simulation과 snapshot materialization 시간을 구분하고 token usage와 digest trace contract를 run record에 추가했다. 현재 deterministic mode는 model call이 없으므로 정확히 0으로 표시한다.
- 재발 방지: 실제 builder/model/tool adapter는 phase event와 provider usage evidence가 없으면 production metric으로 표시하지 않는다. Snapshot 복사 시간을 application compile 시간이라고 부르지 않는다.

## Studio Run이 실제 workflow 대신 simulator와 기존 결과 복사만 수행했다

- 관찰: `Run workflow`를 누르면 `simulateDeterministic()`이 모든 node를 수 ms 안에 완료 처리하고 `sim_*` artifact를 만들었다. 이어서 이미 만들어진 demo directory를 복사한 시간만 `Result build`로 표시했다. 실제 agent 작업은 Studio 밖에서 수행됐는데도 실행 버튼, 완료 event와 `0 tokens`가 한 화면에 있어 실제 workflow 실행처럼 받아들여졌다.
- 원인: WIR graph projection과 executable implementation binding을 분리하지 않은 채 simulator를 Studio primary action에 연결했다. Provider usage를 받는 경계가 없다는 이유로 0을 기록했으며, 실행기가 없는 상태를 실패가 아니라 simulation 성공으로 대체했다.
- 영향: 기존 `DETERMINISTIC_SIMULATION` run의 19 ms·5.52 ms 같은 값은 실제 demo 생성 시간이나 model 사용량의 증거가 아니다. 기존 record는 삭제하지 않고 `legacy`로만 열람한다.
- 교정: Studio Run에 strict local execution manifest를 추가했다. 모든 WIR node·output port·실행 순서가 실제 argv에 1:1 binding되지 않으면 Run을 비활성화하고 `WORKFLOW_NOT_EXECUTABLE`을 반환한다. 실제 process는 run별 input과 stdout/stderr를 보존하며 running snapshot, node duration, exit code, content hash와 end-to-end wall clock을 기록한다. LLM node는 Codex JSONL 또는 `AAWP_EVENT model_usage`가 없으면 `MODEL_USAGE_MISSING`으로 실패한다.
- 재발 방지: `awf simulate`와 Studio Run은 별도 command와 execution mode로 유지한다. 실행기가 없는 경우 fallback하지 않는다. `0 tokens`는 token tracking 대상 node가 하나도 없는 실제 non-model execution에서만 measured로 표시한다.

## 완전한 child spec이 여러 산출물 중 하나로 보여 전달 경계가 모호했다

- 관찰: Candidate document는 이미 원본 전체를 포함했지만 proposal, summary, verdict와 같은 디렉터리에 있어 runtime도 여러 파일을 함께 읽어야 하는 것처럼 보였다.
- 원인: Revision envelope의 계보 정보는 sidecar에 충분하다고 보고 child document 자체의 self-description을 생략했다.
- 교정: `meta.revision`에 parent/contract digest, feedback ID, candidate status와 `executionInput=this_document`를 내장했다. Sidecar는 감사·재현에만 사용한다.
- 재발 방지: 사용자가 전달하는 domain artifact는 단독으로 버전과 계보를 식별할 수 있어야 한다. 자기 content digest처럼 순환하는 값만 외부 envelope에 둔다.

## 원본에 없는 역할 화면을 비교 편의를 위해 만들 위험이 있었다

- 관찰: 담당자별 원본/후보 비교에서 원본 spec에는 지급 담당 전용 화면이 없었다.
- 원인: 역할별 화면 수를 맞추려 하면 source 밖의 화면을 임의로 합성할 수 있다.
- 교정: 원본 지급 역할은 `SPEC GAP`으로 표시하고 candidate에서만 두 전용 화면을 제공한다.
- 재발 방지: 비교 fixture는 양쪽 개수를 억지로 맞추지 않고 source absence도 검토 evidence로 보존한다.

## 검증 공백

- 현재 자동화: build, typecheck, lint, format, unit/integration test와 HTTP deep-link 검증.
- 미수행: 연결 가능한 in-app browser가 없어 Studio 변경의 자동 screenshot 비교를 수행하지 못했다.
- 대응: 시각 QA 완료라고 기록하지 않으며 browser surface가 제공되면 동일 viewport screenshot regression을 추가한다.

## 디자인 MD 단독 검증에 기존 시각 가이드를 섞었다

- 관찰: `DESIGN.md` 기반 pilot이라고 보고했지만 실제 execution prompt가 기존 transport voucher demo, presentation contract와 pinned visual reference 보존을 명시했다.
- 원인: 새 문서를 기존 가이드의 상위 요약으로 취급하고, 사용자가 요구한 입력 격리 실험으로 해석하지 않았다. Manifest에도 visual reference와 adapter version을 요구했다.
- 영향: 결과 품질은 확인할 수 있어도 `DESIGN.md` 하나만으로 같은 디자인을 만들 수 있다는 증거가 아니었다.
- 교정: 필요한 token, web/mobile composition, interaction과 접근성 규칙을 `DESIGN.md` 1.1.0에 흡수했다. `spec-to-demo` 0.3.0 builder는 이전 demo·CSS·presentation/visual contract 접근을 금지하고 manifest에 `designInputs: ["DESIGN.md"]`와 byte digest만 기록한다.
- 재발 방지: 입력 격리 실험은 prompt와 artifact manifest 양쪽에 allowed/forbidden source를 선언하고 verifier가 forbidden field와 문자열을 검사한다.

## Model 호출 시작을 usage 수집 시점으로 기록했다

- 관찰: 5분 17초 model node의 `ModelInvoked`가 node 시작이 아니라 종료 직전 `+317347.9 ms`에 표시됐다.
- 원인: Child process 종료 후 stdout JSONL을 한 번에 파싱하면서 usage sample마다 `ModelInvoked` event를 생성했다.
- 교정: LLM step 시작 callback에서 `ModelInvoked`를 기록하고 종료 usage는 `ModelCompleted`에 duration과 함께 기록한다.
- 재발 방지: Timeline test가 model start elapsed가 completion elapsed보다 작은지 검증한다. Invocation과 telemetry collection을 같은 event로 재사용하지 않는다.

## Studio마다 다른 run store를 사용해 기록이 사라진 것처럼 보였다

- 관찰: 기본 Studio, smoke와 design pilot이 서로 다른 JSONL·execution·demo root를 사용해 한 Studio에서 이전 runs가 보이지 않았다.
- 원인: Pilot을 별도 port로 띄우며 저장 경로도 함께 분기했고, local persistence root를 제품 invariant로 정하지 않았다.
- 교정: 프로젝트 루트 `runs/history.jsonl`과 `runs/<runId>/{run.json,input.json,logs,artifacts,demo}`를 기본 경계로 정했다. 세 legacy history의 22개 run을 원본 삭제 없이 통합했다.
- 재발 방지: 공식 Studio command는 `runs/` 기본값을 사용한다. 별도 store는 격리 test에서만 허용하고 사용자-facing Studio에는 사용하지 않는다.

## Run metadata와 executor가 같은 directory 생성을 경쟁했다

- 관찰: 통합 root 첫 실행이 `EEXIST: mkdir runs/<runId>`로 12 ms 만에 실패했다.
- 원인: JSONL store가 `run.json`을 쓰기 위해 run directory를 먼저 만들었지만 executor는 directory가 존재하지 않아야 한다고 가정했다.
- 교정: Executor는 run root의 사전 존재를 허용하고 `input.json`과 `logs/`의 독립 생성에서 충돌을 검출한다.
- 재발 방지: Store가 `run.json`을 먼저 만든 상태에서 실제 local process artifact를 쓰는 회귀 test를 추가했다.
