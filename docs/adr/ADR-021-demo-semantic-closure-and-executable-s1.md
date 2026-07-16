# ADR-021: Demo는 의미 dependency closure와 실행 증거로 S1을 판정한다

- 상태: accepted
- 일자: 2026-07-16

## 문제

Requested-screen projection v1은 화면, actor, component와 기존 interaction projection만 전달했다. 새 canonical Spec의 flow, authority, state machine, Data/API binding과 acceptance가 builder 입력에서 사라졌고, 복잡한 command는 공통 확인창으로 축약됐다. Release verifier도 특정 문자열과 일반 layout을 확인해 결재 action과 상태 지속성이 없는 결과를 S1 passed로 오판했다.

## 고려한 대안

1. Heavy Spec 전체를 항상 model에 전달한다. 의미 유실은 줄지만 두 화면 run도 약 1.4MB source와 과도한 input token을 소비하고 선택 범위를 흐린다.
2. 화면 projection을 유지하고 prompt에 flow를 잘 구현하라고 적는다. Builder가 읽을 수 없는 정보를 복구할 수 없고 판정도 증거가 되지 않는다.
3. 선택 화면에서 도달 가능한 semantic dependency만 결정적으로 projection하고, 필요한 화면이 빠지면 explicit selection expansion을 요구한다. S1 acceptance는 stable browser evidence contract로 컴파일해 독립 verifier가 실제 클릭한다.
4. Dependency 화면을 자동으로 selection에 추가한다. 결과는 편하지만 사용자가 정한 범위와 비용 계약을 몰래 확장한다.

## 결정

3번을 선택한다.

- Projection v2는 선택 screen과 actor/component 외에 관련 flow, state machine, query/command, data binding, capability, acceptance, assumption, storyboard와 mock data를 포함한다.
- `selectionContract`는 requested screen, required screen, flow, command, query와 evidence check ID를 기록한다.
- Required screen은 선택된 S1 flow와 executable evidence가 결정한다. 선택 화면의 일반 navigation 대상은 optional out-of-scope target으로 기록하되 자동으로 required closure에 넣지 않는다. 그렇지 않으면 역할 허브 하나가 무관한 업무 전체로 fan-out한다.
- Dependency screen이 빠지면 `compile-demo-scope`가 contract artifact를 남기고 model 호출 전에 `scope-expansion-required`로 실패한다. 자동 확장하지 않는다.
- Canonical `acceptance.scenarios[]`는 `evidenceChecks[]`를 가져야 한다. Prose-only scenario는 revision 오류이고, 유효한 check가 있어도 실제 Demo evidence 전에는 `DEMO_EVIDENCE_PENDING`으로 S1 blocked다.
- Semantic compiler는 개별 check뿐 아니라 같은 `screenId + actorId + actionId`를 공유하는 check도 비교한다. 같은 actor의 같은 action을 hidden과 visible/clickable로 동시에 요구하면 Spec revision을 차단한다.
- Evidence assertion은 action target type과 함께 검사한다. Screen target은 `navigates`로 canonical target 이동을 검증하고 command form/state assertion을 사용할 수 없다.
- Demo는 `data-aawp-actor-id`, `data-aawp-action-id`, action surface와 observable state marker를 제공한다. Verifier가 역할별 visibility, action-specific form, state/version/work-item 변화, reload persistence, error input 보존과 duplicate rejection을 클릭으로 판정한다.
- Initial inspect는 첫 assertion에서 중단하지 않고 각 evidence check를 clean state로 격리해 전체 finding을 수집한다. 한 번뿐인 bounded repair는 이 완전한 finding 집합만 받고, final verifier가 같은 cohort를 다시 실행한다.
- Verifier는 이미 보이는 action surface를 여는 click과 command submit을 구분한다. Surface가 보이면 그 내부 submit을 정확히 한 번만 실행하며, 오류 trigger는 정상 submit과 분리하고 duplicate rejection marker는 두 번째 시도가 실제로 거부된 뒤에만 인정한다.
- Demo bytes와 pinned input이 그대로이고 verifier만 교정된 경우 model build를 다시 실행하지 않는다. 별도 reverify attempt가 Demo tree·input·verifier·workflow contract digest를 고정하고 최신 evidence verdict를 보존한다. 원 run의 failed/completed status는 immutable history로 유지한다.
- S2의 DB/API·PII·조직 권한 미결 항목은 S1 interaction 결함과 구분하며, S1 수정을 이유로 확정값을 발명하지 않는다.

## 결과와 한계

세 화면만 선택했던 청년기본소득 run은 정책 결재함·결재 상세·지급 준비 worklist가 빠졌음을 모델 호출 전에 설명할 수 있다. 현재 child Spec의 prose-only acceptance 세 건은 S1 blocker로 재분류된다.

Browser evidence schema는 DOM instrumentation contract이므로 builder가 이를 구현하지 않으면 결과가 시각적으로 좋아도 release는 실패한다. Check가 직접 진입한 screen/actor에서 실행될 수 없는 숨은 setup state를 요구하면 Demo가 추측하지 않고 Spec gap으로 돌려보내야 한다. Figma 수준 pixel fidelity나 실제 backend authorization을 증명하지 않으며, 후자는 각각 디자인 QA와 S2/S3 검증의 책임이다.

## 검증

- Semantic projection이 관련 flow/state/API/binding/authority를 보존하는 단위 테스트
- Flow와 acceptance가 요구하는 누락 screen ID를 반환하는 selection test
- False-ready selection contract 거부 test
- Prose-only acceptance가 S1을 block하는 semantic profile test
- 여러 check 사이 hidden/clickable visibility 모순을 block하는 semantic profile test
- 구조화된 다중 browser finding을 bounded repair report로 변환하는 inspect test
- 계층형 stable feedback ID parser 회귀 test
- WIR static check와 실제 browser evidence release verifier
