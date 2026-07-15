# 공개 참고 자료

AAWP의 설계 판단에 사용한 공개 자료다. Dependency의 exact version과 license는 [dependency-sources.md](dependency-sources.md), clean-room 경계는 [provenance-matrix.yaml](provenance-matrix.yaml)을 따른다. 최종 접근 기준일은 2026-07-15이다.

## Agent·workflow 설계

- Anthropic, [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents): 단순하고 조합 가능한 pattern, workflow와 agent 구분
- Anthropic, [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents): progress artifact와 장기 작업 handoff
- n8n, [AI Workflow Builder](https://docs.n8n.io/advanced-ai/ai-workflow-builder/): 자연어 authoring과 graph UX 참고. AAWP 코어 구현이나 내부 semantics의 source로 사용하지 않는다.

## Durable execution과 incremental computation

- Temporal, [Workflow execution](https://docs.temporal.io/workflow-execution): durable history, retry, signal과 recovery semantics
- Bazel, [Remote caching](https://bazel.build/remote/caching): action cache, content-addressable storage와 declared input/output 원칙

## Verification

- UK AI Security Institute, [Inspect AI](https://inspect.aisi.org.uk/): dataset, agent, tool과 scorer 기반 evaluation
- Microsoft, [Playwright](https://playwright.dev/): executable browser acceptance
- Deque, [axe-core](https://github.com/dequelabs/axe-core): accessibility 검사

## Interoperability·observability·security

- Model Context Protocol, [Specification](https://modelcontextprotocol.io/specification/2025-11-25): tool interoperability와 구현체의 consent/access-control 책임
- OpenTelemetry, [Generative AI conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/): model/tool telemetry vocabulary
- OWASP, [Agentic AI threats and mitigations](https://genai.owasp.org/): agentic system threat modeling과 security test 기준

## Spec revision semantics

- IETF, [RFC 6901 JSON Pointer](https://www.rfc-editor.org/rfc/rfc6901): spec 내부 변경 대상 주소 표현
- IETF, [RFC 6902 JSON Patch](https://www.rfc-editor.org/rfc/rfc6902): add, replace, remove operation 의미 참고. AAWP는 authority, feedback provenance와 approval을 추가한 제한 subset만 사용한다.

## 사용 원칙

- 공개 자료의 behavior와 개념을 참고하되 타 프로젝트의 함수명, schema, prompt, 파일 구조와 test 문구를 복제하지 않는다.
- 외부 framework는 adapter 또는 dependency로 사용하고 AAWP의 artifact lineage, authority와 release acceptance의 진실원은 코어가 소유한다.
- 참고 자료가 있다는 사실은 기능의 production readiness나 benchmark 우위를 증명하지 않는다.
