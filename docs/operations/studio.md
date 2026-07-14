# Studio local usage

Studio는 WIR source를 읽어 graph, node contract와 canonical JSON editor를 제공한다. 서버는 기본적으로 `127.0.0.1`에만 bind하고 source 파일을 쓰지 않는다.

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
  --port 4173
```

- `POST /api/runs`은 입력 fixture를 검증하고 deterministic dry-run을 실행한다.
- `GET /api/runs`은 append-only JSONL에 저장된 run 목록을 반환한다.
- `GET /api/runs/:runId`는 node 상태, event timeline, artifact와 output 기록을 반환한다.

현재 WIR에는 executable implementation binding이 없으므로 이 경로는 `DETERMINISTIC_SIMULATION`이다. Temporal activity, tool 또는 model을 실제 호출하지 않으며 side effect는 실행하지 않는다. Production 실행을 표시하려면 같은 API projection에 Temporal event source와 artifact store를 연결해야 한다.

기본 화면은 `Run workflow`와 실행 기록만 제공한다. WIR candidate 검사 API는 남아 있지만 실행 console에는 editor, semantic diff와 impact control을 노출하지 않는다. publish, approval, pause, resume와 cancel은 이 로컬 서버가 수행하지 않는다. production에 연결할 때는 인증된 API gateway가 operator command intent를 받아 runtime event로 기록해야 한다.
