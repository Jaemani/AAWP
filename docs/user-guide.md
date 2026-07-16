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
npm run studio -- --port 4173
```

`http://127.0.0.1:4173/`을 연다.

1. `Workflow`에서 실행할 workflow를 선택한다. Execution manifest가 없는 workflow는 구조를 볼 수 있지만 Run은 비활성화된다.
2. `spec-to-demo`는 project-relative source spec 경로, screen ID와 요청 원문을 입력한다. Screen ID는 쉼표 또는 줄바꿈으로 구분하며 빈 선택을 전체 화면으로 해석하지 않는다.
3. `Run <workflow-id>`를 누른다. Studio가 `runs/requests/<requestId>`에 source projection과 `DESIGN.md` digest를 고정한 뒤 등록된 실제 process chain을 시작한다.
4. Workflow strip에서 기능적 작업명, 구현 설명과 node 상태를 확인한다. `displayName`과 `description`이 없는 이전 WIR은 기술 node ID로 fallback한다.
5. `Runs`에서 선택 workflow의 과거 run을 열고 Result preview, artifact, execution timeline, token과 output을 확인한다.

기본 `Runtime` 표시는 `Project workspace · N local steps`이므로 checkout 경로가 다른 팀원에게도 같은 의미를 갖는다. 실제 cwd와 argv는 접힌 `Technical details`에만 표시하며 run record에도 evidence로 보존한다.

선택한 run의 dashboard 주소는 `/?run=<runId>`, onboarded demo 주소는 `/runs/<runId>/demo/`, 저장 snapshot 검사 주소는 `/runs/<runId>/demo-preview/`다.

- `Open demo`: onboard/offboard 상태를 바꾸지 않고 저장된 snapshot을 새 탭의 local 검사 주소로 연다.
- `Onboard demo`: 저장된 snapshot을 URL과 preview에서 활성화하고 이전 active demo를 자동으로 offboard한다.
- `Offboard demo`: URL 제공을 중단하지만 snapshot을 보존한다.
- `Delete demo`: `runs/<runId>/demo` snapshot만 삭제한다.

새 snapshot은 기본 offboard 상태다. 어떤 lifecycle action도 `runs/<runId>/input.json`, `artifacts/`, node log, `run.json`, `runs/history.jsonl`과 lineage를 변경하지 않는다.

Studio server는 local-only이다. `--executor`가 없으면 `Not executable`로 표시하고 Run을 비활성화하며, 몇 ms짜리 simulation 성공 record를 대신 만들지 않는다. 실행 manifest가 있으면 `Local process`로 표시하고 Run 상세의 `End-to-end time`은 입력 검증부터 실제 builder, verifier와 snapshot 완료까지의 monotonic 경과 시간이다. `Snapshot`은 application compiler 시간이 아니라 검증된 결과를 run별로 복사·digest하는 후처리 시간이며 없으면 `N/A`다.

`Tokens`는 executor가 보존한 Codex JSONL `turn.completed.usage` 또는 표준 `AAWP_EVENT model_usage`의 합계다. Summary는 `1.23K`, `925.8K`, `1.23M`처럼 압축해 표시하고 hover title은 input/cached/output/reasoning 정확값과 coverage를 유지한다. `llm` WIR node는 usage evidence가 없으면 성공하지 않는다. `0 · 0 calls`는 모든 node가 `tokenTracking: none`인 실제 비모델 workflow에서만 유효하다. `Not reported`는 0과 다르며 telemetry가 불완전하다는 뜻이다. `Traceability`는 run ID를 trace ID로 사용하고 workflow, input과 실제 execution event digest를 함께 표시한다.

`Execution timeline`의 `elapsedMs`는 run 시작 기준 monotonic offset이다. 같은 표시 시각의 연속 event는 첫 행에만 시간을 표시하고, model/verifier completion이 이미 보여준 node duration은 후속 `NodeCompleted`에서 반복하지 않는다. `ModelInvoked`는 model process 시작 시점, `ModelCompleted`는 duration과 usage가 확정된 종료 시점이다. Timeline의 작업명은 WIR node의 `displayName`을 사용하고 구현 `description`은 해당 node의 첫 event에만 붙인다. 기술 ID는 tooltip과 workflow strip에 보존한다. Node 완료 event에는 실제 child-process `durationMs`, exit code와 stdout/stderr log path가 계속 저장된다. POST는 running record를 먼저 반환하고 Studio는 5초마다 갱신한다. Timing 계약 추가 전의 기존 `DETERMINISTIC_SIMULATION` 기록은 `legacy`로 표시한다. 현재 executor는 local process이고 Temporal worker 복구, 인증, 승인, pause/resume/cancel은 아직 연결되지 않았다.

### Run 파일 구조

모든 workflow는 대화와 무관하게 같은 구조를 사용한다.

```text
runs/history.jsonl
runs/requests/<request-id>/{request.json,source-spec.json}
runs/<runId>/{run.json,input.json,logs/,artifacts/,demo/}
```

이전 `.awf` 기록은 `npm run migrate:runs`로 원본을 삭제하지 않고 통합할 수 있다. 자세한 규약은 [`runs/README.md`](../runs/README.md)를 참고한다.

명시적인 model 없는 dry-run이 필요하면 Studio Run이 아니라 `awf simulate`를 사용한다. 두 경로는 기록과 UI에서 합치지 않는다. Execution manifest 형식과 오류 코드는 [Studio 운영 문서](operations/studio.md)를 참고한다.

현재 Studio는 대화와 독립적으로 실행되지만 local-only이다. WIR, catalog, execution manifest, `WORKFLOW.md`, source request와 `DESIGN.md`만으로 같은 경계를 재구성할 수 있으나 실행 머신에는 Codex CLI 설치·인증이 필요하다. 인증·tenant isolation·remote worker·secret broker·pause/cancel과 durable resume가 필요한 팀 배포 단계는 아직 아니다.

## 3. `spec-to-demo` 입력 범위

새 실행은 먼저 source spec을 pinned request로 복사한다.

Studio의 structured input이 아래 과정을 자동 수행한다. CLI에서 request를 미리 만들고 싶을 때만 다음 명령을 사용한다.

```bash
npm run request:spec-to-demo -- \
  --source path/to/spec.json \
  --screen admin-voucher-policy-setup \
  --screen admin-payout-execution \
  --request "정책 설정과 지급 실행 화면을 만들어줘" \
  --id policy-payout-pilot
```

생성된 `request.json`에는 source spec과 `DESIGN.md`의 byte SHA-256이 들어간다. Builder는 [workflow WIR](../workflows/templates/spec-to-demo/workflow.wir.yaml), [execution manifest](../workflows/templates/spec-to-demo/execution.manifest.json), [실행 지침](../workflows/templates/spec-to-demo/WORKFLOW.md)만으로 동작한다. 업무 의미는 pinned source spec, 시각 디자인은 `DESIGN.md` 하나만 사용한다. 이전 demo, `presentation-contract.yaml`, `visual-reference-contract.yaml`, 기존 CSS와 대화 기억은 입력에서 제외된다.

기본 request 생성은 heavy source 전체를 model에 전달하지 않는다. 요청한 `screens`와 그 화면이 직접 참조하는 actor, component, interaction만 `source-spec.json` projection으로 고정한다. `request.json`의 `sourceSpec.byteSha256`은 projection을, `sourceSpec.originalByteSha256`은 원본을 추적한다. 전체 source가 필요한 진단 실행만 `--full-source`를 명시한다.

`build-demo`는 artifact 작성 뒤 browserless public checker로 필수 파일, JavaScript/manifest, canonical screen ID/hash route, exact source copy, canonical product identity, 제품 UI의 구조용 label 누출과 `DESIGN.md`의 정적 shell 조건을 확인한다. Builder sandbox에서 Playwright나 release verifier를 실행하지 않는다. Runtime은 `inspect-release → 최대 1회 repair-demo → verify-release`를 별도 process로 실행해 실제 layout, overflow와 interaction을 판정한다. 최종 verifier가 실패하면 candidate를 성공이나 release로 승격하지 않지만, 생성된 파일이 정상적인 static demo라면 `Failed candidate · inspection only` snapshot으로 보존해 Studio iframe과 `Open demo`에서 원인을 확인할 수 있다. 실패 candidate는 onboard할 수 없다.

`DESIGN.md` 문구를 수정했다고 model-backed workflow를 자동 재실행하지 않는다. 우선 기존 artifact에 static/unit/browser verifier를 재사용한다. 실제 생성 결과를 다시 볼 필요가 있고 사용자가 명시적으로 재생성을 요청한 경우에만 고정된 대표 화면 2–3개 cohort를 실행하며, 디자인 검증 때문에 전체 spec이나 화면 집합을 확장하지 않는다.

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
  --runs runs/history.jsonl \
  --demo-source examples/heavy-spec-policy-operations \
  --demo-root runs \
  --port 4173
```

Exact screen ID와 source digest는 `examples/heavy-spec-policy-operations/selection-manifest.json`이 고정한다. 새 run은 offboard 상태이므로 dashboard에서 `Onboard demo`를 눌러야 preview와 run ID URL이 열린다.

이 예제의 `bundle-manifest.json`은 정책, 유통, 발행·준비자산을 별도 bundle로 제공한다. Bundle을 고른 뒤 surface와 화면을 전환한다. 관리 콘솔과 발행사 콘솔은 서로 다른 surface이고, 각 화면은 독립 `screen-artifacts/<screen-id>.json`과 route를 가진다. 향후 mobile screen은 같은 manifest에 `formFactor: "mobile"` surface로 추가한다.

화면 위쪽/바깥의 bundle selector는 결과 collection을 탐색하는 AAWP UI이고, iframe 안의 240px rail은 source spec이 정의한 실제 제품 navigation이다. 제품 rail과 CTA가 현재 22-screen selection을 가리키면 연결된 화면으로 이동한다. 원본 spec에는 있지만 이번 selection 밖인 목적지는 `이번 데모 범위 밖`으로 안내한다. 목적지가 불명확한 affordance는 버튼을 유지한 채 Spec feedback을 표시하며 임의 screen을 만들거나 연결하지 않는다.

Bundle, surface와 screen 선택은 preview 위의 단일 horizontal switcher에 있다. 제품 rail과 나란히 두 번째 좌측 panel을 만들지 않는다. `독립 화면 열기`는 현재 run snapshot의 절대 screen URL을 새 탭에서 열며, 독립 화면 안의 source CTA도 target 독립 화면으로 이어진다.

제품 화면의 제목은 `screen.copy`에서 `key=title`인 사용자용 문구를 우선한다. Route, purpose, dataNeeds, component 이름과 spec feedback count는 제품 DOM에 표시하지 않고 Studio의 artifact·event inspection 영역에서만 확인한다.

필터, 탭, drawer, 단계형 폼과 submit feedback은 demo 안에서 동작한다. 표시되는 record와 금액은 상호작용 검토용 예시 데이터이고, screen 구조·copy·권한 경계의 진실원은 pinned source artifact다.

`presentation-contract.yaml`, `visual-reference-contract.yaml`과 과거 demo adapter는 기존 fixture의 provenance로만 남는다. `spec-to-demo` 0.4.0은 필요한 token, web/mobile composition, interaction과 접근성 기준을 `DESIGN.md`에 흡수했으며 demo manifest에는 이 파일의 path/version/digest만 기록한다. 1.2.0–1.6.0에서 control geometry, compact panel anatomy, product identity, dark authority rail과 executable browser acceptance를 정립했다. 1.7.0은 token-only trap을 피하도록 표준 YAML front matter와 decision prose를 분리했다. 1.8.0은 실제 이전/신규 run 비교에서 드러난 over-boxing과 긴 pill을 막았고, 1.9.0은 financial metric 줄바꿈과 raw schema 이름·추상 authority label 노출을 실행 가능한 금지 규칙으로 닫았다. 1.10.0은 mobile route가 표시 없는 horizontal scroll 뒤에 숨는 회귀를 막고, 작은 route 묶음은 모두 동시에 보이도록 한다. 1.10.1은 mobile header의 neutral surface와 별개로 짧은 brand eyebrow 또는 작은 marker 한 곳에 전용 brand accent를 보장한다.

저장된 pilot의 desktop/mobile geometry와 overflow는 다음처럼 재검사할 수 있다. `--screen`은 반복할 수 있고 screenshot과 JSON report는 기본적으로 `tmp/demo-layout-qa/`에 생성된다.

```bash
npm run qa:demo-layout -- \
  --url http://127.0.0.1:4173/runs/<runId>/demo-preview/ \
  --screen admin-voucher-policy-setup \
  --screen admin-payout-execution
```

검사는 먼저 모든 화면 URL의 HTTP 성공을 요구한다. 그 뒤 1440×1100과 390×844에서 한 줄 input/select 높이 차이 1px 미만, 비의도 horizontal overflow 없음, field/action 겹침 없음, form과 action 사이 16px 이상을 확인한다. 따라서 `demo_not_found` 같은 JSON 오류 응답은 빈 정상 화면으로 통과하지 않는다.

정확성의 현재 경계도 구분한다. Source screen object, component reference, design token, navigation target과 interaction description은 byte/digest 또는 deep-equality test로 고정된다. 반면 각 component의 모든 prop이 화면 field로 노출되는지와 Figma 수준 pixel geometry는 아직 전수 acceptance가 없다. 따라서 현재 demo는 source-faithful structural prototype이지 22개 화면의 field-by-field 완전 구현이라고 주장하지 않는다. 예시 record도 source authority data가 아니다.

### 원본/담당자별 candidate 비교 예제

원본 spec과 feedback 적용 결과를 같은 검토 UI에서 담당 업무별 1–2화면씩 전환할 수 있다.

```bash
npm run generate:heavy-spec-revision
npm run generate:heavy-spec-role-comparison
npm test --prefix examples/heavy-spec-role-comparison
node apps/studio/dist/server.js \
  --workflow examples/spec-to-demo.wir.yaml \
  --input examples/heavy-spec-role-comparison.input.json \
  --runs runs/history.jsonl \
  --demo-source examples/heavy-spec-role-comparison \
  --demo-root runs \
  --port 4173
```

비교 순서는 `spec version → 담당 업무 → 화면`이다. 제품의 좌측 navigation rail은 하나만 유지하며 비교 UI를 두 번째 rail로 만들지 않는다. 8개 담당 업무에 candidate 15개, 원본 12개 고유 화면 projection을 사용한다. 원본에 지급 담당 전용 화면이 없으므로 임의 제품 화면을 만들지 않고 `SPEC GAP`을 표시한다.

Candidate runtime 입력은 `generated/refined-production-spec.role-workspaces.candidate.json` 한 파일이다. 이 파일은 원본 전체 110-screen document와 `meta.revision`의 parent digest, 13개 feedback ID, contract digest, candidate 상태를 함께 포함한다. `patch-proposal.json`, `revision-summary.json`, `revision-verdict.json`은 재현·감사용 sidecar이며 demo 실행 입력이 아니다.

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

Spec field 표준은 profile validator가 소유한다. 현재 `gyeonggi-integrated-wallet-production-spec/v1` profile은 heavy spec의 root, stable ID, route, component/actor/nav/interaction 참조, baseline entity 보존과 admin/issuer authority root 분리를 검사한다.

```bash
npm run validate:heavy-spec -- refined-production-spec.json
```

담당자별 화면그룹 피드백은 `examples/heavy-spec-feedback-revision/feedback-intent.json`의 13개 stable ID로 컴파일됐다. `npm run generate:heavy-spec-revision`은 76개 typed operation, 110-screen 단일 child spec, summary와 verdict를 `generated/`에 재현한다. 원본, `designTokens`, `extendedDesign`과 관련 없는 소비자·가맹점 화면은 변경하지 않는다. Child의 `meta.revision.executionInput`은 `this_document`이며 sidecar가 없어도 부모와 feedback 계보를 식별할 수 있다.

Child candidate는 verifier를 통과해도 승인되지 않았다. 결과 directory의 `verification-summary.json`과 `revision-verdict.json`에서 candidate 상태, digest, maturity와 blocker를 확인하고 diff를 검토한 뒤에만 별도 approval로 promotion해야 한다. Production model proposal은 Studio에서 실행되지만 Studio diff/approval UI는 아직 없다. 현재 결과를 사람 승인까지 끝난 자동 교정으로 보아서는 안 된다. 상세 경계는 [`spec-feedback-to-spec` 가이드](spec-feedback-to-spec.md)를 참고한다.

S2 결과에는 `data-contract.json`, `api-contract.json`, `preview-blocker-routing.json`이 추가된다. 이 계약은 logical entity/query/command와 source digest를 고정하며 DB table이나 HTTP endpoint를 자동 생성하지 않는다. `status=blocked`이면 blocker owner와 question을 해결해야 하며 Preview 환경은 생성되지 않는다. `status=ready`인 fixture만 local PGlite harness에서 resource version, idempotency와 lease를 검증할 수 있다. 이 harness를 production DB로 사용하지 않는다.

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
