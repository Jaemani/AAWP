# ADR-013: demo 범위는 explicit selection contract로 고정한다

- 상태: accepted
- 기준일: 2026-07-15

## 문제

사용자는 전체 spec이 아니라 특정 화면, 주제 또는 flow만 demo로 요청할 수 있다. “정책 관련 페이지”, “정책·유통·발행·준비 화면 전체”, “flow별로”처럼 자연어 범위가 달라지며, 큰 spec에서 전체 화면을 기본 생성하면 비용과 검증 범위가 폭증한다.

## 고려한 대안

1. 플랫폼 코어가 자연어를 직접 해석한다. Domain taxonomy가 코어로 새고 model revision에 따라 scope가 바뀌므로 채택하지 않았다.
2. Workflow prompt에만 범위를 적는다. 최종 포함·제외 화면을 감사하거나 verifier가 강제할 수 없어 채택하지 않았다.
3. 별도 `spec-divide` workflow를 즉시 만든다. 아직 독립 authority, verifier와 세 workflow 이상의 재사용 증거가 없어 연기했다.
4. Domain resolver와 platform-enforced contract를 분리한다. 자연어 해석은 교체 가능하게 두고 compiler가 explicit ID만 승인하므로 채택했다.

## 결정

- 정규화된 spec은 optional `screenGroups`로 `topic`과 `flow` 묶음, alias와 screen ID를 선언한다.
- Resolver는 사용자 원문을 `scopeSelection.screenIds`, `requirementKeys`, `groupIds`로 변환한다.
- `spec-to-demo` compiler는 source artifact 일치, ID 존재, duplicate, group reference와 `maxScreens`를 검사한다.
- Scope contract는 요청 원문, 선택 group, 포함·제외 screen과 선택 requirement를 immutable digest에 포함한다.
- Selection이 없을 때 전체 화면을 암묵적으로 선택하지 않는다. 전체 생성도 모든 screen ID 또는 명시적인 all group으로 요청해야 한다.
- 요청 원문만 있고 explicit selector가 없으면 `UNRESOLVED_SCOPE_REQUEST`로 중단한다.
- Builder는 public scope contract만 받고 verifier는 같은 contract와 mandatory broad regression으로 판정한다.

## 책임 경계

- 플랫폼 코어: generic artifact, policy, lineage, revision과 execution semantics
- `spec-to-demo`: screen/requirement/topic/flow domain scope compiler
- AI resolver: 자연어를 typed candidate selector로 제안
- 사용자 승인: ambiguity가 있거나 configured threshold보다 넓은 selection
- `spec-feedback-to-spec`: source spec 자체를 수정하는 별도 workflow

## 결과와 재검토 조건

정확한 screen ID 요청과 topic/flow 요청이 같은 compile·verification 경로를 사용한다. Model이 바뀌어도 승인된 scope artifact는 재현된다. Taxonomy 추출이 여러 workflow에서 반복되고 독립 품질 측정이 필요해지면 `spec-divide` template 승격을 재검토한다.
