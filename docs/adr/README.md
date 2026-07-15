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

상태가 바뀌면 기존 ADR을 삭제하지 않고 `superseded`로 표시한 뒤 새 ADR을 추가한다.
