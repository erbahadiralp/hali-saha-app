import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { SubscriptionTier, TIER_LIMITS, UserSubscription } from '../constants/tierLimits';
import { db, functions } from '../firebaseConfig';
import { useAuth } from './AuthContext';

// Re-export for convenience
export { TIER_LIMITS };
export type { SubscriptionTier, UserSubscription };

// ===== CONTEXT TYPE =====
interface PremiumContextType {
    // Tier info
    tier: SubscriptionTier;
    subscription: UserSubscription;
    loading: boolean;

    // Backward compatibility
    isPremium: boolean; // true if player or captain

    // Limits
    groupMemberships: number;
    monthlyMatchesCreated: number;
    canCreateGroup: boolean;
    canCreateMatch: boolean;

    // Feature checks
    canSeeFullStats: boolean;
    canSeeAllRankings: boolean;
    canBalanceTeams: (matchId?: string) => boolean;
    canCustomizeMatch: (matchId?: string) => boolean;
    canManageDebts: boolean;
    canExportStats: boolean;
    canSeeFormGraph: boolean;
    canSeeOverall: boolean;
    hasPremiumFrame: boolean;
    hasAds: boolean;
    visibleMatchHistory: number;
    visibleRankingCount: number;

    // Customizations (captain only)
    customizations: {
        teamAName: string;
        teamBName: string;
        yesText: string;
        noText: string;
        maybeText: string;
    };
    statsVisible: boolean;

    // Actions
    checkLimit: (type: 'group' | 'match') => boolean;
    incrementGroupCount: () => Promise<void>;
    incrementMatchCount: () => Promise<void>;
    updateCustomization: (key: string, value: string) => Promise<void>;
    toggleStatsVisibility: () => Promise<void>;
    setTier: (tier: SubscriptionTier) => Promise<void>;
    activateToken: (matchId: string) => Promise<void>;
    isTokenActive: (matchId: string) => boolean;

    // Deprecated - use setTier instead
    setPremium: (value: boolean) => Promise<void>;
}

const defaultCustomizations = {
    teamAName: 'Takım A',
    teamBName: 'Takım B',
    yesText: 'Varım',
    noText: 'Yokum',
    maybeText: 'Belki',
};

const PremiumContext = createContext<PremiumContextType | undefined>(undefined);

export function PremiumProvider({ children }: { children: React.ReactNode }) {
    const { user } = useAuth();
    const [subscription, setSubscription] = useState<UserSubscription>({
        tier: 'free',
        expiresAt: null,
        activeTokenMatchIds: [],
    });
    const [loading, setLoading] = useState(true);
    const [groupMemberships, setGroupMemberships] = useState(0);
    const [monthlyMatchesCreated, setMonthlyMatchesCreated] = useState(0);
    const [monthStartDate, setMonthStartDate] = useState<Date | null>(null);
    const [customizations, setCustomizations] = useState(defaultCustomizations);
    const [statsVisible, setStatsVisible] = useState(true);

    const tier = subscription.tier;
    const limits = TIER_LIMITS[tier];

    // Backward compatibility
    const isPremium = tier === 'player' || tier === 'captain';

    // Feature access
    const canSeeFullStats = limits.canSeeFullStats;
    const canSeeAllRankings = limits.canSeeAllRankings;
    const canManageDebts = limits.canManageDebts;
    const canExportStats = limits.canExportStats;
    const canSeeFormGraph = limits.canSeeFormGraph;
    const canSeeOverall = limits.canSeeOverall;
    const hasPremiumFrame = limits.hasPremiumFrame;
    const hasAds = limits.hasAds;
    const visibleMatchHistory = limits.visibleMatchHistory;
    const visibleRankingCount = limits.visibleRankingCount;

    // Token-aware feature checks
    const canBalanceTeams = (matchId?: string): boolean => {
        if (limits.canBalanceTeams) return true;
        if (matchId && subscription.activeTokenMatchIds.includes(matchId)) return true;
        return false;
    };

    const canCustomizeMatch = (matchId?: string): boolean => {
        if (limits.canCustomizeMatch) return true;
        if (matchId && subscription.activeTokenMatchIds.includes(matchId)) return true;
        return false;
    };

    const isTokenActive = (matchId: string): boolean => {
        return subscription.activeTokenMatchIds.includes(matchId);
    };

    // Limit checks
    const canCreateGroup = groupMemberships < limits.maxGroups;
    const canCreateMatch = limits.monthlyMatchLimit === Infinity || monthlyMatchesCreated < limits.monthlyMatchLimit;

    useEffect(() => {
        if (user) {
            loadUserPremiumData();
        } else {
            setSubscription({ tier: 'free', expiresAt: null, activeTokenMatchIds: [] });
            setLoading(false);
        }
    }, [user]);

    const loadUserPremiumData = async () => {
        if (!user) return;
        try {
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            if (userDoc.exists()) {
                const data = userDoc.data();

                // Load tier (backward compatible with old isPremium boolean)
                let userTier: SubscriptionTier = 'free';
                if (data.subscription?.tier) {
                    userTier = data.subscription.tier;
                } else if (data.isPremium) {
                    // Backward compatibility: old isPremium users become captain
                    userTier = 'captain';
                }

                // Check expiration
                const expiresAt = data.subscription?.expiresAt?.toDate?.() || null;
                if (expiresAt && expiresAt < new Date()) {
                    userTier = 'free'; // Expired
                }

                const activeTokens = data.subscription?.activeTokenMatchIds || [];

                setSubscription({
                    tier: userTier,
                    expiresAt,
                    activeTokenMatchIds: activeTokens,
                });

                // Group memberships
                const userGroups = data.groups || [];
                setGroupMemberships(userGroups.length);
                setStatsVisible(data.statsVisible !== false);

                // Check and reset monthly counter
                const storedMonthStart = data.monthStartDate?.toDate?.();
                const now = new Date();
                const oneMonthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());

                if (!storedMonthStart || storedMonthStart < oneMonthAgo) {
                    setMonthlyMatchesCreated(0);
                    setMonthStartDate(now);
                    await updateDoc(doc(db, 'users', user.uid), {
                        monthlyMatchesCreated: 0,
                        monthStartDate: now
                    });
                } else {
                    setMonthlyMatchesCreated(data.monthlyMatchesCreated || data.weeklyMatchesCreated || 0);
                    setMonthStartDate(storedMonthStart);
                }

                // Load customizations
                if (data.customizations) {
                    setCustomizations({ ...defaultCustomizations, ...data.customizations });
                }
            }
        } catch (error) {
            console.error('Error loading premium data:', error);
        } finally {
            setLoading(false);
        }
    };

    const checkLimit = (type: 'group' | 'match'): boolean => {
        if (type === 'group') return canCreateGroup;
        if (type === 'match') return canCreateMatch;
        return false;
    };

    const incrementGroupCount = async () => {
        if (!user) return;
        setGroupMemberships(prev => prev + 1);
    };

    const incrementMatchCount = async () => {
        if (!user) return;
        if (limits.monthlyMatchLimit === Infinity) return; // Unlimited
        const newCount = monthlyMatchesCreated + 1;
        setMonthlyMatchesCreated(newCount);
        await updateDoc(doc(db, 'users', user.uid), { monthlyMatchesCreated: newCount });
    };

    const updateCustomization = async (key: string, value: string) => {
        if (!user) return;
        // Only captain or token can customize
        if (tier !== 'captain') return;
        const newCustomizations = { ...customizations, [key]: value };
        setCustomizations(newCustomizations);
        await updateDoc(doc(db, 'users', user.uid), { customizations: newCustomizations });
    };

    const toggleStatsVisibility = async () => {
        if (!user || tier === 'free') return;
        const newValue = !statsVisible;
        setStatsVisible(newValue);
        await updateDoc(doc(db, 'users', user.uid), { statsVisible: newValue });
    };

    // Subscription fields are server-owned; until RevenueCat is wired up the sandbox goes through a
    // Cloud Function. State changes only after the server accepted the write; errors reach the caller.
    const setTier = async (newTier: SubscriptionTier) => {
        if (!user) return;
        await httpsCallable(functions, 'setSandboxSubscription')({ tier: newTier });
        setSubscription(prev => ({ ...prev, tier: newTier }));
    };

    const activateToken = async (matchId: string) => {
        if (!user) return;
        await httpsCallable(functions, 'setSandboxSubscription')({ tokenMatchId: matchId });
        setSubscription(prev => ({
            ...prev,
            activeTokenMatchIds: prev.activeTokenMatchIds.includes(matchId) ? prev.activeTokenMatchIds : [...prev.activeTokenMatchIds, matchId],
        }));
    };

    // Backward compat
    const setPremium = async (value: boolean) => {
        await setTier(value ? 'captain' : 'free');
    };

    return (
        <PremiumContext.Provider value={{
            tier,
            subscription,
            loading,
            isPremium,
            groupMemberships,
            monthlyMatchesCreated,
            canCreateGroup,
            canCreateMatch,
            canSeeFullStats,
            canSeeAllRankings,
            canBalanceTeams,
            canCustomizeMatch,
            canManageDebts,
            canExportStats,
            canSeeFormGraph,
            canSeeOverall,
            hasPremiumFrame,
            hasAds,
            visibleMatchHistory,
            visibleRankingCount,
            customizations,
            statsVisible,
            checkLimit,
            incrementGroupCount,
            incrementMatchCount,
            updateCustomization,
            toggleStatsVisibility,
            setTier,
            activateToken,
            isTokenActive,
            setPremium,
        }}>
            {children}
        </PremiumContext.Provider>
    );
}

export function usePremium() {
    const context = useContext(PremiumContext);
    if (context === undefined) {
        throw new Error('usePremium must be used within a PremiumProvider');
    }
    return context;
}
