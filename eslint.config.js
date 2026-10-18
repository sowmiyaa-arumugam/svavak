// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// Portions derived from AmazonAppDev/react-native-multi-tv-app-sample (MIT-0)
// ESLint flat config for the TypeScript in apps/tv and packages/switchclock: the sample's rules, unchanged.

const prettier = require('eslint-plugin-prettier'); // reports Prettier formatting differences as lint findings

module.exports = [ // a single config block
  { // TypeScript and TSX files
    files: ['**/*.ts', '**/*.tsx'], // what this block lints
    ignores: ['node_modules/**', 'build/**', 'dist/**'], // never dependencies or build output
    languageOptions: { // how files are parsed
      parser: require('@typescript-eslint/parser'), // TypeScript syntax
      parserOptions: { // parser settings
        ecmaVersion: 'latest', // newest ECMAScript syntax
        sourceType: 'module', // ES modules
        ecmaFeatures: { // syntax extensions
          jsx: true, // TSX
        }, // end of syntax extensions
      }, // end of parser settings
      globals: { // predefined globals
        React: 'readonly', // React, as in the sample
      }, // end of globals
    }, // end of parsing
    plugins: { // rule sources
      '@typescript-eslint': require('@typescript-eslint/eslint-plugin'), // TypeScript rules
      react: require('eslint-plugin-react'), // React rules
      prettier: prettier, // the formatting rule
    }, // end of plugins
    rules: { // the sample's rule set
      semi: ['warn', 'always'], // statements end with semicolons
      'prefer-const': 'error', // never reassigned means const
      'react/jsx-filename-extension': ['error', { extensions: ['.tsx'] }], // JSX only in .tsx files
      '@typescript-eslint/explicit-function-return-type': 'off', // inferred return types are fine
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }], // unused names, except _-prefixed arguments
      'prettier/prettier': [ // formatting, checked against .prettierrc
        'warn', // a warning, as in the sample
        { // Prettier options
          endOfLine: 'auto', // keep each file's existing line endings (Windows checkouts)
          usePrettierrc: true, // as in the sample
        }, // end of Prettier options
      ], // end of the formatting rule
    }, // end of rules
  }, // end of the TypeScript block
]; // end of the config
