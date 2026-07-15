# ADR-016: Spec revision의 전달 단위는 self-describing child document다

- 상태: accepted
- 날짜: 2026-07-15

## 문제

Revision candidate는 patch proposal, verdict와 summary를 함께 만들지만 downstream demo나 다른 workflow가 이 파일들을 모두 입력으로 요구하면 domain artifact가 revision 도구의 내부 포맷에 결합된다. 반대로 child document에 아무 계보도 없으면 단독 전달 시 부모와 feedback 범위를 식별하기 어렵다.

## 대안

1. Parent spec과 JSON Patch를 항상 함께 전달한다. 저장은 작지만 실행마다 materialization이 필요하고 patch engine에 결합된다.
2. Candidate envelope 전체를 runtime 입력으로 사용한다. 계보는 풍부하지만 실제 spec consumer가 `document` wrapper를 알아야 한다.
3. 원본 전체가 반영된 child document 안에 비순환 revision metadata를 넣고 단일 실행 입력으로 사용한다.

## 결정

3을 선택한다. Child의 `meta.revision`은 parent artifact/digest, contract digest, feedback ID, status, generator와 `executionInput=this_document`를 포함한다. Proposal, summary와 verdict는 감사·재현 sidecar이며 downstream domain runtime의 필수 입력이 아니다.

Candidate 자신의 content digest와 candidate ID는 문서 안에 넣으면 자기참조 순환이 생기므로 외부 revision envelope와 summary에 둔다. Promotion 전 status는 계속 `candidate`이며 사용자의 승인 없이 source나 active spec pointer를 바꾸지 않는다.

## 결과

- Spec consumer는 child JSON 한 파일만 읽는다.
- 파일만 전달되어도 부모와 feedback 계보를 식별할 수 있다.
- Patch 재현과 independent verdict는 별도 evidence로 보존된다.
- Domain spec이 AAWP proposal schema에 종속되지 않는다.
