// ============================================================
// Malzz Chat — Shared Firebase configuration & initialization
// Pure ES Modules, loaded from the Firebase CDN. No bundler,
// no npm install required — works directly on Firebase Hosting,
// Vercel static hosting, or any static file host.
//
// IMPORTANT: replace the placeholder values below with the
// config from YOUR Firebase project
// (Project settings → General → Your apps → SDK setup and config).
// These values are safe to expose in client code by design —
// Firebase enforces access through Firestore/Storage Security
// Rules (firestore.rules / storage.rules), not through secrecy
// of this config object.
// ============================================================

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { getMessaging, isSupported as messagingSupported } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js";

export const firebaseConfig = {
  apiKey: "AIzaSyD2_VAsx4e3ES9rzHoF1Q1RKMlFnUrwimg",
  authDomain: "malzz-chat-new.firebaseapp.com",
  projectId: "malzz-chat-new",
  storageBucket: "malzz-chat-new.firebasestorage.app",
  messagingSenderId: "736878338803",
  appId: "1:736878338803:web:ab14bf0dc3dc26d0cc8d86",
  measurementId: "G-BBTPJ709JP",
};

// Public VAPID key for Web Push (Project settings → Cloud Messaging → Web Push certificates)
export const FCM_VAPID_KEY = "YOUR_VAPID_PUBLIC_KEY";

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();
export const ts = serverTimestamp;

export let messaging = null;
export async function getMessagingInstance() {
  try {
    if (messaging) return messaging;
    if (await messagingSupported()) {
      messaging = getMessaging(app);
      return messaging;
    }
  } catch (e) {
    console.warn("FCM not supported in this browser/context", e);
  }
  return null;
}

export const APP_NAME = "Malzz Chat";
export const APP_COPYRIGHT = "© 2026 Malzz. All Rights Reserved.";
