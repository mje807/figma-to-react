/**
 * Figma 플러그인 메인 (Figma 런타임에서 실행)
 *
 * 역할:
 * 1. 선택된 노드를 Plugin API로 추출
 * 2. IR로 변환
 * 3. 로컬 서버(localhost:3131)로 POST
 * 4. 결과를 UI에 표시
 *
 * DESIGN.md "Figma Plugin 접근 방식" 참고
 */

// TODO: 구현 예정
// - extractIR(): Plugin API 기반 IR 추출 (getCSSAsync() 활용)
// - 로컬 서버 연결 상태 확인 (GET /health)
// - 변환 요청 (POST /convert)
// - 결과 토스트 표시

figma.showUI(__html__, { width: 320, height: 480 });

figma.ui.onmessage = async (msg: { type: string; config?: unknown }) => {
  if (msg.type === 'convert') {
    const selection = figma.currentPage.selection;

    if (selection.length === 0) {
      figma.ui.postMessage({ type: 'error', message: '변환할 노드를 선택해주세요.' });
      return;
    }

    // TODO: extractIR(selection[0]) 구현 후 연결
    figma.ui.postMessage({ type: 'pending', message: '구현 예정' });
  }
};
