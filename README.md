# Malzz Chat

Aplikasi chat lengkap, statis, tanpa framework (HTML5 + CSS3 + ES2023 murni) — terdiri dari **situs pengguna** (multi-file, folder `user/`) dan **panel admin** (`user/admin.html`, satu file HTML mandiri: HTML+CSS+JS+config Firebase semua digabung dalam satu file), keduanya menggunakan satu proyek Firebase yang sama (Auth, Firestore, Storage, FCM, Hosting).

## Struktur Folder

```
MalzzChat/
├── firebase.js           # Konfigurasi Firebase bersama untuk situs user (WAJIB DIISI)
├── firebase.json         # Konfigurasi Firebase Hosting (opsional, jika deploy ke Firebase)
├── firestore.rules       # Security rules Firestore
├── storage.rules         # Security rules Storage
└── user/                 # Semua source code (situs pengguna + admin)
    ├── index.html         (Home: story, chat, online, notifikasi)
    ├── login.html
    ├── register.html
    ├── chat.html          (chat pribadi & grup)
    ├── profile.html
    ├── settings.html
    ├── banned.html
    ├── admin.html         (Panel Admin — 1 file HTML utuh: CSS + JS + config Firebase inline)
    ├── app.js             (logika aplikasi situs user)
    ├── style.css          (style situs user)
    ├── manifest.json      (PWA)
    ├── sw.js              (service worker / offline)
    └── icons/
```

> **Catatan:** `admin.html` sengaja dibuat sebagai **satu file HTML mandiri** — semua CSS, JavaScript, dan konfigurasi Firebase-nya ditulis inline di dalam file itu sendiri (tidak memanggil `../firebase.js` atau file `.css`/`.js` eksternal apa pun). Ini terpisah dari sistem modul situs user, jadi kamu bebas memindahkan/memisahkan `admin.html` ke lokasi lain nanti tanpa merusak apa pun — cukup pastikan konfigurasi Firebase di dalamnya tetap menunjuk ke project yang sama dengan `firebase.js` milik situs user (khususnya jika ingin login admin memakai akun & data yang sama).

## 1. Buat Proyek Firebase

1. Buka [Firebase Console](https://console.firebase.google.com) → **Add project**.
2. Aktifkan layanan berikut pada proyek:
   - **Authentication** → Sign-in method → aktifkan **Email/Password** dan **Google**.
   - **Firestore Database** → Create database (mode production).
   - **Storage** → Get started.
   - **Cloud Messaging** (untuk notifikasi push) → di tab **Cloud Messaging**, generate **Web Push certificate (VAPID key)**.
3. Buka **Project settings → General → Your apps → Web app (</>)** untuk mendapatkan objek konfigurasi Firebase.

## 2. Isi Konfigurasi

Edit `firebase.js` di root project dan ganti semua nilai placeholder (`YOUR_API_KEY`, dst.) dengan nilai asli dari proyek Firebase kamu, termasuk `FCM_VAPID_KEY`.

> Nilai `firebaseConfig` ini aman untuk ditampilkan di kode client — keamanan sesungguhnya diatur oleh `firestore.rules` dan `storage.rules`, bukan oleh kerahasiaan config ini.

## 3. Buat Akun Admin Pertama

Karena tidak ada backend, akun admin pertama harus dibuat manual:

1. Daftar akun baru melalui halaman `user/register.html` seperti pengguna biasa.
2. Buka **Firestore Database** di Firebase Console → koleksi `users` → cari dokumen dengan `uid` akun tersebut.
3. Ubah field `role` dari `"user"` menjadi `"admin"`.
4. Sekarang akun tersebut bisa login di `user/admin.html`.

## 4. Deploy Security Rules

Gunakan Firebase CLI (`npm install -g firebase-tools`) dari komputer kamu sendiri:

```bash
firebase login
firebase use --add        # pilih project ID kamu
firebase deploy --only firestore:rules,storage:rules
```

Atau tempel isi `firestore.rules` dan `storage.rules` langsung ke tab **Rules** di Firebase Console (Firestore & Storage).

## 5. Deploy ke Vercel

Karena ini adalah situs statis murni (tanpa build step, tanpa Node backend):

1. Push folder `MalzzChat/` (atau isi di dalamnya) ke sebuah repository GitHub.
2. Di [Vercel](https://vercel.com) → **New Project** → import repo tersebut.
3. **Framework Preset:** pilih **Other** (tidak ada build command diperlukan).
4. **Root Directory:** arahkan ke folder `user/` (ini berisi seluruh situs pengguna **dan** `admin.html`). **Build Command:** kosongkan / `None`. **Output Directory:** `.`.
5. Deploy. Situs pengguna akan berada di `https://domain-kamu.vercel.app/index.html` dan panel admin di `https://domain-kamu.vercel.app/admin.html`.

> Karena `user/app.js` mengimpor `../firebase.js` secara relatif, jika kamu memindahkan folder `user/` sebagai root proyek Vercel, pastikan `firebase.js` ikut disalin ke satu level di atas `user/` (atau sesuaikan path import di `app.js`). `admin.html` tidak punya masalah ini karena semuanya (termasuk config Firebase) sudah inline di dalam file itu sendiri — kamu bisa memindahkannya ke mana saja tanpa menyesuaikan import apa pun, cukup pastikan `firebaseConfig` di dalamnya diisi dengan project yang sama.

## Keterbatasan yang Perlu Diketahui

1. **Push notification lintas perangkat**: Karena aplikasi ini 100% client-side (tanpa server/Node/Cloud Functions), token FCM setiap pengguna berhasil disimpan di Firestore (`users/{uid}.fcmTokens`), dan notifikasi foreground/in-app + Notification API browser berjalan normal. **Namun**, untuk benar-benar mengirim push ke perangkat lain (misalnya notifikasi pesan baru saat aplikasi tertutup di HP orang lain), Firebase mengharuskan pemanggilan **FCM Admin SDK** dari sisi server — ini butuh Cloud Function atau server kecil terpisah. Jika kamu membutuhkan ini nantinya, tambahkan satu Cloud Function sederhana yang men-trigger saat dokumen pesan/notifikasi baru dibuat, lalu memanggil `admin.messaging().sendMulticast()`.
2. **Analitik/dailyStats**: Koleksi `dailyStats` diisi secara best-effort langsung dari client (increment counter setiap ada aksi seperti broadcast). Ini cukup untuk keperluan monitoring ringan, tapi bukan pipeline agregasi presisi seperti BigQuery/Cloud Functions terjadwal.
3. **Firestore Indexes**: Beberapa query gabungan (misalnya `where` + `orderBy` pada koleksi yang sama) mungkin meminta kamu membuat composite index — Firebase akan menampilkan link otomatis di Console/error log saat pertama kali query dijalankan; cukup klik link tersebut untuk membuatnya.

## Kredit

© 2026 Malzz. All Rights Reserved.
