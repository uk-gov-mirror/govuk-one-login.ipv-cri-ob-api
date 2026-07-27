import { defineConfig } from 'eslint/config'

import eslint from '@eslint/js'
import prettier from 'eslint-config-prettier'
import perfectionist from 'eslint-plugin-perfectionist'
import tseslint from 'typescript-eslint'

export default defineConfig(
  { ignores: ['dist/**', 'node_modules/**', '.aws-sam/**', 'coverage'] },
  eslint.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  perfectionist.configs['recommended-natural'],
  prettier,
  {
    languageOptions: {
      parserOptions: {
        projectService: true
      }
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { fixStyle: 'separate-type-imports' }
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
      ],
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      'func-style': ['error', 'expression'],
      'no-console': 'error',
      'padding-line-between-statements': [
        'warn',
        { blankLine: 'always', next: '*', prev: 'import' },
        { blankLine: 'any', next: 'import', prev: 'import' }
      ],
      'perfectionist/sort-imports': [
        'warn',
        {
          groups: [
            [
              'type-builtin',
              'type-external',
              'type-internal',
              'type-parent',
              'type-sibling',
              'type-index'
            ],
            [
              'named-builtin',
              'named-external',
              'named-internal',
              'named-parent',
              'named-sibling',
              'named-index'
            ],
            [
              'default-builtin',
              'default-external',
              'default-internal',
              'default-parent',
              'default-sibling',
              'default-index'
            ],
            [
              'wildcard-builtin',
              'wildcard-external',
              'wildcard-internal',
              'wildcard-parent',
              'wildcard-sibling',
              'wildcard-index'
            ],
            'side-effect',
            'unknown'
          ],
          newlinesBetween: 1,
          type: 'natural'
        }
      ]
    }
  },
  {
    files: ['test/**/*'],
    rules: {
      'no-console': 'off'
    }
  }
)
