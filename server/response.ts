import type { ServerResponse } from 'node:http';

export async function sendWebResponse(res: ServerResponse, response: Response) {
  res.statusCode = response.status;

  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') {
      const existing = res.getHeader('set-cookie');
      if (Array.isArray(existing)) {
        res.setHeader('set-cookie', [...existing, value]);
      } else if (typeof existing === 'string' && existing.length > 0) {
        res.setHeader('set-cookie', [existing, value]);
      } else {
        res.setHeader('set-cookie', value);
      }
      return;
    }
    res.setHeader(key, value);
  });

  if (response.body) {
    const arrayBuffer = await response.arrayBuffer();
    res.end(Buffer.from(arrayBuffer));
    return;
  }

  res.end();
}

