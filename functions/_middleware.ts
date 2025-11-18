import { PagesFunction } from './types';

export const onRequest: PagesFunction = async (context) => {
  // CORS 配置
  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  const response = await context.next();
  
  // 添加 CORS 头
  response.headers.set('Access-Control-Allow-Origin', '*');
  return response;
};
