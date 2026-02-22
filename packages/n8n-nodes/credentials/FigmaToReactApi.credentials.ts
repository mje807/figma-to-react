/**
 * n8n Credentials: Figma to React API
 * 로컬 서버 연결 설정 + Figma Personal Access Token
 */

import type { ICredentialType, INodeProperties } from 'n8n-workflow';

export class FigmaToReactApi implements ICredentialType {
  name = 'figmaToReactApi';
  displayName = 'Figma to React API';
  documentationUrl = 'https://github.com/mje807/figma-to-react';
  properties: INodeProperties[] = [
    {
      displayName: '서버 URL',
      name: 'serverUrl',
      type: 'string',
      default: 'http://localhost:3131',
      description: 'figma-to-react 로컬 서버 주소 (npx f2r serve로 실행)',
    },
    {
      displayName: 'API Key',
      name: 'apiKey',
      type: 'string',
      typeOptions: { password: true },
      default: '',
      description: '서버 보호용 API Key (설정하지 않으면 인증 없음)',
    },
    {
      displayName: 'Figma Personal Access Token',
      name: 'figmaToken',
      type: 'string',
      typeOptions: { password: true },
      default: '',
      description: 'figma.com → Settings → Personal access tokens',
    },
  ];
}
