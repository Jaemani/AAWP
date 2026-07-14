# ADR-007: 외부 실행은 default-deny gateway 뒤에 둔다

## 상태

승인

## 결정

Model provider, MCP와 CLI tool을 runtime activity에서 직접 호출하지 않는다. Provider-neutral Agent Gateway와 capability-aware Tool Gateway가 schema, budget, filesystem, network, tool, secret과 telemetry 정책을 먼저 집행한다.

Filesystem authorization은 lexical path와 canonical real path를 모두 확인한다. Sandbox에는 parent environment를 전달하지 않고 broker가 발급한 승인 secret lease만 전달한다. Prompt와 tool content telemetry는 기본 비활성화한다.

## 결과

새 provider와 tool transport는 gateway port를 구현해야 하며 WIR 권한만으로 직접 외부 effect를 실행할 수 없다. OCI sandbox backend와 secret vault는 교체 가능하지만 default-deny 의미를 약화할 수 없다.
