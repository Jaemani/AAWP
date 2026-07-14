# Studio local usage

Studio는 WIR source를 읽어 graph, node contract와 canonical JSON editor를 제공한다. 서버는 기본적으로 `127.0.0.1`에만 bind하고 source 파일을 쓰지 않는다.

```bash
npm run build
node apps/studio/dist/server.js --workflow examples/spec-to-demo.wir.yaml --port 4173
```

- `GET /`은 최소 Studio를 표시한다.
- `GET /api/workflow`은 source WIR digest와 canonical JSON을 반환한다.
- `POST /api/check`은 2 MiB 이하의 JSON 후보를 compiler로 검사하고 canonical digest를 반환한다.

브라우저의 node contract 편집은 후보 JSON만 바꾼다. publish, approval, pause, resume와 cancel은 이 로컬 서버가 수행하지 않는다. production에 연결할 때는 인증된 API gateway가 operator command intent를 받아 runtime event로 기록해야 한다.
