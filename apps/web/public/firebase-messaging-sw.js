/* eslint-disable no-undef */
// ============================================================
// CargoNepal — FCM background service worker (spec §29)
// ============================================================
// Handles push when the app is in the background. Firebase config is
// injected at build time via the VITE_FIREBASE_* env vars; the values
// below are replaced by the build (see scripts/inject-sw.mjs). For
// local dev without Firebase, this file is inert.
// ============================================================

importScripts("https://www.gstatic.com/firebasejs/10.14.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.0/firebase-messaging-compat.js");

// __FIREBASE_CONFIG__ is replaced during build; fallback keeps SW valid.
const firebaseConfig = self.__FIREBASE_CONFIG__ || {
  apiKey: "REPLACE_AT_BUILD",
  authDomain: "REPLACE_AT_BUILD",
  projectId: "REPLACE_AT_BUILD",
  messagingSenderId: "REPLACE_AT_BUILD",
  appId: "REPLACE_AT_BUILD",
};

try {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    const title = payload.notification?.title || "CargoNepal";
    const options = {
      body: payload.notification?.body || "",
      icon: "/favicon.svg",
      badge: "/favicon.svg",
      data: payload.data || {},
    };
    self.registration.showNotification(title, options);
  });

  self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const data = event.notification.data || {};
    const target = data.screen === "tracking" && data.order_id
      ? `/customer/orders/${data.order_id}`
      : data.audience === "rider" ? "/rider" : data.audience === "admin" ? "/admin" : "/customer";
    event.waitUntil(clients.openWindow(target));
  });
} catch (e) {
  console.warn("FCM SW not initialized:", e);
}
