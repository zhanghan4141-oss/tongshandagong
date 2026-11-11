/* =========================================================
 * 通山打拱 · 最小化 Service Worker
 *
 * 仅用于满足 Android Chrome 的 PWA「可安装性」判定（须有 fetch 事件处理器），
 * 不做任何缓存、不 respondWith —— 所有请求仍走浏览器默认网络路径，
 * 避免干扰 Socket.IO 长连接、/api/* 接口与版本更新（静态资源已用 ?v= 版本号破缓存）。
 * ========================================================= */
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => { self.clients.claim(); });
self.addEventListener('fetch', () => { /* 空处理：浏览器默认网络行为 */ });
