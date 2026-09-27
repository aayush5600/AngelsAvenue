import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, StatusBar, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Animated, { FadeInRight, FadeInDown } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { auth } from '../firebaseConfig';
import { signOut } from 'firebase/auth';

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
  { id: '1', title: 'Sales Entry', icon: 'edit-3', subtitle: 'Record new sales', route: '/sales-entry' },
  { id: '2', title: 'My Sales Report', icon: 'bar-chart-2', subtitle: 'View your sales', route: '/salesman-report' },
  { id: '3', title: 'My Stock', icon: 'box', subtitle: 'Check inventory levels', route: '/stock' },
  { id: '4', title: 'Add Stock', icon: 'plus-square', subtitle: 'Add new items to stock', route: '/add-stock' },
  { id: '5', title: 'Add Expense', icon: 'dollar-sign', subtitle: 'Log daily expenses', route: '/shop-expense' },
];

export default function HomeSalesmanScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const email = params.email as string || 'Sales Man';

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={THEME.bg} />
      <View style={styles.container}>

        {/* Modern Header */}
        <Animated.View entering={FadeInDown.duration(1000).springify().damping(12)} style={styles.header}>
          <View>
            <Text style={styles.greeting}>Welcome back,</Text>
            <View style={styles.roleBadge}>
              <View style={styles.dot} />
              <Text style={styles.roleText}>Sales Man</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.profileButton}
            activeOpacity={0.8}
            onPress={() => router.push({ pathname: '/profile', params: { email } })}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {typeof email === 'string' && email.length > 0 ? email[0].toUpperCase() : 'S'}
              </Text>
            </View>
          </TouchableOpacity>
        </Animated.View>

        {/* Action List (One Cell Horizontally) */}
        <ScrollView style={styles.listContainer} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
          {MENU_ITEMS.map((item, index) => (
            <Animated.View
              key={item.id}
              entering={FadeInRight.delay(200 + index * 100).duration(800).springify().damping(14)}
            >
              <TouchableOpacity
                activeOpacity={0.7}
                style={styles.card}
                onPress={() => item.route ? router.push(item.route as any) : null}
              >
                <View style={styles.cardContent}>
                  <View style={[styles.iconContainer, item.icon === 'minus-circle' && { backgroundColor: 'rgba(255, 59, 48, 0.1)' }]}>
                    <Feather name={item.icon as any} size={24} color={item.icon === 'minus-circle' ? '#ff3b30' : THEME.accent} />
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
        </ScrollView>

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
    paddingBottom: 30,
  },
  greeting: {
    color: THEME.textMain,
    fontSize: 28,
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
    fontSize: 22,
    fontWeight: '700',
  },
  listContainer: {
    flex: 1,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: THEME.cardBg,
        borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(212, 175, 55, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  textContainer: {
    flex: 1,
    paddingRight: 16,
  },
  cardTitle: {
    color: THEME.textMain,
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  cardSubtitle: {
    color: THEME.textSub,
    fontSize: 14,
  },
});
