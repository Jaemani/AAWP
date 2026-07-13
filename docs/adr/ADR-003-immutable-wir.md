# ADR-003: WIR는 불변 계약

## 상태

승인

## 결정

Workflow Intermediate Representation은 version과 digest를 가진 불변 계약이다.

## 대안

- mutable graph: 편집 UI에는 편하지만 실행 재현과 verifier 판정이 불안정하다.
- code-first workflow만 사용: 개발자 경험은 좋지만 자연어/시각 authoring, diff, policy check가 어렵다.

## 결과

수정은 새 WIR version을 만들고, run은 특정 digest에 고정된다.
