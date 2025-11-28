import type { VercelRequest, VercelResponse } from '@vercel/node';

import { handleMeteringGet, handleMeteringPost } from '../functions/api/metering';
import { getRequestEnv } from '../server/env';
import { nodeRequestToWebRequest } from '../server/request';
import { sendWebResponse } from '../server/response';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const method = req.method?.toUpperCase();
  if (method !== 'GET' && method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const request = await nodeRequestToWebRequest(req);
  const env = getRequestEnv();
  const response = method === 'GET' ? await handleMeteringGet(request, env) : await handleMeteringPost(request, env);
  await sendWebResponse(res, response);
}

