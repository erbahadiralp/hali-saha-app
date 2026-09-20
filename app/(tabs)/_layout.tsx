import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import { BottomTabBarProps } from 'expo-router/js-tabs';
import React from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HapticTab } from '@/components/haptic-tab';
import { useSettingsColors } from '../../components/settings/SettingsUI';
import { withOpacity } from '../../constants/designTokens';

/**
 * Floating tab bar (design/home-active-user.png). "Keşfet" is intentionally left out and match
 * creation lives on the screens themselves, so the old centre FAB is gone.
 */

const TAB_BAR_HEIGHT = 68;

const TABS: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap; activeIcon: keyof typeof Ionicons.glyphMap }> = {
  index: { label: 'Ana Sayfa', icon: 'home-outline', activeIcon: 'home' },
  matches: { label: 'Maçlarım', icon: 'calendar-outline', activeIcon: 'calendar' },
  groups: { label: 'Gruplarım', icon: 'people-outline', activeIcon: 'people' },
  profile: { label: 'Profil', icon: 'person-outline', activeIcon: 'person' },
};

function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const C = useSettingsColors();
  const insets = useSafeAreaInsets();

  return (
    <View pointerEvents="box-none" style={[st.float, { bottom: insets.bottom > 0 ? insets.bottom + 6 : 14 }]}>
      <View style={[st.shadow, { shadowColor: C.shadow }]}>
        <View style={[st.bar, { backgroundColor: withOpacity(C.sheet, Platform.OS === 'ios' ? 0.82 : 0.97), borderColor: C.border }]}>
          {Platform.OS === 'ios' && <BlurView intensity={60} tint={C.isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />}
          {state.routes.map((route, index) => {
            const tab = TABS[route.name];
            if (!tab) return null; // hidden routes (e.g. the legacy "create" redirect)
            const focused = state.index === index;
            const color = focused ? C.link : C.textTertiary;

            const onPress = () => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
            };

            return (
              <TouchableOpacity
                key={route.key}
                onPress={onPress}
                activeOpacity={0.7}
                accessibilityRole="tab"
                accessibilityState={{ selected: focused }}
                accessibilityLabel={descriptors[route.key].options.tabBarAccessibilityLabel ?? tab.label}
                style={st.item}
              >
                <Ionicons name={focused ? tab.activeIcon : tab.icon} size={23} color={color} />
                <Text style={[st.label, { color, fontWeight: focused ? '800' : '600' }]} numberOfLines={1}>{tab.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  float: { position: 'absolute', left: 16, right: 16, zIndex: 100 },
  shadow: { borderRadius: 26, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.28, shadowRadius: 22, elevation: 14 },
  bar: { height: TAB_BAR_HEIGHT, borderRadius: 26, borderWidth: 1, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6 },
  item: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'center', gap: 3 },
  label: { fontSize: 10.5 },
});

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarButton: HapticTab, lazy: true, freezeOnBlur: true }} tabBar={props => <FloatingTabBar {...props} />}>
      <Tabs.Screen name="index" options={{ title: 'Ana Sayfa', tabBarAccessibilityLabel: 'Ana Sayfa sekmesi' }} />
      <Tabs.Screen name="matches" options={{ title: 'Maçlarım', tabBarAccessibilityLabel: 'Maçlarım sekmesi' }} />
      <Tabs.Screen name="create" options={{ href: null }} />
      <Tabs.Screen name="groups" options={{ title: 'Gruplarım', tabBarAccessibilityLabel: 'Gruplarım sekmesi' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profil', tabBarAccessibilityLabel: 'Profilim sekmesi' }} />
    </Tabs>
  );
}
