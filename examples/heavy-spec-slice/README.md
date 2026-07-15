# 경기 통합월렛 3화면 slice

102개 화면이 정의된 production spec에서 다음 대표 화면만 구현한 로컬 검증용 웹 데모다.

- `home-wallet`: 모바일 월렛 홈과 상품권별 잔액 sheet
- `pay-qr`: 결제 확인, 요청, 완료 상태
- `admin-policy-list`: 정책 검색·필터와 상세 drawer

원본 spec은 수정하지 않는다. `slice-manifest.json`에 원본 경로와 SHA-256, 선택 화면을 고정한다.

## 단독 실행

```bash
python3 -m http.server 4174 --bind 127.0.0.1 --directory examples/heavy-spec-slice
```

## Studio run 결과로 실행

```bash
npm run build
node apps/studio/dist/server.js \
  --workflow examples/spec-to-demo.wir.yaml \
  --input examples/heavy-spec-slice.input.json \
  --runs .awf/studio-runs.jsonl \
  --demo-source examples/heavy-spec-slice \
  --demo-root .awf/demos \
  --port 4173
```

`Run workflow`를 누르면 결과가 `.awf/demos/<run-id>/`에 offboarded snapshot으로 복사된다. `Onboard demo`를 누른 run만 `/runs/<run-id>/demo/`와 dashboard preview에서 열린다. `Offboard demo`는 파일을 보존한 채 제공을 중단하고 `Delete demo`는 이 snapshot만 삭제한다. 어떤 동작도 input file, JSONL run/event 기록과 원본 demo source를 변경하지 않는다.

## 검증 범위

`npm test --prefix examples/heavy-spec-slice`는 원본 SHA-256, 3개 화면 ID, 핵심 증거 문구, 시각 token과 JS 구문을 검사한다. 이 검사는 실제 workflow 생성 재현성이나 screenshot 기반 시각 회귀를 증명하지 않는다.
