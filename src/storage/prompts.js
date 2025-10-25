const STORAGE_KEY = 'contextDock.prompts';

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
}

export const __testing = {
  STORAGE_KEY,
  normalizePrompt,
  validatePrompt,
  readPromptsFromStorage,
  writePromptsToStorage,
};

