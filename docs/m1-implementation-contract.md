# M1 구현 계약

이 문서는 M1 코드와 테스트의 규범이다. 루트 계획서와 보충본이 모호하거나 충돌하면 이 문서를 우선한다.

## WIR 공개 계약

- `WorkflowDefinition`은 `artifactSchemas`, workflow `inputs`/`outputs`, `verifierDefinitions`, `nodes`, `edges`, `releasePolicy`를 가진다.
- artifact schema identity는 `type@schemaVersion`이다. M1 edge compatibility는 identity의 정확한 일치만 허용한다.
- `verifierDefinitions`의 각 항목은 stable `id`, `owner`, `visibility`(`public` 또는 `hidden`)를 가진다. node verifier binding과 release policy는 이 registry의 ID만 참조한다.
- product/builder owner ID는 release verifier owner ID와 같을 수 없다. release verifier owner role은 `verifier`여야 한다.
- builder/product node의 입력 포트는 `hidden`일 수 없다. hidden verifier definition은 product/builder가 소유할 수 없다.
- 한 node input과 workflow output에는 정확히 하나의 producer만 존재해야 한다.

## 정적 분석 의미

- graph cycle은 M1에서 금지한다. 반복은 `loop` node 내부의 `maxRounds`, `progressMetric`, `minImprovement`로만 표현한다.
- write conflict는 두 node 사이에 어느 방향으로도 dependency path가 없을 때만 검사한다. 순차 node의 동일 경로 write는 허용한다.
- write pattern은 exact path, `*`, suffix `/**`만 지원한다. 두 pattern의 실제 범위가 겹치면 conflict다. 충돌 검사는 첫 일치 항목에서 멈추지 않고 모든 이전 writer를 비교한다.
- required input/output producer, schema reference, endpoint, verifier reference, owner separation, capability, side effect guard, retry/timeout, worst-case cost를 stable diagnostic code로 검사한다.
- `artifactSchemas[].schema`는 JSON Schema 2020-12 object 또는 boolean이어야 하며 Ajv가 유효한 schema로 받아들여야 한다.
- warning은 `ok`를 false로 만들지 않는다. error diagnostic은 code, severity, path, 선택적 nodeId/edgeIndex, message, details를 가진다.

## Canonicalization

- JSON value만 허용한다. `undefined`, bigint, symbol, function, non-finite number, custom prototype object, accessor property, symbol key, non-enumerable property, sparse array, 순환 참조를 명시적 오류로 거부한다.
- 모든 key와 string value를 NFC로 정규화하고 정규화 후 key collision을 거부한다.
- key는 UTF-16 code unit 순서로 정렬하고 `-0`은 `0`으로 표현한다. canonical bytes에 SHA-256을 적용한다.

## Check와 Simulate

- `awf check FILE`: JSON/YAML parse 후 structural/semantic validation. valid 0, WIR error 1, IO/parse 2다.
- `awf simulate FILE --input FIXTURE`: 먼저 WIR을 검사하고 fixture가 workflow input port와 정확히 일치하는지 확인한다. 누락·추가 port 또는 artifact JSON Schema 불일치는 `INVALID_FIXTURE`와 exit 2다.
- ready node는 ID의 UTF-16 순서로 선택한다. node array와 edge array 순서를 바꿔도 같은 의미라면 trace가 같아야 한다.
- 모든 node kind는 결정적 stub을 사용한다. 외부 effect, 모델, 네트워크, secret은 실행하지 않는다. side effect는 `sideEffectSkipped` event를 남긴다.
- 실행 불능 node나 workflow output 미생성은 성공 trace로 반환하지 않고 명시적 simulation error로 종료한다.

## Direct-v0 기준선

- manifest가 10개 case의 ID, category, frozen prompt, seed tree, verifier command, timeout을 소유한다.
- category는 small-edit 3개, coupled-typescript 3개, closed-scope-generation 2개, frozen-evidence-synthesis 2개다.
- 각 case는 별도 임시 디렉터리에서 `gpt-5.5`와 reasoning `medium`으로 실행한다. 동시성 기본값은 3이다.
- raw JSONL과 최종 모델 메시지는 Git에서 제외한다. committed summary에는 verifier 결과, latency, usage, dated price snapshot 기반 cost, environment digest만 둔다.
- usage 필드가 provider에서 오지 않으면 `null`과 이유를 기록한다. 임의 추정은 금지한다.
