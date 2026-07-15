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

## Local simulation이 production workflow처럼 오해될 수 있었다

- 관찰: run과 event가 기록되므로 실제 model/tool workflow가 수행된 것으로 받아들일 여지가 있었다.
- 교정: Studio badge, run record와 문서에 `DETERMINISTIC_SIMULATION`을 명시했다.
- 남은 위험: production event source가 연결되기 전에는 demo 품질이나 workflow 우위를 Studio run 자체로 주장할 수 없다.

## 검증 공백

- 현재 자동화: build, typecheck, lint, format, unit/integration test와 HTTP deep-link 검증.
- 미수행: 연결 가능한 in-app browser가 없어 Studio 변경의 자동 screenshot 비교를 수행하지 못했다.
- 대응: 시각 QA 완료라고 기록하지 않으며 browser surface가 제공되면 동일 viewport screenshot regression을 추가한다.
