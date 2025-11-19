import './styles.css';

const params = new URLSearchParams(window.location.search);
const session = {
  userId: params.get('userId') ?? 'dev-user-123',
  sessionId: params.get('sessionId') ?? 'dev-session-456',
  agentId: params.get('agentId') ?? 'dev-agent-789',
};
const sessionToken = params.get('sessionToken')?.trim() ?? '';

const userIdField = document.getElementById('userIdField');
const sessionIdField = document.getElementById('sessionIdField');
const agentIdField = document.getElementById('agentIdField');

if (!userIdField || !sessionIdField || !agentIdField) {
  throw new Error('模版缺少会话展示元素');
}

userIdField.textContent = abbreviate(session.userId);
sessionIdField.textContent = abbreviate(session.sessionId);
agentIdField.textContent = abbreviate(session.agentId);

const chatForm = document.getElementById('promptForm');
const chatInput = document.getElementById('promptInput');
const submitButton = document.getElementById('submitButton');
const logList = document.getElementById('logList');
const template = document.getElementById('logItemTemplate');

const exampleChatButton = document.getElementById('exampleChat');
const imageGenerateForm = document.getElementById('imageGenerateForm');
const imageGeneratePrompt = document.getElementById('imageGeneratePrompt');
const imageEditForm = document.getElementById('imageEditForm');
const imageEditPrompt = document.getElementById('imageEditPrompt');
const imageFileInput = document.getElementById('imageEditFile');
const imagePreview = document.getElementById('imagePreview');
const exampleTabs = document.querySelectorAll('.tab-button');
const examplePanes = document.querySelectorAll('.example-pane');

let uploadedImageBase64 = null;

if (!chatForm || !chatInput || !submitButton || !logList || !template) {
  throw new Error('模版缺少交互元素');
}

chatForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const prompt = chatInput.value.trim();
  if (!prompt) return;

  appendLog('USER', prompt);
  toggleForm(true);

  try {
    const response = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: session.sessionId,
        sessionToken: sessionToken || undefined,
        prompt,
      }),
    });

    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.error || '调用失败');
    }

    const summary = summariseResponse('chat', result);
    appendLog('ASSISTANT', summary.text, {
      metaHtml: summary.metaHtml,
      images: summary.images,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : JSON.stringify(error);
    appendLog('ERROR', message);
  } finally {
    chatInput.value = '';
    toggleForm(false);
  }
});

exampleTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    exampleTabs.forEach((btn) => btn.classList.toggle('active', btn === tab));
    examplePanes.forEach((pane) => {
      const shouldShow = pane.dataset.operation === tab.dataset.tab;
      pane.classList.toggle('active', shouldShow);
    });
  });
});

if (exampleChatButton) {
  exampleChatButton.addEventListener('click', () => {
    const value = chatInput.value.trim();
    const userContent = value || '请用一句话描述一个舒适的阅读角落。';
    runExample('chat', {
      messages: [
        { role: 'system', content: 'You are a concise assistant.' },
        { role: 'user', content: userContent },
      ],
      vendor: 'openai',
      model: 'gpt-5-mini',
    });
  });
}

if (imageGenerateForm) {
  imageGenerateForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const promptValue =
      imageGeneratePrompt?.value?.trim() ||
      'A cozy room with plants and soft daylight, photorealistic';
    runExample('image_generate', {
      prompt: promptValue,
      model: 'gemini-2.5-flash',
    });
  });
}

if (imageFileInput) {
  imageFileInput.addEventListener('change', async () => {
    const file = imageFileInput.files?.[0];
    if (!file) {
      uploadedImageBase64 = null;
      renderImagePreview(null);
      return;
    }

    if (!file.type.startsWith('image/')) {
      appendLog('ERROR', '请选择图片文件');
      imageFileInput.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        const commaIndex = result.indexOf(',');
        uploadedImageBase64 = commaIndex >= 0 ? result.slice(commaIndex + 1) : result;
        renderImagePreview(result);
      }
    };
    reader.onerror = () => {
      appendLog('ERROR', '图片读取失败');
      imageFileInput.value = '';
    };
    reader.readAsDataURL(file);
  });
}

if (imageEditForm) {
  imageEditForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const promptValue =
      imageEditPrompt?.value?.trim() ||
      'Place the product on a marble table with soft daylight.';
    if (!uploadedImageBase64) {
      appendLog('ERROR', '请先上传一张图片');
      return;
    }
    runExample('image_edit', {
      prompt: promptValue,
      imageBase64: uploadedImageBase64,
    });
  });
}

async function runExample(operation, payload) {
  appendLog('EXAMPLE', `调用 ${operation} 中...`);
  try {
    const response = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: session.sessionId,
        sessionToken: sessionToken || undefined,
        operation,
        payload,
      }),
    });
    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || '调用失败');
    }
    const summary = summariseResponse(operation, data);
    appendLog('ASSISTANT', summary.text, {
      metaHtml: summary.metaHtml,
      images: summary.images,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : JSON.stringify(error);
    appendLog('ERROR', message);
    appendLog(
      'HINT',
      '示例调用失败，请确认已配置 MULERUN_API_KEY / AGENT_KEY，或在本地开启 SESSION_VALIDATION_DISABLED 后重试。'
    );
  }
}

function appendLog(type, content, options = {}) {
  const fragment = template.content.cloneNode(true);
  const article = fragment.querySelector('.log-item');
  const badge = fragment.querySelector('.badge');
  const time = fragment.querySelector('time');
  const text = fragment.querySelector('p');

  if (!article || !badge || !time || !text) {
    throw new Error('渲染日志失败');
  }

  badge.textContent = type;
  badge.dataset.type = type.toLowerCase();
  time.textContent = new Date().toLocaleTimeString();
  if (options.html) {
    text.innerHTML = options.html;
  } else {
    text.textContent = content;
  }

  if (options.metaHtml) {
    const meta = document.createElement('div');
    meta.className = 'log-meta';
    meta.innerHTML = options.metaHtml;
    article.append(meta);
  }

  if (Array.isArray(options.images) && options.images.length > 0) {
    const gallery = document.createElement('div');
    gallery.className = 'log-images';
    options.images.forEach((src) => {
      const img = document.createElement('img');
      img.src = src;
      img.alt = 'output';
      gallery.append(img);
    });
    article.append(gallery);
  }

  logList.prepend(article);
}

function toggleForm(disabled) {
  chatInput.disabled = disabled;
  submitButton.disabled = disabled;
  submitButton.textContent = disabled ? '处理中...' : '发送';
}

function abbreviate(value) {
  if (!value) return '--';
  if (value.length <= 10) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function renderImagePreview(src) {
  if (!imagePreview) return;
  imagePreview.innerHTML = '';
  if (!src) {
    imagePreview.innerHTML = '<span>未选择图片</span>';
    return;
  }
  const img = document.createElement('img');
  img.src = src;
  img.alt = 'upload preview';
  imagePreview.append(img);
}

function summariseResponse(operation, data) {
  const summary = {
    text: '',
    images: [],
    metaHtml: '',
  };

  if (operation === 'chat') {
    summary.text =
      extractAssistantText(data) ??
      '已返回对话结果（详见响应体，可根据需要解析 message.content）。';
  } else if (operation === 'image_generate' || operation === 'image_edit') {
    const images = normaliseImages(data.images);
    summary.images = images;
    summary.text = images.length
      ? `${operation} 成功：生成了 ${images.length} 张图片`
      : `${operation} 调用成功`;
  } else {
    summary.text = '操作完成';
  }

  const metaLines = [];
  if (data.usage) {
    const { promptTokens, completionTokens, totalTokens } = data.usage;
    metaLines.push(
      `Tokens: prompt ${promptTokens ?? 0} / completion ${completionTokens ?? 0} / total ${
        totalTokens ?? 0
      }`
    );
  }
  const effectiveCost = coerceNumber(data.cost);
  if (typeof effectiveCost === 'number') {
    metaLines.push(`计费（含加成）: ${effectiveCost}`);
  }

  if (data.pricing) {
    const baseCost = coerceNumber(data.pricing.baseCost ?? data.pricing.baseUnitCost);
    if (typeof baseCost === 'number') {
      metaLines.push(`模型原始成本: ${baseCost}`);
    }
    const markup = coerceNumber(data.pricing.markup);
    if (typeof markup === 'number' && markup !== 1) {
      metaLines.push(`加成系数: ${markup}`);
    }
  }
  if (data.metering?.meteringId) {
    metaLines.push(`Metering ID: ${data.metering.meteringId}`);
  }

  if (metaLines.length > 0) {
    summary.metaHtml = `<ul>${metaLines
      .map((line) => `<li>${escapeHtml(line)}</li>`)
      .join('')}</ul>`;
  }

  return summary;
}

function extractAssistantText(data) {
  const choices = data?.data?.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const choice = choices[0];
    if (typeof choice?.message?.content === 'string') {
      return choice.message.content;
    }
    if (Array.isArray(choice?.message?.content)) {
      return choice.message.content
        .map((part) => part?.text ?? part)
        .filter(Boolean)
        .join('\n');
    }
  }
  if (typeof data?.data?.content === 'string') return data.data.content;
  return null;
}

function normaliseImages(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((asset) => extractImageSource(asset))
    .filter(Boolean);
}

function extractImageSource(asset) {
  if (!asset) return null;
  if (typeof asset === 'string') {
    return asset.startsWith('data:') ? asset : asset;
  }
  if (typeof asset !== 'object') {
    return null;
  }
  const type = typeof asset.type === 'string' ? asset.type.toLowerCase() : '';
  const dataValue = resolveImageData(asset);
  if (!dataValue) {
    return null;
  }
  if (type === 'base64' || dataValue.startsWith('data:')) {
    return dataValue.startsWith('data:')
      ? dataValue
      : `data:image/png;base64,${dataValue.replace(/^data:image\/\w+;base64,/, '')}`;
  }
  if (type === 'url' || isProbablyUrl(dataValue)) {
    return dataValue;
  }
  return null;
}

function resolveImageData(asset) {
  if (typeof asset.data === 'string') return asset.data;
  if (asset.data && typeof asset.data === 'object') {
    if (typeof asset.data.url === 'string') return asset.data.url;
    if (typeof asset.data.src === 'string') return asset.data.src;
  }
  if (typeof asset.url === 'string') return asset.url;
  if (typeof asset.src === 'string') return asset.src;
  return null;
}

function isProbablyUrl(value) {
  return /^https?:\/\//i.test(value);
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return char;
    }
  });
}

function coerceNumber(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.round(parsed * 1000) / 1000;
}
