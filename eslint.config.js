import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // No silent failures (audit H6): every catch block surfaces the failure,
      // logs it, or carries a comment saying why silence is right — and a
      // comment is the only thing that makes an empty block pass. Spelled out
      // rather than inherited from `recommended`, so loosening it is a visible
      // edit. Silent `.catch(() => {})` handlers are function bodies, which this
      // rule cannot see; src/lib/noSilentCatch.test.ts guards those, tree-wide.
      'no-empty': ['error', { allowEmptyCatch: false }],
    },
  },
])
