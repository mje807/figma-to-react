# ADR-001: CSS-agnostic Core + Renderer 분리

## 결정
코어는 구조/의미(IR)만 담당하고, CSS 표현은 renderer 계층에서 처리한다.

## 근거
CSS 방식 변경(styled/tailwind)이 코어 변경으로 전파되는 리스크를 줄이기 위함.

## 대안
코어가 직접 CSS 문법 생성(기각: 결합도 증가).

## 결과
Renderer 추가/교체 비용 감소, 시스템 확장성 증가.
