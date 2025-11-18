// API 调用封装
export async function endSession(sessionId: string) {
  try {
    await fetch('/api/metering', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        cost: 0,
        isFinal: true,
      }),
    });
  } catch (error) {
    console.error('Failed to end session:', error);
  }
}

export async function reportWithRetry(
  sessionId: string, 
  cost: number, 
  maxRetries = 3
): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch('/api/metering', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, cost }),
      });
      if (response.ok) return;
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
}
