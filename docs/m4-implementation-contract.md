# M4 구현 계약

이 문서는 Agent·Tool Security Gateway의 M4 규범이다. M4는 model provider와 tool transport를 WIR runtime에서 분리하고, 모든 외부 실행을 schema·capability·telemetry 경계 뒤에 둔다.

## Model gateway

- provider는 raw JSON text, token usage, provider model revision을 반환하는 중립 계약을 구현한다.
- gateway는 호출 전 provider 선택, timeout과 output token 상한을 고정한다.
- JSON parse 또는 response schema 검증이 실패하면 결과를 artifact로 publish하지 않는다.
- provider timeout, capacity, authorization, validation과 unknown failure는 stable error class로 정규화한다.
- provider 교체는 workflow나 runtime 계약을 바꾸지 않는다.

## Capability와 secret

- filesystem, network, tool, secret은 모두 default deny다.
- filesystem path는 workspace-relative grant와 lexical path를 검사한 뒤 실제 경로를 canonicalize한다.
- path traversal, workspace 밖 symlink와 허가 범위 안에서 다른 범위로 향하는 symlink를 거부한다.
- network grant는 HTTP(S) origin 또는 기본 port hostname만 허용하고 userinfo와 미허가 host를 거부한다.
- tool ID와 secret reference는 exact match로 승인한다.
- parent process environment는 sandbox에 복사하지 않는다. secret은 승인된 reference를 broker가 node별 단기 lease로 발급한 값만 전달한다.

## Sandbox와 tool adapter

- sandbox launcher는 rootless, read-only root filesystem, no-new-privileges, dropped capabilities와 resource limit을 backend 계약에 강제한다.
- backend는 canonical host mount, 허용 egress, 명시 environment만 받아 격리 실행한다.
- CLI adapter는 shell string을 실행하지 않고 pinned image의 argv와 JSON stdin만 전달한다.
- MCP adapter도 같은 capability gateway 뒤에 있으며 client port에는 secret 값 대신 승인된 reference만 전달한다.
- tool input은 adapter 호출 전에, output은 반환 전에 JSON Schema로 검증한다.
- 모든 tool 결과에는 trust level을 기록하며 untrusted 결과는 tainted다.

## Telemetry

- OpenTelemetry span은 tenant, run, node, artifact correlation ID를 기록한다.
- prompt, model response, tool input과 tool output content는 기본 비활성화한다.
- capture를 명시적으로 켜도 등록된 secret 값은 span attribute와 exception message에서 redaction한다.
- token usage, provider, model, tool ID, trust와 실행 결과 상태는 content 없이 기록할 수 있다.

## 비보장 범위

- gateway는 OCI 격리 backend가 계약을 실제로 집행한다는 가정 아래 동작한다. production rootless runtime, egress proxy와 secret vault adapter는 배포 구성에서 제공한다.
- MCP server와 model provider의 응답은 신뢰하지 않는다. schema 통과는 의미적 안전성이나 prompt injection 부재를 보장하지 않는다.
