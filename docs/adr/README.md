# Architecture Decision Records

ADR은 중요한 구조 선택의 맥락, 고려한 대안, 결정과 결과를 보존한다. 구현 보고서는 “무엇이 완료됐는가”를, ADR은 “왜 이 구조를 선택했는가”를 설명한다.

## 절차

1. 문제와 변경할 수 없는 constraint를 적는다.
2. 최소 두 가지 대안과 trade-off를 비교한다.
3. 선택한 경계와 의도적으로 하지 않는 일을 명시한다.
4. 운영·보안·migration 결과와 재검토 조건을 기록한다.
5. 구현과 test가 결정에 맞는지 milestone report에 연결한다.

## 현재 결정

- ADR-001–004: artifact graph, Temporal runtime, immutable WIR와 content addressing
- ADR-005–006: direct baseline 승격과 authority separation
- ADR-007–009: default-deny gateway, impact planning과 evidence-owned release
- ADR-010–011: stable requirement identity, hidden package와 direct-default routing
- ADR-012: Studio는 runtime truth가 아닌 control-plane view
- [ADR-013](ADR-013-explicit-demo-scope-selection.md): 자연어 demo 요청을 explicit scope contract로 고정
- [ADR-014](ADR-014-demo-bundle-is-a-platform-artifact.md): 여러 demo 화면을 platform-owned bundle artifact로 보존
- [ADR-015](ADR-015-spec-feedback-produces-immutable-revisions.md): feedback을 immutable spec revision candidate로 적용
- [ADR-016](ADR-016-self-describing-spec-revision.md): spec revision 전달 단위를 self-describing 단일 child document로 고정
- [ADR-017](ADR-017-studio-runs-require-executable-bindings.md): Studio Run을 실제 node binding·wall clock·usage evidence에만 연결
- [ADR-018](ADR-018-run-root-and-self-contained-workflows.md): local run을 단일 root에 보존하고 workflow를 대화 비의존 실행 bundle로 고정
- [ADR-019](ADR-019-studio-catalog-and-typed-launchers.md): Studio workflow catalog와 domain별 typed launcher를 분리
- [ADR-020](ADR-020-preview-contracts-gate-environments.md): Data/API 계약과 S2 blocker가 ready일 때만 ephemeral Preview 환경을 생성
- [ADR-021](ADR-021-demo-semantic-closure-and-executable-s1.md): Demo 의미 dependency closure와 실제 browser evidence로 S1을 판정
- [ADR-022](ADR-022-canonical-demo-entry-and-projection-consistency.md): Demo 진입점·active journey·deprecated compatibility 충돌을 model 호출 전에 차단

상태가 바뀌면 기존 ADR을 삭제하지 않고 `superseded`로 표시한 뒤 새 ADR을 추가한다.
