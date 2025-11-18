import { Env } from '../../types';
import { calculateImageCost } from '../../pricing';
import { callMuleRun } from './client';
import { extractUsageAndCost, resolveCostWithMarkup } from './metrics';

export type ImageTaskKind = 'generation' | 'edit';

export interface ImageTaskOptions {
  env: Env;
  kind: ImageTaskKind;
  payload: Record<string, unknown>;
  pollIntervalMs: number;
  pollTimeoutMs: number;
}

export async function runImageTask(options: ImageTaskOptions) {
  const { env, kind, payload, pollIntervalMs, pollTimeoutMs } = options;
  const prompt = typeof payload.prompt === 'string' ? payload.prompt.trim() : '';

  if (!prompt) {
    throw new Error('Image tasks require a prompt.');
  }

  const submitPath =
    kind === 'generation'
      ? '/vendors/google/v1/nano-banana/generation'
      : '/vendors/google/v1/nano-banana/edit';

  const pollPathBuilder =
    kind === 'generation'
      ? (taskId: string) =>
          `/vendors/google/v1/nano-banana/generation/${encodeURIComponent(taskId)}`
      : (taskId: string) =>
          `/vendors/google/v1/nano-banana/edit/${encodeURIComponent(taskId)}`;

  const requestBody: Record<string, unknown> = { prompt };

  if (kind === 'edit') {
    const imageBase64 = typeof payload.imageBase64 === 'string' ? payload.imageBase64 : undefined;
    const maskBase64 = typeof payload.maskBase64 === 'string' ? payload.maskBase64 : undefined;
    const imageUrls = Array.isArray(payload.images)
      ? payload.images.filter(
          (value): value is string =>
            typeof value === 'string' && value.trim().length > 0
        )
      : undefined;

    const images: string[] = [];
    if (imageUrls && imageUrls.length > 0) {
      images.push(...imageUrls);
    }
    if (imageBase64) {
      images.push(`data:image/png;base64,${imageBase64}`);
    }

    if (images.length === 0) {
      throw new Error('Image edit requires at least one base image or remote URL.');
    }

    requestBody.images = images;
    if (maskBase64) {
      requestBody.mask = `data:image/png;base64,${maskBase64}`;
    }
  }

  const submitResponse = await callMuleRun(env, submitPath, 'POST', requestBody);
  const taskInfo = extractTaskInfo(submitResponse as Record<string, unknown>);
  if (!taskInfo?.taskId) {
    throw new Error('Failed to obtain task ID');
  }

  const finalTask = await pollTaskResult(
    env,
    pollPathBuilder,
    taskInfo.taskId,
    pollIntervalMs,
    pollTimeoutMs
  );
  const images = extractImages(finalTask);
  const usageInfo = extractUsageAndCost(finalTask as Record<string, unknown>);
  const pricing = calculateImageCost(env, images.length);
  const cost = resolveCostWithMarkup(env, pricing.cost, usageInfo.cost);

  return {
    data: finalTask,
    images,
    usage: usageInfo.usage,
    cost,
    unitPrice: (pricing as any).unitPrice ?? pricing.unitCost ?? undefined,
    pricing,
  };
}

interface TaskInfo {
  taskId: string;
  status?: string;
}

function extractTaskInfo(payload: Record<string, unknown>): TaskInfo | null {
  const directId = readString(payload, ['task_id', 'taskId', 'id']);
  if (directId) {
    const status = readString(payload, ['status']) || undefined;
    return { taskId: directId, status };
  }

  const taskInfo = readObject(payload, ['task', 'task_info', 'taskInfo']);
  if (!taskInfo) {
    return null;
  }

  const taskId = readString(taskInfo, ['task_id', 'taskId', 'id']);
  return taskId ? { taskId, status: readString(taskInfo, ['status']) || undefined } : null;
}

async function pollTaskResult(
  env: Env,
  pathBuilder: (taskId: string) => string,
  taskId: string,
  pollIntervalMs: number,
  pollTimeoutMs: number
) {
  const startedAt = Date.now();

  while (true) {
    const response = await callMuleRun(env, pathBuilder(taskId), 'GET');
    const result = response as Record<string, unknown>;
    const taskInfo = readObject(result, ['task', 'task_info', 'taskInfo']);
    const status =
      readString(result, ['status', 'state', 'task_status']) ??
      (taskInfo ? readString(taskInfo, ['status', 'state']) : null);
    if (isTaskFailed(status)) {
      throw new Error(`Image task failed with status: ${status ?? 'unknown'}`);
    }
    if (isTaskCompleted(status)) {
      return response;
    }

    if (Date.now() - startedAt > pollTimeoutMs) {
      throw new Error('Image task timed out waiting for completion.');
    }

    await delay(pollIntervalMs);
  }
}

function isTaskCompleted(status?: string | null) {
  if (!status) return false;
  const normalized = status.toLowerCase();
  return (
    normalized.includes('success') ||
    normalized.includes('complete') ||
    normalized.includes('finished') ||
    normalized.includes('done')
  );
}

function isTaskFailed(status?: string | null) {
  if (!status) return false;
  const normalized = status.toLowerCase();
  return (
    normalized.includes('fail') ||
    normalized.includes('error') ||
    normalized.includes('cancel')
  );
}

function extractImages(payload: unknown) {
  const images: Array<{ type: 'base64' | 'url'; data: string }> = [];

  if (!payload || typeof payload !== 'object') {
    return images;
  }

  traverse(payload, (value) => {
    if (typeof value !== 'string') return;
    const trimmed = value.trim();

    if (isHttpUrl(trimmed)) {
      images.push({ type: 'url', data: trimmed });
      return;
    }

    if (looksLikeBase64(trimmed)) {
      images.push({ type: 'base64', data: trimmed });
    }
  });

  return images;
}

function traverse(value: unknown, visitor: (value: unknown) => void) {
  visitor(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      traverse(item, visitor);
    }
    return;
  }

  if (value && typeof value === 'object') {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      traverse((value as Record<string, unknown>)[key], visitor);
    }
  }
}

function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function looksLikeBase64(value: string) {
  if (value.length < 200) return false;
  return /^[A-Za-z0-9+/=\r\n]+$/.test(value);
}

function delay(durationMs: number) {
  if (durationMs <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

function readString(
  source: Record<string, unknown>,
  keys: string[]
): string | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}


function readObject(
  source: Record<string, unknown>,
  keys: string[]
): Record<string, unknown> | null {
  for (const key of keys) {
    const value = source[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }
  return null;
}
