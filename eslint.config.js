import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // `npm run lint` is `eslint .` and CI runs it, so "." has to mean the app —
  // src, shared, e2e, scripts, evals, firebase/functions/src — and nothing a
  // tool wrote. Every entry here is gitignored output. Without them a local
  // run walked the build output and every agent worktree under .claude/ (each
  // a full checkout of this repo), and reported ~1,500 errors for ~80 real ones.
  globalIgnores([
    // Build output. Only the Functions workspace's own `lib/` (tsc outDir) and
    // `dist/` (esbuild bundle): src/lib, firebase/functions/src/lib,
    // scripts/import/lib and evals/manual-parser/lib are source, so this is
    // deliberately not `**/lib/**`.
    'dist/',
    'dist-ssr/',
    'firebase/functions/lib/',
    'firebase/functions/dist/',
    // Tool state and other working copies (Claude Code worktrees live in
    // .claude/worktrees/).
    '.claude/',
    '.cursor/',
    '.agents/',
    '.firebase/',
    'memory/',
    // Test and report output.
    'playwright-report/',
    'test-results/',
    'journey-report/',
    'design-shots/',
    'coverage/',
    // Local-only data the ops and eval scripts pull or write.
    'feedback/',
    'testflight-feedback/',
    'scripts/parse-eval/results/',
    'scripts/parse-eval/candidates/',
    'scripts/parse-eval/.pdf-cache/',
    'scripts/chat-eval/results/',
    'evals/manual-parser/.pdf-cache/',
  ]),
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
