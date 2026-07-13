/* eslint-disable no-undef */
/**
 * Firebase Cloud Messaging service worker — handles background push while the
 * app tab is closed/inactive. Files in /public are NOT processed by Vite, so the
 * Firebase config below is inlined (all values are client-safe, not secrets).
 *
 * OWNER: replace the placeholder config with the SAME values you set in the
 * app's VITE_FIREBASE_* env before deploying, or background notifications won't
 * be delivered. Foreground notifications work without this file.
 */
importScripts("https://www.gstatic.com/firebasejs/12.9.0/firebase-app-compat.js")
importScripts("https://www.gstatic.com/firebasejs/12.9.0/firebase-messaging-compat.js")

firebase.initializeApp({
  apiKey: "demo-api-key",
  authDomain: "demo-homehub.firebaseapp.com",
  projectId: "demo-homehub",
  storageBucket: "demo-homehub.appspot.com",
  messagingSenderId: "0",
  appId: "demo-app-id",
})

const messaging = firebase.messaging()

// Background message → OS notification. Tapping it deep-links via data.url.
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title ?? "Homehub"
  const options = {
    body: payload.notification?.body ?? "",
    icon: "/icon-192.png",
    data: payload.data ?? {},
  }
  self.registration.showNotification(title, options)
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const url = event.notification.data?.url || "/"
  event.waitUntil(clients.openWindow(url))
})
