import { vi } from 'vitest'

if (typeof globalThis.chrome === 'undefined') {
	globalThis.chrome = {}
}

if (!globalThis.chrome.runtime) {
	globalThis.chrome.runtime = {}
}

if (!globalThis.chrome.storage) {
	globalThis.chrome.storage = { local: {}, sync: {} }
}

function createStorageArea() {
	const store = new Map()
	return {
		get: vi.fn((keys, callback) => {
			let result = {}
			if (Array.isArray(keys)) {
				keys.forEach((key) => {
					result[key] = store.get(key)
				})
			} else if (typeof keys === 'string') {
				result[keys] = store.get(keys)
			} else if (typeof keys === 'object' && keys !== null) {
				result = { ...keys }
				Object.keys(result).forEach((key) => {
					result[key] = store.get(key) ?? result[key]
				})
			} else if (keys == null) {
				store.forEach((value, key) => {
					result[key] = value
				})
			}
			queueMicrotask(() => callback(result))
		}),
		set: vi.fn((items, callback) => {
			Object.keys(items).forEach((key) => store.set(key, items[key]))
			queueMicrotask(() => callback && callback())
		}),
		remove: vi.fn((keys, callback) => {
			const list = Array.isArray(keys) ? keys : [keys]
			list.forEach((key) => store.delete(key))
			queueMicrotask(() => callback && callback())
		}),
		clear: vi.fn((callback) => {
			store.clear()
			queueMicrotask(() => callback && callback())
		}),
	}
}

chrome.storage.local = createStorageArea()
chrome.storage.sync = createStorageArea()

chrome.runtime.lastError = null
