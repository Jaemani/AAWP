# Studio local usage

Studio는 WIR source를 읽어 workflow 실행, run 기록과 결과를 한 화면에 투영하는 local control console이다. 서버는 기본적으로 `127.0.0.1`에만 bind하고 source 파일을 쓰지 않는다.

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
- 성공한 run의 `--demo-source`는 `.awf/demos/<run-id>/`에 content digest가 붙은 snapshot으로 복사된다.
- `GET /runs/:runId/demo/`는 run ID별 웹 데모 결과를 제공한다.
- `DELETE /api/runs/:runId/demo`는 웹 데모 snapshot만 삭제한다. append-only run/event 기록과 source는 보존한다.

## 화면 정보 구조

Studio는 운영자가 가장 자주 확인하는 순서대로 화면을 구성한다.

1. 상단의 `Run workflow`로 workflow를 실행한다.
2. workflow strip에서 단계별 `Waiting`, `Running`, `Completed`, `Failed` 상태를 확인한다.
3. 왼쪽 `Runs` rail에서 영속화된 실행 기록을 선택한다.
4. 오른쪽 상세 영역에서 결과 preview, node, artifact, event와 output을 확인한다.

기록을 선택하면 dashboard 주소가 `/?run=<runId>`로 바뀐다. 이 주소를 다시 열면 해당 run을 바로 선택하므로 운영 검토 링크로 사용할 수 있다. 결과 자체의 독립 주소는 `/runs/<runId>/demo/`다.

웹 데모가 있는 run은 dashboard 안에서 넓게 미리 본다. `Open demo`는 run ID가 포함된 독립 주소를 열고 `Delete result`는 해당 snapshot만 삭제한다. 삭제 후에도 run, node, artifact metadata와 event 기록은 남는다. 같은 workflow를 다시 실행하면 새 run ID로 결과 snapshot을 재생성할 수 있다.

현재 WIR에는 executable implementation binding이 없으므로 이 경로는 `DETERMINISTIC_SIMULATION`이다. Temporal activity, tool 또는 model을 실제 호출하지 않으며 side effect는 실행하지 않는다. Production 실행을 표시하려면 같은 API projection에 Temporal event source와 artifact store를 연결해야 한다.

기본 화면의 primary action은 `Run workflow` 하나다. `Run input`은 보조 disclosure로 접고, 결과가 있는 경우에만 `Open demo`와 `Delete result`를 표시한다. WIR candidate 검사 API는 남아 있지만 실행 console에는 editor, semantic diff와 impact control을 노출하지 않는다. publish, approval, pause, resume와 cancel은 이 로컬 서버가 수행하지 않는다. production에 연결할 때는 인증된 API gateway가 operator command intent를 받아 runtime event로 기록해야 한다.
