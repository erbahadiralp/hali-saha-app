import { initializeApp } from "firebase/app";
// @ts-ignore
import { Auth, getAuth, getReactNativePersistence, initializeAuth } from 'firebase/auth';
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import { getStorage } from "firebase/storage";
import { Platform } from 'react-native';

// Firebase config loaded from environment variables (.env)
// Note: Firebase API keys are safe to include in client code - security is enforced by Firestore Security Rules
// For additional protection, restrict API key usage in Google Cloud Console
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || "",
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID || ""
};

const app = initializeApp(firebaseConfig);

// Platform-specific auth initialization
let auth: Auth;
if (Platform.OS === 'web') {
  // Web platform uses browser persistence
  auth = getAuth(app);
} else {
  // Native platforms use AsyncStorage
  const ReactNativeAsyncStorage = require('@react-native-async-storage/async-storage').default;
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(ReactNativeAsyncStorage)
  });
}

export { auth };
export const db = getFirestore(app);
export const storage = getStorage(app);
// Must match the region set in functions/src/index.ts.
export const FUNCTIONS_REGION = "europe-west1";
export const functions = getFunctions(app, FUNCTIONS_REGION);

