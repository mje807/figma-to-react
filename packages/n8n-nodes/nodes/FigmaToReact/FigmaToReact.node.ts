/**
 * n8n 커스텀 노드: Figma to React - Convert
 *
 * 기능: Figma 컴포넌트 → React 코드 생성
 * 입력: fileKey, nodeId, 스타일 설정
 * 출력: { files, componentName, warnings }
 *
 * DESIGN.md "방법 B: 커스텀 n8n 노드 패키지" 참고
 */

import type {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
} from 'n8n-workflow';

// TODO: 구현 예정
// import type { StyleAdapterType } from '@figma-to-react/core';

export class FigmaToReact implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Figma to React: Convert',
    name: 'figmaToReact',
    group: ['transform'],
    version: 1,
    description: 'Figma 컴포넌트를 React + TypeScript 코드로 변환합니다.',
    defaults: { name: 'Figma to React' },
    inputs: ['main'],
    outputs: ['main'],
    credentials: [{ name: 'figmaToReactApi', required: true }],
    properties: [
      {
        displayName: 'File Key',
        name: 'fileKey',
        type: 'string',
        required: true,
        default: '',
        description: 'Figma 파일 URL의 /design/<여기>/ 부분',
        placeholder: 'abc123def456',
      },
      {
        displayName: 'Node ID',
        name: 'nodeId',
        type: 'string',
        required: true,
        default: '',
        description: '변환할 Figma 컴포넌트 노드 ID (예: 123:456)',
      },
      {
        displayName: '스타일 어댑터',
        name: 'style',
        type: 'options',
        default: 'tailwind',
        options: [
          { name: 'Tailwind CSS', value: 'tailwind' },
          { name: 'CSS Modules', value: 'css-modules' },
          { name: 'Styled-Components', value: 'styled-components' },
          { name: 'Emotion', value: 'emotion' },
        ],
      },
      {
        displayName: '출력 경로',
        name: 'outputDir',
        type: 'string',
        default: './src/components',
        description: '생성된 파일을 저장할 경로 (서버 기준 상대 또는 절대 경로)',
      },
      {
        displayName: 'TypeScript',
        name: 'typescript',
        type: 'boolean',
        default: true,
      },
      {
        displayName: 'Storybook stories 생성',
        name: 'stories',
        type: 'boolean',
        default: false,
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const results: INodeExecutionData[] = [];

    for (let i = 0; i < items.length; i++) {
      const fileKey = this.getNodeParameter('fileKey', i) as string;
      const nodeId = this.getNodeParameter('nodeId', i) as string;
      const style = this.getNodeParameter('style', i) as string;
      const outputDir = this.getNodeParameter('outputDir', i) as string;
      const typescript = this.getNodeParameter('typescript', i) as boolean;
      const stories = this.getNodeParameter('stories', i) as boolean;

      const credentials = await this.getCredentials('figmaToReactApi');
      const serverUrl = credentials.serverUrl as string;

      // 로컬 서버 POST /convert 호출
      // TODO: 실제 구현 시 this.helpers.httpRequest 사용
      const response = await this.helpers.httpRequest({
        method: 'POST',
        url: `${serverUrl}/convert`,
        headers: {
          'Content-Type': 'application/json',
          ...(credentials.apiKey ? { 'x-api-key': credentials.apiKey as string } : {}),
        },
        body: JSON.stringify({ fileKey, nodeId, config: { style, outputDir, typescript, stories } }),
      });

      results.push({ json: response as object });
    }

    return [results];
  }
}
