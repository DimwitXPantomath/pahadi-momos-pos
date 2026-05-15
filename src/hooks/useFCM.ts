import { useEffect, useCallback } from "react"
import { messaging, getToken, onMessage, VAPID_KEY } from "@/lib/firebase"

// ── Store FCM token to Supabase so server can push to specific device ─────────
async function saveFCMToken(token: string) {
  // Optional: save to Supabase for server-side pushes
  // const { supabase } = await import("@/lib/supabase")
  // await supabase.from("fcm_tokens").upsert({ token, created_at: new Date().toISOString() })
  console.log("FCM Token:", token)
  // For now, store in localStorage for reuse
  localStorage.setItem("fcm_token", token)
}

// ── Request permission + get FCM token ────────────────────────────────────────
export async function requestFCMPermission(): Promise<string | null> {
  if (!messaging) {
    console.warn("FCM not available")
    return null
  }

  try {
    const permission = await Notification.requestPermission()
    if (permission !== "granted") {
      console.log("Notification permission denied")
      return null
    }

    // Register service worker first
    const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js")

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    })

    if (token) {
      await saveFCMToken(token)
      return token
    }

    return null
  } catch (err) {
    console.error("FCM token error:", err)
    return null
  }
}

// ── Hook: initialise FCM + handle foreground messages ────────────────────────
export function useFCM(onForegroundMessage?: (payload: any) => void) {
  useEffect(() => {
    if (!messaging) return

    // Handle messages when app is in foreground
    const unsubscribe = onMessage(messaging, (payload) => {
      console.log("FCM foreground message:", payload)

      // Play sound
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
        ;[523, 659, 784, 1047].forEach((freq, i) => {
          const osc = ctx.createOscillator(), gain = ctx.createGain()
          osc.connect(gain); gain.connect(ctx.destination)
          osc.frequency.value = freq; osc.type = "sine"
          gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.15)
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.4)
          osc.start(ctx.currentTime + i * 0.15)
          osc.stop(ctx.currentTime + i * 0.15 + 0.4)
        })
      } catch (e) {}

      // Show in-app notification as browser notification
      if (Notification.permission === "granted") {
        new Notification(payload.notification?.title ?? "Praang", {
          body: payload.notification?.body ?? "",
          icon: "/favicon.ico",
          tag: payload.data?.orderId ?? "praang-notification",
        })
      }

      // Call custom handler if provided
      onForegroundMessage?.(payload)
    })

    return unsubscribe
  }, [onForegroundMessage])
}

// ── Send push notification via FCM REST API ───────────────────────────────────
// Call this from your backend / Supabase Edge Function
// This is just a helper to show the shape — actual send needs server-side auth
export function buildFCMPayload(token: string, title: string, body: string, data?: Record<string, string>) {
  return {
    to: token,
    notification: { title, body },
    data: data ?? {},
  }
}
