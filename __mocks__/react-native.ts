// Mock react-native for Jest tests (avoids native module issues)
export const Platform = {
    OS: 'android',
    select: (obj: any) => obj.android || obj.default,
};

export const Alert = {
    alert: jest.fn(),
};

export const AsyncStorage = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    getAllKeys: jest.fn(() => []),
    multiRemove: jest.fn(),
};

export default {
    Platform,
    Alert,
    AsyncStorage,
};
