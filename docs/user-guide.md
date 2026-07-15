# AAWP 사용자 가이드

## 1. 설치와 검증

Node.js 24 이상, npm 11 이상 환경에서 실행한다.

```bash
npm ci
npm run build
npm test
```

WIR 검사와 model 호출 없는 simulation:

```bash
node apps/cli/dist/index.js check examples/spec-to-demo.wir.yaml
node apps/cli/dist/index.js simulate examples/spec-to-demo.wir.yaml \
  --input examples/spec-to-demo.input.json
```

`check`은 graph, port type, 권한, budget와 release policy를 검사한다. `simulate`는 외부 model, network, secret과 side effect를 호출하지 않는다.

## 2. AAWP Studio

```bash
node apps/studio/dist/server.js \
  --workflow examples/spec-to-demo.wir.yaml \
  --input examples/heavy-spec-slice.input.json \
  --runs .awf/studio-runs.jsonl \
  --demo-source examples/heavy-spec-slice \
  --demo-root .awf/demos \
  --port 4173
```

`http://127.0.0.1:4173/`을 연다.

1. 필요하면 `Run input`에서 JSON 입력을 확인한다.
2. `Run workflow`를 누른다.
3. Workflow strip에서 node 상태를 확인한다.
4. `Runs`에서 과거 run을 선택한다.
5. Result preview, node, artifact, event와 output을 확인한다.

선택한 run의 dashboard 주소는 `/?run=<runId>`, onboarded demo 주소는 `/runs/<runId>/demo/`다.

- `Onboard demo`: 저장된 snapshot을 URL과 preview에서 활성화한다.
- `Offboard demo`: URL 제공을 중단하지만 snapshot을 보존한다.
- `Delete demo`: `.awf/demos/<runId>` snapshot만 삭제한다.

새 snapshot은 기본 offboard 상태다. 어떤 lifecycle action도 Run input file, 원본 demo source, JSONL run/event와 lineage를 변경하지 않는다.

현재 Studio server는 local-only이고 `DETERMINISTIC_SIMULATION`을 표시한다. 실제 Temporal·model·tool 실행, 인증, 승인, pause/resume/cancel은 아직 연결되지 않았다.

## 3. `spec-to-demo` 입력 범위

### 특정 화면

정확한 screen ID를 안다면 `scopeSelection.screenIds`를 사용한다.

```json
{
  "specArtifactId": "spec-wallet-v3",
  "scopeSelection": {
    "requestText": "정책 목록과 정책 효과 화면만 만들어줘",
    "screenIds": ["admin-policy-list", "admin-policy-effect-dashboard"]
  },
  "demoProfile": "web-react",
  "targetViewports": [{ "width": 1440, "height": 900 }],
  "constraints": { "maxScreens": 2, "accessibilityLevel": "wcag-aa-target" }
}
```

### 화면 안의 특정 요구사항

Requirement key 또는 `screenId/requirementKey`를 사용한다. 같은 화면의 다른 requirement는 자동으로 포함되지 않는다.

```json
{
  "scopeSelection": {
    "requirementKeys": ["admin-policy-list/policy-version-drawer"]
  }
}
```

### 주제별 모든 화면

정규화된 spec의 `screenGroups`에 topic group을 선언한다.

```json
{
  "screenGroups": [
    {
      "id": "policy",
      "title": "정책 관련 화면",
      "kind": "topic",
      "aliases": ["정책", "policy"],
      "screenIds": ["admin-policy-list", "admin-policy-effect-dashboard"]
    }
  ]
}
```

사용자 요청은 resolver가 group ID로 해석한다.

```json
{
  "scopeSelection": {
    "requestText": "정책 관련 페이지 만들어줘",
    "groupIds": ["policy"]
  }
}
```

### 플로우별 모든 화면

`kind: "flow"` group은 순서 있는 사용자·운영 흐름에 속한 화면 집합을 표현한다. 현재 contract는 포함 집합을 고정하고, 화면 순서는 spec의 별도 navigation/flow metadata가 소유한다.

```json
{
  "scopeSelection": {
    "requestText": "정책, 유통, 발행, 준비 관련 화면을 플로우별로 만들어줘",
    "groupIds": ["policy-flow", "circulation-flow", "issuance-flow", "reserve-flow"]
  },
  "constraints": { "maxScreens": 24 }
}
```

`maxScreens`는 group 확장 이후 적용된다. 초과하면 일부를 임의로 버리지 않고 `MAX_SCREENS_EXCEEDED`로 중단한다.

Selection을 생략해도 전체 화면을 자동 선택하지 않는다. 전체 화면이 필요하면 모든 screen ID 또는 명시적인 `all` group을 선택해야 한다. 큰 spec을 실수로 전부 생성하는 것을 막기 위한 fail-closed 규칙이다.

### 자연어 요청 처리 경계

1. Resolver가 screen title, purpose, route, actor, taxonomy와 alias를 읽는다.
2. 자연어를 `screenIds`, `requirementKeys`, `groupIds` 후보로 변환한다.
3. 둘 이상의 의미가 가능하거나 범위가 크면 사용자에게 selection preview를 보여 승인받는다.
4. Compiler가 source artifact와 ID 존재 여부, duplicate, max screen을 검증한다.
5. 최종 `ScopeContract`에 요청 원문, 포함·제외 screen, requirement와 group ID를 기록한다.

요청 원문만 있고 명시적 ID가 없으면 `UNRESOLVED_SCOPE_REQUEST`로 거부한다. AI가 prompt 안에서만 임의 범위를 정한 상태로 builder를 실행하지 않는다.

### 22-screen 정책·유통·발행·준비자산 예제

저장소에는 102-screen source에서 22개 화면만 명시적으로 선택한 fixture가 있다. Source spec의 흐름·논리적 일관성은 수정하지 않는다.

```bash
npm test --prefix examples/heavy-spec-policy-operations
node apps/studio/dist/server.js \
  --workflow examples/spec-to-demo.wir.yaml \
  --input examples/heavy-spec-policy-operations.input.json \
  --runs .awf/studio-runs.jsonl \
  --demo-source examples/heavy-spec-policy-operations \
  --demo-root .awf/demos \
  --port 4173
```

Exact screen ID와 source digest는 `examples/heavy-spec-policy-operations/selection-manifest.json`이 고정한다. 새 run은 offboard 상태이므로 dashboard에서 `Onboard demo`를 눌러야 preview와 run ID URL이 열린다.

이 예제의 `bundle-manifest.json`은 정책, 유통, 발행·준비자산을 별도 bundle로 제공한다. Bundle을 고른 뒤 surface와 화면을 전환한다. 관리 콘솔과 발행사 콘솔은 서로 다른 surface이고, 각 화면은 독립 `screen-artifacts/<screen-id>.json`과 route를 가진다. 향후 mobile screen은 같은 manifest에 `formFactor: "mobile"` surface로 추가한다.

화면 위쪽/바깥의 bundle selector는 결과 collection을 탐색하는 AAWP UI이고, iframe 안의 240px rail은 source spec이 정의한 실제 제품 navigation이다. 제품 rail과 CTA가 현재 22-screen selection을 가리키면 연결된 화면으로 이동한다. 원본 spec에는 있지만 이번 selection 밖인 목적지는 `이번 데모 범위 밖`으로 안내한다. 목적지가 불명확한 affordance는 버튼을 유지한 채 Spec feedback을 표시하며 임의 screen을 만들거나 연결하지 않는다.

Bundle, surface와 screen 선택은 preview 위의 단일 horizontal switcher에 있다. 제품 rail과 나란히 두 번째 좌측 panel을 만들지 않는다. `독립 화면 열기`는 현재 run snapshot의 절대 screen URL을 새 탭에서 열며, 독립 화면 안의 source CTA도 target 독립 화면으로 이어진다.

필터, 탭, drawer, 단계형 폼과 submit feedback은 demo 안에서 동작한다. 표시되는 record와 금액은 상호작용 검토용 예시 데이터이고, screen 구조·copy·권한 경계의 진실원은 pinned source artifact다.

`presentation-contract.yaml`은 source와 별도로 pinned된다. `generate-bundle.mjs`가 `design-tokens.css`를 만들며 screen artifact는 presentation digest와 surface adapter version을 기록한다. 현재 adapter는 selected source의 45개 component contract를 모두 명시적으로 지원하지 않으면 실행을 거부한다.

정확성의 현재 경계도 구분한다. Source screen object, component reference, design token, navigation target과 interaction description은 byte/digest 또는 deep-equality test로 고정된다. 반면 각 component의 모든 prop이 화면 field로 노출되는지와 Figma 수준 pixel geometry는 아직 전수 acceptance가 없다. 따라서 현재 demo는 source-faithful structural prototype이지 22개 화면의 field-by-field 완전 구현이라고 주장하지 않는다. 예시 record도 source authority data가 아니다.

## 4. `spec-feedback-to-spec`

Workflow IR 검사:

```bash
node apps/cli/dist/index.js check examples/spec-feedback-to-spec.wir.yaml
```

실행 순서는 pinned source → feedback contract → patch proposal → deterministic candidate → independent verdict → 사람 승인이다. Source는 직접 변경하지 않는다.

```json
{
  "schemaVersion": "aawp/spec-feedback-intent/v1",
  "sourceArtifactId": "spec-wallet-v3",
  "sourceDigest": "<canonical sha256>",
  "requestText": "정책 목록의 빈 상태 문구를 바꿔줘",
  "feedback": [
    {
      "id": "feedback-1",
      "text": "빈 상태에서 다음 행동을 안내해줘",
      "targetPointer": "/screens/0/copy/empty"
    }
  ],
  "authority": {
    "allowedPathPrefixes": ["/screens/0"],
    "allowRemove": false
  },
  "profile": {
    "id": "wallet-spec",
    "requiredPointers": ["/meta", "/screens"]
  }
}
```

Spec field 표준은 profile validator가 소유한다. 현재 template은 revision substrate까지 구현됐고 production model activity, Studio diff/approval UI와 heavy spec 전용 semantic validator는 아직 연결되지 않았다. 상세 경계는 [`spec-feedback-to-spec` 가이드](spec-feedback-to-spec.md)를 참고한다.

## 5. Spec version과 revision

- `documentId`: 같은 논리 spec 계보에서 유지한다.
- `sourceArtifactId`: immutable spec content/version마다 바뀐다.
- `specArtifactId`: 실행 입력이 사용할 exact source version을 pin한다.
- Requirement ID: `documentId + screenId + sourceKey`로 안정화한다.
- Contract digest: requirement 문구, scope 또는 constraint가 바뀌면 달라진다.

다른 spec version을 실행하려면 새 source artifact를 만들고 입력의 `specArtifactId`를 바꾼다. Artifact ID가 document와 맞지 않으면 compile을 거부한다. Revision engine은 변경된 requirement와 downstream builder/verifier를 무효화하고, fingerprint가 같은 scaffold·dependency artifact는 재사용한다.

## 6. Workflow 선택

- 한 번의 작은 수정: `DIRECT`
- 명세에서 제한된 demo 생성: `spec-to-demo` (`CONTRACT`)
- 오탈자처럼 작은 spec feedback: `DIRECT` 실행자 + 동일한 typed revision contract
- 여러 화면·요구사항의 spec feedback: `spec-feedback-to-spec` (`CONTRACT`)
- 열린 조사와 여러 가설: `EXPLORER`

`spec-divide`는 현재 사용하지 않는다. Topic/flow taxonomy 생성이 여러 workflow에서 재사용되고 독립 승인·benchmark가 필요할 때 별도 template로 만든다.

## 7. 결과와 삭제

- Replay: 기존 기록 결과를 반환하고 effect를 다시 실행하지 않는다.
- Rerun: 같은 node를 다시 실행한다.
- Revision: parent run에서 분기해 영향 범위만 다시 실행한다.
- Reproduce: 동일 fingerprint 결과를 재사용하거나 기능적 동등성을 다시 검증한다.

Demo snapshot은 파생 결과이므로 offboard하거나 삭제할 수 있다. `Offboard`는 되돌릴 수 있고 파일을 보존한다. `Delete demo`는 snapshot만 제거한다. Input file, source artifact, run/event와 lineage는 별도 retention policy 없이는 삭제하지 않는다.

## 8. 문제 해결

- `UNKNOWN_SCOPE_SELECTOR`: screen/requirement ID와 spec version을 확인한다.
- `UNKNOWN_SCREEN_GROUP`: normalized spec의 `screenGroups` ID를 확인한다.
- `MISSING_SCOPE_SELECTION`: 만들 화면, requirement 또는 group을 명시한다.
- `UNRESOLVED_SCOPE_REQUEST`: 자연어 요청을 명시적 selector로 해소한다.
- `MAX_SCREENS_EXCEEDED`: 요청 범위를 줄이거나 의도적으로 상한을 높인다.
- `SPEC_ARTIFACT_MISMATCH`: 입력의 `specArtifactId`를 선택한 document의 `sourceArtifactId`와 맞춘다.
- Studio에 결과가 없음: run의 demo source 설정과 snapshot 존재 여부를 확인한다. 삭제한 결과는 새 run으로 재생성한다.

운영 API와 보안 경계는 [Studio operations](operations/studio.md), 구현 한계는 각 milestone report를 참고한다.
