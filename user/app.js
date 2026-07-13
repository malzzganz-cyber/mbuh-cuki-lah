// ============================================================
// Malzz Chat — app.js
// Shared application logic for every user-facing page.
// Vanilla ES2023, Firebase v10 modular SDK (via CDN, see ../firebase.js)
// ============================================================
import {
  app, auth, db, storage, googleProvider, ts, APP_NAME, getMessagingInstance, FCM_VAPID_KEY,
} from "../firebase.js";
import {
  onAuthStateChanged, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signInWithPopup, sendPasswordResetEmail, sendEmailVerification, updateProfile,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc, getDoc, setDoc, updateDoc, onSnapshot, collection, query, where, orderBy, limit,
  addDoc, serverTimestamp, arrayUnion, arrayRemove, deleteDoc, increment, startAfter,
  getDocs, writeBatch, deleteField,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  ref as storageRef, uploadBytes, getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { getToken, onMessage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js";

// ------------------------------------------------------------
// THEME
// ------------------------------------------------------------
export function initTheme() {
  const saved = localStorage.getItem("malzz-theme") || "light";
  document.documentElement.setAttribute("data-theme", saved);
}
export function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "light";
  const next = current === "light" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("malzz-theme", next);
  return next;
}
initTheme();

// ------------------------------------------------------------
// TOAST
// ------------------------------------------------------------
export function toast(message, type = "info", ms = 3200) {
  let stack = document.querySelector(".toast-stack");
  if (!stack) {
    stack = document.createElement("div");
    stack.className = "toast-stack";
    document.body.appendChild(stack);
  }
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  stack.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

export function friendlyFirebaseError(err) {
  const code = err && err.code ? err.code : "";
  const map = {
    "auth/invalid-email": "Format email tidak valid.",
    "auth/user-not-found": "Akun tidak ditemukan.",
    "auth/wrong-password": "Password salah.",
    "auth/invalid-credential": "Email atau password salah.",
    "auth/email-already-in-use": "Email sudah terdaftar.",
    "auth/weak-password": "Password minimal 6 karakter.",
    "auth/too-many-requests": "Terlalu banyak percobaan. Coba lagi nanti.",
    "auth/network-request-failed": "Koneksi internet bermasalah.",
    "auth/popup-closed-by-user": "Login dibatalkan.",
    "storage/unauthorized": "Tidak punya izin mengunggah file ini.",
    "storage/canceled": "Upload dibatalkan.",
    "permission-denied": "Kamu tidak punya izin untuk aksi ini.",
    "unavailable": "Server sedang tidak dapat dijangkau. Periksa koneksi internet.",
  };
  return map[code] || (err && err.message) || "Terjadi kesalahan. Silakan coba lagi.";
}

// ------------------------------------------------------------
// OFFLINE / RECONNECT
// ------------------------------------------------------------
window.addEventListener("offline", () => toast("Kamu sedang offline.", "error", 5000));
window.addEventListener("online", () => toast("Koneksi kembali tersambung.", "success"));

// ------------------------------------------------------------
// RIPPLE EFFECT
// ------------------------------------------------------------
document.addEventListener("click", (e) => {
  const target = e.target.closest(".ripple");
  if (!target) return;
  const circle = document.createElement("span");
  const rect = target.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  circle.className = "ripple-circle";
  circle.style.width = circle.style.height = `${size}px`;
  circle.style.left = `${e.clientX - rect.left - size / 2}px`;
  circle.style.top = `${e.clientY - rect.top - size / 2}px`;
  target.appendChild(circle);
  setTimeout(() => circle.remove(), 650);
});

// ------------------------------------------------------------
// AUTH HELPERS
// ------------------------------------------------------------
export function currentUser() {
  return auth.currentUser;
}

export function userDocRef(uid) {
  return doc(db, "users", uid);
}

let banListenerUnsub = null;

/** Attach a real-time listener that force-logs-out the moment `banned` flips true. */
function watchBanStatus(uid) {
  if (banListenerUnsub) banListenerUnsub();
  banListenerUnsub = onSnapshot(userDocRef(uid), async (snap) => {
    const data = snap.data();
    if (data && data.banned === true) {
      sessionStorage.setItem("malzz-ban-info", JSON.stringify({
        name: data.name || "",
        banReason: data.banReason || "-",
        banAt: data.banAt ? data.banAt.toMillis() : Date.now(),
        banExpiresAt: data.banExpiresAt ? data.banExpiresAt.toMillis() : null,
        banPermanent: !!data.banPermanent,
      }));
      await signOut(auth).catch(() => {});
      window.location.replace("./banned.html");
    }
  });
}

/**
 * Guard a page: requires a signed-in, verified, non-banned user.
 * Redirects appropriately and resolves with the user's Firestore profile.
 */
export function requireAuth({ requireVerified = false } = {}) {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        window.location.replace("./login.html");
        return;
      }
      const snap = await getDoc(userDocRef(user.uid));
      const profile = snap.exists() ? snap.data() : null;
      if (profile && profile.banned === true) {
        sessionStorage.setItem("malzz-ban-info", JSON.stringify({
          name: profile.name || "",
          banReason: profile.banReason || "-",
          banAt: profile.banAt ? profile.banAt.toMillis() : Date.now(),
          banExpiresAt: profile.banExpiresAt ? profile.banExpiresAt.toMillis() : null,
          banPermanent: !!profile.banPermanent,
        }));
        await signOut(auth).catch(() => {});
        window.location.replace("./banned.html");
        return;
      }
      if (requireVerified && !user.emailVerified && !profile?.isGoogleAccount) {
        toast("Silakan verifikasi email kamu terlebih dahulu.", "error");
      }
      await updateDoc(userDocRef(user.uid), { online: true, lastSeen: serverTimestamp() }).catch(() => {});
      window.addEventListener("beforeunload", () => {
        updateDoc(userDocRef(user.uid), { online: false, lastSeen: serverTimestamp() }).catch(() => {});
      });
      watchBanStatus(user.uid);
      resolve({ user, profile });
    });
  });
}

export async function logout() {
  const user = auth.currentUser;
  if (user) await updateDoc(userDocRef(user.uid), { online: false, lastSeen: serverTimestamp() }).catch(() => {});
  if (banListenerUnsub) banListenerUnsub();
  await signOut(auth);
  window.location.replace("./login.html");
}

export async function registerWithEmail({ name, username, email, password }) {
  const existing = await getDocs(query(collection(db, "users"), where("username", "==", username)));
  if (!existing.empty) throw { code: "username-taken", message: "Username sudah digunakan." };
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName: name });
  await setDoc(userDocRef(cred.user.uid), {
    uid: cred.user.uid,
    name, username, email,
    photoURL: "", bannerURL: "", bio: "", status: "Hai, saya menggunakan Malzz Chat!",
    role: "user", verified: false,
    banned: false, banReason: "", banExpiresAt: null, banPermanent: false,
    online: true, lastSeen: serverTimestamp(), createdAt: serverTimestamp(),
    fcmTokens: [], blockedUsers: [],
  });
  await sendEmailVerification(cred.user).catch(() => {});
  return cred.user;
}

export async function loginWithEmail(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

export async function loginWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider);
  const ref = userDocRef(result.user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      uid: result.user.uid,
      name: result.user.displayName || "Pengguna Malzz",
      username: `user${result.user.uid.slice(0, 6)}`,
      email: result.user.email,
      photoURL: result.user.photoURL || "",
      bannerURL: "", bio: "", status: "Hai, saya menggunakan Malzz Chat!",
      role: "user", verified: false,
      banned: false, banReason: "", banExpiresAt: null, banPermanent: false,
      online: true, lastSeen: serverTimestamp(), createdAt: serverTimestamp(),
      fcmTokens: [], blockedUsers: [], isGoogleAccount: true,
    });
  }
  return result.user;
}

export async function resetPassword(email) {
  return sendPasswordResetEmail(auth, email);
}

// ------------------------------------------------------------
// FCM (push notifications)
// ------------------------------------------------------------
export async function initMessaging(uid) {
  try {
    const messaging = await getMessagingInstance();
    if (!messaging) return;
    const reg = await navigator.serviceWorker.getRegistration("./sw.js");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;
    const token = await getToken(messaging, { vapidKey: FCM_VAPID_KEY, serviceWorkerRegistration: reg });
    if (token) {
      await updateDoc(userDocRef(uid), { fcmTokens: arrayUnion(token) }).catch(() => {});
    }
    onMessage(messaging, (payload) => {
      toast(payload.notification?.title || "Notifikasi baru");
    });
  } catch (e) {
    console.warn("FCM init skipped:", e.message);
  }
}

export function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

// ------------------------------------------------------------
// BOTTOM NAV
// ------------------------------------------------------------
const NAV_ICONS = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>',
  groups: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="8" r="3"/><path d="M2 20c0-3.3 3.1-6 7-6s7 2.7 7 6"/><circle cx="17" cy="9" r="2.5"/><path d="M15 14.2c2.6.4 4.5 2.2 4.5 4.8"/></svg>',
  notif: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8a6 6 0 10-12 0c0 4-2 5-2 7h16c0-2-2-3-2-7"/><path d="M9.5 21a2.5 2.5 0 005 0"/></svg>',
  profile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/></svg>',
};

export function renderBottomNav(active) {
  const nav = document.createElement("div");
  nav.className = "bottom-nav glass";
  nav.innerHTML = `
    <a class="nav-item ${active === "home" ? "active" : ""}" href="./index.html">${NAV_ICONS.home}<span>Home</span></a>
    <a class="nav-item ${active === "groups" ? "active" : ""}" href="./index.html#groups">${NAV_ICONS.groups}<span>Grup</span></a>
    <a class="nav-item ${active === "notif" ? "active" : ""}" href="./index.html#notif">${NAV_ICONS.notif}<span>Notif</span></a>
    <a class="nav-item ${active === "profile" ? "active" : ""}" href="./profile.html">${NAV_ICONS.profile}<span>Profil</span></a>
  `;
  document.body.appendChild(nav);
}

// ------------------------------------------------------------
// TIME FORMATTING
// ------------------------------------------------------------
export function fmtTime(tsField) {
  if (!tsField) return "";
  const d = tsField.toDate ? tsField.toDate() : new Date(tsField);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Kemarin";
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
}

export function fmtLastSeen(tsField, online) {
  if (online) return "Online";
  if (!tsField) return "Offline";
  const d = tsField.toDate ? tsField.toDate() : new Date(tsField);
  const diffMin = Math.round((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return "Baru saja";
  if (diffMin < 60) return `${diffMin} menit lalu`;
  if (diffMin < 1440) return `${Math.round(diffMin / 60)} jam lalu`;
  return `Terakhir dilihat ${d.toLocaleDateString("id-ID")}`;
}

export function initials(name = "") {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || "").join("");
}

export function avatarOrFallback(url, name) {
  return url || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name || "M")}&backgroundColor=6c5ce7,00cec9`;
}

// ------------------------------------------------------------
// CHAT HELPERS
// ------------------------------------------------------------
export function privateChatId(uidA, uidB) {
  return [uidA, uidB].sort().join("_");
}

export async function ensurePrivateChat(myUid, otherUid) {
  const chatId = privateChatId(myUid, otherUid);
  const ref = doc(db, "privateChats", chatId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      members: [myUid, otherUid],
      lastMessage: "", lastMessageAt: serverTimestamp(),
      unread: { [myUid]: 0, [otherUid]: 0 },
      pinnedMessageId: null,
      typing: { [myUid]: false, [otherUid]: false },
      createdAt: serverTimestamp(),
    });
  }
  return chatId;
}

export async function uploadMedia(file, folder, id) {
  const path = `${folder}/${id}/${Date.now()}_${file.name}`;
  const ref = storageRef(storage, path);
  await uploadBytes(ref, file);
  return getDownloadURL(ref);
}

export async function sendMessage({ threadRef, messagesCol, senderId, type, text, mediaURL, replyTo }) {
  const msg = {
    senderId, type: type || "text",
    text: text || "", mediaURL: mediaURL || "",
    replyTo: replyTo || null,
    edited: false, deletedFor: [], deletedForEveryone: false,
    reactions: {}, seenBy: [senderId], deliveredTo: [senderId],
    createdAt: serverTimestamp(),
  };
  await addDoc(messagesCol, msg);
  await updateDoc(threadRef, {
    lastMessage: type === "text" ? text : `[${type}]`,
    lastMessageAt: serverTimestamp(),
  }).catch(() => {});
}

export async function setTyping(threadRef, uid, isTyping) {
  await updateDoc(threadRef, { [`typing.${uid}`]: isTyping }).catch(() => {});
}

export async function toggleReaction(msgRef, uid, emoji) {
  const snap = await getDoc(msgRef);
  const reactions = snap.data()?.reactions || {};
  if (reactions[uid] === emoji) {
    await updateDoc(msgRef, { [`reactions.${uid}`]: deleteField() });
  } else {
    await updateDoc(msgRef, { [`reactions.${uid}`]: emoji });
  }
}

export async function markSeen(msgRef, uid) {
  await updateDoc(msgRef, { seenBy: arrayUnion(uid), deliveredTo: arrayUnion(uid) }).catch(() => {});
}

export async function editMessage(msgRef, text) {
  await updateDoc(msgRef, { text, edited: true });
}

export async function deleteForMe(msgRef, uid) {
  await updateDoc(msgRef, { deletedFor: arrayUnion(uid) });
}

export async function deleteForEveryone(msgRef) {
  await updateDoc(msgRef, { deletedForEveryone: true, text: "", mediaURL: "" });
}

export async function pinMessage(threadRef, msgId) {
  await updateDoc(threadRef, { pinnedMessageId: msgId });
}
export async function unpinMessage(threadRef) {
  await updateDoc(threadRef, { pinnedMessageId: null });
}

export function copyText(text) {
  navigator.clipboard?.writeText(text).then(() => toast("Disalin ke clipboard", "success"));
}

// ------------------------------------------------------------
// NOTIFICATIONS
// ------------------------------------------------------------
export async function pushNotification(uid, { title, body, type = "system", link = "./index.html" }) {
  await addDoc(collection(db, "notifications", uid, "items"), {
    title, body, type, link, read: false, createdAt: serverTimestamp(),
  });
}

export function listenNotifications(uid, cb) {
  const q = query(collection(db, "notifications", uid, "items"), orderBy("createdAt", "desc"), limit(50));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}

// ------------------------------------------------------------
// BLOCKING
// ------------------------------------------------------------
export async function blockUser(myUid, targetUid) {
  await updateDoc(userDocRef(myUid), { blockedUsers: arrayUnion(targetUid) });
}
export async function unblockUser(myUid, targetUid) {
  await updateDoc(userDocRef(myUid), { blockedUsers: arrayRemove(targetUid) });
}

// ------------------------------------------------------------
// REPORT
// ------------------------------------------------------------
export async function reportContent({ reporterId, targetType, targetId, reason }) {
  await addDoc(collection(db, "reports"), {
    reporterId, targetType, targetId, reason, status: "open", createdAt: serverTimestamp(),
  });
}

// ------------------------------------------------------------
// GENERIC MODAL / SHEET
// ------------------------------------------------------------
export function openSheet(innerHTML, { center = false } = {}) {
  const overlay = document.createElement("div");
  overlay.className = `overlay ${center ? "center" : ""}`;
  overlay.innerHTML = `<div class="sheet scale-in">${center ? "" : '<div class="handle"></div>'}${innerHTML}</div>`;
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  return overlay;
}

export { db, auth, storage, doc, getDoc, setDoc, updateDoc, onSnapshot, collection, query, where, orderBy, limit, addDoc, serverTimestamp, arrayUnion, arrayRemove, deleteDoc, increment, startAfter, getDocs, writeBatch, storageRef, uploadBytes, getDownloadURL, APP_NAME };
