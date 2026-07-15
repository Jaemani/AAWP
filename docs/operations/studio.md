# Studio local usage

AAWP Studio는 WIR source를 읽어 workflow 실행, run 기록과 결과를 한 화면에 투영하는 local control console이다. 제품 identity는 workflow template ID와 분리하며 현재 선택한 workflow는 실행 context에서만 표시한다. 서버는 기본적으로 `127.0.0.1`에만 bind한다. Control console은 WIR source를 수정하지 않지만 등록된 executor process는 자체 sandbox 정책에 따라 파일을 쓸 수 있다. 현재 local executor는 WIR의 filesystem capability를 OS 수준으로 강제하지 않으므로 신뢰한 manifest만 등록한다.

```bash
npm run build
node apps/studio/dist/server.js \
  --workflow examples/spec-to-demo.wir.yaml \
  --executor path/to/execution-manifest.json \
  --port 4173
```

- `GET /`은 최소 Studio를 표시한다.
- `GET /api/workflow`은 source WIR digest와 canonical JSON을 반환한다.
- `POST /api/check`은 2 MiB 이하의 JSON 후보를 compiler로 검사하고 canonical digest를 반환한다.

실행 입력과 기록까지 표시하려면 다음처럼 실행한다.

```bash
node apps/studio/dist/server.js \
  --workflow examples/spec-to-demo.wir.yaml \
  --executor path/to/execution-manifest.json \
  --input examples/spec-to-demo.input.json \
  --runs .awf/studio-runs.jsonl \
  --demo-source examples/heavy-spec-slice \
  --demo-root .awf/demos \
  --port 4173
```

- `GET /api/execution`은 등록된 executor의 작업 디렉터리, node별 argv, timeout과 token policy를 반환한다.
- `POST /api/runs`은 `202`와 running record를 반환한 뒤 manifest에 등록된 process를 실행한다. 실행기가 없으면 `409 WORKFLOW_NOT_EXECUTABLE`, 이미 실행 중이면 `409 WORKFLOW_ALREADY_RUNNING`이다.
- `GET /api/runs`은 append-only JSONL의 최신 run snapshot 목록을 반환한다. Running 중에는 같은 run ID의 갱신 snapshot이 추가되고 조회 시 마지막 snapshot이 선택된다.
- `GET /api/runs/:runId`는 node 상태, event timeline, artifact와 output 기록을 반환한다.
- 성공한 run의 `--demo-source`는 `.awf/demos/<run-id>/`에 content digest가 붙은 offboarded snapshot으로 복사된다.
- `POST /api/runs/:runId/demo/onboard`는 저장된 snapshot을 run ID URL에서 제공한다.
- `POST /api/runs/:runId/demo/offboard`는 URL 제공을 중단하지만 snapshot은 보존한다.
- `GET /runs/:runId/demo/`는 onboarded 상태에서만 웹 데모 결과를 제공한다.
- `DELETE /api/runs/:runId/demo`는 웹 demo snapshot만 삭제한다. Run input, 원본 demo source와 append-only run/event 기록은 보존한다.

## 화면 정보 구조

Studio는 운영자가 가장 자주 확인하는 순서대로 화면을 구성한다.

1. 상단의 `Run workflow`로 workflow를 실행한다.
2. workflow strip에서 단계별 `Waiting`, `Running`, `Completed`, `Failed` 상태를 확인한다.
3. 왼쪽 `Runs` rail에서 영속화된 실행 기록을 선택한다.
4. 오른쪽 상세 영역에서 결과 preview, node, artifact, event와 output을 확인한다.

기록을 선택하면 dashboard 주소가 `/?run=<runId>`로 바뀐다. 이 주소를 다시 열면 해당 run을 바로 선택하므로 운영 검토 링크로 사용할 수 있다. 결과 자체의 독립 주소는 `/runs/<runId>/demo/`다.

새 웹 demo는 기본 offboard 상태다. `Onboard demo`는 run ID 주소와 dashboard preview를 활성화한다. `Offboard demo`는 preview와 URL 제공을 중단하되 snapshot을 남긴다. `Delete demo`는 해당 snapshot만 삭제하며 input file, source, run, node, artifact metadata와 event 기록은 남는다. 같은 workflow를 다시 실행하면 새 run ID로 snapshot을 재생성할 수 있다.

Studio Run은 WIR 자체를 실행 가능한 코드라고 가정하지 않는다. 별도의 `aawp/local-execution-manifest/v1`이 모든 WIR node와 output port를 1:1로 실제 argv에 binding해야 한다. 명령은 shell 없이 `spawn(command, args, { shell: false })`로 실행되며, 입력은 `.awf/executions/<runId>/input.json`, stdout/stderr는 같은 디렉터리의 `logs/`에 보존된다. Manifest 누락·node 누락·port 불일치·순서 불일치는 fail-closed하며 deterministic simulation으로 fallback하지 않는다.

```json
{
  "schemaVersion": "aawp/local-execution-manifest/v1",
  "workflowId": "example",
  "workingDirectory": ".",
  "steps": [
    {
      "nodeId": "build",
      "command": ["codex", "exec", "--json", "--model", "gpt-5.5", "prompt"],
      "timeoutSec": 1800,
      "tokenTracking": "required",
      "outputs": [{ "port": "output", "source": "file", "path": "result.json" }]
    }
  ]
}
```

`command`는 문자열 하나가 아니라 argv 배열이다. `llm` node는 반드시 `tokenTracking: required`여야 하며 usage가 없으면 `MODEL_USAGE_MISSING`으로 실패한다. 비모델 node만 있는 workflow는 `tokenTracking: none`과 실제 `0 tokens · 0 calls`를 기록할 수 있다.

## 실행 계측 계약

새 run에는 optional `metrics` object를 기록한다. Optional인 이유는 기존 JSONL v1 기록을 깨지 않고 `legacy`로 읽기 위해서다.

- `timing.workflowDurationMs`: 입력 검증부터 실제 process, verifier와 결과 snapshot 완료까지의 end-to-end monotonic 경과 시간
- `timing.inputValidationMs`: fixture validation
- `timing.actualExecutionMs`: 등록된 모든 local process 실행 구간
- `timing.deterministicSimulationMs`: 명시적 legacy simulation record에만 존재
- `timing.resultBuild`: `snapshot_materialization`의 measured/not-applicable 상태와 시간
- `tokens`: Codex `turn.completed.usage` 또는 `AAWP_EVENT {"type":"model_usage", ...}`에서 합산한 input/cached/output/reasoning token과 coverage
- `trace`: run ID 기반 trace ID와 workflow/input/trace digest, event count

`Snapshot`은 frontend compile·bundle 시간이 아니다. `--demo-source`의 검증된 정적 결과를 run snapshot으로 복사하고 content digest를 만드는 후처리 시간이다. Builder와 verifier의 실제 시간은 node event와 `actualExecutionMs`에 기록하며 이 field를 build 시간으로 재사용하지 않는다.

기본 화면의 primary action은 `Run workflow` 하나다. `Run input`은 보조 disclosure로 접고, snapshot이 있는 경우 현재 상태에 따라 `Onboard demo` 또는 `Offboard demo`와 `Delete demo`만 표시한다. WIR candidate 검사 API는 남아 있지만 실행 console에는 editor, semantic diff와 impact control을 노출하지 않는다. workflow publish, approval, pause, resume와 cancel은 이 로컬 서버가 수행하지 않는다. production에 연결할 때는 인증된 API gateway가 operator command intent를 받아 runtime event로 기록해야 한다.
