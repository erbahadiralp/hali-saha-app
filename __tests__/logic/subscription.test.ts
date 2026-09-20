import Purchases from 'react-native-purchases';
import { ENTITLEMENTS, hasPremiumPlayerAccess, hasProCaptainAccess, getSubscriptionTier } from '../../services/revenueCat';
import { TIER_LIMITS } from '../../constants/tierLimits';

// Mock react-native-purchases
jest.mock('react-native-purchases', () => ({
    configure: jest.fn(),
    logIn: jest.fn(),
    getCustomerInfo: jest.fn(),
    PurchasesPackage: jest.fn(),
}));

describe('Subscription Service', () => {
    const originalError = console.error;

    beforeAll(() => {
        // Suppress expected console.error in error tests
        console.error = jest.fn();
    });

    afterAll(() => {
        console.error = originalError;
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    test('hasProCaptainAccess returns true if entitlement exists', async () => {
        (Purchases.getCustomerInfo as jest.Mock).mockResolvedValue({
            entitlements: {
                active: {
                    [ENTITLEMENTS.PRO_CAPTAIN]: { isActive: true }
                }
            }
        });

        const isPro = await hasProCaptainAccess();
        expect(isPro).toBe(true);
    });

    test('hasProCaptainAccess returns false if entitlement missing', async () => {
        (Purchases.getCustomerInfo as jest.Mock).mockResolvedValue({
            entitlements: {
                active: {}
            }
        });

        const isPro = await hasProCaptainAccess();
        expect(isPro).toBe(false);
    });

    test('hasPremiumPlayerAccess returns true if entitlement exists', async () => {
        (Purchases.getCustomerInfo as jest.Mock).mockResolvedValue({
            entitlements: {
                active: {
                    [ENTITLEMENTS.PREMIUM_PLAYER]: { isActive: true }
                }
            }
        });

        const isPremium = await hasPremiumPlayerAccess();
        expect(isPremium).toBe(true);
    });

    test('hasPremiumPlayerAccess returns false on error', async () => {
        (Purchases.getCustomerInfo as jest.Mock).mockRejectedValue(new Error('Network Error'));

        const isPremium = await hasPremiumPlayerAccess();
        expect(isPremium).toBe(false);
    });

    test('getSubscriptionTier returns captain when pro_captain active', async () => {
        (Purchases.getCustomerInfo as jest.Mock).mockResolvedValue({
            entitlements: {
                active: {
                    [ENTITLEMENTS.PRO_CAPTAIN]: { isActive: true }
                }
            }
        });

        const tier = await getSubscriptionTier();
        expect(tier).toBe('captain');
    });

    test('getSubscriptionTier returns player when premium_player active', async () => {
        (Purchases.getCustomerInfo as jest.Mock).mockResolvedValue({
            entitlements: {
                active: {
                    [ENTITLEMENTS.PREMIUM_PLAYER]: { isActive: true }
                }
            }
        });

        const tier = await getSubscriptionTier();
        expect(tier).toBe('player');
    });

    test('getSubscriptionTier returns free when no entitlements', async () => {
        (Purchases.getCustomerInfo as jest.Mock).mockResolvedValue({
            entitlements: {
                active: {}
            }
        });

        const tier = await getSubscriptionTier();
        expect(tier).toBe('free');
    });

    test('getSubscriptionTier returns free on error', async () => {
        (Purchases.getCustomerInfo as jest.Mock).mockRejectedValue(new Error('Network'));

        const tier = await getSubscriptionTier();
        expect(tier).toBe('free');
    });

    test('captain tier prioritized over player when both active', async () => {
        (Purchases.getCustomerInfo as jest.Mock).mockResolvedValue({
            entitlements: {
                active: {
                    [ENTITLEMENTS.PRO_CAPTAIN]: { isActive: true },
                    [ENTITLEMENTS.PREMIUM_PLAYER]: { isActive: true }
                }
            }
        });

        const tier = await getSubscriptionTier();
        expect(tier).toBe('captain');
    });
});

describe('Tier Limits', () => {
    test('free tier has correct limits', () => {
        const free = TIER_LIMITS.free;
        expect(free.maxGroups).toBe(1);
        expect(free.monthlyMatchLimit).toBe(1);
        expect(free.canSeeFullStats).toBe(false);
        expect(free.canBalanceTeams).toBe(false);
        expect(free.canCustomizeMatch).toBe(false);
        expect(free.canManageDebts).toBe(false);
        expect(free.hasAds).toBe(true);
        expect(free.visibleMatchHistory).toBe(1);
        expect(free.visibleRankingCount).toBe(1);
    });

    test('player tier has correct limits', () => {
        const player = TIER_LIMITS.player;
        expect(player.maxGroups).toBe(3);
        expect(player.monthlyMatchLimit).toBe(1);
        expect(player.canSeeFullStats).toBe(true);
        expect(player.canSeeFormGraph).toBe(true);
        expect(player.canSeeOverall).toBe(true);
        expect(player.hasPremiumFrame).toBe(true);
        expect(player.canBalanceTeams).toBe(false);
        expect(player.canCustomizeMatch).toBe(false);
        expect(player.hasAds).toBe(false);
        expect(player.visibleMatchHistory).toBe(3);
    });

    test('captain tier has correct limits', () => {
        const captain = TIER_LIMITS.captain;
        expect(captain.maxGroups).toBe(Infinity);
        expect(captain.monthlyMatchLimit).toBe(Infinity);
        expect(captain.canSeeFullStats).toBe(true);
        expect(captain.canBalanceTeams).toBe(true);
        expect(captain.canCustomizeMatch).toBe(true);
        expect(captain.canManageDebts).toBe(true);
        expect(captain.canExportStats).toBe(true);
        expect(captain.hasAds).toBe(false);
        expect(captain.visibleMatchHistory).toBe(Infinity);
    });

    test('captain tier has all player tier features', () => {
        const player = TIER_LIMITS.player;
        const captain = TIER_LIMITS.captain;

        // Every true feature in player should be true in captain
        const playerFeatures = Object.entries(player).filter(([_, v]) => v === true);
        for (const [key] of playerFeatures) {
            expect(captain[key as keyof typeof captain]).toBe(true);
        }
    });

    test('free tier limits are more restrictive than player', () => {
        const free = TIER_LIMITS.free;
        const player = TIER_LIMITS.player;
        expect(free.maxGroups).toBeLessThan(player.maxGroups);
        expect(free.visibleMatchHistory).toBeLessThan(player.visibleMatchHistory);
    });
});
