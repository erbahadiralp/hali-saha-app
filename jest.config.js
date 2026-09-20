module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    transform: {
        '^.+\\.tsx?$': ['ts-jest', { useESM: false }],
    },
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
    testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
    collectCoverageFrom: [
        'services/**/*.ts',
        'utils/**/*.ts',
        '!**/node_modules/**',
    ],
    moduleNameMapper: {
        '^../firebaseConfig$': '<rootDir>/__mocks__/firebaseConfig.ts',
        '^../../firebaseConfig$': '<rootDir>/__mocks__/firebaseConfig.ts',
        '^react-native$': '<rootDir>/__mocks__/react-native.ts',
        '^react-native-purchases$': '<rootDir>/__mocks__/react-native-purchases.ts',
    },
    transformIgnorePatterns: [
        'node_modules/(?!(react-native|@react-native|react-native-purchases)/)',
    ],
};
