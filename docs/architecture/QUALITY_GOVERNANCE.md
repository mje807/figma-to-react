# Quality Governance

## 운영 원칙
품질은 “규칙 + 지표 + 게이트”로 관리한다.

## 게이트 단계
### Phase 1 (필수 차단)
- 빌드 실패
- 접근성 치명 결함 (예: 클릭 가능한 div)
- 타입 에러

### Phase 2 (경고 중심)
- absolute 비율 임계 초과
- DOM depth P95 임계 초과
- tailwind arbitrary 비율 과다

### Phase 3 (최적화)
- 중복 스타일 과다
- 컴포넌트 분해/재사용 개선 제안

## 핵심 지표
- PR merge 비율
- 화면당 후속 수정 시간
- 토큰 사용률
- absolute 사용률
- DOM depth P95
- arbitrary 클래스 비율

## 리포트 형태
- 실행 요약
- 실패/경고 카운트
- 파일별 위반 목록
- 개선 우선순위
