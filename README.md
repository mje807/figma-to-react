# figma-to-react

> Figma 디자인 → 실제 동작하는 React 컴포넌트 자동 변환 도구

## 개요

- Figma 컴포넌트 선택 → React + TypeScript 코드 자동 생성
- **Tailwind / CSS Modules / Styled-Components / Emotion** 지원
- **Figma 플러그인** + **로컬 서버** 하이브리드 아키텍처
- 디자인 토큰 추출 → 테마 시스템 자동 구성
- Storybook stories 자동 생성
- **n8n 워크플로우 통합** — 핸드오프 → PR 생성까지 자동화

## 구조

```
packages/
├── core/       # IR 타입, Style Adapters, Code Generator (공유)
├── plugin/     # Figma 플러그인 (Plugin API 기반 추출)
├── server/     # 로컬 서버 (파일 생성 담당, 포트 3131)
└── n8n-nodes/  # n8n 커스텀 노드 패키지
cli/            # REST API 기반 CLI (CI/CD 자동화용)
workflows/      # n8n 워크플로우 템플릿 4종
```

## 빠른 시작

```bash
# 로컬 서버 실행
npx figma-to-react serve

# Figma에서 플러그인 열고 컴포넌트 선택 후 변환
```

## n8n 자동화

```
Figma 변경 감지 → 코드 생성 → GitHub PR → Slack 알림
```

`workflows/` 폴더의 JSON 템플릿을 n8n에서 불러오기로 사용:
- `01-handoff-auto-pr.json` — 핸드오프 → PR 자동 생성
- `02-token-sync.json` — 디자인 토큰 → theme.ts 자동 동기화
- `03-component-diff.json` — 변경 감지 → PR 업데이트
- `04-storybook-notify.json` — 변경 → Storybook 재빌드 알림

## 상태

🚧 설계 완료 / 구현 예정

설계 문서: [DESIGN.md](./DESIGN.md)

## 라이선스

MIT
