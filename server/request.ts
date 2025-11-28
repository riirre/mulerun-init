import type { IncomingMessage } from 'node:http';

const BODYLESS_METHODS = new Set(['GET', 'HEAD']);

export async function nodeRequestToWebRequest(
  req: IncomingMessage & { body?: unknown },
  explicitBaseUrl?: string
): Promise<Request> {
  const url = buildTargetUrl(req, explicitBaseUrl);
  const headers = buildHeaders(req);
  const method = (req.method || 'GET').toUpperCase();

  let bodyInit: BodyInit | undefined;
  if (!BODYLESS_METHODS.has(method)) {
    bodyInit = await resolveBody(req);
  }

  return new Request(url, {
    method,
    headers,
    body: bodyInit,
  });
}

function buildTargetUrl(req: IncomingMessage, explicitBase?: string) {
  const rawUrl = req.url || '/';
  try {
    // absolute URL provided
    new URL(rawUrl);
    return rawUrl;
  } catch {
    // fallthrough
  }

  const base = explicitBase ?? deriveBaseUrl(req);
  return new URL(rawUrl, base).toString();
}

function deriveBaseUrl(req: IncomingMessage) {
  const protoHeader = req.headers['x-forwarded-proto'];
  const forwardedProto = Array.isArray(protoHeader) ? protoHeader[0] : protoHeader;
  const protocol = forwardedProto?.split(',')[0]?.trim() || 'http';

  const hostHeader = req.headers['x-forwarded-host'] ?? req.headers.host;
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;

  return `${protocol}://${host ?? 'localhost'}`;
}

function buildHeaders(req: IncomingMessage) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (!value || !key) continue;
    if (Array.isArray(value)) {
      for (const entry of value) {
        headers.append(key, entry);
      }
    } else {
      headers.append(key, value);
    }
  }
  return headers;
}

async function resolveBody(req: IncomingMessage & { body?: unknown }) {
  if (req.body !== undefined) {
    const body = req.body;
    if (typeof body === 'string' || body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
      return body as BodyInit;
    }
    if (Buffer.isBuffer(body)) {
      return bufferToArrayBuffer(body);
    }
    if (typeof body === 'object') {
      return JSON.stringify(body);
    }
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  if (!chunks.length) {
    return undefined;
  }
  const buffer = Buffer.concat(chunks);
  if (buffer.length === 0) {
    return undefined;
  }
  return bufferToArrayBuffer(buffer);
}

function bufferToArrayBuffer(buffer: Buffer) {
  const clone = new Uint8Array(buffer.length);
  clone.set(buffer);
  return clone.buffer;
}

