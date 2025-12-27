/**
 * Waits for a condition to be true.
 * @param {() => boolean | Promise<boolean>} predicate - The condition to check.
 * @param {number} timeout - Maximum time to wait in ms.
 * @param {number} interval - Polling interval in ms.
 * @returns {Promise<void>} - Resolves when predicate is true, rejects on timeout.
 */
export async function waitFor(predicate, timeout = 5000, interval = 100) {
  const startTime = Date.now();
  let lastError = null;
  while (Date.now() - startTime < timeout) {
    try {
      if (await predicate()) {
        return;
      }
    } catch (error) {
      lastError = error;
      // Keep polling until timeout
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  const errorMessage = lastError ? `. Last error: ${lastError.message}` : '';
  throw new Error(`Timeout waiting for condition after ${timeout}ms${errorMessage}`);
}
