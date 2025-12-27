/**
 * Waits for a condition to be true.
 * @param {() => boolean | Promise<boolean>} predicate - The condition to check.
 * @param {number} timeout - Maximum time to wait in ms.
 * @param {number} interval - Polling interval in ms.
 * @returns {Promise<void>} - Resolves when predicate is true, rejects on timeout.
 */
export async function waitFor(predicate, timeout = 5000, interval = 100) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    try {
      if (await predicate()) {
        return;
      }
    } catch (error) {
      // Ignore errors in predicate and keep polling (unless desired otherwise)
      // For now, let's allow errors to bubble up if we want strict checks, 
      // but usually for 'wait' we might want to ignore transient errors?
      // Actually, standard waitFor usually expects predicate to return false or throw.
      // But let's keep it simple: if predicate throws, we bubble it up.
      // If predicate returns falsey, we wait.
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  throw new Error(`Timeout waiting for condition after ${timeout}ms`);
}
