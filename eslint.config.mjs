import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },

  {
    files: ['modules/**/*.{ts,tsx}'],
    rules: {
      'import/no-cycle': ['error', { maxDepth: 1 }],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/components/*', '@/hooks/*'],
              message: 'Domain modules must not import UI-layer components or hooks.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['components/**/*.{ts,tsx}', 'hooks/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/modules/*/repository', '@/modules/*/threads-*/**'],
              message:
                'Presentation layers must consume module actions/services, not direct repositories.',
            },
            {
              group: ['@/lib/infrastructure/*'],
              message: 'Presentation layers must not import infrastructure directly.',
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
  ]),
]);

export default eslintConfig;
