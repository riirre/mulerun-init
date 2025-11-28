import 'dotenv/config';
import { createServer } from 'node:http';

import { handleAiPost } from '../functions/api/ai';
import { handleMeteringGet, handleMeteringPost } from '../functions/api/metering';
import { handleSessionGet } from '../functions/api/session';
import { getRequestEnv } from './env';
import { nodeRequestToWebRequest } from './request';
import { sendWebResponse } from './response';

const PORT = Number(process.env.DEV_API_PORT ?? 8788);
const env = getRequestEnv();

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://localhost:${PORT}`);
    const method = req.method?.toUpperCase();

    if (url.pathname === '/api/session' && method === 'GET') {
      const request = await nodeRequestToWebRequest(req, url.origin);
      const response = await handleSessionGet(request, env);
      await sendWebResponse(res, response);
      return;
    }

    if (url.pathname === '/api/ai' && method === 'POST') {
      const request = await nodeRequestToWebRequest(req, url.origin);
      const response = await handleAiPost(request, env);
      await sendWebResponse(res, response);
      return;
    }

    if (url.pathname === '/api/metering' && method === 'GET') {
      const request = await nodeRequestToWebRequest(req, url.origin);
      const response = await handleMeteringGet(request, env);
      await sendWebResponse(res, response);
      return;
    }

    if (url.pathname === '/api/metering' && method === 'POST') {
      const request = await nodeRequestToWebRequest(req, url.origin);
      const response = await handleMeteringPost(request, env);
      await sendWebResponse(res, response);
      return;
    }

    res.statusCode = 404;
    res.end('Not Found');
  } catch (error) {
    console.error('[dev-server] unhandled error', error);
    res.statusCode = 500;
    res.end((error as Error).message);
  }
});

server.listen(PORT, () => {
  console.log(`[dev-server] listening on http://localhost:${PORT}`);
});

