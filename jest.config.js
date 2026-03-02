/** @type {import('ts-jest').JestConfigWithTsJest} */
const path = require('path');

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: './tsconfig.json'
      },
    ],
  },
  moduleDirectories: ['node_modules', 'src'],
  testMatch: ['**/__tests__/**/*.test.ts?(x)'],
  verbose: true,
  reporters: [
    "default",
    ["./node_modules/jest-junit", {
      "outputDirectory": path.join(__dirname, "reports"),
      "outputName": "junit.xml",
      "includeConsoleOutput": true,
      "usePathForSuiteName": "true"
    }]
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js']
};
console.log('Jest config loaded from:', __dirname);
