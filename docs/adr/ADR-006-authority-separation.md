# ADR-006: Product 작성자와 Release 검증 권한 분리

## 상태

승인

## 결정

product writer는 release verifier를 소유할 수 없고 hidden verifier artifact를 읽을 수 없다.

## 대안

- 같은 agent가 산출물과 최종 검증을 모두 소유: 빠르지만 self-approval 위험이 있다.
- public verifier만 사용: 디버깅은 쉽지만 benchmark gaming에 취약하다.

## 결과

WIR 정적 분석은 owner overlap, hidden leakage, release verifier rule 위반을 error로 거부한다.
