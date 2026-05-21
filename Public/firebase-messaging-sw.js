// public/firebase-messaging-sw.js
// This file MUST be in the /public folder and served at the root URL
// It handles FCM push notifications when the app is in the background or closed

importScripts("https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js")
importScripts("https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js")

// ── IMPORTANT: these values must match your .env.local ───────────────────────
// We can't use import.meta.env here (service worker runs outside Vite)
// So we hardcode the PUBLIC config values here (these are safe to expose)
firebase.initializeApp({
  apiKey:            "AIzaSyBsvd9ftkJqsF2t8bjAnzz8yzASdhsKwOk",
  authDomain:        "praang-pos.firebaseapp.com",
  projectId:         "praang-pos",
  storageBucket:     "praang-pos.firebasestorage.app",
  messagingSenderId: "198509405492",
  appId:             "1:198509405492:web:3d8f838a7eed5281d33161",
})

const messaging = firebase.messaging()

// ── Handle background messages ────────────────────────────────────────────────
messaging.onBackgroundMessage((payload) => {
  console.log("[SW] Background FCM message:", payload)

  const title = payload.notification?.title ?? "Praang"
  const body  = payload.notification?.body  ?? ""
  const icon  = "/favicon.ico"
  const tag   = payload.data?.orderId ?? "praang"

  // Show notification even when app is closed / phone locked
  self.registration.showNotification(title, {
    body,
    icon,
    badge: "/favicon.ico",
    tag,
    requireInteraction: true,   // stays on screen until user taps
    vibrate: [300, 100, 300],
    data: payload.data ?? {},
  })
})

// ── Handle notification click ─────────────────────────────────────────────────
self.addEventListener("notificationclick", (event) => {
  event.notification.close()

  const orderId = event.notification.data?.orderId
  const url = orderId
    ? `${self.location.origin}/order/${orderId}`
    : self.location.origin

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Focus existing tab if open
      for (const client of clientList) {
        if (client.url === url && "focus" in client) return client.focus()
      }
      // Otherwise open new tab
      if (clients.openWindow) return clients.openWindow(url)
    })
  )
})
