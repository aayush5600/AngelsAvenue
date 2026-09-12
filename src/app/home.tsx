import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Animated, { FadeInRight, FadeInDown } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';

const THEME = {
  bg: '#121212',
  cardBg: '#1c1c1e',
  accent: '#d4af37',
  textMain: '#ffffff',
  textSub: '#8e8e93',
  border: '#2c2c2e',
  success: '#32d74b'
};




const MENU_ITEMS = [
  { id: '1', title: 'Sales Report', icon: 'bar-chart-2', subtitle: 'View detailed analytics', route: '/admin-sales-report' },
  { id: '5', title: 'Compare Shops', icon: 'pie-chart', subtitle: 'Analyze branch performance side-by-side', route: '/shop-compare' },
  { id: '3', title: 'View Stock', icon: 'box', subtitle: 'Check inventory levels', route: '/admin-stock' },
  { id: '4', title: 'Person', icon: 'users', subtitle: 'Manage salesmen and admins', route: '/person' },
];

export default function HomeScreen() {
  const router = useRouter();
  const { email } = useLocalSearchParams();

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={THEME.bg} />
      <View style={styles.container}>

        {/* Modern Header */}
        <Animated.View entering={FadeInDown.duration(1000).springify().damping(12)} style={styles.header}>
          <View>
            <Text style={styles.greeting}>Dashboard</Text>
            <View style={styles.roleBadge}>
              <View style={styles.dot} />
              <Text style={styles.roleText}>Admin Access</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.profileButton}
            activeOpacity={0.8}
            onPress={() => router.push({ pathname: '/profile', params: { email } })}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {typeof email === 'string' && email.length > 0 ? email[0].toUpperCase() : 'A'}
              </Text>
            </View>
          </TouchableOpacity>
        </Animated.View>

        {/* Action List (One Cell Horizontally) */}
        <View style={styles.listContainer}>
          {MENU_ITEMS.map((item, index) => (
            <Animated.View
              key={item.id}
              entering={FadeInRight.delay(200 + index * 150).duration(800).springify().damping(14)}
            >
              <TouchableOpacity
                activeOpacity={0.7}
                style={styles.card}
                onPress={() => item.route ? router.push(item.route as any) : null}
              >
                <View style={styles.cardContent}>
                  <View style={styles.iconContainer}>
                    <Feather name={item.icon as any} size={24} color={THEME.accent} />
                  </View>
                  <View style={styles.textContainer}>
                    <Text style={styles.cardTitle}>{item.title}</Text>
                    <Text style={styles.cardSubtitle}>{item.subtitle}</Text>
                  </View>
                </View>
                <Feather name="chevron-right" size={24} color={THEME.textSub} />
              </TouchableOpacity>
            </Animated.View>
          ))}
        </View>

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: THEME.bg,

  },
  container: {
    flex: 1,
    backgroundColor: THEME.bg,
    paddingHorizontal: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 40,
  },
  greeting: {
    color: THEME.textMain,
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(212, 175, 55, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: THEME.accent,
    marginRight: 6,
  },
  roleText: {
    color: THEME.accent,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  profileButton: {
    shadowColor: THEME.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 5,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: THEME.cardBg,
        borderWidth: 2,
    borderColor: THEME.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: THEME.accent,
    fontSize: 20,
    fontWeight: '700',
  },
  listContainer: {
    gap: 16,
  },
  card: {
    width: '100%',
    backgroundColor: THEME.cardBg,
        borderRadius: 24,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: THEME.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 12,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(212, 175, 55, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  textContainer: {
    justifyContent: 'center',
    flex: 1,
  },
  cardTitle: {
    color: THEME.textMain,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  cardSubtitle: {
    color: THEME.textSub,
    fontSize: 14,
    fontWeight: '500',
  },
});
