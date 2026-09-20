// Jest setup file
// Add any global test setup here

// Mock console.error and console.warn to suppress noise in tests
global.console = {
    ...console,
    // Uncomment to suppress warnings in tests
    // warn: jest.fn(),
    // error: jest.fn(),
};
