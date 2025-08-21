module.exports = {
  testEnvironment: 'node',
  collectCoverageFrom: [
    'lambda/**/*.{js,mjs}',
    '!lambda/**/node_modules/**',
    '!lambda/lambdaLayer/nodejs/node_modules/**',
    '!lambda/lambdaLayer/nodejs/shared/index.js',
    '!**/coverage/**',
    '!**/*.test.{js,mjs}'
  ],
  testMatch: [
    '**/lambda/**/*.test.{js,mjs}',
    '**/?(*.)+(spec|test).{js,mjs}'
  ],
  transform: {
    '^.+\\.(js|mjs)$': 'babel-jest'
  },
  moduleFileExtensions: ['js', 'mjs', 'json'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/lambda/lambdaLayer/nodejs/node_modules/',
    '/cdk.out/'
  ],
  moduleNameMapper: {
    '^/opt/nodejs/shared/index\\.js$': '<rootDir>/lambda/lambdaLayer/nodejs/shared/index.js'
  },
  setupFilesAfterEnv: ['<rootDir>/test-setup.js'],
  // Mock directories
  roots: ['<rootDir>/lambda', '<rootDir>/mocks'],
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  transformIgnorePatterns: [
    'node_modules/(?!(aws-sdk-client-mock|aws-sdk-client-mock-jest|jose)/)'
  ]
};
