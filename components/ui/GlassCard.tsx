import React from 'react';
import { StyleSheet, View, ViewStyle, Platform, useColorScheme } from 'react-native';
import { BlurView } from 'expo-blur';
import { borderRadius, spacing } from '../../constants/designTokens';

interface GlassCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  intensity?: number;
  tint?: 'dark' | 'light' | 'default';
}

export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  style,
  intensity = 35,
  tint
}) => {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  
  // Decide actual tint based on system theme if not explicitly passed
  const activeTint = tint || (isDark ? 'dark' : 'light');

  // Web and android sometimes struggle with BlurView, provide fallback background
  const hasBlurSupport = Platform.OS === 'ios' || Platform.OS === 'android';

  const dynamicStyles = {
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(255, 255, 255, 0.65)',
    borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
  };

  if (!hasBlurSupport) {
    return (
      <View style={[
        styles.cardBase, 
        dynamicStyles, 
        Platform.OS === 'web' && { backdropFilter: 'blur(20px)' } as any,
        style
      ]}>
        {children}
      </View>
    );
  }

  return (
    <BlurView
      intensity={intensity}
      tint={activeTint}
      style={[styles.cardBase, dynamicStyles, style]}
    >
      {children}
    </BlurView>
  );
};

const styles = StyleSheet.create({
  cardBase: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    padding: spacing.lg,
  },
});
