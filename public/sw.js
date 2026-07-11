/// <reference lib="webworker" />

// Homehub Push Notification Service Worker

self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {}
  const title = data.title ?? "Homehub"
  const options = {
    body: data.body ?? "You have a maintenance task due.",
    icon: "/icon-192.png",
    badge: "/favicon-32.png",
    tag: data.tag ?? "homehub-notification",
    data: { url: data.url ?? "/" },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const url = event.notification.data?.url ?? "/"
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      return self.clients.openWindow(url)
    })
  )
})
