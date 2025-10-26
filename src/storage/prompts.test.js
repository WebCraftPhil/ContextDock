import { describe, it, expect, beforeEach } from 'vitest'

import {
	getPrompts,
	savePrompt,
	deletePrompt,
	updatePrompt,
	clearPrompts,
	exportPrompts,
	importPrompts,
	getPromptStats,
	recordPromptUsage,
	__testing,
} from './prompts.js'

const { STORAGE_KEY, PROMPT_STATS_KEY } = __testing

describe('prompts storage', () => {
	beforeEach(async () => {
		await clearPrompts()
	})

	it('saves and retrieves prompts', async () => {
		await savePrompt({ id: 'a', title: 'A', content: 'Hello' })
		const prompts = await getPrompts()
		expect(prompts).toEqual([{ id: 'a', title: 'A', content: 'Hello' }])
	})

	it('updates existing prompt', async () => {
		await savePrompt({ id: 'a', title: 'A', content: 'Hello' })
		const updated = await updatePrompt('a', { title: 'A2' })
		expect(updated.title).toBe('A2')
		const prompts = await getPrompts()
		expect(prompts[0].title).toBe('A2')
	})

	it('deletes prompts and cleans stats', async () => {
		await savePrompt({ id: 'a', title: 'A', content: 'Hello' })
		await recordPromptUsage('a', new Date('2023-01-01T00:00:00.000Z'))
		const ok = await deletePrompt('a')
		expect(ok).toBe(true)
		const prompts = await getPrompts()
		expect(prompts).toEqual([])
		const stats = await getPromptStats()
		expect(stats['a']).toBeUndefined()
	})

	it('exports and imports prompts and stats', async () => {
		await savePrompt({ id: 'a', title: 'A', content: 'Hello' })
		await recordPromptUsage('a', new Date('2023-01-01T00:00:00.000Z'))
		const exported = await exportPrompts()
		await clearPrompts()
		const payload = JSON.parse(exported)
		const result = await importPrompts(payload)
		expect(result.prompts.length).toBe(1)
		const stats = await getPromptStats()
		expect(stats.a.count).toBe(1)
	})

	it('validates prompt shape', async () => {
		await expect(() => __testing.validatePrompt({})).toThrow()
		await expect(() => __testing.validatePrompt({ id: '', title: 'x', content: 'y' })).toThrow()
		await expect(() => __testing.validatePrompt({ id: 'a', title: '', content: 'y' })).toThrow()
		await expect(() => __testing.validatePrompt({ id: 'a', title: 'x', content: '' })).toThrow()
	})
})
