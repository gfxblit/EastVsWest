import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        // Browser globals
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        console: 'readonly',
        performance: 'readonly',
        crypto: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        AbortController: 'readonly',
        Blob: 'readonly',
        FileReader: 'readonly',
        Image: 'readonly',
        alert: 'readonly',
        KeyboardEvent: 'readonly',
        MouseEvent: 'readonly',
        Touch: 'readonly',
        TouchEvent: 'readonly',
        HTMLCanvasElement: 'readonly',
        File: 'readonly',
        Event: 'readonly',
        Buffer: 'readonly',
        // Node.js globals
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'readonly',
      },
    },
    rules: {
      // Indentation: 2 spaces
      'indent': ['error', 2, { 'SwitchCase': 1 }],

      // Quotes: single quotes
      'quotes': ['error', 'single', { 'avoidEscape': true }],

      // Semicolons: required
      'semi': ['error', 'always'],

      // Trailing commas
      'comma-dangle': ['error', 'always-multiline'],

      // No unused vars (warning only)
      'no-unused-vars': ['warn', { 'argsIgnorePattern': '^_', 'varsIgnorePattern': '^_' }],

      // Consistent spacing
      'space-before-blocks': 'error',
      'keyword-spacing': 'error',
      'space-infix-ops': 'error',

      // Best practices
      'eqeqeq': ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },
  {
    // Test files specific config
    files: ['**/*.test.js', '**/*.spec.js', 'e2e/**/*.js'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        test: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        jest: 'readonly',
        // Node.js globals for test files
        setTimeout: 'readonly',
        clearInterval: 'readonly',
        setInterval: 'readonly',
        Buffer: 'readonly',
      },
    },
  },
  {
    // Ignore patterns
    ignores: [
      'node_modules/**',
      'dist/**',
      'build/**',
      'coverage/**',
      'supabase/functions/**',
    ],
  },
];
