// Install: take control without waiting
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// Activate: claim control of all clients immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
