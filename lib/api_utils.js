/**
 * Executa uma lista de tarefas (Promises) com um limite máximo de concorrência.
 * Essencial para evitar erros 429/503 por excesso de workers em APIs como Groq e NVIDIA NIM.
 *
 * @param {Array<Function>} tasks - Array de funções que retornam Promises
 * @param {number} concurrency - Número máximo de execuções simultâneas
 * @returns {Promise<Array>} - Resultados de todas as tarefas
 */
async function runWithConcurrencyLimit(tasks, concurrency) {
  const results = [];
  const executing = new Set();

  for (const [index, task] of tasks.entries()) {
    const p = Promise.resolve().then(() => task());
    results.push(p);
    executing.add(p);

    const clean = () => executing.delete(p);
    p.then(clean).catch(clean);

    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }

  return Promise.all(results);
}

/**
 * Executa uma função de API com Exponential Backoff e Jitter (variação aleatória).
 * Ideal para quando a SDK oficial não trata ou quando usamos fetch() puro.
 * 
 * @param {Function} apiCallFn - A função assíncrona que faz a chamada à API
 * @param {number} maxRetries - Limite de tentativas
 * @param {number} baseDelayMs - Tempo base de espera em milissegundos
 */
async function callWithRetry(apiCallFn, maxRetries = 3, baseDelayMs = 5000) {
  let attempt = 0;
  
  while (attempt < maxRetries) {
    try {
      return await apiCallFn();
    } catch (error) {
      attempt++;
      
      // Verifica se é erro de rate limit (429), server (503/504) ou erro de rede/timeout
      const errStr = String(error.message || error.code || '').toLowerCase();
      const isRetryable = 
        error.status === 429 || error.status === 503 || error.status === 504 || 
        errStr.includes('429') || errStr.includes('503') || errStr.includes('504') ||
        errStr.includes('timeout') || errStr.includes('econnreset') || 
        errStr.includes('econnrefused') || errStr.includes('enotfound') || 
        errStr.includes('fetch');

      if (!isRetryable || attempt >= maxRetries) {
        throw error;
      }

      // Exponential backoff com jitter: baseDelay * (2 ^ attempt) + (0 a 1000ms aleatório)
      const backoff = baseDelayMs * Math.pow(2, attempt);
      const jitter = Math.random() * 1000;
      const waitTime = backoff + jitter;

      console.warn(`[RETRY] API sobrecarregada (Tentativa ${attempt}/${maxRetries}). Aguardando ${Math.round(waitTime/1000)}s antes de tentar novamente...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
}

module.exports = {
  runWithConcurrencyLimit,
  callWithRetry
};
