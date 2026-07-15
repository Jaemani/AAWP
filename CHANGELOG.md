# 변경 기록

형식은 사용자·운영자에게 영향을 주는 변경을 중심으로 기록한다. 아직 안정 release 전이므로 날짜별 update note를 사용한다.

## 2026-07-15

### AAWP Studio identity와 실행 console

- 제품 표기를 `AAWP Studio`와 `Adaptive Artifact Workflow Platform`으로 통일했다.
- workflow ID인 `spec-to-demo`를 제품 subtitle에서 제거했다.
- 화면 위계를 workflow 실행 → run 기록 → 선택 결과로 정리했다.
- 실행 중 button과 첫 node에 즉시 busy/running feedback을 표시한다.
- `/?run=<runId>` dashboard deep link, run별 demo preview/open/delete를 추가했다.
- demo snapshot 삭제 후에도 append-only run/event 기록은 보존한다.
- 새 demo snapshot을 기본 offboard 상태로 만들고 `Onboard demo`, `Offboard demo`, `Delete demo` lifecycle을 추가했다.
- Offboard는 URL 제공만 중단하며 Delete도 input file, source와 run/event를 변경하지 않는다.
- Simulation event에 run 시작 기준 monotonic `elapsedMs`와 node `durationMs`를 기록해 sequence와 시간이 역전되던 오류를 수정했다.
- Studio의 `Event timeline`을 `Simulation trace`로 명확히 하고, timing 계약이 없던 과거 기록은 `legacy`로 표시한다.

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

### 문서

- 루트 README를 플랫폼 핵심과 현재 증명 경계 중심으로 재구성했다.
- 사용자 가이드, 핵심 개념, ADR index, 공개 참고 자료와 오류·교정 기록을 추가했다.

## 2026-07-14

- M1–M9 compiler, artifact/event plane, Temporal adapter, gateway, impact engine, verifier control, `spec-to-demo`, value router와 Studio projection을 구현했다.
- heavy production spec에서 102개 중 3개 대표 화면 demo slice를 만들고 run ID별 snapshot으로 제공했다.
- 전체 자동 검증 기준 43개 test file, 220개 test를 통과했다.
