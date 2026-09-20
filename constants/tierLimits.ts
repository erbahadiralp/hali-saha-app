// ===== TIER DEFINITIONS =====
export type SubscriptionTier = 'free' | 'player' | 'captain';

export interface UserSubscription {
    tier: SubscriptionTier;
    expiresAt: Date | null;
    activeTokenMatchIds: string[]; // Jeton ile acilmis maclar
}

// ===== TIER LIMITS =====
export const TIER_LIMITS = {
    free: {
        maxGroups: 1,
        monthlyMatchLimit: 1,
        canSeeFullStats: false,
        canSeeAllRankings: false,
        canBalanceTeams: false,
        canCustomizeMatch: false,
        canManageDebts: false,
        canExportStats: false,
        canSeeFormGraph: false,
        canSeeOverall: false,
        hasPremiumFrame: false,
        hasAds: true,
        visibleMatchHistory: 1, // Baskalarinin profilinde kac mac gorunur
        visibleRankingCount: 1, // Grup siralamasinda kac kisi gorunur
    },
    player: {
        maxGroups: 3,
        monthlyMatchLimit: 1, // Oyuncu da ayda 1 mac olusturabilir
        canSeeFullStats: true,
        canSeeAllRankings: true,
        canBalanceTeams: false,
        canCustomizeMatch: false,
        canManageDebts: false,
        canExportStats: false,
        canSeeFormGraph: true,
        canSeeOverall: true,
        hasPremiumFrame: true,
        hasAds: false,
        visibleMatchHistory: 3,
        visibleRankingCount: Infinity,
    },
    captain: {
        maxGroups: Infinity,
        monthlyMatchLimit: Infinity,
        canSeeFullStats: true,
        canSeeAllRankings: true,
        canBalanceTeams: true,
        canCustomizeMatch: true,
        canManageDebts: true,
        canExportStats: true,
        canSeeFormGraph: true,
        canSeeOverall: true,
        hasPremiumFrame: true,
        hasAds: false,
        visibleMatchHistory: Infinity,
        visibleRankingCount: Infinity,
    },
};
