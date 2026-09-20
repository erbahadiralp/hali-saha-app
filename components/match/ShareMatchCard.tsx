import React, { useRef, useState } from 'react';
import { StyleSheet, View, Text, Image, Alert, ActivityIndicator } from 'react-native';
import ViewShot, { type ViewShotRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { colors, borderRadius, spacing, shadows, typography } from '../../constants/designTokens';
import { AnimatedButton } from '../ui/AnimatedButton';

interface ShareMatchCardProps {
  matchDate: string;
  groupName: string;
  score: string;
  playerStats: {
    displayName: string;
    photoURL?: string;
    goals: number;
    assists: number;
    isMotm: boolean;
    overall: number;
    position: string;
  };
  onClose: () => void;
}

export const ShareMatchCard: React.FC<ShareMatchCardProps> = ({
  matchDate,
  groupName,
  score,
  playerStats,
  onClose
}) => {
  const viewShotRef = useRef<ViewShotRef>(null);
  const [sharing, setSharing] = useState(false);

  const handleShare = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      if (viewShotRef.current?.capture) {
        const uri = await viewShotRef.current.capture();
        const isAvailable = await Sharing.isAvailableAsync();
        if (isAvailable) {
          await Sharing.shareAsync(uri, {
            mimeType: 'image/png',
            dialogTitle: 'Maç Raporumu Paylaş',
          });
        } else {
          Alert.alert('Paylaşım Desteklenmiyor', 'Cihazınızda paylaşım özelliği aktif değil.');
        }
      }
    } catch (error) {
      console.error('Error sharing match card:', error);
      Alert.alert('Paylaşım Hatası', 'Görsel paylaşılırken bir hata oluştu.');
    } finally {
      setSharing(false);
    }
  };

  return (
    <View style={styles.overlay}>
      {/* ViewShot container rendering the 9:16 vertical layout */}
      <View style={styles.cardWrapper}>
        <ViewShot
          ref={viewShotRef}
          options={{ format: 'png', quality: 1.0 }}
          style={styles.viewShot}
        >
          <LinearGradient
            colors={['#0e0f0e', '#072517', '#0e0f0e']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.gradientBg}
          >
            {/* Header branding */}
            <View style={styles.header}>
              <Text style={styles.brandText}>KADROLA</Text>
              <Text style={styles.headerTitle}>MAÇ RAPORU</Text>
            </View>

            {/* Match info */}
            <View style={styles.matchInfo}>
              <Text style={styles.groupText} numberOfLines={1}>{groupName.toUpperCase()}</Text>
              <Text style={styles.scoreText}>{score}</Text>
              <Text style={styles.dateText}>{matchDate}</Text>
            </View>

            {/* FUT Player Card Spotlight */}
            <View style={styles.spotlightContainer}>
              <LinearGradient
                colors={playerStats.isMotm ? ['#D4AF37', '#8A6F27'] : ['#10B981', '#064e3b']}
                style={[
                  styles.futCard,
                  playerStats.isMotm && styles.motmFutCard
                ]}
              >
                <View style={styles.futHeader}>
                  <Text style={styles.futOverall}>{playerStats.overall}</Text>
                  <Text style={styles.futPosition}>{playerStats.position}</Text>
                </View>

                <View style={styles.photoContainer}>
                  {playerStats.photoURL ? (
                    <Image source={{ uri: playerStats.photoURL }} style={styles.playerPhoto} />
                  ) : (
                    <Text style={styles.photoPlaceholder}>👤</Text>
                  )}
                </View>

                <View style={styles.futFooter}>
                  <Text style={styles.playerNameText} numberOfLines={1}>
                    {playerStats.displayName.toUpperCase()}
                  </Text>
                </View>
              </LinearGradient>
            </View>

            {/* Personal Stats detail */}
            <View style={styles.statsContainer}>
              <View style={styles.statRow}>
                <Text style={styles.statValue}>⚽ {playerStats.goals}</Text>
                <Text style={styles.statLabel}>GOL</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statRow}>
                <Text style={styles.statValue}>👟 {playerStats.assists}</Text>
                <Text style={styles.statLabel}>ASİST</Text>
              </View>
            </View>

            {/* MOTM Celebration */}
            {playerStats.isMotm && (
              <View style={styles.motmBadge}>
                <MaterialIcons name="emoji-events" size={24} color={colors.gold} />
                <Text style={styles.motmBadgeText}>MAÇIN ADAMI (MOTM)</Text>
              </View>
            )}

            <View style={styles.footerBranding}>
              <Text style={styles.appUrl}>kadrola.app</Text>
            </View>
          </LinearGradient>
        </ViewShot>
      </View>

      {/* Share / Close Controls outside the capture view */}
      <View style={styles.controlRow}>
        <AnimatedButton
          onPress={onClose}
          title="Kapat"
          variant="secondary"
          style={styles.controlButton}
          accessibilityLabel="Kapat ve geri dön"
        />
        <AnimatedButton
          onPress={handleShare}
          title={sharing ? 'Hazırlanıyor...' : 'Paylaş'}
          variant="primary"
          loading={sharing}
          style={[styles.controlButton, { backgroundColor: colors.primary }]}
          accessibilityLabel="Görseli Instagram'da Paylaş"
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  cardWrapper: {
    width: 320,
    height: 540,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    ...shadows.lg,
  },
  viewShot: {
    flex: 1,
  },
  gradientBg: {
    flex: 1,
    padding: spacing.xl,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    marginTop: spacing.md,
  },
  brandText: {
    color: colors.primary,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 4,
    fontFamily: 'BarlowCondensed_700Bold',
  },
  headerTitle: {
    color: colors.textDark,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 2,
    fontFamily: 'Barlow_600SemiBold',
    marginTop: 2,
  },
  matchInfo: {
    alignItems: 'center',
  },
  groupText: {
    color: colors.textSecondaryDark,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
    fontFamily: 'Barlow_600SemiBold',
  },
  scoreText: {
    color: colors.textDark,
    fontSize: 48,
    fontWeight: '900',
    fontFamily: 'BarlowCondensed_700Bold',
    letterSpacing: -1,
  },
  dateText: {
    color: colors.textSecondaryDark,
    fontSize: 11,
    fontFamily: 'Barlow_400Regular',
  },
  spotlightContainer: {
    marginVertical: spacing.lg,
  },
  futCard: {
    width: 140,
    height: 200,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 2,
    borderColor: colors.primary,
    justifyContent: 'space-between',
    alignItems: 'center',
    ...shadows.lg,
  },
  motmFutCard: {
    borderColor: colors.gold,
    ...shadows.glow(colors.gold),
  },
  futHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    alignItems: 'center',
  },
  futOverall: {
    color: colors.textDark,
    fontSize: 28,
    fontWeight: '900',
    fontFamily: 'BarlowCondensed_700Bold',
  },
  futPosition: {
    color: colors.textDark,
    fontSize: 12,
    fontWeight: 'bold',
    fontFamily: 'Barlow_700Bold',
  },
  photoContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  playerPhoto: {
    width: 80,
    height: 80,
  },
  photoPlaceholder: {
    fontSize: 36,
  },
  futFooter: {
    width: '100%',
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    paddingTop: spacing.xs,
    alignItems: 'center',
  },
  playerNameText: {
    color: colors.textDark,
    fontSize: 12,
    fontWeight: 'bold',
    fontFamily: 'Barlow_700Bold',
  },
  statsContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.glassBorderDark,
    paddingVertical: spacing.md,
    width: '100%',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  statRow: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    color: colors.textDark,
    fontSize: 20,
    fontWeight: '800',
    fontFamily: 'BarlowCondensed_700Bold',
  },
  statLabel: {
    color: colors.textSecondaryDark,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
    fontFamily: 'Barlow_600SemiBold',
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: colors.borderDark,
  },
  motmBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(212,175,55,0.15)',
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: borderRadius.full,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  motmBadgeText: {
    color: colors.gold,
    fontWeight: 'bold',
    fontSize: 11,
    fontFamily: 'Barlow_700Bold',
    letterSpacing: 0.5,
  },
  footerBranding: {
    marginBottom: spacing.xs,
  },
  appUrl: {
    color: colors.textSecondaryDark,
    opacity: 0.5,
    fontSize: 10,
    letterSpacing: 2,
    fontFamily: 'Barlow_400Regular',
  },
  controlRow: {
    flexDirection: 'row',
    width: 320,
    marginTop: spacing.xl,
    gap: spacing.md,
  },
  controlButton: {
    flex: 1,
  },
});
