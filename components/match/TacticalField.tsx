import React, { useState } from 'react';
import { StyleSheet, View, Text, Image, TouchableOpacity, Dimensions } from 'react-native';
import { colors, borderRadius, spacing, shadows } from '../../constants/designTokens';
import { GlassCard } from '../ui/GlassCard';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const FIELD_WIDTH = SCREEN_WIDTH - spacing.xl * 2;
const FIELD_HEIGHT = FIELD_WIDTH * 1.35;

export interface TacticalPlayer {
  uid: string;
  displayName: string;
  photoURL?: string;
  position: 'GK' | 'DF' | 'MF' | 'FW';
  overall?: number;
}

interface TacticalFieldProps {
  teamAPlayers: TacticalPlayer[];
  teamBPlayers: TacticalPlayer[];
  isAdmin: boolean;
  onSwapPlayers?: (player1Id: string, player2Id: string) => void;
  onUpdatePosition?: (playerId: string, newPosition: 'GK' | 'DF' | 'MF' | 'FW') => void;
}

export const TacticalField: React.FC<TacticalFieldProps> = ({
  teamAPlayers,
  teamBPlayers,
  isAdmin,
  onSwapPlayers,
  onUpdatePosition
}) => {
  const [selectedTeam, setSelectedTeam] = useState<'A' | 'B'>('A');
  const [selectedPlayer, setSelectedPlayer] = useState<TacticalPlayer | null>(null);

  const players = selectedTeam === 'A' ? teamAPlayers : teamBPlayers;

  // Distribute players on the pitch based on position
  const getPlayerPositions = (playersList: TacticalPlayer[]) => {
    const list = [...playersList];
    const gks = list.filter(p => p.position === 'GK');
    const dfs = list.filter(p => p.position === 'DF');
    const mfs = list.filter(p => p.position === 'MF');
    const fws = list.filter(p => p.position === 'FW');

    const positions: Array<{ player: TacticalPlayer; x: number; y: number }> = [];

    // Coordinates are percentages of FIELD_WIDTH and FIELD_HEIGHT

    // GK: bottom center
    gks.forEach((gk, i) => {
      positions.push({
        player: gk,
        x: 42,
        y: 85
      });
    });

    // DFs: defensive line
    dfs.forEach((df, i) => {
      const step = 80 / (dfs.length + 1);
      positions.push({
        player: df,
        x: 10 + step * (i + 1) - 8,
        y: 63
      });
    });

    // MFs: midfield line
    mfs.forEach((mf, i) => {
      const step = 80 / (mfs.length + 1);
      positions.push({
        player: mf,
        x: 10 + step * (i + 1) - 8,
        y: 40
      });
    });

    // FWs: forwards
    fws.forEach((fw, i) => {
      const step = 80 / (fws.length + 1);
      positions.push({
        player: fw,
        x: 10 + step * (i + 1) - 8,
        y: 18
      });
    });

    return positions;
  };

  const positions = getPlayerPositions(players);

  const handlePlayerTap = (player: TacticalPlayer) => {
    setSelectedPlayer(selectedPlayer?.uid === player.uid ? null : player);
  };

  const handlePositionChange = (pos: 'GK' | 'DF' | 'MF' | 'FW') => {
    if (selectedPlayer && onUpdatePosition) {
      onUpdatePosition(selectedPlayer.uid, pos);
      setSelectedPlayer({ ...selectedPlayer, position: pos });
    }
  };

  return (
    <GlassCard style={styles.container}>
      {/* Team Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          onPress={() => { setSelectedTeam('A'); setSelectedPlayer(null); }}
          accessibilityLabel="A Takımı Taktik Görünümü"
          accessibilityRole="tab"
          accessibilityState={{ selected: selectedTeam === 'A' }}
          style={[styles.tab, selectedTeam === 'A' && styles.activeTab]}
        >
          <Text style={[styles.tabText, selectedTeam === 'A' && styles.activeTabText]}>A Takımı</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => { setSelectedTeam('B'); setSelectedPlayer(null); }}
          accessibilityLabel="B Takımı Taktik Görünümü"
          accessibilityRole="tab"
          accessibilityState={{ selected: selectedTeam === 'B' }}
          style={[styles.tab, selectedTeam === 'B' && styles.activeTab]}
        >
          <Text style={[styles.tabText, selectedTeam === 'B' && styles.activeTabText]}>B Takımı</Text>
        </TouchableOpacity>
      </View>

      {/* Football Pitch */}
      <View style={styles.pitch}>
        {/* Outter boundary */}
        <View style={styles.pitchBoundary} />
        {/* Center circle & line */}
        <View style={styles.centerLine} />
        <View style={styles.centerCircle} />
        <View style={styles.centerSpot} />

        {/* Penalty Areas */}
        <View style={styles.penaltyAreaTop} />
        <View style={styles.penaltyAreaBottom} />

        {/* Render Players */}
        {positions.map(({ player, x, y }) => {
          const isSelected = selectedPlayer?.uid === player.uid;
          return (
            <TouchableOpacity
              key={player.uid}
              onPress={() => handlePlayerTap(player)}
              accessibilityLabel={`${player.displayName}, Mevki: ${player.position}, GEN: ${player.overall || ''}`}
              accessibilityRole="button"
              style={[
                styles.playerNode,
                { left: `${x}%`, top: `${y}%` }
              ]}
            >
              <View style={[styles.avatarContainer, isSelected && styles.selectedAvatar]}>
                {player.photoURL ? (
                  <Image source={{ uri: player.photoURL }} style={styles.avatarImage} />
                ) : (
                  <Text style={styles.avatarInitials}>
                    {player.displayName.split(' ').map(n => n[0]).slice(0, 2).join('')}
                  </Text>
                )}
                {player.overall && (
                  <View style={styles.overallBadge}>
                    <Text style={styles.overallText}>{player.overall}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.playerName} numberOfLines={1}>
                {player.displayName.split(' ')[0]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Interactive Admin panel underneath */}
      {selectedPlayer && (
        <View style={styles.detailsContainer}>
          <Text style={styles.detailsName}>{selectedPlayer.displayName}</Text>
          <Text style={styles.detailsSub}>Mevcut Mevki: {selectedPlayer.position}</Text>

          {isAdmin && onUpdatePosition && (
            <View style={styles.actionRow}>
              {(['GK', 'DF', 'MF', 'FW'] as const).map(pos => (
                <TouchableOpacity
                  key={pos}
                  onPress={() => handlePositionChange(pos)}
                  accessibilityLabel={`Pozisyonu ${pos} olarak değiştir`}
                  accessibilityRole="button"
                  style={[
                    styles.actionButton,
                    selectedPlayer.position === pos && styles.activeActionButton
                  ]}
                >
                  <Text style={[
                    styles.actionButtonText,
                    selectedPlayer.position === pos && styles.activeActionButtonText
                  ]}>
                    {pos}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      )}
    </GlassCard>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 0,
    overflow: 'hidden',
  },
  tabContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderColor: colors.borderDark,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
  },
  tabText: {
    color: colors.textSecondaryDark,
    fontWeight: '600',
    fontSize: 14,
    fontFamily: 'Barlow_600SemiBold',
  },
  activeTabText: {
    color: colors.primary,
  },
  pitch: {
    width: FIELD_WIDTH,
    height: FIELD_HEIGHT,
    backgroundColor: '#0a1d0f', // Very premium forest green
    position: 'relative',
    overflow: 'hidden',
  },
  pitchBoundary: {
    position: 'absolute',
    top: 10,
    bottom: 10,
    left: 10,
    right: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  centerLine: {
    position: 'absolute',
    top: '50%',
    left: 10,
    right: 10,
    height: 1.5,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  centerCircle: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 80,
    height: 80,
    borderRadius: 40,
    marginLeft: -40,
    marginTop: -40,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  centerSpot: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 6,
    height: 6,
    borderRadius: 3,
    marginLeft: -3,
    marginTop: -3,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
  penaltyAreaTop: {
    position: 'absolute',
    top: 10,
    left: '25%',
    right: '25%',
    height: 50,
    borderBottomWidth: 1.5,
    borderLeftWidth: 1.5,
    borderRightWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  penaltyAreaBottom: {
    position: 'absolute',
    bottom: 10,
    left: '25%',
    right: '25%',
    height: 50,
    borderTopWidth: 1.5,
    borderLeftWidth: 1.5,
    borderRightWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  playerNode: {
    position: 'absolute',
    width: 60,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  avatarContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.cardDark,
    borderWidth: 2,
    borderColor: colors.textSecondaryDark,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    ...shadows.sm,
  },
  selectedAvatar: {
    borderColor: colors.primary,
    ...shadows.glow(colors.primary),
  },
  avatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarInitials: {
    color: colors.textDark,
    fontWeight: 'bold',
    fontSize: 14,
    fontFamily: 'Barlow_700Bold',
  },
  overallBadge: {
    position: 'absolute',
    right: -6,
    bottom: -6,
    backgroundColor: colors.gold,
    borderRadius: 8,
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.cardDark,
  },
  overallText: {
    fontSize: 10,
    color: colors.cardDark,
    fontWeight: 'bold',
    fontFamily: 'BarlowCondensed_700Bold',
  },
  playerName: {
    color: colors.textDark,
    fontSize: 11,
    marginTop: spacing.xs,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: -1, height: 1 },
    textShadowRadius: 3,
    fontFamily: 'Barlow_600SemiBold',
    textAlign: 'center',
  },
  detailsContainer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderColor: colors.borderDark,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
  },
  detailsName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.textDark,
    fontFamily: 'Barlow_700Bold',
  },
  detailsSub: {
    fontSize: 12,
    color: colors.textSecondaryDark,
    marginBottom: spacing.md,
    fontFamily: 'Barlow_400Regular',
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.cardDark,
    borderWidth: 1,
    borderColor: colors.borderDark,
  },
  activeActionButton: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  actionButtonText: {
    color: colors.textDark,
    fontWeight: 'bold',
    fontSize: 12,
    fontFamily: 'Barlow_700Bold',
  },
  activeActionButtonText: {
    color: colors.textDark,
  },
});
