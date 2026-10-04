import next from 'eslint-config-next';

export default [
  ...next,
  {
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  { ignores: ['.next/**', 'node_modules/**', 'public/sw.js'] },
];
