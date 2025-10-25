const STORAGE_KEY = 'contextDock.prompts';
const PROMPT_STATS_KEY = 'contextDock.promptStats';

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function ensureChromeStorageAvailable() {
  if (!(typeof chrome !== 'undefined' && chrome?.storage?.local)) {
    throw new Error('chrome.storage.local is not available in this context.');
  }
}

function callStorage(method, args = []) {
  ensureChromeStorageAvailable();
  const storage = chrome.storage.local;

  return new Promise((resolve, reject) => {
    try {
      storage[method](...args, (result) => {
        const error = chrome.runtime?.lastError;
        if (error) {
          reject(new Error(error.message));
        } else {
          resolve(result);
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}

function normalizePrompt(prompt) {
  if (!prompt || typeof prompt !== 'object') {
    throw new TypeError('Prompt must be an object.');
  }

  const id = typeof prompt.id === 'string' ? prompt.id.trim() : prompt.id;
  const title = typeof prompt.title === 'string' ? prompt.title.trim() : prompt.title;
  const content = typeof prompt.content === 'string' ? prompt.content : prompt.content;
  const tags = prompt.tags === undefined ? undefined : [...prompt.tags];

  return {
    ...prompt,
    id,
    title,
    content,
    ...(tags !== undefined ? { tags } : {}),
  };
}

function validatePrompt(prompt) {
  if (!prompt || typeof prompt !== 'object') {
    throw new TypeError('Prompt must be a plain object.');
  }

  if (!prompt.id || typeof prompt.id !== 'string') {
    throw new TypeError('Prompt id must be a non-empty string.');
  }

  if (!prompt.title || typeof prompt.title !== 'string') {
    throw new TypeError('Prompt title must be a non-empty string.');
  }

  if (!prompt.content || typeof prompt.content !== 'string') {
    throw new TypeError('Prompt content must be a non-empty string.');
  }

  if (prompt.tags !== undefined) {
    if (!Array.isArray(prompt.tags)) {
      throw new TypeError('Prompt tags must be an array of strings.');
    }

    const nonStringTag = prompt.tags.find((tag) => typeof tag !== 'string');
    if (nonStringTag !== undefined) {
      throw new TypeError('Every prompt tag must be a string.');
    }
  }
}

async function readPromptsFromStorage() {
  const result = await callStorage('get', [STORAGE_KEY]);
  const prompts = result?.[STORAGE_KEY];
  return Array.isArray(prompts) ? prompts : [];
}

async function writePromptsToStorage(prompts) {
  await callStorage('set', [{ [STORAGE_KEY]: prompts }]);
}

async function readPromptStatsFromStorage() {
  const result = await callStorage('get', [PROMPT_STATS_KEY]);
  const stats = result?.[PROMPT_STATS_KEY];
  return isPlainObject(stats) ? stats : {};
}

async function writePromptStatsToStorage(stats) {
  await callStorage('set', [{ [PROMPT_STATS_KEY]: stats }]);
}

async function mergeStats(importedStats) {
  const current = await readPromptStatsFromStorage();
  const next = { ...current };

  Object.entries(importedStats).forEach(([promptId, stats]) => {
    if (!isPlainObject(stats)) {
      return;
    }

    const count = Number(stats.count);
    const lastUsed = typeof stats.lastUsed === 'string' ? stats.lastUsed : null;

    if (!Number.isFinite(count) && !lastUsed) {
      return;
    }

    const existing = next[promptId] ?? { count: 0, lastUsed: null };

    const merged = {
      count: Number.isFinite(count) ? Math.max(existing.count || 0, count) : existing.count || 0,
      lastUsed: lastUsed || existing.lastUsed,
    };

    next[promptId] = merged;
  });

  await writePromptStatsToStorage(next);
  return next;
}

export async function getPrompts() {
  return readPromptsFromStorage();
}

export async function savePrompt(prompt) {
  const normalizedPrompt = normalizePrompt(prompt);
  validatePrompt(normalizedPrompt);

  const prompts = await readPromptsFromStorage();
  const existingIndex = prompts.findIndex((item) => item.id === normalizedPrompt.id);

  if (existingIndex >= 0) {
    prompts[existingIndex] = normalizedPrompt;
  } else {
    prompts.push(normalizedPrompt);
  }

  await writePromptsToStorage(prompts);
  return normalizedPrompt;
}

export async function deletePrompt(id) {
  if (!id || typeof id !== 'string') {
    throw new TypeError('Prompt id must be a non-empty string.');
  }

  const prompts = await readPromptsFromStorage();
  const nextPrompts = prompts.filter((prompt) => prompt.id !== id);

  if (nextPrompts.length === prompts.length) {
    return false;
  }

  await writePromptsToStorage(nextPrompts);

  const stats = await readPromptStatsFromStorage();
  if (stats[id]) {
    delete stats[id];
    await writePromptStatsToStorage(stats);
  }

  return true;
}

export async function updatePrompt(id, data) {
  if (!id || typeof id !== 'string') {
    throw new TypeError('Prompt id must be a non-empty string.');
  }

  if (!data || typeof data !== 'object') {
    throw new TypeError('Update data must be a plain object.');
  }

  const prompts = await readPromptsFromStorage();
  const index = prompts.findIndex((prompt) => prompt.id === id);

  if (index === -1) {
    throw new Error(`Prompt with id "${id}" not found.`);
  }

  const candidate = normalizePrompt({
    ...prompts[index],
    ...data,
    id,
  });

  validatePrompt(candidate);

  prompts[index] = candidate;
  await writePromptsToStorage(prompts);
  return candidate;
}

export async function clearPrompts() {
  await writePromptsToStorage([]);
  await writePromptStatsToStorage({});
}

export async function exportPrompts() {
  const [prompts, stats] = await Promise.all([
    readPromptsFromStorage(),
    readPromptStatsFromStorage(),
  ]);

  return JSON.stringify({ prompts, stats }, null, 2);
}

export async function importPrompts(rawPrompts) {
  const payload = Array.isArray(rawPrompts)
    ? { prompts: rawPrompts }
    : isPlainObject(rawPrompts)
    ? rawPrompts
    : null;

  if (!payload || !Array.isArray(payload.prompts)) {
    throw new TypeError('Imported prompts must be an array or object with a prompts array.');
  }

  const existingPrompts = await readPromptsFromStorage();
  const existingIds = new Set(existingPrompts.map((prompt) => prompt.id));

  const normalized = payload.prompts.map((prompt) => {
    const normalizedPrompt = normalizePrompt(prompt);
    validatePrompt(normalizedPrompt);
    return normalizedPrompt;
  });

  const nextIds = new Set();
  const deduped = [];

  for (const prompt of normalized) {
    if (existingIds.has(prompt.id) || nextIds.has(prompt.id)) {
      continue;
    }

    nextIds.add(prompt.id);
    deduped.push(prompt);
  }

  const nextPrompts = deduped.length ? [...existingPrompts, ...deduped] : existingPrompts;

  await writePromptsToStorage(nextPrompts);

  if (payload.stats && isPlainObject(payload.stats)) {
    await mergeStats(payload.stats);
  }

  return {
    prompts: nextPrompts,
    added: deduped,
  };
}

export async function getPromptStats() {
  return readPromptStatsFromStorage();
}

export async function recordPromptUsage(promptId, timestamp = new Date()) {
  if (!promptId || typeof promptId !== 'string') {
    throw new TypeError('Prompt id must be a non-empty string.');
  }

  const stats = await readPromptStatsFromStorage();
  const record = stats[promptId] ?? { count: 0, lastUsed: null };

  const updatedRecord = {
    count: Number.isFinite(record.count) ? record.count + 1 : 1,
    lastUsed: timestamp.toISOString(),
  };

  const nextStats = {
    ...stats,
    [promptId]: updatedRecord,
  };

  await writePromptStatsToStorage(nextStats);
  return updatedRecord;
}

export const __testing = {
  STORAGE_KEY,
  PROMPT_STATS_KEY,
  normalizePrompt,
  validatePrompt,
  readPromptsFromStorage,
  writePromptsToStorage,
  readPromptStatsFromStorage,
  writePromptStatsToStorage,
  exportPrompts,
  importPrompts,
  mergeStats,
  getPromptStats,
  recordPromptUsage,
};

