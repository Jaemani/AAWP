# 적응형 에이전틱 워크플로 플랫폼 아키텍처 보충본

이 문서는 루트 원본 `agentic_workflow_framework_implementation_plan_ko.md`를 삭제하거나 대체하지 않는다. M0/M1 공개 계약을 구현 가능한 형태로 정리한 보충본이다.

M1의 세부 실행 의미와 오류 처리 규칙은 `docs/m1-implementation-contract.md`를 규범으로 사용한다.
M2의 artifact, event, lineage 저장 의미는 `docs/m2-implementation-contract.md`를 규범으로 사용한다.
M3의 Temporal workflow, activity, signal, retry와 side-effect 의미는 `docs/m3-implementation-contract.md`를 규범으로 사용한다.
M4의 model, tool, capability, secret과 telemetry 의미는 `docs/m4-implementation-contract.md`를 규범으로 사용한다.
M5의 revision, invalidation, cache planning과 branch promotion 의미는 `docs/m5-implementation-contract.md`를 규범으로 사용한다.
M6의 verifier 격리, evidence, finding, repair authority와 monotonic promotion 의미는 `docs/m6-implementation-contract.md`를 규범으로 사용한다.
M7의 spec-to-demo contract compilation, visibility split, coherent builder, verifier plan과 revision 의미는 `docs/m7-implementation-contract.md`를 규범으로 사용한다.
M8의 value routing, execution template, versioned explorer plan과 shadow evaluation 의미는 `docs/m8-implementation-contract.md`를 규범으로 사용한다.

## M0 합의 사항

- 제품 중심은 에이전트 수가 아니라 불변 산출물 그래프다.
- 생산 내구 실행 기본값은 Temporal이다. M1은 `RuntimePort` 경계를 정의했고 M3는 그 경계의 첫 adapter를 구현한다.
- 첨부 durable-agents 프로젝트의 소스, 스키마, 프롬프트, 파일 레이아웃, 테스트 문구는 복사하지 않는다.
- DIRECT 기준선은 항상 같은 입력, 같은 검증기, 같은 가격 스냅샷, 같은 환경 요약으로 재실행 가능해야 한다.

## M1 공개 계약 수정 사항

- `WorkflowDefinition`은 `artifactSchemas`, 명시적 workflow input port, workflow output port를 가진다.
- 모든 노드 포트와 루트 포트는 semantic `type`과 `schemaVersion`을 참조한다.
- edge endpoint는 `{ "kind": "workflowInput" | "nodeOutput" }`와 `{ "kind": "nodeInput" | "workflowOutput" }`의 discriminated object다.
- v1 edge 호환성은 `type`과 `schemaVersion`의 정확한 동일성이다.
- product writer는 release verifier를 소유할 수 없다.
- hidden verifier artifact는 builder가 읽을 수 없다.
- 자연어 authoring은 M1 범위가 아니며, 이후 agent gateway milestone로 연기한다.

## M1 품질 게이트

`npm ci`, `npm run build`, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`, direct-v0 10건 기준선, sample check, sample simulate 2회 byte-identical 비교가 통과해야 한다.
