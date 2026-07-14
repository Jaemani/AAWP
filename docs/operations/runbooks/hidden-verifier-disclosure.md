# Hidden verifier disclosure runbook

1. 의심 projection, audit export와 consumer credential을 차단한다.
2. 관련 run과 bundle ID만으로 append-only incident event를 남긴다. 유출 상세를 새 로그에 복제하지 않는다.
3. 해당 tenant의 audit export, gateway access log와 policy version을 법적 보존 대상으로 표시한다.
4. builder가 verifier image, policy digest, finding reason 또는 evidence payload를 읽었는지 확인한다.
5. verifier image·policy·acceptance pack과 관련 capability token을 회전한다.
6. 같은 projection policy를 쓰는 모든 endpoint를 검사하고 재발 test를 추가한다.
7. 보안 담당자의 해제 승인 전까지 candidate promotion을 중지한다.

`projectEvidence`는 hidden bundle의 outcome 외 상세를 기본 제거한다. 이 runbook은 application layer의 우회 endpoint, 잘못된 role mapping 또는 raw database export가 그 경계를 깨뜨렸을 때 사용한다.
