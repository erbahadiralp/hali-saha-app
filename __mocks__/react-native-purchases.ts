// Mock react-native-purchases for Jest tests
const Purchases = {
    configure: jest.fn(),
    logIn: jest.fn(),
    logOut: jest.fn(),
    getCustomerInfo: jest.fn(),
    getOfferings: jest.fn(),
    purchasePackage: jest.fn(),
    restorePurchases: jest.fn(),
    setLogLevel: jest.fn(),
    LOG_LEVEL: { DEBUG: 'DEBUG', INFO: 'INFO' },
};

export const CustomerInfo = {};
export const PurchasesOffering = {};
export const PurchasesPackage = {};

export default Purchases;
