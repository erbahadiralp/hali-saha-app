import { Platform } from 'react-native';
import Purchases, {
    CustomerInfo,
    PurchasesOffering,
    PurchasesPackage,
} from 'react-native-purchases';

// RevenueCat API Keys - Will be configured per environment
// TODO: Replace these with your actual RevenueCat API keys
const REVENUECAT_API_KEY_IOS = 'appl_XXXXXXXXXXXXX'; // Replace with your iOS key
const REVENUECAT_API_KEY_ANDROID = 'goog_XXXXXXXXXXXXX'; // Replace with your Android key

// Product identifiers - These match your App Store Connect / Play Console products
export const PRODUCT_IDS = {
    // Kaptan/Admin packages
    SINGLE_TOKEN: 'single_match_token', // 39.99₺ one-time
    PRO_CAPTAIN_MONTHLY: 'pro_captain_monthly', // 129.99₺/month
    PRO_CAPTAIN_YEARLY: 'pro_captain_yearly', // 999.99₺/year

    // Oyuncu packages
    PREMIUM_PLAYER_MONTHLY: 'premium_player_monthly', // 29.99₺/month
    PREMIUM_PLAYER_YEARLY: 'premium_player_yearly', // 239.99₺/year
};

// Entitlement identifiers
export const ENTITLEMENTS = {
    PRO_CAPTAIN: 'pro_captain',
    PREMIUM_PLAYER: 'premium_player',
};

let isConfigured = false;

/**
 * Initialize RevenueCat SDK
 * Call this once at app startup
 */
export async function initializeRevenueCat(userId?: string): Promise<void> {
    if (isConfigured) return;

    try {
        const apiKey = Platform.OS === 'ios'
            ? REVENUECAT_API_KEY_IOS
            : REVENUECAT_API_KEY_ANDROID;

        Purchases.configure({ apiKey });

        if (userId) {
            await Purchases.logIn(userId);
        }

        isConfigured = true;
        console.log('RevenueCat initialized successfully');
    } catch (error) {
        console.error('Error initializing RevenueCat:', error);
    }
}

/**
 * Set the user ID for RevenueCat
 */
export async function setRevenueCatUserId(userId: string): Promise<CustomerInfo | null> {
    try {
        const { customerInfo } = await Purchases.logIn(userId);
        return customerInfo;
    } catch (error) {
        console.error('Error setting RevenueCat user:', error);
        return null;
    }
}

/**
 * Get available offerings (packages)
 */
export async function getOfferings(): Promise<PurchasesOffering | null> {
    try {
        const offerings = await Purchases.getOfferings();
        if (offerings.current !== null) {
            return offerings.current;
        }
        return null;
    } catch (error) {
        console.error('Error fetching offerings:', error);
        return null;
    }
}

/**
 * Check if user has active Pro Captain subscription
 */
export async function hasProCaptainAccess(): Promise<boolean> {
    try {
        const customerInfo = await Purchases.getCustomerInfo();
        return typeof customerInfo.entitlements.active[ENTITLEMENTS.PRO_CAPTAIN] !== 'undefined';
    } catch (error) {
        console.error('Error checking pro captain access:', error);
        return false;
    }
}

/**
 * Check if user has active Premium Player subscription
 */
export async function hasPremiumPlayerAccess(): Promise<boolean> {
    try {
        const customerInfo = await Purchases.getCustomerInfo();
        return typeof customerInfo.entitlements.active[ENTITLEMENTS.PREMIUM_PLAYER] !== 'undefined';
    } catch (error) {
        console.error('Error checking premium player access:', error);
        return false;
    }
}

/**
 * Get current customer info
 */
export async function getCustomerInfo(): Promise<CustomerInfo | null> {
    try {
        return await Purchases.getCustomerInfo();
    } catch (error) {
        console.error('Error getting customer info:', error);
        return null;
    }
}

/**
 * Purchase a package
 */
export async function purchasePackage(packageToPurchase: PurchasesPackage): Promise<{
    success: boolean;
    customerInfo?: CustomerInfo;
    error?: string;
}> {
    try {
        const { customerInfo } = await Purchases.purchasePackage(packageToPurchase);
        return { success: true, customerInfo };
    } catch (error: any) {
        if (error.userCancelled) {
            return { success: false, error: 'cancelled' };
        }
        console.error('Error making purchase:', error);
        return { success: false, error: error.message || 'Purchase failed' };
    }
}

/**
 * Restore purchases
 */
export async function restorePurchases(): Promise<{
    success: boolean;
    customerInfo?: CustomerInfo;
    error?: string;
}> {
    try {
        const customerInfo = await Purchases.restorePurchases();
        return { success: true, customerInfo };
    } catch (error: any) {
        console.error('Error restoring purchases:', error);
        return { success: false, error: error.message || 'Restore failed' };
    }
}

/**
 * Listen for customer info updates
 */
export function addCustomerInfoUpdateListener(
    listener: (info: CustomerInfo) => void
): () => void {
    Purchases.addCustomerInfoUpdateListener(listener);
    // Return empty cleanup function (SDK handles internally)
    return () => { };
}

/**
 * Get the user's subscription tier based on RevenueCat entitlements
 * Maps RevenueCat entitlements to app tier: 'free' | 'player' | 'captain'
 */
export async function getSubscriptionTier(): Promise<'free' | 'player' | 'captain'> {
    try {
        const customerInfo = await Purchases.getCustomerInfo();
        if (customerInfo.entitlements.active[ENTITLEMENTS.PRO_CAPTAIN]) {
            return 'captain';
        }
        if (customerInfo.entitlements.active[ENTITLEMENTS.PREMIUM_PLAYER]) {
            return 'player';
        }
        return 'free';
    } catch (error) {
        console.error('Error getting subscription tier:', error);
        return 'free';
    }
}

/**
 * Get subscription status summary
 */
export async function getSubscriptionStatus(): Promise<{
    isProCaptain: boolean;
    isPremiumPlayer: boolean;
    expirationDate: Date | null;
    managementUrl: string | null;
}> {
    try {
        const customerInfo = await Purchases.getCustomerInfo();

        const proCaptainEntitlement = customerInfo.entitlements.active[ENTITLEMENTS.PRO_CAPTAIN];
        const premiumPlayerEntitlement = customerInfo.entitlements.active[ENTITLEMENTS.PREMIUM_PLAYER];

        let expirationDate: Date | null = null;
        if (proCaptainEntitlement?.expirationDate) {
            expirationDate = new Date(proCaptainEntitlement.expirationDate);
        } else if (premiumPlayerEntitlement?.expirationDate) {
            expirationDate = new Date(premiumPlayerEntitlement.expirationDate);
        }

        return {
            isProCaptain: !!proCaptainEntitlement,
            isPremiumPlayer: !!premiumPlayerEntitlement,
            expirationDate,
            managementUrl: customerInfo.managementURL,
        };
    } catch (error) {
        console.error('Error getting subscription status:', error);
        return {
            isProCaptain: false,
            isPremiumPlayer: false,
            expirationDate: null,
            managementUrl: null,
        };
    }
}
