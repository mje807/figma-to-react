/**
 * 로컬 변환 서버
 * 포트: 3131
 *
 * 역할:
 * 1. Figma 플러그인에서 IR을 받아서 React 파일 생성
 * 2. Style Adapter 선택 (Tailwind / CSS Modules / SC)
 * 3. 파일 시스템에 직접 쓰기
 * 4. 선택적으로 VS Code 자동 오픈
 *
 * API:
 *   GET  /health    → 서버 상태 확인 (플러그인이 연결 확인용으로 사용)
 *   POST /convert   → IR 받아서 파일 생성
 *   POST /preview   → 파일 생성 없이 코드 문자열 반환 (dry-run)
 *
 * DESIGN.md "로컬 서버 API 스펙" 참고
 */

// TODO: 구현 예정
// const app = express();
// app.get('/health', ...)
// app.post('/convert', ...)
// app.post('/preview', ...)
// app.listen(3131, ...)

console.log('TODO: 서버 구현 예정 (포트 3131)');
