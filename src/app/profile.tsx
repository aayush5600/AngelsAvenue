import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, StatusBar, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { auth, db } from '../firebaseConfig';
import { signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

const THEME = {
  bg: '#121212',
  cardBg: '#1c1c1e',
  accent: '#d4af37',
  textMain: '#ffffff',
  textSub: '#8e8e93',
  border: '#2c2c2e',
  success: '#32d74b'
};


export default function ProfileScreen() {
  const router = useRouter();

  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      const user = auth.currentUser;
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        let docSnap = await getDoc(doc(db, 'salesmen', user.uid));
        if (docSnap.exists()) { setUserData(docSnap.data()); setLoading(false); return; }

        docSnap = await getDoc(doc(db, 'shops', user.uid));
        if (docSnap.exists()) { setUserData(docSnap.data()); setLoading(false); return; }

        docSnap = await getDoc(doc(db, 'admins', user.uid));
        if (docSnap.exists()) { setUserData(docSnap.data()); setLoading(false); return; }

      } catch (e) {
        console.error("Error fetching user profile:", e);
      }
      setLoading(false);
    };

    fetchUser();
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.replace('/');
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const displayName = userData?.name || 'User';
  const displayEmail = userData?.email || auth.currentUser?.email || 'No email';
  const displayInitial = displayName[0]?.toUpperCase() || 'U';

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={THEME.bg} />
      <View style={styles.container}>

        {/* Header */}
        <Animated.View entering={FadeInDown.duration(600)} style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <Feather name="arrow-left" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Profile</Text>
          <View style={{ width: 40 }} />
        </Animated.View>

        {loading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color={THEME.accent} />
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

            {/* Avatar Section */}
            <Animated.View entering={FadeInDown.delay(100).duration(600).springify()} style={styles.avatarContainer}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{displayInitial}</Text>
              </View>
              <Text style={styles.avatarName}>{displayName}</Text>
              <Text style={styles.avatarRole}>{userData?.role || 'Unknown Role'}</Text>
            </Animated.View>

            {/* Details Section */}
            <Animated.View entering={FadeInDown.delay(200).duration(600).springify()} style={styles.infoCard}>
              <View style={styles.infoRow}>
                <View style={styles.iconContainer}>
                  <Feather name="user" size={20} color={THEME.accent} />
                </View>
                <View style={styles.infoTextContainer}>
                  <Text style={styles.label}>Full Name</Text>
                  <Text style={styles.value}>{displayName}</Text>
                </View>
              </View>

              <View style={styles.divider} />

              <View style={styles.infoRow}>
                <View style={styles.iconContainer}>
                  <Feather name="mail" size={20} color={THEME.accent} />
                </View>
                <View style={styles.infoTextContainer}>
                  <Text style={styles.label}>Email Address</Text>
                  <Text style={styles.value}>{displayEmail}</Text>
                </View>
              </View>

              {userData?.mobile && (
                <>
                  <View style={styles.divider} />
                  <View style={styles.infoRow}>
                    <View style={styles.iconContainer}>
                      <Feather name="phone" size={20} color={THEME.accent} />
                    </View>
                    <View style={styles.infoTextContainer}>
                      <Text style={styles.label}>Mobile Number</Text>
                      <Text style={styles.value}>{userData.mobile}</Text>
                    </View>
                  </View>
                </>
              )}

              {userData?.shopName && (
                <>
                  <View style={styles.divider} />
                  <View style={styles.infoRow}>
                    <View style={styles.iconContainer}>
                      <Feather name="home" size={20} color={THEME.accent} />
                    </View>
                    <View style={styles.infoTextContainer}>
                      <Text style={styles.label}>Assigned Shop</Text>
                      <Text style={styles.value}>{userData.shopName}</Text>
                    </View>
                  </View>
                </>
              )}
            </Animated.View>

            {/* Logout Button */}
            <Animated.View entering={FadeInUp.delay(300).duration(600).springify()} style={styles.logoutContainer}>
              <TouchableOpacity
                style={styles.logoutButton}
                activeOpacity={0.8}
                onPress={handleLogout}
              >
                <Feather name="log-out" size={20} color="#000" style={{ marginRight: 8 }} />
                <Text style={styles.logoutText}>Log Out</Text>
              </TouchableOpacity>
            </Animated.View>

          </ScrollView>
        )}
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
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  content: {
    padding: 24,
    paddingBottom: 40,
  },
  avatarContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(212, 175, 55, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: THEME.accent,
  },
  avatarText: {
    color: THEME.accent,
    fontSize: 40,
    fontWeight: '700',
  },
  avatarName: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
  },
  avatarRole: {
    color: THEME.accent,
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    backgroundColor: 'rgba(212, 175, 55, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  infoCard: {
    backgroundColor: THEME.cardBg,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: THEME.border,
    marginBottom: 32,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(212, 175, 55, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  infoTextContainer: {
    flex: 1,
  },
  label: {
    color: THEME.textSub,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  value: {
    color: THEME.textMain,
    fontSize: 16,
    fontWeight: '500',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    marginVertical: 16,
    marginLeft: 56, // Align with text
  },
  logoutContainer: {
    marginTop: 'auto',
  },
  logoutButton: {
    backgroundColor: THEME.accent,
    flexDirection: 'row',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: THEME.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  logoutText: {
    color: '#000',
    fontSize: 18,
    fontWeight: '700',
  },
});
