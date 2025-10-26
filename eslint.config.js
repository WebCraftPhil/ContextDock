// @ts-nocheck
import js from '@eslint/js'
import pluginImport from 'eslint-plugin-import'
import pluginN from 'eslint-plugin-n'
import pluginPromise from 'eslint-plugin-promise'
import pluginVitest from 'eslint-plugin-vitest'
import globals from 'globals'

export default [
	{
		ignores: [
			'dist/**',
			'node_modules/**',
		],
	},
	js.configs.recommended,
	{
		plugins: {
			import: pluginImport,
			n: pluginN,
			promise: pluginPromise,
		},
		languageOptions: {
			sourceType: 'module',
			globals: {
				...globals.browser,
				chrome: 'readonly',
			},
		},
		rules: {
			'no-console': 'off',
			'no-undef': 'error',
			'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
			'import/order': ['warn', { 'newlines-between': 'always', alphabetize: { order: 'asc', caseInsensitive: true } }],
			'promise/always-return': 'off',
		},
	},
	{
		files: ['**/*.{test,spec}.js'],
		plugins: { vitest: pluginVitest },
		languageOptions: {
			globals: { ...globals.node, ...globals.vitest },
		},
		rules: {
			'vitest/no-conditional-expect': 'warn',
		},
	},
	{
		files: ['tailwind.config.js', 'vitest.config.js'],
		languageOptions: {
			sourceType: 'module',
			globals: { ...globals.node },
		},
	},
	{
		files: ['content.js'],
		languageOptions: {
			globals: { ...globals.browser, tailwind: 'readonly', chrome: 'readonly' },
		},
	},
]
