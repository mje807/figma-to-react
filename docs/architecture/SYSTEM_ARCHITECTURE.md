# Figma → React 생성 시스템 설계 (System Architecture & Principles)

## 1) 비전
Figma 산출물을 단순 변환기가 아니라 **Design ↔ Engineering Contract를 집행하는 컴파일러**로 다룬다.

## 2) 목표
- 프로덕션 유지보수 가능한 코드 생성
- CSS 방식 변경(styled/tailwind)에도 코어 안정성 유지
- 토큰/디자인시스템 중심 일관성 확보
- 품질 게이트 기반 운영

## 3) 비목표
- 100% 무수정 자동완성 추구 안 함
- Figma 표현의 무리한 1:1 웹 재현 포기
- 초기 유사도 기반 자동 컴포넌트 추출 배제

## 4) 핵심 원칙
1. **CSS-agnostic Core**: 코어(구조/의미)와 렌더러(표현) 분리
2. **Token-first**: 토큰 있으면 토큰 유지, 없으면 raw + 리포트 노출
3. **Determinism-first**: 예측가능한 규칙 우선 (Instance-first)
4. **Generator as Product**: 생성기도 버전/운영/품질게이트를 가진 제품

## 5) 시스템 경계
- **Design Ingestion**: Figma 데이터 취득
- **Semantic Compilation**: 웹/React 의미 변환(IR 중심)
- **Emission & Governance**: 코드 방출 + 품질검증 + 운영

## 6) 아키텍처 개요
`Figma Model → IR → React Component Tree → Renderer`

IR은 다음을 담는 중립 언어:
- layout intent (stack/grid/absolute)
- style intent (typography/spacing/visual)
- token reference
- instance boundary

## 7) Design Contract
초기 강제:
- Auto Layout 우선
- Instance 기반 구성 우선
- Variables/Styles 연결 권장 (미연결은 raw + 리포트)

초기 제한:
- 과도한 absolute
- 의미 없는 wrapper 남발
- 임의 상호작용 구현

## 8) 토큰 시스템 관계
- 토큰은 값 집합이 아닌 **계약 API**
- b/s/c 레이어 유지
- light/dark를 variant로 독립 해석
- Token Compiler는 1급 시스템으로 분리

## 9) 컴포넌트 매핑 전략
- Instance 매핑 성공 시 내부 생성 생략(DS 책임)
- 실패 시 fallback + 리포트
- 유사도 추출은 초기 배제

## 10) Renderer 공존
- 구조/의미 동일, 표현만 다름
- tailwind 모드에서 arbitrary 비율을 품질 지표로 관리

## 11) 품질 거버넌스
- 규칙 + 지표 + 게이트
- 단계적 강화:
  - 필수: 빌드 안정성, 접근성 치명결함 차단
  - 권장: absolute 비율, DOM depth, arbitrary 비율
  - 확장: 중복률, 리팩터 제안

## 12) 운영 모델
- PR 단위 유통 + 리포트 포함
- 생성기 버전/재현성 보장
- 실패는 침묵이 아니라 진단 가능한 리포트로 처리

## 13) KPI
- 화면 1개 생성 후 수정시간
- 생성 PR merge 비율
- DOM depth P95
- absolute 사용률
- 토큰 사용률
- tailwind arbitrary 비율
