import { createRequire } from 'module';
const require = createRequire(import.meta.url);

/** @type {import('jest').Config} */
const config = {
    testEnvironment: 'jsdom',
    extensionsToTreatAsEsm: ['.ts', '.svelte'],
    transform: {
        '^.+\\.ts$': [
            'ts-jest',
            { useESM: true, tsconfig: '<rootDir>/test/tsconfig.json' }
        ],
        '^.+\\.svelte$': [
            'svelte-jester',
            { preprocess: true, compilerOptions: { generate: 'dom' } }
        ]
    },
    transformIgnorePatterns: [
        '/node_modules/(?!(svelte|svelte/.*|@sveltejs/.*)/)'
    ],
    moduleFileExtensions: ['ts','js','svelte','json'],
    collectCoverage: true,
    moduleDirectories: ['node_modules','src','test'],
    coverageReporters: ['lcov','text','teamcity'],
    testResultsProcessor: 'jest-teamcity-reporter',
    testMatch: [
        '**/test/**/*.test.ts',
        '**/test/**/*.test.js',
        '**/test/**/*.test.svelte'
    ],
    moduleNameMapper: {
        '\\.(css|scss)$': '<rootDir>/test/__mocks__/styleMock.js',
        '^obsidian$': '<rootDir>/__mocks__/obsidian.ts',
        '^@vanakat/plugin-api$': '<rootDir>/test/__mocks__/pluginApiMock.js'
    },
    setupFilesAfterEnv: ['<rootDir>/jest.setup.js']
};

export default config;