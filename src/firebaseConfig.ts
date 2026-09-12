import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence, getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const firebaseConfig = {
  apiKey: "AIzaSyCrfro0DZfaTchHrwSqTq1hWS39VQgvWHk",
  authDomain: "angel-s-avenue-53b39.firebaseapp.com",
  projectId: "angel-s-avenue-53b39",
  storageBucket: "angel-s-avenue-53b39.firebasestorage.app",
  messagingSenderId: "128389437905",
  appId: "1:128389437905:web:bbf7d5f7460ad1e63928f0",
  measurementId: "G-G5V0HKHLHQ"
};

let app;
let auth;

if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
  if (Platform.OS === 'web') {
    auth = getAuth(app);
  } else {
    // Suppress the warning and persist logins using async storage
    auth = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage)
    });
  }
} else {
  app = getApp();
  auth = getAuth(app);
}

const db = getFirestore(app);

export { auth, db, firebaseConfig };
