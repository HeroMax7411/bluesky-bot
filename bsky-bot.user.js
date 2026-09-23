// ==UserScript==
// @name         بوت إدارة بلو سكاي v1.0.6 PRO
// @namespace    https://github.com/HeroMax7411/bluesky-bot
// @version      1.0.6
// @description  بوت إدارة بلو سكاي الاحترافي - مقسّم على ملفات
// @author       Sayed Alhlwani
// @homepageURL  https://sayedalhlwani.blogspot.com/
// @supportURL   https://github.com/HeroMax7411/bluesky-bot/issues
// @updateURL    https://raw.githubusercontent.com/HeroMax7411/bluesky-bot/main/bsky-bot.user.js
// @downloadURL  https://raw.githubusercontent.com/HeroMax7411/bluesky-bot/main/bsky-bot.user.js
// @match        https://bsky.app/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=bsky.app
// @grant        GM_setClipboard
// @grant        GM_download
// @grant        GM_notification
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      api.open-meteo.com
// @connect      bsky.social
// @connect      api.github.com
// @connect      raw.githubusercontent.com
// @require      https://raw.githubusercontent.com/HeroMax7411/bluesky-bot/main/src/core.js
// @require      https://raw.githubusercontent.com/HeroMax7411/bluesky-bot/main/src/dom.js
// @require      https://raw.githubusercontent.com/HeroMax7411/bluesky-bot/main/src/actions.js
// @require      https://raw.githubusercontent.com/HeroMax7411/bluesky-bot/main/src/ui.js
// @require      https://raw.githubusercontent.com/HeroMax7411/bluesky-bot/main/src/update.js
// @run-at       document-end
// @noframes
// ==/UserScript==

(function () {
    'use strict';

    const NS = window.__BSKY;
    if (!NS) {
        console.error('❌ فشل تحميل ملفات البوت');
        alert('❌ فشل تحميل ملفات البوت - تحقق من الاتصال بالإنترنت');
        return;
    }
    if (NS.version !== '1.0.6') {
        console.warn('⚠️ نسخة قديمة محمّلة');
    }

    // بدء التشغيل
    setTimeout(() => {
        NS.createDashboard();
        NS.botLoop();
        NS.autoCheckUpdate();  

    }, 2000);

    window.addEventListener('beforeunload', () => {
        NS.loopGeneration++;
        NS.stopKeepAlive();
    });

    console.log('✅ بوت بلو سكاي v1.0.6 جاهز');
})();
