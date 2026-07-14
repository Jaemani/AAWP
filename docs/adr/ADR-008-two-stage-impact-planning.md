# ADR-008: 영향 closure와 fingerprint 증거를 분리한다

## 상태

승인

## 결정

Revision 재실행 여부는 graph diff만으로 확정하지 않는다. 먼저 input, contract, WIR와 execution profile 변경 root에서 downstream closure를 계산하고, 두 번째 단계에서 candidate fingerprint와 tenant·sensitivity·verifier policy cache 증거를 대조한다.

Broad regression과 undeclared read는 cache hit보다 우선하는 mandatory rerun이다. Changed root인데 parent fingerprint가 같으면 fingerprint 누락 가능성으로 보고 fail-safe rerun한다.

## 결과

동일 candidate fingerprint의 과거 artifact는 revision 간 재사용할 수 있고 모든 reuse·rerun에는 설명 가능한 reason이 남는다. 의존성 선언이 불완전하면 최소성보다 안전을 우선해 더 넓게 재실행한다.
