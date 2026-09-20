import { collection, doc, getDocs, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';

// ===== BADGE DEFINITIONS =====
export type BadgeId =
    | 'sniper'
    | 'mozart'
    | 'wall'
    | 'octopus'
    | 'on_fire'
    | 'mvp_bronze'
    | 'mvp_silver'
    | 'mvp_gold'
    // Social badges
    | 'best_captain'
    | 'team_player'
    | 'guru'
    | 'rising_star';

export interface Badge {
    id: BadgeId;
    name: string;
    description: string;
    emoji: string;
    tier: 'bronze' | 'silver' | 'gold';
    requirement: string;
    isSocial?: boolean;
}

// ===== CARD FRAME DEFINITIONS =====
export type CardFrameId = 'classic' | 'diamond' | 'emerald' | 'legendary' | 'fire';

export interface CardFrame {
    id: CardFrameId;
    name: string;
    borderColor: string;
    bgGradientStart: string;
    bgGradientEnd: string;
    accentColor: string;
    emoji: string;
}

export const CARD_FRAMES: Record<CardFrameId, CardFrame> = {
    classic: {
        id: 'classic',
        name: 'Klasik',
        borderColor: '#FFD700',
        bgGradientStart: '#0d1f0d',
        bgGradientEnd: '#0d1f0d',
        accentColor: '#FFD700',
        emoji: '⭐',
    },
    diamond: {
        id: 'diamond',
        name: 'Elmas',
        borderColor: '#00BFFF',
        bgGradientStart: '#0a1929',
        bgGradientEnd: '#0d2137',
        accentColor: '#00BFFF',
        emoji: '💎',
    },
    emerald: {
        id: 'emerald',
        name: 'Zümrüt',
        borderColor: '#50C878',
        bgGradientStart: '#0a2e1a',
        bgGradientEnd: '#0d3d23',
        accentColor: '#50C878',
        emoji: '🟢',
    },
    legendary: {
        id: 'legendary',
        name: 'Efsanevi',
        borderColor: '#FF4500',
        bgGradientStart: '#1a0a00',
        bgGradientEnd: '#2d1200',
        accentColor: '#FF4500',
        emoji: '🔴',
    },
    fire: {
        id: 'fire',
        name: 'Ateş',
        borderColor: '#FF6347',
        bgGradientStart: '#1a0505',
        bgGradientEnd: '#2d0a0a',
        accentColor: '#FF6347',
        emoji: '🔥',
    },
};

export const BADGE_DEFINITIONS: Record<BadgeId, Badge> = {
    sniper: {
        id: 'sniper',
        name: 'Sniper',
        description: '10+ gol atan oyuncu',
        emoji: '🎯',
        tier: 'bronze',
        requirement: '10+ gol',
    },
    mozart: {
        id: 'mozart',
        name: 'Mozart',
        description: '10+ asist yapan oyuncu',
        emoji: '🎵',
        tier: 'bronze',
        requirement: '10+ asist',
    },
    wall: {
        id: 'wall',
        name: 'Duvar',
        description: '5+ clean sheet yapan kaleci',
        emoji: '🧱',
        tier: 'bronze',
        requirement: '5+ clean sheet',
    },
    octopus: {
        id: 'octopus',
        name: 'Ahtapot',
        description: '3+ maçta hem gol hem asist',
        emoji: '🐙',
        tier: 'silver',
        requirement: '3+ maçta gol + asist',
    },
    on_fire: {
        id: 'on_fire',
        name: 'Ateşte',
        description: 'Son 5 maçta 5+ gol katkısı',
        emoji: '🔥',
        tier: 'silver',
        requirement: 'Son 5 maçta 5+ gol katkısı',
    },
    mvp_bronze: {
        id: 'mvp_bronze',
        name: 'MVP Bronz',
        description: '3 kez MVP seçilen oyuncu',
        emoji: '🏅',
        tier: 'bronze',
        requirement: '3+ MVP',
    },
    mvp_silver: {
        id: 'mvp_silver',
        name: 'MVP Gümüş',
        description: '10 kez MVP seçilen oyuncu',
        emoji: '🥈',
        tier: 'silver',
        requirement: '10+ MVP',
    },
    mvp_gold: {
        id: 'mvp_gold',
        name: 'MVP Altın',
        description: '25 kez MVP seçilen oyuncu',
        emoji: '🥇',
        tier: 'gold',
        requirement: '25+ MVP',
    },
    // Social badges — awarded by group admin or community
    best_captain: {
        id: 'best_captain',
        name: 'En İyi Kaptan',
        description: 'Grup yöneticisi tarafından verilen liderlik rozeti',
        emoji: '👑',
        tier: 'gold',
        requirement: 'Grup admini tarafından verilir',
        isSocial: true,
    },
    team_player: {
        id: 'team_player',
        name: 'Takım Oyuncusu',
        description: 'Takım ruhuyla oynayan oyuncu',
        emoji: '🤝',
        tier: 'silver',
        requirement: 'Grup admini tarafından verilir',
        isSocial: true,
    },
    guru: {
        id: 'guru',
        name: 'Halısaha Gurusu',
        description: '50+ maç oynayan deneyimli oyuncu',
        emoji: '🧙',
        tier: 'gold',
        requirement: '50+ maç',
        isSocial: true,
    },
    rising_star: {
        id: 'rising_star',
        name: 'Yeni Yıldız',
        description: 'Yükselen performans gösteren oyuncu',
        emoji: '🌟',
        tier: 'bronze',
        requirement: 'Grup admini tarafından verilir',
        isSocial: true,
    },
};

// ===== USER BADGE =====
export interface UserBadge {
    badgeId: BadgeId;
    earnedAt: Date;
    groupId?: string;
}

// ===== BADGE EVALUATION =====
interface PlayerStats {
    goals: number;
    assists: number;
    motmCount: number;
    cleanSheets?: number;
    matchesPlayed: number;
    // For "on_fire" and "octopus" checks
    recentMatches?: {
        goals: number;
        assists: number;
    }[];
}

/**
 * Evaluate which badges a player has earned based on their stats
 */
export function evaluateBadges(stats: PlayerStats): BadgeId[] {
    const earned: BadgeId[] = [];

    // Sniper: 10+ goals
    if (stats.goals >= 10) earned.push('sniper');

    // Mozart: 10+ assists
    if (stats.assists >= 10) earned.push('mozart');

    // Wall: 5+ clean sheets
    if ((stats.cleanSheets || 0) >= 5) earned.push('wall');

    // MVP tiers
    if (stats.motmCount >= 25) earned.push('mvp_gold');
    else if (stats.motmCount >= 10) earned.push('mvp_silver');
    else if (stats.motmCount >= 3) earned.push('mvp_bronze');

    // Octopus: 3+ matches with both goal AND assist
    if (stats.recentMatches) {
        const bothCount = stats.recentMatches.filter(m => m.goals > 0 && m.assists > 0).length;
        if (bothCount >= 3) earned.push('octopus');

        // On Fire: 5+ goal contributions in last 5 matches
        const last5 = stats.recentMatches.slice(0, 5);
        const totalContributions = last5.reduce((sum, m) => sum + m.goals + m.assists, 0);
        if (last5.length >= 5 && totalContributions >= 5) earned.push('on_fire');
    }

    return earned;
}

// ===== FIRESTORE OPERATIONS =====

/**
 * Get all badges for a user
 */
export async function getUserBadges(userId: string): Promise<UserBadge[]> {
    try {
        const badgesRef = collection(db, 'users', userId, 'badges');
        const snapshot = await getDocs(badgesRef);
        return snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                badgeId: doc.id as BadgeId,
                earnedAt: data.earnedAt instanceof Timestamp ? data.earnedAt.toDate() : new Date(data.earnedAt),
                groupId: data.groupId,
            };
        });
    } catch (error) {
        console.error('Error fetching badges:', error);
        return [];
    }
}

/**
 * Award a badge to a user (no-op if already earned)
 */
export async function awardBadge(userId: string, badgeId: BadgeId, groupId?: string): Promise<void> {
    try {
        const badgeRef = doc(db, 'users', userId, 'badges', badgeId);
        await setDoc(badgeRef, {
            badgeId,
            earnedAt: Timestamp.now(),
            ...(groupId && { groupId }),
        }, { merge: true }); // merge: true means it won't overwrite if already exists
    } catch (error) {
        console.error('Error awarding badge:', error);
    }
}

/**
 * Check and award badges for a player after a match
 */
export async function checkAndAwardBadges(userId: string, stats: PlayerStats, groupId?: string): Promise<BadgeId[]> {
    const earned = evaluateBadges(stats);
    const existing = await getUserBadges(userId);
    const existingIds = new Set(existing.map(b => b.badgeId));

    const newBadges: BadgeId[] = [];
    for (const badgeId of earned) {
        if (!existingIds.has(badgeId)) {
            await awardBadge(userId, badgeId, groupId);
            newBadges.push(badgeId);
        }
    }

    return newBadges;
}
