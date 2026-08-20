// Retries a fetch-and-parse cycle on transient failures. `attemptFn` receives the
// attempt number (0-based) and must return { retry: false, value } on success or
// { retry: true, delayMs?, error? } to trigger a backoff + retry.
async function withRetry(attemptFn, { maxRetries = 5, baseDelayMs = 1000 } = {}) {
  for (let attempt = 0; ; attempt++) {
    const result = await attemptFn(attempt);
    if (!result.retry) return result.value;
    if (attempt >= maxRetries) throw new Error(result.error || 'Max retries exceeded');
    const delay = result.delayMs ?? (baseDelayMs * 2 ** attempt + Math.random() * 250);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}

// Shared classification for HTTP responses: retry on 429/5xx, honoring Retry-After.
function httpRetryDecision(response) {
  if (response.ok) return null;
  if (response.status === 429 || response.status >= 500) {
    const retryAfter = response.headers.get('retry-after');
    return { retry: true, delayMs: retryAfter ? parseInt(retryAfter, 10) * 1000 : undefined };
  }
  return null;
}

module.exports = { withRetry, httpRetryDecision };
