// Storage functions (copied from src/storage/prompts.js for popup compatibility)
const STORAGE_KEY = 'contextDock.prompts';

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

async function getPrompts() {
  return readPromptsFromStorage();
}

async function savePrompt(prompt) {
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

async function deletePrompt(id) {
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

// DOM Elements
const app = document.getElementById('app');
const promptsList = document.getElementById('prompts-list');
const searchInput = document.getElementById('search-input');
const newPromptBtn = document.getElementById('new-prompt-btn');
const createModal = document.getElementById('create-modal');
const createForm = document.getElementById('create-form');
const promptTitle = document.getElementById('prompt-title');
const promptTags = document.getElementById('prompt-tags');
const promptContent = document.getElementById('prompt-content');
const formError = document.getElementById('form-error');
const cancelBtn = document.getElementById('cancel-btn');
const saveBtn = document.getElementById('save-btn');

// State
let allPrompts = [];
let filteredPrompts = [];

// Initialize
document.addEventListener('DOMContentLoaded', init);

async function init() {
  try {
    await loadPrompts();
    setupEventListeners();
  } catch (error) {
    console.error('ContextDock: Failed to initialize popup', error);
    showError('Failed to load prompts. Please try refreshing.');
  }
}

function setupEventListeners() {
  // New prompt button
  newPromptBtn.addEventListener('click', showCreateModal);

  // Modal controls
  cancelBtn.addEventListener('click', hideCreateModal);
  createModal.addEventListener('click', (e) => {
    if (e.target === createModal) {
      hideCreateModal();
    }
  });

  // Form submission
  createForm.addEventListener('submit', handleFormSubmit);

  // Search
  searchInput.addEventListener('input', handleSearch);

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && createModal.style.display !== 'none') {
      hideCreateModal();
    }
  });
}

async function loadPrompts() {
  try {
    allPrompts = await getPrompts();
    filteredPrompts = [...allPrompts];
    renderPrompts();
  } catch (error) {
    console.error('ContextDock: Failed to load prompts', error);
    throw error;
  }
}

function renderPrompts() {
  if (filteredPrompts.length === 0) {
    if (allPrompts.length === 0) {
      promptsList.innerHTML = `
        <div class="contextdock-card p-8 text-center">
          <p class="text-slate-500 dark:text-slate-400 mb-4">No prompts yet</p>
          <button class="contextdock-button contextdock-button--primary" onclick="showCreateModal()">
            Create your first prompt
          </button>
        </div>
      `;
    } else {
      promptsList.innerHTML = `
        <div class="contextdock-card p-8 text-center">
          <p class="text-slate-500 dark:text-slate-400">No prompts match your search</p>
        </div>
      `;
    }
    return;
  }

  const promptsHtml = filteredPrompts.map(prompt => `
    <div class="contextdock-card p-4">
      <div class="contextdock-flex-between mb-3">
        <h3 class="font-medium text-slate-900 dark:text-slate-100 truncate">${escapeHtml(prompt.title)}</h3>
        <div class="flex space-x-2">
          <button
            class="contextdock-button contextdock-button--ghost contextdock-button--small"
            onclick="editPrompt('${prompt.id}')"
            title="Edit prompt"
          >
            ✏️
          </button>
          <button
            class="contextdock-button contextdock-button--ghost contextdock-button--small"
            onclick="deletePromptById('${prompt.id}')"
            title="Delete prompt"
          >
            🗑️
          </button>
        </div>
      </div>

      <div class="text-sm text-slate-600 dark:text-slate-400 mb-3 line-clamp-3">
        ${escapeHtml(prompt.content.substring(0, 150))}${prompt.content.length > 150 ? '...' : ''}
      </div>

      ${prompt.tags && prompt.tags.length > 0 ? `
        <div class="flex flex-wrap gap-1 mb-3">
          ${prompt.tags.map(tag => `
            <span class="contextdock-tag">${escapeHtml(tag)}</span>
          `).join('')}
        </div>
      ` : ''}

      <div class="text-xs text-slate-500 dark:text-slate-400">
        Created ${formatDate(prompt.createdAt)}
      </div>
    </div>
  `).join('');

  promptsList.innerHTML = promptsHtml;
}

function showCreateModal() {
  resetForm();
  createModal.style.display = 'flex';
  promptTitle.focus();
}

function hideCreateModal() {
  createModal.style.display = 'none';
  resetForm();
}

function resetForm() {
  createForm.reset();
  hideFormError();
}

function showFormError(message) {
  formError.textContent = message;
  formError.style.display = 'block';
}

function hideFormError() {
  formError.style.display = 'none';
}

async function handleFormSubmit(e) {
  e.preventDefault();

  const title = promptTitle.value.trim();
  const content = promptContent.value.trim();
  const tagsInput = promptTags.value.trim();

  // Validation
  if (!title) {
    showFormError('Title is required');
    promptTitle.focus();
    return;
  }

  if (!content) {
    showFormError('Content is required');
    promptContent.focus();
    return;
  }

  // Parse tags
  const tags = tagsInput
    ? tagsInput.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0)
    : [];

  // Create prompt object
  const prompt = {
    id: generatePromptId(),
    title,
    content,
    tags,
    createdAt: new Date().toISOString()
  };

  try {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    await savePrompt(prompt);

    // Refresh the list
    await loadPrompts();

    // Hide modal
    hideCreateModal();

    // Clear search
    searchInput.value = '';

  } catch (error) {
    console.error('ContextDock: Failed to save prompt', error);
    showFormError('Failed to save prompt. Please try again.');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Prompt';
  }
}

function handleSearch(e) {
  const query = e.target.value.toLowerCase().trim();

  if (!query) {
    filteredPrompts = [...allPrompts];
  } else {
    filteredPrompts = allPrompts.filter(prompt =>
      prompt.title.toLowerCase().includes(query) ||
      prompt.content.toLowerCase().includes(query) ||
      (prompt.tags && prompt.tags.some(tag => tag.toLowerCase().includes(query)))
    );
  }

  renderPrompts();
}

async function deletePromptById(promptId) {
  if (!confirm('Are you sure you want to delete this prompt?')) {
    return;
  }

  try {
    await deletePrompt(promptId);
    await loadPrompts();
  } catch (error) {
    console.error('ContextDock: Failed to delete prompt', error);
    showError('Failed to delete prompt. Please try again.');
  }
}

function editPrompt(promptId) {
  // TODO: Implement edit functionality
  alert('Edit functionality coming soon!');
}

function generatePromptId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `prompt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatDate(isoString) {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return 'today';
    } else if (diffDays === 1) {
      return 'yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  } catch (error) {
    return 'recently';
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showError(message) {
  // Simple error display - could be enhanced with a toast system
  const errorDiv = document.createElement('div');
  errorDiv.className = 'contextdock-card p-4 mb-4 border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-900/50 dark:text-red-200';
  errorDiv.textContent = message;

  app.insertBefore(errorDiv, app.firstChild);

  setTimeout(() => {
    if (errorDiv.parentNode) {
      errorDiv.parentNode.removeChild(errorDiv);
    }
  }, 5000);
}

// Make functions global for onclick handlers and external access
window.showCreateModal = showCreateModal;
window.editPrompt = editPrompt;
window.deletePromptById = deletePromptById;

// Reusable modal functionality
window.ContextDockModal = {
  show: showCreateModal,
  hide: hideCreateModal,
  savePrompt: savePrompt,
  getPrompts: getPrompts,
  deletePrompt: deletePrompt
};
