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

### `spec-to-demo` 범위 선택

- 기존 screen/requirement selector에 구조화된 `scopeSelection`을 추가했다.
- 정규화된 spec의 `screenGroups`가 `topic`과 `flow` 묶음을 선언할 수 있다.
- 사용자 요청 원문, 선택한 group과 최종 screen/requirement 집합을 scope contract에 기록한다.
- 자연어 요청이 명시적 ID로 해소되지 않았거나 group이 잘못된 경우 compile을 fail-closed한다.

### 문서

- 루트 README를 플랫폼 핵심과 현재 증명 경계 중심으로 재구성했다.
- 사용자 가이드, 핵심 개념, ADR index, 공개 참고 자료와 오류·교정 기록을 추가했다.

## 2026-07-14

- M1–M9 compiler, artifact/event plane, Temporal adapter, gateway, impact engine, verifier control, `spec-to-demo`, value router와 Studio projection을 구현했다.
- heavy production spec에서 102개 중 3개 대표 화면 demo slice를 만들고 run ID별 snapshot으로 제공했다.
- 전체 자동 검증 기준 43개 test file, 220개 test를 통과했다.
