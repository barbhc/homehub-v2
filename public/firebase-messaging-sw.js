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
  apiKey: "AIzaSyAe0ilNrLqqLMmUwmiATYXQOpUl5Oh8IQU",
  authDomain: "homehub-2068d.firebaseapp.com",
  projectId: "homehub-2068d",
  storageBucket: "homehub-2068d.firebasestorage.app",
  messagingSenderId: "793197604559",
  appId: "1:793197604559:web:b587e42c487e2d99df91ba",
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
