# 接口示例

常用请求/响应示例，便于本地调试或教学。

## `/api/ai` – `operation = "chat"`

```json
{
  "sessionId": "fcf69a06-4a59-4c3a-a75d-7d07a9c2b8cb",
  "sessionToken": "session-token",
  "operation": "chat",
  "payload": {
    "vendor": "openai",
    "model": "gpt-5-mini",
    "messages": [
      { "role": "system", "content": "You are a helpful assistant." },
      { "role": "user", "content": "Give me three hook lines for a pet water fountain." }
    ]
  }
}
```

**Response**

```json
{
  "success": true,
  "operation": "chat",
  "data": { "...": "OpenAI 原始响应" },
  "usage": { "promptTokens": 54, "completionTokens": 87, "totalTokens": 141 },
  "cost": 420,
  "pricing": { "cost": 420, "markup": 1.2 },
  "metering": { "success": true, "meteringId": "mtg_xxx" }
}
```

## `/api/ai` – `operation = "image_generate"`

```json
{
  "sessionId": "fcf69a06-4a59-4c3a-a75d-7d07a9c2b8cb",
  "sessionToken": "session-token",
  "operation": "image_generate",
  "payload": {
    "prompt": "A cozy room with a reading corner, soft daylight",
    "images": [],
    "vendor": "google"
  },
  "options": {
    "pollTimeoutMs": 240000,
    "pollIntervalMs": 3000
  }
}
```

**Response**

```json
{
  "success": true,
  "operation": "image_generate",
  "images": [
    { "type": "url", "data": "https://cdn.mulerun.com/demo/product-1.png" }
  ],
  "usage": { "images": 1 },
  "cost": 360,
  "metering": { "success": true }
}
```

## `/api/ai` – `operation = "image_edit"`

```json
{
  "sessionId": "fcf69a06-4a59-4c3a-a75d-7d07a9c2b8cb",
  "sessionToken": "session-token",
  "operation": "image_edit",
  "payload": {
    "prompt": "Product sitting in a minimalist kitchen, soft daylight, photorealistic",
    "imageBase64": "<base64-encoded PNG>"
  },
  "options": {
    "pollTimeoutMs": 240000,
    "pollIntervalMs": 3000
  }
}
```

**Response**

```json
{
  "success": true,
  "operation": "image_edit",
  "images": [
    { "type": "url", "data": "https://cdn.mulerun.com/demo/product-1.png" },
    { "type": "base64", "data": "<base64>" }
  ],
  "usage": { "images": 2 },
  "cost": 780,
  "metering": { "success": true }
}
```
