# n8n 워크플로우 템플릿

n8n에서 불러오기: Settings → Import workflow → JSON 파일 선택

## 준비사항

1. n8n 설치 및 실행 (`npx n8n`)
2. figma-to-react 로컬 서버 실행 (`npx f2r serve`)
3. n8n Community Nodes에 `@figma-to-react/n8n-nodes` 설치
4. Credentials 설정 (서버 URL, Figma Token)

## 템플릿 목록

| 파일 | 설명 | 트리거 |
|------|------|--------|
| `01-handoff-auto-pr.json` | 핸드오프 → PR 자동 생성 | Figma 변경 감지 |
| `02-token-sync.json` | 디자인 토큰 변경 → theme.ts 자동 커밋 | Figma 변경 감지 |
| `03-component-diff.json` | 컴포넌트 변경 → 기존 PR 업데이트 | Figma 변경 감지 |
| `04-storybook-notify.json` | 변경 → Storybook 재빌드 + Slack 알림 | Figma 변경 감지 |

## HTTP Request만으로 간단 연결 (커스텀 노드 없이)

n8n의 기본 HTTP Request 노드로도 연결 가능:

```
POST http://localhost:3131/convert
Content-Type: application/json

{
  "fileKey": "{{ $json.file_key }}",
  "nodeId": "{{ $json.component_id }}",
  "config": {
    "style": "tailwind",
    "outputDir": "./src/components",
    "typescript": true
  }
}
```
