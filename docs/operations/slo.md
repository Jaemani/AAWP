# Control plane SLO와 alert

기준일은 2026년 7월 14일이다. 이 목표는 첫 production cohort의 30일 rolling window에 적용한다. verifier 자체 품질과 model 결과 품질은 availability SLO와 분리해 eval에서 관리한다.

## SLO

| 신호                           |       목표 | 측정 경계                                                        |
| ------------------------------ | ---------: | ---------------------------------------------------------------- |
| WIR check API availability     |      99.9% | 인증을 통과한 요청 중 5xx가 아닌 비율                            |
| run command durable acceptance |      99.9% | 승인·pause·resume·cancel command가 durable history에 기록된 비율 |
| projection freshness p95       |  10초 이하 | 마지막 event 발생부터 Studio read model 반영까지                 |
| revision impact preview p95    |   2초 이하 | 1,000 node 이하 WIR의 preview 요청                               |
| worker 장애 후 복구 성공률     | 99.5% 이상 | 허용된 retry window 안에 terminal 또는 waiting 상태로 복구한 run |
| backup metadata RPO            |  15분 이하 | 마지막 검증 완료 backup 시각                                     |
| 전체 restore RTO               | 2시간 이하 | 격리 환경 restore 시작부터 lineage audit 완료까지                |
| hidden verifier leakage        |        0건 | 권한 없는 projection·audit·backup consumer에 상세가 노출된 사건  |

## Alert

| 이름                              | 조건                                                    | 심각도                     | 첫 대응                                                   |
| --------------------------------- | ------------------------------------------------------- | -------------------------- | --------------------------------------------------------- |
| `ControlPlaneErrorBudgetFastBurn` | 1시간 burn rate 14.4배 또는 6시간 6배                   | page                       | 최근 deploy 중지, API error 분류                          |
| `ProjectionLagHigh`               | p95 30초 초과가 10분 지속                               | ticket, 60초 초과 page     | event consumer lag와 poison event 확인                    |
| `DurableCommandMissing`           | command 응답 후 event 미관찰 60초                       | page                       | 중복 command 금지, event key로 reconcile                  |
| `WorkerRecoveryFailed`            | recovery test/run이 retry window 초과                   | page                       | runtime history, activity heartbeat, dependency 상태 확인 |
| `BackupStale`                     | 검증 backup이 30분 이상 없음                            | page                       | metadata snapshot과 CAS replication 상태 확인             |
| `BackupIntegrityFailed`           | digest, event sequence, evidence 또는 lineage 검사 실패 | page                       | 해당 backup 격리, 마지막 정상 세대 보존                   |
| `QuotaNearLimit`                  | tenant 자원 중 하나가 80% 초과                          | ticket                     | operator에게 사용량·예상 소진 시각 통지                   |
| `QuotaExceeded`                   | hard quota 초과                                         | page only for side effects | 새 fan-out 차단, 기존 recovery·read는 허용                |
| `HiddenVerifierDisclosure`        | projection policy violation 1건                         | security page              | access 차단, audit export 보존, incident runbook 실행     |

모든 alert는 `tenant_id`, `run_id`가 있을 때만 제한적으로 포함한다. prompt, tool payload, secret 원문은 label과 alert body에 넣지 않는다.
