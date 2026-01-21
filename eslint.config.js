import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...tseslint.configs.stylistic,
  eslintConfigPrettier,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      'no-multi-spaces': 'error',
      'no-empty': 'warn',
      'no-console': 'warn',
      'no-constant-condition': 'off',
      'no-multiple-empty-lines': ['warn', { max: 1, maxBOF: 0 }],
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^__' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-inferrable-types': 'warn',
      '@typescript-eslint/array-type': 'warn',
      '@typescript-eslint/prefer-for-of': 'warn',
      '@typescript-eslint/consistent-generic-constructors': 'warn',
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', 'public/**', '.github/**', 'example/**'],
  }
);
