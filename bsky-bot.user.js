// ==UserScript==
// @name         بوت إدارة بلو سكاي v1.0.6 PRO
// @name:en      Bluesky Bot Manager v1.0.6 PRO
// @namespace    https://github.com/HeroMax7411/bluesky-bot
// @version      1.0.7
// @description  بوت إدارة بلو سكاي الاحترافي - 30 ميزة متقدمة + دعم عربي كامل
// @description:en Professional Bluesky bot - 30 advanced features + full Arabic support
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

    /* ══════════════════════════════════════════════════
       الملف الرئيسي — يُثبَّت من:
       https://raw.githubusercontent.com/HeroMax7411/bluesky-bot/main/bsky-bot.user.js
       
       يعتمد على 5 ملفات في src/:
       - core.js      (الأساسيات + الحالة + الأخطاء)
       - dom.js       (أدوات DOM + كشف الأزرار)
       - actions.js   (الإجراءات + النشر + الجلسة)
       - ui.js        (اللوحة + الحلقة الرئيسية)
       - update.js    (نظام التحديث التلقائي)
    ══════════════════════════════════════════════════ */

    // التحقق من تحميل كل الملفات
    const NS = window.__BSKY;
    if (!NS) {
        console.error('❌ فشل تحميل ملفات البوت - تحقق من اتصالك بالإنترنت');
        console.error('الملفات المطلوبة:');
        console.error('  - src/core.js');
        console.error('  - src/dom.js');
        console.error('  - src/actions.js');
        console.error('  - src/ui.js');
        console.error('  - src/update.js');
        return;
    }

    // تحقق من الإصدار
    if (NS.version !== '1.0.6') {
        console.warn(`⚠️ تحذير: نسخة غير متطابقة`);
        console.warn(`   المتوقع: 1.0.6`);
        console.warn(`   المحمّل: ${NS.version}`);
        console.warn(`   قد تحتاج لمسح الكاش وإعادة التحميل.`);
    }

    // تحقق من تحميل الدوال الأساسية
    const requiredFunctions = [
        'createDashboard',
        'botLoop',
        'autoCheckUpdate',
        'checkForUpdate',
        'doCleanupNonFollowers',
        'doFollowBack',
        'doAutoLike',
        'doAutoFollow'
    ];
    
    const missing = requiredFunctions.filter(fn => typeof NS[fn] !== 'function');
    if (missing.length > 0) {
        console.error('❌ دوال مفقودة:', missing.join(', '));
        console.error('قد تحتاج لإعادة تحميل جميع ملفات src/');
        return;
    }

    console.log('✅ جميع الملفات محمّلة بنجاح');

    /* ════════════════ بدء التشغيل ════════════════ */
    setTimeout(() => {
        try {
            NS.createDashboard();
            NS.botLoop();
            NS.autoCheckUpdate();  // فحص التحديثات كل 24 ساعة
            console.log(`🚀 بوت بلو سكاي v${NS.version} جاهز للعمل`);
            console.log('💡 اضغط Shift+B لإظهار/إخفاء اللوحة');
        } catch (e) {
            console.error('❌ فشل بدء التشغيل:', e);
            NS.captureError(e, 'startup');
        }
    }, 2000);

    /* ════════════════ إغلاق نظيف ════════════════ */
    window.addEventListener('beforeunload', () => {
        try {
            NS.loopGeneration++;
            NS.stopKeepAlive();
        } catch (e) {}
    });

    /* ════════════════ اختصار Shift+B ════════════════ */
    // (موجود أيضاً في ui.js كاحتياطي)
    document.addEventListener('keydown', function (e) {
        if (e.shiftKey && e.key && e.key.toLowerCase() === 'b') {
            const panel = document.getElementById(NS.PANEL_ID);
            const mini = document.getElementById(NS.PANEL_ID + '-mini');
            if (!panel || !mini) return;
            const vis = panel.style.display !== 'none';
            panel.style.display = vis ? 'none' : 'flex';
            mini.style.display = vis ? 'flex' : 'none';
            NS.state.collapsed = vis;
            NS.saveSettings();
        }
    });

})();
