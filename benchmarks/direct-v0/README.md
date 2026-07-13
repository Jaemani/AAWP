# DIRECT-v0 기준선

이 기준선은 WIR 워크플로를 사용하지 않는 GPT-5.5 medium 단일 실행자를 고정된 10개 작업에서 측정한다. 각 작업은 격리된 복사본에서 실행하며, 실행자가 볼 수 없는 저장소 소유 검증기가 결과를 판정한다.

```bash
rtk npm run bench:direct
```

기본 동시성은 3이다. 단일 case를 하네스 점검에 사용할 수 있다.

```bash
rtk npm run bench:direct -- --case small-edit-copy --concurrency 1
```

`manifest.json`이 case ID, 분류, 고정 prompt, seed tree, verifier와 timeout을 소유한다. 원본 JSONL, 모델의 마지막 메시지, 실행 workspace는 `runs/`와 `workspaces/` 아래에 보존하되 Git에는 넣지 않는다. 10건 전체 실행일 때만 저장소 루트의 `summary.json`을 갱신한다.

`summary.json`에는 검증 결과, 지연, provider가 반환한 token usage와 환경 digest만 기록한다. 환경에는 manifest, 전체 seed tree, hidden verifier와 이들을 합친 cohort SHA-256이 포함된다. 현재 ChatGPT 인증 Codex 실행 이벤트에는 신뢰할 수 있는 실행별 USD 가격이 없으므로 `costUsd`는 `null`이다.

검증기 자체를 수정했을 때는 모델을 다시 호출하지 않고 보존된 workspace를 재판정한다.

```bash
rtk npm run bench:direct:reverify -- 20260713T214151659Z
```
