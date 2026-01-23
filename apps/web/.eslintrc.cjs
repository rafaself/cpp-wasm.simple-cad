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
    'no-restricted-syntax': [
      'error',
      {
        selector: "Literal[value=/\\b(text|gap|p|m|h|w)-\\[/]",
        message: 'Arbitrary Tailwind values are forbidden; use token-backed utilities.',
      },
      {
        selector: "Literal[value=/(#[0-9A-Fa-f]{3,6})/]",
        message: 'Raw color literals are forbidden in TS/TSX; add a semantic token instead.',
      },
      {
        selector: "Literal[value=/\\bz-\\d+/]",
        message: 'Use z-index tokens (z-modal, z-dropdown, z-toast, etc.) instead of numeric z- classes.',
      },
    ],
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
        'no-restricted-syntax': 'off', // Tests may use raw colors for assertions
      },
    },
    {
      // Files that legitimately require raw hex colors (data tables, color pickers, import adapters, SVG overlays)
      files: [
        // DXF import - industry standard color tables and mappings
        'features/import/utils/dxf/aciColors.ts', // AutoCAD Color Index - industry standard color table
        'features/import/utils/dxf/styles.ts', // DXF style definitions with standard colors
        'features/import/utils/dxf/colorScheme.ts', // DXF color scheme mapping
        'features/import/utils/dxf/dxfWorker.ts', // DXF worker with default fallback colors
        // PDF import - default colors for missing metadata
        'features/import/utils/pdf*.ts', // PDF import utilities with fallback colors
        // Color picker - needs raw color values by definition
        'components/ColorPicker/**/*.{ts,tsx}',
        // Theme defaults - base color definitions
        'theme/defaults.ts',
        // Color utilities - color manipulation functions
        'utils/color.ts',
        'utils/cssColor.ts',
        // Visual overlays - SVG stroke/fill colors for selection handles and debugging
        'features/editor/components/ShapeOverlay.tsx', // Selection handles and debug visualization
        'features/editor/components/Header.tsx', // Header with brand colors
        'features/editor/components/LayerManagerModal.tsx', // Layer preview colors
        // Test utilities
        'test-utils/**/*.ts',
      ],
      rules: {
        'no-restricted-syntax': [
          'error',
          {
            selector: "Literal[value=/\\b(text|gap|p|m|h|w)-\\[/]",
            message: 'Arbitrary Tailwind values are forbidden; use token-backed utilities.',
          },
          {
            selector: "Literal[value=/\\bz-\\d+/]",
            message: 'Use z-index tokens (z-modal, z-dropdown, z-toast, etc.) instead of numeric z- classes.',
          },
          // Raw hex colors allowed in these data/picker files
        ],
      },
    },
  ],
};
