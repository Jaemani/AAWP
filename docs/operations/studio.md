# Studio local usage

AAWP Studio는 WIR source를 읽어 workflow 실행, run 기록과 결과를 한 화면에 투영하는 local control console이다. 제품 identity는 workflow template ID와 분리하며 현재 선택한 workflow는 실행 context에서만 표시한다. 서버는 기본적으로 `127.0.0.1`에만 bind하고 source 파일을 쓰지 않는다.

```bash
npm run build
node apps/studio/dist/server.js --workflow examples/spec-to-demo.wir.yaml --port 4173
```

- `GET /`은 최소 Studio를 표시한다.
- `GET /api/workflow`은 source WIR digest와 canonical JSON을 반환한다.
- `POST /api/check`은 2 MiB 이하의 JSON 후보를 compiler로 검사하고 canonical digest를 반환한다.

실행 입력과 기록까지 표시하려면 다음처럼 실행한다.

```bash
node apps/studio/dist/server.js \
  --workflow examples/spec-to-demo.wir.yaml \
  --input examples/spec-to-demo.input.json \
  --runs .awf/studio-runs.jsonl \
  --demo-source examples/heavy-spec-slice \
  --demo-root .awf/demos \
  --port 4173
```

- `POST /api/runs`은 입력 fixture를 검증하고 deterministic dry-run을 실행한다.
- `GET /api/runs`은 append-only JSONL에 저장된 run 목록을 반환한다.
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

현재 WIR에는 executable implementation binding이 없으므로 이 경로는 `DETERMINISTIC_SIMULATION`이다. Temporal activity, tool 또는 model을 실제 호출하지 않으며 side effect는 실행하지 않는다. Production 실행을 표시하려면 같은 API projection에 Temporal event source와 artifact store를 연결해야 한다.

## 실행 계측 계약

새 run에는 optional `metrics` object를 기록한다. Optional인 이유는 기존 JSONL v1 기록을 깨지 않고 `legacy`로 읽기 위해서다.

- `timing.workflowDurationMs`: 입력 검증부터 simulation과 결과 snapshot 완료까지의 monotonic 경과 시간
- `timing.inputValidationMs`: fixture validation
- `timing.deterministicSimulationMs`: WIR simulator 구간
- `timing.resultBuild`: `snapshot_materialization`의 measured/not-applicable 상태와 시간
- `tokens`: runtime usage event에서 합산한 model call, input/output/total token. deterministic mode는 모두 정확히 0
- `trace`: run ID 기반 trace ID와 workflow/input/trace digest, event count

현재 `Result build`는 frontend compile·bundle 시간이 아니다. `--demo-source`의 검증된 정적 결과를 run snapshot으로 복사하고 content digest를 만드는 시간이다. 실제 builder activity가 연결되면 compile, test, snapshot phase를 별도 event로 기록하고 이 field를 거짓으로 재사용하지 않는다.

기본 화면의 primary action은 `Run workflow` 하나다. `Run input`은 보조 disclosure로 접고, snapshot이 있는 경우 현재 상태에 따라 `Onboard demo` 또는 `Offboard demo`와 `Delete demo`만 표시한다. WIR candidate 검사 API는 남아 있지만 실행 console에는 editor, semantic diff와 impact control을 노출하지 않는다. workflow publish, approval, pause, resume와 cancel은 이 로컬 서버가 수행하지 않는다. production에 연결할 때는 인증된 API gateway가 operator command intent를 받아 runtime event로 기록해야 한다.
