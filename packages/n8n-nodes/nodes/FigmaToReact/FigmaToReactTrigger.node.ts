/**
 * n8n 트리거 노드: Figma Change Trigger
 *
 * 기능: Figma 파일 변경 감지 → 워크플로우 시작
 * 방식: 폴링 (Figma는 무료 플랜 webhook 미지원)
 * 감지 유형: components / tokens / all
 *
 * DESIGN.md "③ Figma Change Trigger" 참고
 */

import type {
  IPollFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  ITriggerResponse,
} from 'n8n-workflow';

export class FigmaToReactTrigger implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Figma Change Trigger',
    name: 'figmaToReactTrigger',
    group: ['trigger'],
    version: 1,
    description: 'Figma 파일 변경을 감지하면 워크플로우를 시작합니다.',
    defaults: { name: 'Figma Change Trigger' },
    inputs: [],
    outputs: ['main'],
    credentials: [{ name: 'figmaToReactApi', required: true }],
    polling: true,
    properties: [
      {
        displayName: 'File Key',
        name: 'fileKey',
        type: 'string',
        required: true,
        default: '',
        description: 'Figma 파일 URL의 /design/<여기>/ 부분',
      },
      {
        displayName: '감지 유형',
        name: 'watchType',
        type: 'options',
        default: 'all',
        options: [
          { name: '컴포넌트 변경', value: 'components' },
          { name: '디자인 토큰 변경', value: 'tokens' },
          { name: '전체', value: 'all' },
        ],
      },
    ],
  };

  async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
    const fileKey = this.getNodeParameter('fileKey') as string;
    const watchType = this.getNodeParameter('watchType') as string;
    const credentials = await this.getCredentials('figmaToReactApi');
    const serverUrl = credentials.serverUrl as string;

    // 서버의 변경 감지 엔드포인트 호출
    // GET /diff?fileKey=...&watchType=...&since=<lastChecked>
    const lastChecked = this.getWorkflowStaticData('node').lastChecked as string | undefined;

    const response = await this.helpers.httpRequest({
      method: 'GET',
      url: `${serverUrl}/diff`,
      qs: { fileKey, watchType, since: lastChecked ?? '' },
    }) as { changes: object[]; timestamp: string };

    // 타임스탬프 저장 (다음 폴링 기준)
    this.getWorkflowStaticData('node').lastChecked = response.timestamp;

    if (!response.changes || response.changes.length === 0) {
      return null; // 변경 없음 → 워크플로우 실행 안 함
    }

    return [response.changes.map(change => ({ json: change }))];
  }
}
