// ESLint configuration focused on governance and React/TS safety
module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    node: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  settings: {
    react: { version: 'detect' },
    'import/resolver': {
      typescript: {
        project: './tsconfig.json',
      },
    },
    'boundaries/elements': [
      { type: 'app', pattern: '{App,index}.{ts,tsx}' },
      { type: 'engine', pattern: 'engine/**/*' },
      { type: 'features', pattern: 'features/**/*' },
      { type: 'shared', pattern: '{components,design,hooks,utils,stores,i18n,config,test-utils,types}/**/*' },
    ],
    'boundaries/ignore': [
      '**/*.test.*',
      '**/*.spec.*',
      '**/tests/**',
      '**/test-utils/**',
      '**/features/**/components/**',
      '**/utils/dev/**',
      '**/utils/benchmark/**',
      '**/utils/benchmarks/**',
      '**/components/dev/**',
    ],
  },
  plugins: [
    '@typescript-eslint',
    'react',
    'react-hooks',
    'import',
    'boundaries',
    'prettier',
  ],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'plugin:import/recommended',
    'plugin:import/typescript',
    'plugin:prettier/recommended',
  ],
  rules: {
    'no-console': ['error', { allow: ['warn', 'error'] }],
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': 'off',
    '@typescript-eslint/ban-types': 'off',
    '@typescript-eslint/ban-ts-comment': 'off',
    'react-hooks/exhaustive-deps': 'warn',
    'react/prop-types': 'off',
    'import/default': 'off',
    'import/no-named-as-default-member': 'off',
    'import/order': [
      'warn',
      {
        groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index', 'object', 'type'],
        alphabetize: { order: 'asc', caseInsensitive: true },
        'newlines-between': 'always',
      },
    ],
    'boundaries/element-types': [
      'error',
      {
        default: 'allow',
        rules: [
          { from: 'shared', disallow: ['features', 'engine'] },
          { from: 'engine', disallow: ['features', 'shared'] },
        ],
      },
    ],
    'react/react-in-jsx-scope': 'off',
    'prettier/prettier': ['error'],
    'no-control-regex': 'off',
    'no-case-declarations': 'off',
    'no-inner-declarations': 'off',
    'no-useless-escape': 'off',
  },
  overrides: [
    {
      files: [
        '**/*.test.{ts,tsx}',
        '**/*.spec.{ts,tsx}',
        'tests/**/*',
        'scripts/**/*',
        'utils/dev/**/*',
        'utils/benchmarks/**/*',
        'utils/benchmark/**/*',
        'components/dev/**/*',
      ],
      rules: {
        'no-console': 'off',
        '@typescript-eslint/no-explicit-any': 'off',
      },
    },
  ],
};
