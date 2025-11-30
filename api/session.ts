import type { VercelRequest, VercelResponse } from '@vercel/node';

import { handleSessionGet } from '../functions/api/session';
import { getRequestEnv } from '../server/env';
import { nodeRequestToWebRequest } from '../server/request';
import { sendWebResponse } from '../server/response';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method?.toUpperCase() !== 'GET') {
      res.setHeader('Allow', 'GET');
      res.status(405).json({ error: 'Method Not Allowed' });
      return;
    }

    const request = await nodeRequestToWebRequest(req);
    const env = getRequestEnv();
    const response = await handleSessionGet(request, env);
    await sendWebResponse(res, response);
  } catch (error) {
    console.error('[api/session] Error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    res.status(500).json({ error: message });
  }
}

