import js from '@eslint/js';
import globals from 'globals';

export default [
  {ignores: ['dist/**', 'node_modules/**']},
  js.configs.recommended,
  {
    languageOptions: {globals: {...globals.browser, ...globals.worker}},
    rules: {
      'no-unused-vars': ['error', {argsIgnorePattern: '^_', caughtErrors: 'none'}],
      'eqeqeq': ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },
  {
    files: ['*.config.js', 'tests/*.test.js', 'tests/observer-benchmark.js', 'tests/quiet-motion-research.js', 'tests/multiscale-research.js', 'tests/ink-research.js'],
    languageOptions: {globals: globals.node},
  },
  {
    files: ['src/{depthwalk,depth-frame,stereogram,pattern,contours,surface-stereo,chroma-stereo,scene-color,foundation-stereo,foundation-texture,foundation-motion,foundation-carrier,foundation-preparation,frame-demand}.js', 'src/gpu/depthwalk-gpu.js'],
    rules: {
      'no-restricted-globals': ['error', 'window', 'document'],
      'no-restricted-imports': ['error', {patterns: ['three', 'three/*']}],
    },
  },
];
