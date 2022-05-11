module.exports = {
  env: {
    browser: true,
    es6: true,
  },
  extends: [
    'airbnb-base',
  ],
  globals: {
    Atomics: 'readonly',
    SharedArrayBuffer: 'readonly',
  },
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  rules: {
    'no-console': 0,
    'no-underscore-dangle': 0,
    'no-use-before-define': 0,
    'operator-linebreak': 0,
    'func-style': ["error", "expression"],
    'implicit-arrow-linebreak': 0,
    'import/no-named-as-default': 0,
    'function-paren-newline': 0,
  },
};
