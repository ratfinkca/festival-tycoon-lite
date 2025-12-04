import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // Ignore build output
  globalIgnores(['dist']),

  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // Our game loop & audio engine intentionally use custom deps in hooks
      'react-hooks/exhaustive-deps': 'off',
    },
  },

  // Optional: relax “no explicit any” just for the audio engine, if you want
  {
    files: ['src/game/audio.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
])
