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

선택한 run의 dashboard 주소는 `/?run=<runId>`, 독립 demo 주소는 `/runs/<runId>/demo/`다. `Delete result`는 `.awf/demos/<runId>` snapshot만 삭제한다. JSONL run/event 기록과 source는 삭제하지 않는다.

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

## 4. Spec version과 revision

- `documentId`: 같은 논리 spec 계보에서 유지한다.
- `sourceArtifactId`: immutable spec content/version마다 바뀐다.
- `specArtifactId`: 실행 입력이 사용할 exact source version을 pin한다.
- Requirement ID: `documentId + screenId + sourceKey`로 안정화한다.
- Contract digest: requirement 문구, scope 또는 constraint가 바뀌면 달라진다.

다른 spec version을 실행하려면 새 source artifact를 만들고 입력의 `specArtifactId`를 바꾼다. Artifact ID가 document와 맞지 않으면 compile을 거부한다. Revision engine은 변경된 requirement와 downstream builder/verifier를 무효화하고, fingerprint가 같은 scaffold·dependency artifact는 재사용한다.

## 5. Workflow 선택

- 한 번의 작은 수정: `DIRECT`
- 명세에서 제한된 demo 생성: `spec-to-demo` (`CONTRACT`)
- demo feedback을 source spec에 반영: 향후 `spec-feedback-to-spec`
- 열린 조사와 여러 가설: `EXPLORER`

`spec-divide`는 현재 사용하지 않는다. Topic/flow taxonomy 생성이 여러 workflow에서 재사용되고 독립 승인·benchmark가 필요할 때 별도 template로 만든다.

## 6. 결과와 삭제

- Replay: 기존 기록 결과를 반환하고 effect를 다시 실행하지 않는다.
- Rerun: 같은 node를 다시 실행한다.
- Revision: parent run에서 분기해 영향 범위만 다시 실행한다.
- Reproduce: 동일 fingerprint 결과를 재사용하거나 기능적 동등성을 다시 검증한다.

Demo snapshot은 파생 결과이므로 삭제할 수 있다. Source artifact, run/event와 lineage는 별도 retention policy 없이는 삭제하지 않는다.

## 7. 문제 해결

- `UNKNOWN_SCOPE_SELECTOR`: screen/requirement ID와 spec version을 확인한다.
- `UNKNOWN_SCREEN_GROUP`: normalized spec의 `screenGroups` ID를 확인한다.
- `MISSING_SCOPE_SELECTION`: 만들 화면, requirement 또는 group을 명시한다.
- `UNRESOLVED_SCOPE_REQUEST`: 자연어 요청을 명시적 selector로 해소한다.
- `MAX_SCREENS_EXCEEDED`: 요청 범위를 줄이거나 의도적으로 상한을 높인다.
- `SPEC_ARTIFACT_MISMATCH`: 입력의 `specArtifactId`를 선택한 document의 `sourceArtifactId`와 맞춘다.
- Studio에 결과가 없음: run의 demo source 설정과 snapshot 존재 여부를 확인한다. 삭제한 결과는 새 run으로 재생성한다.

운영 API와 보안 경계는 [Studio operations](operations/studio.md), 구현 한계는 각 milestone report를 참고한다.
