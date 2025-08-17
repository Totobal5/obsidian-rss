import { createRequire } from 'module';
const require = createRequire(import.meta.url);

/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'jsdom',
  extensionsToTreatAsEsm: ['.ts', '.svelte'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: '<rootDir>/test/tsconfig.json'
      }
    ],
    '^.+\\.svelte$': [
      'svelte-jester',
  { preprocess: true, compilerOptions: { generate: 'dom', compatibility: { componentApi: 4 } } }
    ]
  },
  globals: {
    'ts-jest': { useESM: true }
  },
  moduleFileExtensions: ['ts','js','svelte','json'],
  collectCoverage: true,
  moduleDirectories: ['node_modules','src','test'],
  coverageReporters: ['lcov','text','teamcity'],
  testResultsProcessor: 'jest-teamcity-reporter',
  testMatch: ['**/test/**/*.test.ts'],
  moduleNameMapper: {
    '\\.(css|scss)$': '<rootDir>/test/__mocks__/styleMock.js',
    '^obsidian$': '<rootDir>/__mocks__/obsidian.ts',
    '^@vanakat/plugin-api$': '<rootDir>/test/__mocks__/pluginApiMock.js'
  }
};

export default config;
