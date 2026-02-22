# figma-to-react

> Figma 디자인 → 실제 동작하는 React 컴포넌트 자동 변환 도구

## 개요

- Figma 컴포넌트를 선택하면 React + TypeScript 코드를 자동 생성
- **Tailwind / CSS Modules / Styled-Components** 지원
- **Figma 플러그인** + **로컬 서버** 하이브리드 아키텍처
- 디자인 토큰 추출 → 테마 시스템 자동 구성
- Storybook stories 자동 생성

## 구조

```
packages/
├── core/      # IR 타입, Style Adapters, Code Generator (공유)
├── plugin/    # Figma 플러그인 (Plugin API 기반 추출)
├── server/    # 로컬 서버 (파일 생성 담당, 기본 포트 3131)
└── cli/       # REST API 기반 CLI (CI/CD 자동화용)
```

## 빠른 시작

```bash
# 로컬 서버 실행
npx figma-to-react serve

# Figma에서 플러그인 열고 컴포넌트 선택 후 변환
```

## 상태

🚧 설계 완료 / 구현 예정

설계 문서: [DESIGN.md](./DESIGN.md)

## 라이선스

MIT
