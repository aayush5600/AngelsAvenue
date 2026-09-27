import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Image, KeyboardAvoidingView, Platform, Dimensions, ActivityIndicator, Alert } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useRouter, useRootNavigationState, Redirect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { signInWithEmailAndPassword, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';

const THEME = {
  bg: '#121212',
  cardBg: '#1c1c1e',
  accent: '#d4af37',
  textMain: '#ffffff',
  textSub: '#8e8e93',
  border: '#2c2c2e',
  success: '#32d74b'
};

const { width } = Dimensions.get('window');

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [authError, setAuthError] = useState('');
  const [routeTo, setRouteTo] = useState<{ pathname: string, params: any } | null>(null);
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();

  useEffect(() => {
    let isMounted = true;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          // Check Admin
          let userDoc = await getDoc(doc(db, 'admins', user.uid));
          if (userDoc.exists()) {
            if (isMounted) setRouteTo({ pathname: '/home', params: { email: user.email || '' } });
            return;
          }

          // Check Shop
          userDoc = await getDoc(doc(db, 'shops', user.uid));
          if (userDoc.exists()) {
            if (isMounted) setRouteTo({ pathname: '/home-shop', params: { email: user.email || '' } });
            return;
          }

          // Check Salesman
          userDoc = await getDoc(doc(db, 'salesmen', user.uid));
          if (userDoc.exists()) {
            if (isMounted) setRouteTo({ pathname: '/home-salesman', params: { email: user.email || '' } });
            return;
          }

          // Fallback
          if (isMounted) setRouteTo({ pathname: '/home', params: { email: user.email || '' } });
        } catch (error: any) {
          console.error("Error checking user role:", error);
          if (isMounted) {
            setAuthError(error.message || 'Error checking role');
            setCheckingAuth(false);
          }
        }
      } else {
        if (isMounted) {
          setCheckingAuth(false);
        }
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const handleLogin = async () => {
    if (!email || !password) return;
    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Check Admin
      let userDoc = await getDoc(doc(db, 'admins', user.uid));
      if (userDoc.exists()) {
        setTimeout(() => router.replace({ pathname: '/home', params: { email: user.email || '' } }), 150);
        return;
      }

      // Check Shop
      userDoc = await getDoc(doc(db, 'shops', user.uid));
      if (userDoc.exists()) {
        setTimeout(() => router.replace({ pathname: '/home-shop', params: { email: user.email || '' } }), 150);
        return;
      }

      // Check Salesman
      userDoc = await getDoc(doc(db, 'salesmen', user.uid));
      if (userDoc.exists()) {
        setTimeout(() => router.replace({ pathname: '/home-salesman', params: { email: user.email || '' } }), 150);
        return;
      }

      // Fallback
      setTimeout(() => router.replace({ pathname: '/home', params: { email: user.email || '' } }), 150);

    } catch (error: any) {
      Alert.alert('Login Failed', error.message);
    } finally {
      setLoading(false);
    }
  };

  if (routeTo && rootNavigationState?.key) {
    return <Redirect href={routeTo as any} />;
  }

  if (checkingAuth || routeTo) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={THEME.accent} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>

        <Animated.View entering={FadeInDown.duration(800).springify()} style={styles.logoContainer}>
          <Image
            source={require("../../assets/images/Angel's_Avenue_Logo.png")}
            style={styles.logo}
            resizeMode="cover"
          />
          <Text style={styles.title}>Angel's Avenue</Text>
          <Text style={styles.subtitle}>{authError ? `Debug: ${authError}` : 'Welcome back, please login'}</Text>
        </Animated.View>

        <View style={styles.formContainer}>
          <Animated.View entering={FadeInDown.delay(200).duration(800).springify()} style={styles.inputContainer}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your email"
              placeholderTextColor={THEME.textSub}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(400).duration(800).springify()} style={styles.inputContainer}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordContainer}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Enter your password"
                placeholderTextColor={THEME.textSub}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity
                style={styles.eyeIcon}
                onPress={() => setShowPassword(!showPassword)}
                activeOpacity={0.7}
              >
                <Feather name={showPassword ? 'eye-off' : 'eye'} size={20} color={THEME.textSub} />
              </TouchableOpacity>
            </View>
          </Animated.View>

          <Animated.View entering={FadeInUp.delay(600).duration(800).springify()} style={styles.buttonContainer}>
            <TouchableOpacity style={styles.button} activeOpacity={0.8} onPress={handleLogin} disabled={loading}>
              {loading ? (
                <ActivityIndicator color={THEME.bg} />
              ) : (
                <Text style={styles.buttonText}>Login</Text>
              )}
            </TouchableOpacity>
          </Animated.View>
        </View>

      </View>

    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.bg, // Dark theme background
  },
  content: {
    flex: 1,
    paddingHorizontal: 30,
    justifyContent: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 50,
  },
  logo: {
    width: 140,
    height: 140,
    marginBottom: 20,
    borderRadius: 70,
    overflow: 'hidden',
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: THEME.textMain,
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 16,
    color: THEME.textSub,
    fontWeight: '500',
  },
  formContainer: {
    width: '100%',
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    color: THEME.textSub,
    marginBottom: 8,
    fontWeight: '600',
    marginLeft: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: THEME.cardBg,
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 18,
    fontSize: 16,
    color: THEME.textMain,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 2,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.cardBg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: THEME.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 2,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 18,
    fontSize: 16,
    color: THEME.textMain,
  },
  eyeIcon: {
    padding: 16,
  },
  buttonContainer: {
    marginTop: 24,
  },
  button: {
    backgroundColor: THEME.accent, // Elegant gold accent
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    shadowColor: THEME.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 15,
    elevation: 5,
  },
  buttonText: {
    color: THEME.bg,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
