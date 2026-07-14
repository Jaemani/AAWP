# M9 Studio·운영 강화 구현 결과

기준일은 2026년 7월 14일이다. M9은 WIR을 유일한 진실원으로 유지하는 control-plane projection, 최소 Studio와 운영 안전장치를 구현했다.

## 완료 범위

### Control plane

- canonical WIR JSON import/export와 digest-preserving round-trip
- node·edge·contract edit operation과 compiler-backed publishability 판정
- node, edge, artifact schema, verifier와 contract의 stable-ID semantic diff
- `@awf/impact-engine`을 그대로 사용하는 revision impact·cache preview
- authority, read/write, network, secret reference와 worst-case cost graph projection
- append-only event 기반 run timeline, approval inbox, budget, routing과 operator intent projection
- artifact lineage projection과 hidden verifier evidence의 기본 비노출

### Studio

- `Run workflow` 단일 action과 자동 갱신 run history
- 선택한 run의 node 상태, event timeline, artifact와 output panel
- WIR editor, semantic diff, impact, lineage와 evidence는 control-plane API에 유지하고 기본 실행 화면에서는 제거
- 반응형·keyboard-focus 가능한 dependency-free HTML
- YAML/JSON source를 읽는 local-only server
- read-only source API와 2 MiB 제한 compiler check API
- deterministic dry-run 실행 API와 node/event/artifact 기록 화면
- 서버 재시작 후에도 유지되는 local append-only JSONL run history
- run ID 기반 웹 데모 snapshot, dashboard 미리보기와 결과 파일 삭제
- CSP, no-store, nosniff와 frame deny 응답 header

Studio 후보는 source 파일, production runtime 또는 database를 직접 변경하지 않는다. browser-side 정규화는 편집 편의를 위한 것이며 publish 판단은 서버 측 compiler 결과만 사용한다. Local run은 실제 Temporal·tool·model 실행이 아니라 `DETERMINISTIC_SIMULATION`으로 표시한다.

### 운영

- tenant metadata backup의 canonical digest와 tamper 검출
- workflow, event sequence, artifact parent, evidence integrity와 tenant boundary 검사
- provenance topological restore와 lineage equivalence 확인
- raw secret field가 든 event의 backup 거부
- active data의 ancestor를 보존하는 non-destructive retention plan
- 구조적 redaction 이후 digest를 만드는 audit export
- run, artifact, storage, cost와 token quota evaluation
- backup/restore, hidden verifier incident, data governance runbook
- availability, projection lag, recovery, backup과 disclosure SLO·alert

## 완료 기준과 증거

| M9 완료 기준                                               | 구현 증거                                                          |
| ---------------------------------------------------------- | ------------------------------------------------------------------ |
| Studio round-trips canonical WIR without loss              | canonical JSON을 재parse한 digest와 byte representation 동일 test  |
| Source of truth is not UI state                            | Studio source write API 없음, candidate check만 제공, ADR-012      |
| Semantic workflow diff works                               | entity reorder 무시, node field와 policy addition golden assertion |
| Revision impact preview works                              | changed build node와 downstream verifier rerun closure test        |
| Lineage and evidence view works                            | deterministic projection과 hidden detail non-disclosure test       |
| Backup/restore preserves lineage                           | child restore 후 parent ancestry와 event sequence equivalence test |
| Retention, redaction, quotas, alerts and audit are defined | executable operation test와 `docs/operations` 문서                 |

## 검증 결과

- 기존 M9 focused Vitest: 8개 test file, 18개 test 통과
- 현재 Studio focused Vitest: 4개 test file, 5개 test 통과
- 전체 Vitest: 43개 test file, 220개 test 통과
- `npm install`, build, typecheck, lint, format check, schema generation, whitespace 검사 통과
- Studio HTTP source·valid candidate·invalid candidate integration test 통과
- Studio run API의 event sequence와 JSONL restart persistence test 통과

## 남은 운영 증명

M9 코드가 증명한 범위는 portable control-plane metadata와 local Studio다. 실제 PostgreSQL PITR, object CAS cross-region restore, Temporal production backup, 인증 gateway, operator command 실행과 production alert delivery는 배포 환경이 없으므로 실행하지 않았다.

따라서 `infra/backup/README.md`와 runbook에 세 계층 generation 경계를 정의했지만 production-ready 판정에는 다음이 추가로 필요하다.

- 실제 tenant 크기의 PostgreSQL·CAS·Temporal 통합 restore drill
- RPO 15분, RTO 2시간 SLO 계측
- 인증·역할별 Studio API와 hidden evidence 침투 test
- quota enforcement와 operator override event 연결
- 반복 cohort 기반 direct baseline dashboard

canvas drag/drop layout은 workflow 의미를 오염시키지 않도록 제외했다. 현재 Studio는 실행과 기록 확인에 집중한 caveman 구현이다. WIR 편집 기능이 별도 화면으로 다시 필요해지면 실행 console과 섞지 않고 독립된 관리 경로로 제공해야 한다.
