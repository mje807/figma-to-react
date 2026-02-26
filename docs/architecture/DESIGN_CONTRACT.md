# Design Contract (생성 가능 디자인 계약)

## 목적
생성기 품질을 보장하기 위해 디자이너/개발자 간 입력 품질 계약을 명시한다.

## MUST (초기)
- Auto Layout 기반 레이아웃 사용
- DS 컴포넌트는 Instance로 사용
- 색상/타이포/간격은 Variables/Styles 연결 우선

## SHOULD
- 의미 없는 중첩 wrapper 최소화
- 정렬 목적 absolute 사용 최소화
- 컴포넌트 이름/레이어 의미를 명확히 유지

## WON'T (초기 미지원)
- 유사도 기반 자동 컴포넌트 추출
- 임의 상호작용(hover/pressed) 자동 구현
- 복잡한 absolute 재배치 최적화

## 입력 품질 리포트 항목
- 토큰 미연결 속성 수
- absolute 사용 비율
- Instance 미사용 주요 블록
- 계약 위반 패턴 목록

## 협업 프로세스
1. 디자인 산출물 제출
2. 계약 검사 리포트 확인
3. 위반 수정 or 예외 승인
4. 코드 생성/PR
