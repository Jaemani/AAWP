# M4 구현 결과

기준일은 2026년 7월 14일이다. M4는 model provider와 MCP·CLI tool을 schema, capability, secret, sandbox와 redacted OpenTelemetry 경계 뒤에 배치했다.

## 완료 범위

- provider-neutral `ModelProvider`와 provider registry
- model timeout, cancellation, output token budget와 stable runtime error class
- raw provider JSON parse와 JSON Schema fail-closed validation
- filesystem, network, tool, secret default-deny authorizer
- path traversal, workspace 밖 symlink, grant 밖 canonical path와 dangling symlink 차단
- rootless·read-only·no-new-privileges 격리 spec을 만드는 sandbox launcher
- node별 short-lived secret broker lease와 parent environment 미전달
- shell string 없이 pinned image argv·JSON stdin을 쓰는 CLI adapter
- capability gateway 뒤의 MCP client adapter
- tool input·output schema 검증, trust level과 tainted 결과
- OpenTelemetry API span과 run·node·artifact correlation
- prompt·model·tool payload content-off 기본값과 secret redaction

## 완료 기준과 증거

| M4 완료 기준                                              | 구현 증거                                                                                          |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Provider-neutral model adapter is operational             | 서로 다른 두 provider를 같은 request 계약으로 선택하고 같은 schema result를 반환하는 test          |
| Filesystem, network, tool, secret checks are default deny | 빈 grant의 네 차원 거부, traversal·symlink·undeclared MCP egress·tool·secret negative test         |
| Structured outputs fail closed                            | model malformed JSON·schema violation, tool input·output schema violation, CLI malformed JSON 경계 |
| Prompt and tool payload telemetry is disabled by default  | OpenTelemetry recording tracer에서 content attribute 부재와 correlation attribute 존재 test        |

추가로 provider timeout, capacity error normalization, token budget, pinned image, mandatory isolation flags, parent environment secret 미전달, CLI shell 문자열 비실행, CLI error secret redaction과 MCP trust 경계를 검증했다.

## 실행 의미

`ModelGateway`는 provider 응답을 신뢰하지 않고 raw JSON을 parse한 뒤 호출자가 제공한 schema로 검증한다. Provider의 error class는 `RuntimeNodeError` 계약으로 변환되므로 M3 Temporal retry policy가 동일한 class를 사용할 수 있다.

`ToolGateway`는 local adapter의 capability plan을 WIR node grant와 대조한 뒤에만 adapter를 호출한다. Filesystem mount는 canonical host path만 sandbox backend에 전달한다. CLI는 command string이나 parent `process.env`를 넘기지 않으며 MCP client는 secret 값이 아니라 승인된 reference만 받는다.

## 검증 결과

- Vitest: 18개 test file, 126개 test 통과
- M4 신규 test: 28개
- build, typecheck, lint, format check, schema generation 통과
- package export boundary에서 policy, telemetry, agent gateway와 tool gateway 확인
- sample `awf check`와 byte-identical simulate 회귀 통과

## M5 경계와 남은 위험

M4 core는 격리 spec과 `SandboxBackend` 계약을 제공한다. 실제 rootless OCI runtime, egress proxy, vault-backed secret broker와 remote MCP client 배포 adapter는 아직 없다. Backend가 mount·network·resource isolation 계약을 어기면 launcher만으로 이를 증명할 수 없으므로 production conformance test가 필요하다.

Filesystem 검사와 container mount 사이의 host-side TOCTOU, DNS rebinding, provider usage 계측의 정확성은 후속 hardening 대상이다. Tool adapter는 platform-trusted code이며 외부 tool 결과의 schema 통과가 의미적 안전성을 보장하지 않는다.

WIR v1에는 provider, model, prompt template, tool adapter version을 node에 binding하는 별도 execution profile이 없다. M4 gateway는 독립 실행 가능하지만 runtime에서 workflow node를 자동 routing하는 작업은 이 immutable profile 계약과 함께 수직 슬라이스 전에 추가해야 한다.
