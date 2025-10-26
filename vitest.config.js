import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		environment: 'jsdom',
		setupFiles: ['./vitest.setup.js'],
		coverage: {
			reporter: ['text', 'html', 'lcov'],
		},
	},
})
