/* 노가다 현장 합동 비서실 — 새 무전 알림용 서비스 워커
   안드로이드 크롬은 페이지에서 new Notification() 을 막아 두어서,
   알림 팝업은 이 워커의 showNotification() 으로 띄웁니다. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

/* 알림을 누르면 열려 있는 비서실 창으로 돌아갑니다. 없으면 새로 엽니다. */
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    try {
      const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const c of list) {
        if ('focus' in c) { await c.focus(); return; }
      }
      if (self.clients.openWindow) await self.clients.openWindow('./');
    } catch (e) {}
  })());
});
