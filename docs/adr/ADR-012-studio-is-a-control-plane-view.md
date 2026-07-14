# ADR-012: Studio는 control-plane의 view다

- 상태: accepted
- 기준일: 2026-07-14

## 결정

Studio 전용 workflow 의미나 저장 형식을 만들지 않는다. 편집 입력과 출력은 항상 canonical WIR이며, Studio는 compiler, impact engine, event store, artifact lineage와 verifier evidence의 읽기 모델만 표시한다.

편집 후보는 compiler를 통과하기 전까지 publish할 수 없다. 승인, 중지, 재개, 취소와 같은 조작은 UI 내부 상태 변경이 아니라 권한이 붙은 command intent로 외부 runtime에 전달한다. hidden verifier의 상세 정보는 명시적인 권한이 없으면 projection 단계에서 제거한다.

## 결과

- CLI, SDK와 Studio가 같은 WIR digest를 사용한다.
- UI를 재구축해도 실행 의미와 lineage는 바뀌지 않는다.
- semantic diff와 impact preview가 실제 compiler·impact engine 결과와 일치한다.
- UI 캐시 손실이 workflow 또는 run 상태 손실로 이어지지 않는다.
