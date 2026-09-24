// ==UserScript==
// @name         بوت إدارة بلو سكاي v1.0.15 PRO
// @name:en      Bluesky Bot Manager v1.0.15 PRO
// @namespace    https://github.com/HeroMax7411/bluesky-bot
// @version      1.0.15
// @description  بوت إدارة بلو سكاي الاحترافي - رد تلقائي على أي محتوى + 30 ميزة
// @description:en Professional Bluesky bot - auto reply on any content + 30 features
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
// @run-at       document-end
// @noframes
// ==/UserScript==

/* ══════════════════════════════════════════════════════════════════
   v1.0.15 — إصلاح شامل: كل الصفحات تعمل (Home / Notifications / Messages)
   ══════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════
   src/core.js — الأساسيات
   ═══════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    if (window.__BSKY && window.__BSKY.version === '1.0.15') return;

    const NS = window.__BSKY = window.__BSKY || {};

    NS.version = '1.0.15';
    NS.GITHUB_REPO = 'HeroMax7411/bluesky-bot';
    NS.GITHUB_ISSUES_URL = `https://github.com/${NS.GITHUB_REPO}/issues/new`;
    NS.DEV_URL = 'https://sayedalhlwani.blogspot.com/';
    NS.DONATE_URL = 'https://ko-fi.com/heromax7411';
    NS.APP_PASSWORD_URL = 'https://bsky.app/settings/app-passwords';

    NS.STORAGE_KEY = 'bsky_bot_v75_settings';
    NS.STATS_KEY = 'bsky_bot_v75_stats';
    NS.PROFILES_KEY = 'bsky_bot_v75_profiles';
    NS.ERROR_LOG_KEY = 'bsky_bot_error_log_v1';
    NS.PANEL_ID = 'bsky-bot-v75';

    /* مخزن المرفقات (لا يُحفظ في localStorage) */
    NS.mediaBlobs = new Map();
    NS.MAX_MEDIA_BLOBS = 10;

    /* جلسات لكل حساب */
    NS.accountSessions = NS.accountSessions || {};

    /* ════════════════ أدوات ════════════════ */
    NS.sleep = ms => new Promise(r => setTimeout(r, ms));
    NS.rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
    NS.todayStr = () => new Date().toISOString().slice(0, 10);
    NS.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
        c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

    NS.notify = function (title, text) {
        try {
            if (typeof GM_notification === 'function') {
                GM_notification({ title, text, timeout: 4000 });
            }
        } catch (e) {}
    };

    /* ════════════════ التشفير ════════════════ */
    const XOR_KEY = 'bsky-v75-pro-key-2026';
    const strToU8 = str => new TextEncoder().encode(str);
    const u8ToStr = u8 => new TextDecoder().decode(u8);
    const u8ToB64 = u8 => {
        let bin = '';
        for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
        return btoa(bin);
    };
    const b64ToU8 = b64 => {
        const bin = atob(b64);
        const u8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        return u8;
    };

    NS.encrypt = function (text) {
        if (!text) return '';
        try {
            const bytes = strToU8(text);
            const keyBytes = strToU8(XOR_KEY);
            const out = new Uint8Array(bytes.length);
            for (let i = 0; i < bytes.length; i++) out[i] = bytes[i] ^ keyBytes[i % keyBytes.length];
            return 'ENC:' + u8ToB64(out);
        } catch (e) { return text; }
    };

    NS.decrypt = function (enc) {
        if (!enc || !enc.startsWith('ENC:')) return enc || '';
        try {
            const bytes = b64ToU8(enc.slice(4));
            const keyBytes = strToU8(XOR_KEY);
            const out = new Uint8Array(bytes.length);
            for (let i = 0; i < bytes.length; i++) out[i] = bytes[i] ^ keyBytes[i % keyBytes.length];
            return u8ToStr(out);
        } catch (e) { return ''; }
    };

    /* ════════════════ الأخطاء ════════════════ */
    let errorLog = [];
    try {
        errorLog = JSON.parse(localStorage.getItem(NS.ERROR_LOG_KEY) || '[]');
        if (!Array.isArray(errorLog)) errorLog = [];
    } catch (e) { errorLog = []; }
    NS.errorLog = errorLog;

    NS.saveErrorLog = function () {
        try {
            NS.errorLog = NS.errorLog.slice(-50);
            localStorage.setItem(NS.ERROR_LOG_KEY, JSON.stringify(NS.errorLog));
        } catch (e) {}
    };

    NS.captureError = function (err, context) {
        try {
            const entry = {
                t: Date.now(), version: NS.version,
                message: 'Unknown', stack: '',
                context: String(context || '').slice(0, 200),
                url: (location.href || '').slice(0, 200),
                handle: (NS.state && NS.state.myHandle) || ''
            };
            if (err) {
                try { entry.message = String(err.message || err).slice(0, 500); } catch (e) {}
                try { entry.stack = String(err.stack || '').slice(0, 1500); } catch (e) {}
            }
            NS.errorLog.push(entry);
            NS.saveErrorLog();
            console.error('🔴 خطأ:', entry);
        } catch (f) {}
    };

    const IGNORED_ERRORS = [
        'Script error', 'ResizeObserver loop', 'Non-Error promise rejection',
        'Load failed', 'NetworkError', 'Failed to fetch', 'AbortError',
        'Cannot read properties of undefined', 'is not a function',
        'Extension context invalidated', 'message channel closed',
        'A listener indicated an asynchronous response'
    ];

    const isIgnoredError = msg => !msg ? false : IGNORED_ERRORS.some(ig => String(msg).includes(ig));

    const isFromOurScript = err => {
        try {
            const stack = String((err && err.stack) || '');
            if (!stack) return false;
            return /__BSKY|bsky-bot|userscript|at NS\./.test(stack);
        } catch (e) { return false; }
    };

    window.addEventListener('error', ev => {
        try {
            let errObj = ev && ev.error ? ev.error : (ev && ev.message ? new Error(String(ev.message)) : null);
            if (!errObj) return;
            const msg = String(errObj.message || errObj);
            if (isIgnoredError(msg) || !isFromOurScript(errObj)) return;
            NS.captureError(errObj, 'global error');
        } catch (e) {}
    }, true);

    window.addEventListener('unhandledrejection', ev => {
        try {
            if (!ev || !ev.reason) return;
            const msg = String((ev.reason && ev.reason.message) || ev.reason);
            if (isIgnoredError(msg) || !isFromOurScript(ev.reason)) return;
            NS.captureError(ev.reason, 'unhandled rejection');
        } catch (e) {}
    }, true);

    NS.renderErrorTab = function () {
        const c = document.getElementById('b11-error-count');
        if (c) c.innerHTML = `📊 عدد الأخطاء: <b style="color:#ef4444">${NS.errorLog.length}</b>`;
        const l = document.getElementById('b11-error-list');
        if (!l) return;
        if (!NS.errorLog.length) {
            l.innerHTML = '<div style="color:#22c55e;text-align:center;padding:10px;">✅ لا توجد أخطاء</div>';
            return;
        }
        l.innerHTML = NS.errorLog.slice(-20).reverse().map(e => `
            <div style="background:#1a0f0f;padding:6px;border-radius:4px;margin:4px 0;border-right:3px solid #ef4444;">
                <div style="color:#fbbf24;font-size:10px;">${new Date(e.t).toLocaleTimeString('ar-EG')}</div>
                <div style="color:#fca5a5;margin:3px 0;word-break:break-all;font-size:10px;">${NS.esc(e.message.slice(0, 120))}</div>
            </div>
        `).join('');
    };

    NS.reportErrorToGitHub = function () {
        const errors = NS.errorLog.slice(-5);
        if (!errors.length) { alert('✅ لا توجد أخطاء'); return; }
        const title = encodeURIComponent(`[Bug] v${NS.version} - ${errors[0].message.slice(0, 60)}`);
        const body = encodeURIComponent(
            `## 🐛 تقرير خطأ\n\n**الإصدار:** v${NS.version}\n**التاريخ:** ${new Date().toLocaleString('ar-EG')}\n**الحساب:** ${NS.state.myHandle}\n\n---\n\n` +
            errors.map((e, i) => `### خطأ #${i + 1}\n- **الرسالة:** \`${e.message}\`\n- **السياق:** ${e.context}\n${e.stack ? `- **Stack:**\n\`\`\`\n${e.stack}\n\`\`\`` : ''}`).join('\n\n')
        );
        window.open(`${NS.GITHUB_ISSUES_URL}?title=${title}&body=${body}&labels=bug`, '_blank');
    };

    NS.exportErrorLog = function () {
        const blob = new Blob([JSON.stringify(NS.errorLog, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `bsky-errors-${NS.todayStr()}.json`;
        a.click();
    };

    NS.clearErrorLog = function () {
        if (!confirm('مسح جميع الأخطاء؟')) return;
        NS.errorLog = [];
        NS.saveErrorLog();
        NS.renderErrorTab();
    };

    /* ════════════════ الحالة الافتراضية ════════════════ */
    NS.defaultState = {
        autoLike: false, autoFollow: false, autoUnfollow: false, autoReply: false,
        autoFollowBack: false, autoLikeCommenters: false, autoReplyNotifications: false,
        autoReplyMessages: false, autoRepost: false,

        navEnabled: true,
        navPages: ['/', '/notifications', '/messages'],
        navStayMin: 3, navStayMax: 6,

        messageReplyText: "شكراً على رسالتك! سأرد عليك قريباً 🙏\nأهلاً بك! كيف يمكنني مساعدتك؟",
        customReplyText: "منشور رائع! ✨\nتفاعل جميل 🌟\nشكراً على المشاركة 🙏",
        replyTextOnly: "منشور رائع! ✨\nكلام جميل 🌟\nGreat post! 👍",
        replyWithImage: "صورة جميلة! 📸\nإبداع رائع! 🎨\nNice shot! 📷",
        repostKeywords: "",

        blacklistWords: "spam\ncrypto\nnft\nاعلانات",
        keywordFilter: "",
        useKeywordFilter: false,
        skipNoAvatar: false,
        onlyArabic: false,
        languageFilter: "",

        scheduleEnabled: false,
        scheduleStart: 9, scheduleEnd: 23,

        dailyLimitsEnabled: false,
        dailyLimitLikes: 1000, dailyLimitFollows: 500, dailyLimitReplies: 500,
        dailyLimitMessages: 100, dailyLimitPosts: 10, dailyLimitReposts: 50,
        dailyLimitFollows21: 50,
        dailyCounters: {},

        humanBreakEnabled: true,
        humanBreakEveryMin: 15, humanBreakEveryMax: 25,
        breakDurationMin: 3, breakDurationMax: 7,
        actionCounter: 0,

        scheduledPosts: [],
        blueskyAppPassword: '',
        encryptPasswords: true,

        useTemplateVars: false,
        calendarEnabled: false,
        calendar: { sun: "", mon: "", tue: "", wed: "", thu: "", fri: "", sat: "" },
        sentimentAnalysis: false,
        trackUnfollowers: true,
        knownFollowers: [],
        followEngagers: false,
        engagerQueue: [],
        engagerAttempts: {},
        weatherPosts: false, weatherCity: "Cairo",
        lastWeatherCheck: 0,
        weatherLat: 30.0444, weatherLon: 31.2357,
        abTesting: false, replyPerf: {},
        autoHashtags: false,
        hashtagMap: "تصوير:photography,art\nبرمجة:javascript,coding\nرياضة:sports",
        defaultHashtags: "",
        worldEvents: false,
        mlPreferences: false, actionPerf: {},

        autoUpdateCheck: true,

        likeRatio: 100, followRatio: 100,
        dryRun: true,
        rateLimitPerMin: 8,
        paused: false,
        processedLikes: [], processedFollows: [], processedFollowBacks: [],
        processedCommentLikes: [], processedNotifReplies: [], processedMessages: [],
        processedReposts: [], processedPosts: [],
        unfollowedUsers: [], activityLog: [],
        theme: 'dark', autoScroll: true,
        resetMemoryEveryMin: 60,
        stuckThreshold: 3,
        fastCycleMs: 4000,
        lastClickResult: '',
        myHandle: '',
        panelSize: { w: 400, h: 600 },
        collapsed: false,
    };

    /* ════════════════ تحميل الحالة ════════════════ */
    let savedRaw = null;
    try { savedRaw = localStorage.getItem(NS.STORAGE_KEY); } catch (e) {}
    let savedObj = {};
    try { savedObj = JSON.parse(savedRaw || '{}') || {}; } catch (e) {}
    NS.state = Object.assign({}, NS.defaultState, savedObj);

    if (savedRaw === null) NS.state.collapsed = false;

    window.__bskyState = NS.state;

    ['unfollowedUsers','processedLikes','processedFollows','processedFollowBacks',
     'processedCommentLikes','processedNotifReplies','processedMessages','processedReposts',
     'processedPosts','activityLog','scheduledPosts','knownFollowers','engagerQueue']
        .forEach(k => { if (!Array.isArray(NS.state[k])) NS.state[k] = []; });

    ['dailyCounters','replyPerf','actionPerf','engagerAttempts','calendar','panelSize']
        .forEach(k => { if (!NS.state[k] || typeof NS.state[k] !== 'object') NS.state[k] = k === 'calendar' ? Object.assign({}, NS.defaultState.calendar) : (k === 'panelSize' ? { w: 400, h: 600 } : {}); });

    /* ════════════════ الإحصائيات ════════════════ */
    NS.stats = JSON.parse(localStorage.getItem(NS.STATS_KEY) || 'null') || {
        likes: 0, follows: 0, unfollows: 0, replies: 0, followBacks: 0,
        commentLikes: 0, notifReplies: 0, messageReplies: 0, posts: 0,
        reposts: 0, engagerFollows: 0, history: []
    };
    if (!Array.isArray(NS.stats.history)) NS.stats.history = [];

    NS.profiles = JSON.parse(localStorage.getItem(NS.PROFILES_KEY) || '[]');
    if (!Array.isArray(NS.profiles)) NS.profiles = [];
    NS.activeProfileIdx = 0;

    /* ════════════════ متغيرات عامة ════════════════ */
    NS.loopGeneration = 0;
    NS.activeLoopId = null;
    NS.lastMemoryReset = Date.now();
    NS.cyclesWithoutAction = 0;
    NS.actionTimestamps = [];
    NS.scrollCache = { el: null, ts: 0, path: '' };
    NS.cachedWeather = null;
    NS.sessionCache = { accessJwt: null, refreshJwt: null, did: null, expiresAt: 0 };
    NS.handleDetectionAttempts = 0;
    NS.pageArrivedAt = Date.now();

    /* ════════════════ الحفظ ════════════════ */
    let saveScheduled = false;

    NS.saveSettings = function () {
        if (saveScheduled) return;
        saveScheduled = true;
        setTimeout(NS.forceSaveSettings, 400);
    };

    NS.forceSaveSettings = function () {
        saveScheduled = false;
        ['processedLikes','processedFollows','processedFollowBacks','processedCommentLikes',
         'processedNotifReplies','processedMessages','processedReposts','processedPosts','engagerQueue']
            .forEach(k => { if (Array.isArray(NS.state[k])) NS.state[k] = NS.state[k].slice(-2000); });
        if (Array.isArray(NS.state.unfollowedUsers)) NS.state.unfollowedUsers = NS.state.unfollowedUsers.slice(-300);
        if (Array.isArray(NS.state.activityLog)) NS.state.activityLog = NS.state.activityLog.slice(-500);
        if (Array.isArray(NS.state.knownFollowers)) NS.state.knownFollowers = NS.state.knownFollowers.slice(-2000);

        if (Array.isArray(NS.state.scheduledPosts)) {
            NS.state.scheduledPosts = NS.state.scheduledPosts.map(p => {
                const copy = {};
                for (const k in p) { if (k !== 'mediaBlob') copy[k] = p[k]; }
                return copy;
            }).slice(-100);
        }
        try { localStorage.setItem(NS.STORAGE_KEY, JSON.stringify(NS.state)); } catch (e) {}
    };

    NS.saveStats = function () {
        NS.stats.history = NS.stats.history.slice(-90);
        try { localStorage.setItem(NS.STATS_KEY, JSON.stringify(NS.stats)); } catch (e) {}
    };

    NS.saveProfiles = function () {
        try { localStorage.setItem(NS.PROFILES_KEY, JSON.stringify(NS.profiles)); } catch (e) {}
    };

    NS.bumpStat = function (key, inc) {
        inc = inc || 1;
        NS.stats[key] = (NS.stats[key] || 0) + inc;
        const t = NS.todayStr();
        let day = NS.stats.history.find(h => h.d === t);
        if (!day) {
            day = { d: t, likes: 0, follows: 0, unfollows: 0, replies: 0, followBacks: 0,
                    commentLikes: 0, notifReplies: 0, messageReplies: 0, posts: 0,
                    reposts: 0, engagerFollows: 0 };
            NS.stats.history.push(day);
        }
        day[key] = (day[key] || 0) + inc;
        NS.saveStats();
        NS.updateStatsUI();
        if (NS.state.mlPreferences) NS.trackActionPerf(key);
    };

    NS.trackActionPerf = function (key) {
        const hour = new Date().getHours();
        if (!NS.state.actionPerf[key]) NS.state.actionPerf[key] = {};
        NS.state.actionPerf[key][hour] = (NS.state.actionPerf[key][hour] || 0) + 1;
        NS.saveSettings();
    };

    NS.getBestHour = function () {
        const totals = {};
        Object.values(NS.state.actionPerf).forEach(hours => {
            Object.entries(hours).forEach(([h, c]) => { totals[h] = (totals[h] || 0) + c; });
        });
        let best = 0, bestCount = 0;
        for (let h = 0; h < 24; h++) {
            if ((totals[h] || 0) > bestCount) { bestCount = totals[h]; best = h; }
        }
        return { hour: best, count: bestCount };
    };

    let logDirty = false, logRenderScheduled = false;
    NS.pushLog = function (type, detail) {
        NS.state.activityLog.push({ t: Date.now(), type, detail });
        NS.saveSettings();
        logDirty = true;
        if (!logRenderScheduled) {
            logRenderScheduled = true;
            requestAnimationFrame(() => {
                logRenderScheduled = false;
                const pane = document.querySelector('.b11-pane[data-p="log"]');
                if (logDirty && pane && pane.style.display !== 'none') {
                    logDirty = false;
                    NS.renderLog();
                }
            });
        }
    };

    NS.rateCheck = function () {
        const now = Date.now();
        NS.actionTimestamps = NS.actionTimestamps.filter(t => now - t < 60000);
        return NS.actionTimestamps.length < NS.state.rateLimitPerMin;
    };

    NS.rateRecord = function () { NS.actionTimestamps.push(Date.now()); };

    NS.getDailyCounters = function () {
        const today = NS.todayStr();
        if (!NS.state.dailyCounters || NS.state.dailyCounters.date !== today) {
            NS.state.dailyCounters = {
                date: today, likes: 0, follows: 0, replies: 0, messages: 0,
                posts: 0, followBacks: 0, commentLikes: 0, notifReplies: 0,
                reposts: 0, engagerFollows: 0
            };
            NS.forceSaveSettings();
        }
        return NS.state.dailyCounters;
    };

    NS.dailyCheck = function (key) {
        if (!NS.state.dailyLimitsEnabled) return true;
        const c = NS.getDailyCounters();
        const limits = {
            likes: NS.state.dailyLimitLikes, follows: NS.state.dailyLimitFollows,
            replies: NS.state.dailyLimitReplies, messages: NS.state.dailyLimitMessages,
            posts: NS.state.dailyLimitPosts, reposts: NS.state.dailyLimitReposts,
            engagerFollows: NS.state.dailyLimitFollows21,
        };
        return (c[key] || 0) < (limits[key] || Infinity);
    };

    NS.dailyIncrement = function (key, inc) {
        const c = NS.getDailyCounters();
        c[key] = (c[key] || 0) + (inc || 1);
        NS.forceSaveSettings();
    };

    NS.isWithinSchedule = function () {
        if (!NS.state.scheduleEnabled) return true;
        const h = new Date().getHours();
        const s = Number(NS.state.scheduleStart) || 0;
        const e = Number(NS.state.scheduleEnd) || 24;
        return s <= e ? (h >= s && h < e) : (h >= s || h < e);
    };

    let keepAliveWorker = null, keepAliveURL = null;
    NS.startKeepAlive = function () {
        try {
            if (keepAliveWorker) return;
            const blob = new Blob(['setInterval(()=>postMessage("p"),30000)'], { type: 'text/javascript' });
            keepAliveURL = URL.createObjectURL(blob);
            keepAliveWorker = new Worker(keepAliveURL);
            keepAliveWorker.onmessage = () => {};
        } catch (e) {}
    };
    NS.stopKeepAlive = function () {
        try {
            if (keepAliveWorker) { keepAliveWorker.terminate(); keepAliveWorker = null; }
            if (keepAliveURL) { URL.revokeObjectURL(keepAliveURL); keepAliveURL = null; }
        } catch (e) {}
    };
    NS.startKeepAlive();

    NS.sleepGen = async function (ms, myGen) {
        const end = Date.now() + ms;
        while (Date.now() < end) {
            if (myGen !== undefined && myGen !== NS.loopGeneration) return false;
            await NS.sleep(Math.min(150, end - Date.now()));
        }
        return true;
    };

    console.log(`📦 core.js محمّل - v${NS.version}`);
})();


/* ═══════════════════════════════════════════════════════════
   src/dom.js — أدوات DOM
   ═══════════════════════════════════════════════════════════ */
(function () {
    'use strict';
    const NS = window.__BSKY;
    if (!NS) { console.error('❌ dom.js'); return; }

    NS.isArabicText = function (text) {
        if (!text) return false;
        const arabic = (text.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g) || []).length;
        const total = text.replace(/[^a-zA-Z\u0600-\u06FF]/g, '').length;
        return total > 0 && (arabic / total) > 0.3;
    };

    NS.matchesLanguage = function (text) {
        if (!NS.state.languageFilter || !NS.state.languageFilter.trim()) return true;
        const l = NS.state.languageFilter.trim().toLowerCase();
        if (l === 'ar' || l === 'arabic' || l === 'عربي') return NS.isArabicText(text);
        return true;
    };

    NS.parseList = s => String(s || '').split(/[\n,،]/).map(w => w.trim().toLowerCase()).filter(Boolean);

    NS.containsBlacklisted = function (text) {
        const list = NS.parseList(NS.state.blacklistWords);
        if (!list.length) return false;
        const low = String(text || '').toLowerCase();
        return list.some(w => low.includes(w));
    };

    NS.matchesKeywords = function (text) {
        if (!NS.state.useKeywordFilter) return true;
        const list = NS.parseList(NS.state.keywordFilter);
        if (!list.length) return true;
        const low = String(text || '').toLowerCase();
        return list.some(w => low.includes(w));
    };

    NS.hasAvatar = function (container) {
        if (!container) return false;
        for (const img of container.querySelectorAll('img')) {
            const src = img.getAttribute('src') || '';
            if (!src || src.includes('default-avatar') || src.includes('/default')) continue;
            if (/avatar/i.test(src)) return true;
        }
        return false;
    };

    NS.postHasImage = function (container) {
        if (!container) return false;
        return container.querySelectorAll('img[src*="cdn.bsky.app"], img[src*="bsky"]').length > 0;
    };

    NS.postHasVideo = function (container) {
        if (!container) return false;
        return container.querySelectorAll('video').length > 0;
    };

    const POSITIVE_WORDS = ['رائع','جميل','ممتاز','شكراً','شكرا','أحب','حب','سعيد','فرح','مبدع','إبداع','تحفة','Nice','great','love','amazing','awesome','happy','good'];
    const NEGATIVE_WORDS = ['سيء','حزين','غاضب','كره','مؤلم','فاشل','صعب','سيئة','terrible','sad','angry','hate','awful','bad'];

    NS.analyzeSentiment = function (text) {
        if (!text) return 'neutral';
        const low = text.toLowerCase();
        let pos = 0, neg = 0;
        POSITIVE_WORDS.forEach(w => { if (low.includes(w.toLowerCase())) pos++; });
        NEGATIVE_WORDS.forEach(w => { if (low.includes(w.toLowerCase())) neg++; });
        if (pos > neg) return 'positive';
        if (neg > pos) return 'negative';
        return 'neutral';
    };

    NS.applyTemplateVars = function (template, ctx) {
        if (!NS.state.useTemplateVars) return template;
        return template
            .replace(/\{name\}/g, ctx.name || 'صديقي')
            .replace(/\{handle\}/g, ctx.handle || '')
            .replace(/\{post\}/g, (ctx.post || '').slice(0, 60))
            .replace(/\{time\}/g, new Date().toLocaleTimeString('ar-EG'))
            .replace(/\{date\}/g, NS.todayStr());
    };

    /* ✅ الهاشتاجات: ثابتة + كلمات مفتاحية + بدون تكرار */
    NS.generateHashtags = function (text) {
        if (!NS.state.autoHashtags) return '';
        const found = new Set();

        String(NS.state.defaultHashtags || '')
            .split(/[\s,،]+/).map(t => t.trim().replace(/^#/, '')).filter(Boolean)
            .forEach(t => found.add(t));

        const map = {};
        String(NS.state.hashtagMap || '').split('\n').forEach(line => {
            const idx = line.indexOf(':');
            if (idx === -1) return;
            const kw = line.slice(0, idx).trim().toLowerCase();
            const tags = line.slice(idx + 1);
            if (kw && tags) map[kw] = tags.split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean);
        });
        const low = String(text || '').toLowerCase();
        for (const [kw, tags] of Object.entries(map)) {
            if (low.includes(kw)) tags.forEach(t => found.add(t));
        }
        return Array.from(found).slice(0, 10).map(t => '#' + t).join(' ');
    };

    NS.appendHashtags = function (text) {
        if (!NS.state.autoHashtags) return text;
        const tags = NS.generateHashtags(text);
        if (!tags) return text;
        const existing = (text.match(/#[\w\u0600-\u06FF]+/g) || []).map(t => t.toLowerCase());
        const toAdd = tags.split(' ').filter(t => t && !existing.includes(t.toLowerCase()));
        return toAdd.length ? text + ' ' + toAdd.join(' ') : text;
    };

    NS.getWorldEvent = function () {
        if (!NS.state.worldEvents) return '';
        const now = new Date();
        const m = now.getMonth() + 1, d = now.getDate();
        const events = {
            '1-1': '🎉 سنة جديدة سعيدة!', '3-21': '🌸 عيد الأم', '5-1': '👷 عيد العمال',
            '6-1': '👶 عيد الطفولة', '7-23': '🇪🇬 عيد ثورة يوليو',
            '10-6': '🎖️ ذكرى أكتوبر', '12-25': '🎄 عيد الميلاد',
        };
        return events[`${m}-${d}`] || '';
    };

    NS.fetchWeather = async function () {
        if (!NS.state.weatherPosts) return null;
        if (NS.cachedWeather && Date.now() - NS.state.lastWeatherCheck < 3600000) return NS.cachedWeather;
        try {
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${NS.state.weatherLat}&longitude=${NS.state.weatherLon}&current=temperature_2m,weather_code`;
            const res = await fetch(url);
            const data = await res.json();
            const temp = data.current && data.current.temperature_2m;
            const code = data.current && data.current.weather_code;
            NS.cachedWeather = { temp, code, desc: NS.weatherCodeToArabic(code) };
            NS.state.lastWeatherCheck = Date.now();
            NS.forceSaveSettings();
            return NS.cachedWeather;
        } catch (e) { return null; }
    };

    NS.weatherCodeToArabic = function (code) {
        const m = { 0:'صافٍ ☀️',1:'صافٍ جزئياً 🌤️',2:'غائم جزئياً ⛅',3:'غائم ☁️',45:'ضباب 🌫️',
            48:'ضباب متجمد 🌫️',51:'رذاذ 🌦️',61:'مطر 🌧️',63:'مطر متوسط 🌧️',65:'مطر غزير ⛈️',
            71:'ثلج 🌨️',80:'زخات 🌦️',95:'عاصفة رعدية ⛈️' };
        return m[code] || 'معتدل 🌡️';
    };

    NS.getDecryptedPass = function () {
        const p = NS.state.blueskyAppPassword || '';
        return p.startsWith('ENC:') ? NS.decrypt(p) : p;
    };

    NS.setEncryptedPass = function (plain) {
        NS.state.blueskyAppPassword = NS.state.encryptPasswords ? NS.encrypt(plain) : plain;
        NS.forceSaveSettings();
    };

    NS.getPostKey = function (el) {
        const l = el && el.querySelector ? el.querySelector('a[href*="/post/"]') : null;
        return l ? l.getAttribute('href') : ((el && el.innerText) || '').slice(0, 80);
    };

    NS.getHandleFromContainer = function (c) {
        const l = c && c.querySelector ? c.querySelector('a[href^="/profile/"]') : null;
        if (!l) return null;
        return l.getAttribute('href').replace('/profile/', '').split('/')[0];
    };

    NS.isInsidePanel = function (el) {
        if (!el) return false;
        let cur = el;
        while (cur) {
            if (cur.id === NS.PANEL_ID || cur.id === NS.PANEL_ID + '-mini') return true;
            cur = cur.parentElement;
        }
        return false;
    };

    NS.fire = function (btn) {
        if (!btn) return;
        try { btn.click(); } catch (e) {}
        try {
            const r = btn.getBoundingClientRect();
            const opts = { bubbles: true, cancelable: true, view: window,
                clientX: r.left + r.width / 2, clientY: r.top + r.height / 2,
                button: 0, buttons: 1, pointerId: 1 };
            btn.dispatchEvent(new PointerEvent('pointerdown', opts));
            btn.dispatchEvent(new MouseEvent('mousedown', opts));
            btn.dispatchEvent(new PointerEvent('pointerup', opts));
            btn.dispatchEvent(new MouseEvent('mouseup', opts));
        } catch (e) {}
    };

    NS.findComposer = function () {
        const cands = Array.from(document.querySelectorAll(
            'textarea:not([readonly]):not([disabled]), div[contenteditable="true"], [role="textbox"]'
        )).filter(el => {
            if (NS.isInsidePanel(el)) return false;
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
        });
        const tas = cands.filter(el => el.tagName === 'TEXTAREA');
        if (tas.length) return tas[tas.length - 1];
        return cands[cands.length - 1] || null;
    };

    NS.waitForComposer = async function (myGen, timeoutMs) {
        timeoutMs = timeoutMs || 10000;
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            if (myGen !== NS.loopGeneration) return null;
            const ed = NS.findComposer();
            if (ed) return ed;
            await NS.sleep(300);
        }
        return null;
    };

    NS.findComposerSend = function () {
        const btns = Array.from(document.querySelectorAll('button, [role="button"]'))
            .filter(b => !NS.isInsidePanel(b) && b.getBoundingClientRect().width > 0);
        const enabled = btns.filter(b => !b.disabled);
        const pool = enabled.length ? enabled : btns;
        return pool.find(b => {
            const t = (b.innerText || '').trim().toLowerCase();
            const l = (b.getAttribute('aria-label') || '').trim().toLowerCase();
            const tid = (b.getAttribute('data-testid') || '').toLowerCase();
            if (tid === 'composerpublishbtn' || tid === 'publishbutton' || tid === 'composerpublishbutton') return true;
            if (t === 'reply' || t === 'post' || t === 'رد' || t === 'نشر' || t === 'إرسال' || t === 'أرسل') return true;
            if (l === 'reply' || l === 'post' || l === 'send' || l === 'إرسال' || l === 'رد' || l === 'نشر' || l.startsWith('publish')) return true;
            return false;
        }) || null;
    };

    NS.setInputValue = function (el, value) {
        if (!el || value == null) return false;
        el.focus();
        const isEditable = el.getAttribute('contenteditable') === 'true' || el.getAttribute('role') === 'textbox';
        if (isEditable) {
            try {
                const range = document.createRange();
                range.selectNodeContents(el);
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
                document.execCommand('delete', false, null);
                const ok = document.execCommand('insertText', false, value);
                if (!ok || !(el.innerText || '').trim()) {
                    el.textContent = value;
                    el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: value }));
                }
            } catch (e) {
                el.textContent = value;
                el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: value }));
            }
            el.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
            const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
            const setter = Object.getOwnPropertyDescriptor(proto, 'value');
            if (setter && setter.set) setter.set.call(el, value);
            else el.value = value;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        }
        return true;
    };

    NS.findReplyButtons = function () {
        const out = [];
        const btns = document.querySelectorAll('button, [role="button"]');
        for (const b of btns) {
            if (NS.isInsidePanel(b)) continue;
            const r = b.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) continue;
            const tid = (b.getAttribute('data-testid') || '').toLowerCase();
            const aria = (b.getAttribute('aria-label') || '').toLowerCase().trim();
            const txt = (b.innerText || '').trim().toLowerCase();
            if (tid === 'likebtn' || tid === 'unlikebtn' || tid === 'repostbtn' || tid === 'unrepostbtn' ||
                aria.includes('like') || aria.includes('repost') || aria.includes('share') ||
                aria.includes('إعجاب') || aria.includes('إعادة') || aria.includes('مشاركة') ||
                aria.includes('bookmark') || aria.includes('more')) continue;
            const isReply =
                tid === 'replybtn' || tid === 'reply-button' ||
                aria === 'reply' || aria.startsWith('reply ') ||
                aria === 'رد' || aria.startsWith('رد ') ||
                aria.includes('الرد على') || aria.includes('reply to') ||
                txt === 'reply' || txt === 'رد';
            if (isReply) out.push(b);
        }
        return out;
    };

    NS.isFollowButton = function (btn) {
        const tid = (btn.getAttribute('data-testid') || '').toLowerCase();
        if (tid === 'followbtn' || tid === 'follow-button') return true;
        if (tid === 'unfollowbtn' || tid === 'following-button') return false;
        const l = (btn.getAttribute('aria-label') || '').toLowerCase().trim();
        const t = (btn.innerText || '').trim().toLowerCase();
        const tClean = t.replace(/[^\u0600-\u06FFa-z]/gi, '').trim();
        const matchesFollow = t === 'follow' || t === 'follow back' || t.startsWith('follow ') ||
            tClean === 'follow' || tClean === 'followback' || t === 'متابعة' || t === 'متابعة بالمقابل' ||
            tClean === 'متابعة' || tClean === 'متابعةبالمقابل' || t.includes('follow back') ||
            l === 'follow' || l.startsWith('follow ') || l === 'متابعة' || l.includes('follow back');
        const matchesFollowing = t.includes('following') || t.includes('unfollow') ||
            t === 'متابَع' || t.includes('إلغاء المتابعة') ||
            tClean === 'following' || tClean === 'متابع' ||
            l.includes('following') || l.includes('unfollow');
        return matchesFollow && !matchesFollowing;
    };

    NS.isLikeButton = function (btn) {
        const tid = (btn.getAttribute('data-testid') || '').toLowerCase();
        if (tid === 'likebtn') return true;
        if (tid === 'unlikebtn') return false;
        const l = (btn.getAttribute('aria-label') || '').toLowerCase().trim();
        const t = (btn.innerText || '').trim().toLowerCase();
        const has = l === 'like' || l.startsWith('like ') || l.includes('إعجاب') ||
                    t === 'like' || t.includes('إعجاب');
        return has && !l.includes('unlike') && !l.includes('إلغاء');
    };

    NS.isAlreadyLiked = function (btn) {
        const tid = (btn.getAttribute('data-testid') || '').toLowerCase();
        if (tid === 'unlikebtn') return true;
        const l = (btn.getAttribute('aria-label') || '').toLowerCase();
        return l.includes('unlike') || l.includes('إلغاء الإعجاب');
    };

    NS.isAlreadyFollowing = function (btn) {
        const tid = (btn.getAttribute('data-testid') || '').toLowerCase();
        if (tid === 'unfollowbtn' || tid === 'following-button') return true;
        if (tid === 'followbtn' || tid === 'follow-button') return false;
        const l = (btn.getAttribute('aria-label') || '').toLowerCase();
        const t = (btn.innerText || '').trim().toLowerCase();
        const tClean = t.replace(/[^\u0600-\u06FFa-z]/gi, '').trim();
        const isFollowing = l.includes('following') || l.includes('unfollow') || l.includes('إلغاء المتابعة') ||
            t.includes('following') || t.includes('unfollow') || t.includes('إلغاء المتابعة') ||
            tClean === 'following' || tClean === 'متابع' || tClean === 'unfollow' ||
            t.includes('متابَع') || /^متابع/.test(tClean);
        const isFollowNotFollowing = tClean === 'follow' || tClean === 'متابعة' || tClean === 'followback' ||
            tClean === 'متابعةبالمقابل' ||
            (l.includes('follow') && !l.includes('following') && !l.includes('unfollow'));
        return isFollowing && !isFollowNotFollowing;
    };

    NS.isRepostButton = function (btn) {
        const tid = (btn.getAttribute('data-testid') || '').toLowerCase();
        if (tid === 'repostbtn') return true;
        if (tid === 'unrepostbtn') return false;
        const l = (btn.getAttribute('aria-label') || '').toLowerCase();
        return (l.includes('repost') && !l.includes('un')) || l.includes('إعادة نشر');
    };

    NS.collectAllFollowButtons = function () {
        const results = [], seen = new Set();
        const allBtns = document.querySelectorAll('button, [role="button"]');
        for (const btn of allBtns) {
            if (NS.isInsidePanel(btn) || !NS.isFollowButton(btn)) continue;
            let container = btn;
            for (let i = 0; i < 12 && container; i++) {
                if (container.querySelector('a[href^="/profile/"]')) break;
                container = container.parentElement;
            }
            if (!container) continue;
            const handle = NS.getHandleFromContainer(container);
            if (!handle || seen.has(handle) || handle === NS.state.myHandle) continue;
            if (NS.containsBlacklisted(handle)) continue;
            if (NS.state.skipNoAvatar && !NS.hasAvatar(container)) continue;
            if (NS.state.onlyArabic) {
                const bio = (container.innerText || '').slice(0, 500);
                if (bio.trim() && !NS.isArabicText(bio)) continue;
            }
            seen.add(handle);
            results.push({ btn, post: container, key: handle, handle });
        }
        return results;
    };

    NS.collectAllLikeButtons = function () {
        const results = [], seen = new Set();
        const allBtns = document.querySelectorAll('button, [role="button"]');
        for (const btn of allBtns) {
            if (NS.isInsidePanel(btn) || !NS.isLikeButton(btn) || NS.isAlreadyLiked(btn)) continue;
            let container = btn;
            for (let i = 0; i < 10 && container; i++) {
                if (container.querySelector('a[href*="/post/"]')) break;
                container = container.parentElement;
            }
            if (!container) continue;
            const key = NS.getPostKey(container);
            if (!key || seen.has(key)) continue;
            const postText = (container.innerText || '').slice(0, 800);
            if (NS.containsBlacklisted(postText) || !NS.matchesKeywords(postText)) continue;
            if (NS.state.onlyArabic && !NS.isArabicText(postText)) continue;
            if (NS.state.languageFilter && NS.state.languageFilter !== 'ar' && !NS.matchesLanguage(postText)) continue;
            seen.add(key);
            results.push({ btn, post: container, key });
        }
        return results;
    };

    NS.collectAllRepostButtons = function () {
        const results = [], seen = new Set();
        const allBtns = document.querySelectorAll('button, [role="button"]');
        for (const btn of allBtns) {
            if (NS.isInsidePanel(btn) || !NS.isRepostButton(btn)) continue;
            let container = btn;
            for (let i = 0; i < 10 && container; i++) {
                if (container.querySelector('a[href*="/post/"]')) break;
                container = container.parentElement;
            }
            if (!container) continue;
            const key = NS.getPostKey(container);
            if (!key || seen.has(key)) continue;
            const postText = (container.innerText || '').slice(0, 800);
            if (NS.containsBlacklisted(postText)) continue;
            if (NS.state.repostKeywords) {
                const kws = NS.parseList(NS.state.repostKeywords);
                const low = postText.toLowerCase();
                if (!kws.some(w => low.includes(w))) continue;
            }
            if (NS.state.onlyArabic && !NS.isArabicText(postText)) continue;
            seen.add(key);
            results.push({ btn, post: container, key });
        }
        return results;
    };

    /* ✅ detectNotificationType — يدعم كل الأنواع */
    NS.detectNotificationType = function (text) {
        const t = (text || '').toLowerCase();
        if (t.includes('followed you back') || t.includes('followed you') ||
            t.includes('تابعك') || t.includes('بدأ متابعتك') ||
            t.includes('أعاد متابعتك')) return 'follow';
        if (t.includes('replied to you') || t.includes('رد على') ||
            t.includes('أجاب على') || t.includes('رد عليك')) return 'reply';
        if (t.includes('liked your') || t.includes('أعجب بمنشورك') ||
            t.includes('أعجب')) return 'like';
        if (t.includes('mentioned you') || t.includes('أشار إليك') ||
            t.includes('mention')) return 'mention';
        if (t.includes('reposted') || t.includes('أعاد نشر') ||
            t.includes('quote')) return 'repost';
        return null;
    };

    console.log('📦 dom.js محمّل - v' + NS.version);
})();


/* ═══════════════════════════════════════════════════════════
   src/actions.js — الإجراءات التلقائية
   ═══════════════════════════════════════════════════════════ */
(function () {
    'use strict';
    const NS = window.__BSKY;
    if (!NS) { console.error('❌ actions.js'); return; }

    /* ════════════════ الجلسات ════════════════ */
    NS.getSession = async function () {
        const pass = NS.getDecryptedPass();
        if (!pass) throw new Error('لا توجد كلمة مرور');
        return NS.getSessionFor(NS.state.myHandle, pass);
    };

    NS.getSessionFor = async function (handle, pass) {
        if (!handle) throw new Error('اسم الحساب فارغ');
        if (!pass) throw new Error('كلمة المرور فارغة');
        const cached = NS.accountSessions[handle];
        if (cached && cached.accessJwt && Date.now() < cached.expiresAt) return cached;

        const loginRes = await fetch('https://bsky.social/xrpc/com.atproto.server.createSession', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier: handle, password: pass })
        });
        if (!loginRes.ok) throw new Error(`فشل تسجيل الدخول لـ ${handle} (${loginRes.status})`);

        const s = await loginRes.json();
        const session = {
            accessJwt: s.accessJwt, refreshJwt: s.refreshJwt, did: s.did,
            handle: handle, expiresAt: Date.now() + 100 * 60 * 1000
        };
        NS.accountSessions[handle] = session;
        if (handle === NS.state.myHandle) NS.sessionCache = session;
        return session;
    };

    NS.refreshSession = async function () { return NS.refreshSessionFor(NS.state.myHandle); };

    NS.refreshSessionFor = async function (handle) {
        const cached = NS.accountSessions[handle] || (handle === NS.state.myHandle ? NS.sessionCache : null);
        if (!cached || !cached.refreshJwt) throw new Error('لا توجد جلسة');
        try {
            const res = await fetch('https://bsky.social/xrpc/com.atproto.server.refreshSession', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${cached.refreshJwt}` }
            });
            if (!res.ok) throw new Error('refresh failed');
            const s = await res.json();
            const session = {
                accessJwt: s.accessJwt, refreshJwt: s.refreshJwt, did: s.did,
                handle: handle, expiresAt: Date.now() + 100 * 60 * 1000
            };
            NS.accountSessions[handle] = session;
            if (handle === NS.state.myHandle) NS.sessionCache = session;
            return session;
        } catch (e) {
            delete NS.accountSessions[handle];
            if (handle === NS.state.myHandle) NS.sessionCache = { accessJwt: null, refreshJwt: null, did: null, expiresAt: 0 };
            throw e;
        }
    };

    NS.uploadBlob = async function (accessJwt, file) {
        if (!file || !(file instanceof Blob)) throw new Error('ملف غير صالح');
        if (file.size > 100 * 1024 * 1024) throw new Error('الملف أكبر من 100 MB');
        const buf = await file.arrayBuffer();
        let res = await fetch('https://bsky.social/xrpc/com.atproto.repo.uploadBlob', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${accessJwt}`, 'Content-Type': file.type || 'application/octet-stream' },
            body: buf
        });
        if (res.status === 401) {
            const s = await NS.refreshSession();
            res = await fetch('https://bsky.social/xrpc/com.atproto.repo.uploadBlob', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${s.accessJwt}`, 'Content-Type': file.type || 'application/octet-stream' },
                body: buf
            });
        }
        if (!res.ok) throw new Error('فشل رفع الملف: HTTP ' + res.status);
        const j = await res.json();
        if (!j.blob) throw new Error('استجابة غير صالحة');
        return j.blob;
    };

    NS.publishScheduledPost = async function (post) {
        let targetHandle = NS.state.myHandle;
        let targetPass = NS.getDecryptedPass();
        let targetLabel = 'الحساب الحالي';

        if (typeof post.accountIdx === 'number' && post.accountIdx >= 0 && NS.profiles[post.accountIdx]) {
            const p = NS.profiles[post.accountIdx];
            targetHandle = p.handle || (p.settings && p.settings.myHandle) || '';
            const encPass = p.appPassword || (p.settings && p.settings.blueskyAppPassword) || '';
            targetPass = encPass.startsWith('ENC:') ? NS.decrypt(encPass) : encPass;
            targetLabel = p.name;
        }

        if (!targetHandle) { NS.pushLog('post-fail', `❌ اسم الحساب فارغ (${targetLabel})`); return false; }
        if (!targetPass) { NS.pushLog('post-fail', `❌ لا توجد كلمة مرور لـ ${targetLabel}`); return false; }

        try {
            let s = await NS.getSessionFor(targetHandle, targetPass);
            let text = post.text || '';
            if (NS.state.weatherPosts) {
                const w = await NS.fetchWeather();
                if (w) text += `\n\n🌤️ ${NS.state.weatherCity}: ${w.temp}°C ${w.desc}`;
            }
            if (NS.state.worldEvents) {
                const ev = NS.getWorldEvent();
                if (ev) text = ev + '\n\n' + text;
            }
            text = NS.appendHashtags(text);

            let embed = null;
            const mediaFile = post.hasMedia && post.id ? NS.mediaBlobs.get(post.id) : null;
            if (mediaFile) {
                try {
                    const blob = await NS.uploadBlob(s.accessJwt, mediaFile);
                    if (post.mediaType === 'video') embed = { $type: 'app.bsky.embed.video', video: blob };
                    else embed = { $type: 'app.bsky.embed.images', images: [{ image: blob, alt: post.mediaAlt || '' }] };
                } catch (e) {
                    NS.pushLog('post-fail', '⚠️ فشل رفع المرفق: ' + e.message);
                }
            } else if (post.hasMedia) {
                NS.pushLog('post-fail', '⚠️ المرفق غير متاح (انتهت الجلسة)');
            }

            const record = {
                $type: 'app.bsky.feed.post',
                text: text,
                createdAt: new Date().toISOString(),
                langs: [NS.state.languageFilter || 'ar']
            };
            if (embed) record.embed = embed;

            const doPost = async jwt => fetch('https://bsky.social/xrpc/com.atproto.repo.createRecord', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jwt}` },
                body: JSON.stringify({ repo: s.did, collection: 'app.bsky.feed.post', record })
            });

            let postRes = await doPost(s.accessJwt);
            if (postRes.status === 401) {
                try { s = await NS.refreshSessionFor(targetHandle); postRes = await doPost(s.accessJwt); }
                catch (e) { delete NS.accountSessions[targetHandle]; s = await NS.getSessionFor(targetHandle, targetPass); postRes = await doPost(s.accessJwt); }
            }
            if (!postRes.ok) {
                const errTxt = await postRes.text().catch(() => '');
                throw new Error('فشل النشر: HTTP ' + postRes.status + ' ' + errTxt.slice(0, 100));
            }

            NS.bumpStat('posts');
            NS.dailyIncrement('posts');
            NS.pushLog('post', `✅ [${targetLabel}] "${text.slice(0, 40)}..."`);
            NS.notify('تم النشر', `${targetLabel}: ${text.slice(0, 40)}`);
            if (post.id && NS.mediaBlobs.has(post.id)) NS.mediaBlobs.delete(post.id);
            return true;
        } catch (err) {
            NS.pushLog('post-fail', `❌ [${targetLabel}] ${err.message}`);
            NS.captureError(err, 'publishScheduledPost');
            return false;
        }
    };

    NS.checkScheduledPosts = function () {
        const now = Date.now();
        NS.state.scheduledPosts.forEach(p => {
            if (p.posted || p.time > now) return;
            NS.publishScheduledPost(p).then(ok => {
                if (ok) { p.posted = true; NS.forceSaveSettings(); }
            });
        });
    };

    NS.checkContentCalendar = function () {
        if (!NS.state.calendarEnabled) return;
        const now = new Date(), hour = now.getHours();
        const dayNames = ['sun','mon','tue','wed','thu','fri','sat'];
        const dayKey = dayNames[now.getDay()];
        const content = NS.state.calendar[dayKey];
        if (!content) return;
        const todayKey = `${NS.todayStr()}_calendar_${dayKey}`;
        if (NS.state.processedPosts.includes(todayKey)) return;
        if (hour !== 10) return;
        NS.publishScheduledPost({ text: content }).then(ok => {
            if (ok) { NS.state.processedPosts.push(todayKey); NS.forceSaveSettings(); }
        });
    };

    /* ════════════════ رد المتابعة ════════════════ */
    NS.doFollowBack = async function (myGen) {
        if (!location.pathname.includes('/notifications')) return 0;
        if (!NS.dailyCheck('followBacks')) { NS.pushLog('limit', '⛔ حد رد المتابعة'); return 0; }
        const targets = NS.collectAllFollowButtons();
        NS.updateDebugInfo('follow', targets.length);
        let count = 0;
        for (const t of targets) {
            if (myGen !== NS.loopGeneration) return count;
            if (!NS.rateCheck()) break;
            if (NS.state.processedFollowBacks.includes(t.handle)) continue;
            if (NS.state.dryRun) { NS.pushLog('dry', `رد متابعة: ${t.handle}`); continue; }
            t.btn.scrollIntoView({ block: 'center', behavior: 'instant' });
            if (!await NS.sleepGen(NS.rand(700, 1500), myGen)) return count;
            NS.rateRecord();
            NS.fire(t.btn);
            if (!await NS.sleepGen(NS.rand(2000, 3000), myGen)) return count;
            if (NS.isAlreadyFollowing(t.btn)) {
                NS.state.processedFollowBacks.push(t.handle);
                NS.bumpStat('followBacks');
                NS.dailyIncrement('followBacks');
                count++;
                NS.pushLog('follow-back', `🔄 ${t.handle}`);
                NS.notify('رد متابعة', `تابعت ${t.handle}`);
            } else {
                NS.state.processedFollowBacks.push(t.handle);
                NS.pushLog('follow-back-fail', `❌ ${t.handle}`);
            }
        }
        if (count) NS.saveSettings();
        return count;
    };

    /* ════════════════ إعجاب المعلّقين ════════════════ */
    NS.doLikeCommenters = async function (myGen) {
        const onN = location.pathname.includes('/notifications');
        const onP = /\/profile\/[^/]+/.test(location.pathname);
        if (!onN && !onP) return 0;
        if (!NS.dailyCheck('commentLikes')) return 0;
        const targets = NS.collectAllLikeButtons();
        NS.updateDebugInfo('like', targets.length);
        let count = 0;
        for (const t of targets) {
            if (myGen !== NS.loopGeneration) return count;
            if (!NS.rateCheck()) break;
            if (NS.state.processedCommentLikes.includes(t.key)) continue;
            if (NS.state.dryRun) { NS.pushLog('dry', `إعجاب معلّق`); continue; }
            t.btn.scrollIntoView({ block: 'center', behavior: 'instant' });
            if (!await NS.sleepGen(NS.rand(700, 1400), myGen)) return count;
            NS.rateRecord();
            NS.fire(t.btn);
            if (!await NS.sleepGen(NS.rand(1500, 2500), myGen)) return count;
            if (NS.isAlreadyLiked(t.btn)) {
                NS.state.processedCommentLikes.push(t.key);
                NS.bumpStat('commentLikes');
                NS.dailyIncrement('commentLikes');
                count++;
                NS.pushLog('comment-like', `❤️ ${t.key.slice(0, 40)}`);
            } else {
                NS.state.processedCommentLikes.push(t.key);
                NS.pushLog('comment-like-fail', `❌ ${t.key.slice(0, 40)}`);
            }
        }
        if (count) NS.saveSettings();
        return count;
    };

    /* ════════════════ الإعجاب العام ════════════════ */
    NS.doAutoLike = async function (myGen) {
        if (Math.random() * 100 > NS.state.likeRatio) return 0;
        if (!NS.dailyCheck('likes')) { NS.pushLog('limit', '⛔ حد الإعجاب'); return 0; }
        const targets = NS.collectAllLikeButtons();
        NS.updateDebugInfo('like', targets.length);
        let count = 0;
        for (const t of targets) {
            if (myGen !== NS.loopGeneration) return count;
            if (!NS.rateCheck()) break;
            if (NS.state.processedLikes.includes(t.key)) continue;
            t.btn.scrollIntoView({ block: 'center', behavior: 'instant' });
            if (!await NS.sleepGen(NS.rand(700, 1400), myGen)) return count;
            if (NS.state.dryRun) { NS.pushLog('dry', `إعجاب`); continue; }
            NS.rateRecord();
            NS.fire(t.btn);
            if (!await NS.sleepGen(NS.rand(1500, 2500), myGen)) return count;
            if (NS.isAlreadyLiked(t.btn)) {
                NS.state.processedLikes.push(t.key);
                NS.bumpStat('likes');
                NS.dailyIncrement('likes');
                count++;
                NS.pushLog('like', `✅ ${t.key.slice(0, 50)}`);
                NS.state.lastClickResult = `✅ إعجاب`;
            } else {
                NS.state.processedLikes.push(t.key);
                NS.pushLog('like-fail', `❌ ${t.key.slice(0, 40)}`);
            }
        }
        if (count) NS.saveSettings();
        return count;
    };

    /* ════════════════ المتابعة العامة ════════════════ */
    NS.doAutoFollow = async function (myGen) {
        if (Math.random() * 100 > NS.state.followRatio) return 0;
        if (!NS.dailyCheck('follows')) { NS.pushLog('limit', '⛔ حد المتابعة'); return 0; }
        const targets = NS.collectAllFollowButtons();
        NS.updateDebugInfo('follow', targets.length);
        let count = 0;
        for (const t of targets) {
            if (myGen !== NS.loopGeneration) return count;
            if (!NS.rateCheck()) break;
            if (NS.state.processedFollows.includes(t.handle)) continue;
            if (NS.state.autoFollowBack && location.pathname.includes('/notifications')) continue;
            t.btn.scrollIntoView({ block: 'center', behavior: 'instant' });
            if (!await NS.sleepGen(NS.rand(700, 1400), myGen)) return count;
            if (NS.state.dryRun) { NS.pushLog('dry', `متابعة: ${t.handle}`); continue; }
            NS.rateRecord();
            NS.fire(t.btn);
            if (!await NS.sleepGen(NS.rand(2000, 3200), myGen)) return count;
            if (NS.isAlreadyFollowing(t.btn)) {
                NS.state.processedFollows.push(t.handle);
                NS.bumpStat('follows');
                NS.dailyIncrement('follows');
                count++;
                NS.pushLog('follow', `✅ ${t.handle}`);
            } else {
                NS.state.processedFollows.push(t.handle);
                NS.pushLog('follow-fail', `❌ ${t.handle}`);
            }
        }
        if (count) NS.saveSettings();
        return count;
    };

    /* ════════════════ إعادة النشر ════════════════ */
    NS.doAutoRepost = async function (myGen) {
        if (!NS.state.autoRepost) return 0;
        if (!NS.dailyCheck('reposts')) { NS.pushLog('limit', '⛔ حد إعادة النشر'); return 0; }
        const targets = NS.collectAllRepostButtons();
        let count = 0;
        for (const t of targets.slice(0, 3)) {
            if (myGen !== NS.loopGeneration) return count;
            if (!NS.rateCheck()) break;
            if (NS.state.processedReposts.includes(t.key)) continue;
            if (NS.state.dryRun) { NS.pushLog('dry', `إعادة نشر`); continue; }
            t.btn.scrollIntoView({ block: 'center', behavior: 'instant' });
            if (!await NS.sleepGen(NS.rand(700, 1400), myGen)) return count;
            NS.rateRecord();
            NS.fire(t.btn);
            if (!await NS.sleepGen(NS.rand(2000, 3000), myGen)) return count;
            const confirm = Array.from(document.querySelectorAll('[role="menuitem"], button'))
                .find(b => { const txt = (b.innerText || '').trim().toLowerCase(); return txt === 'repost' || txt === 'إعادة نشر'; });
            if (confirm) { NS.fire(confirm); await NS.sleepGen(1500, myGen); }
            NS.state.processedReposts.push(t.key);
            NS.bumpStat('reposts');
            NS.dailyIncrement('reposts');
            count++;
            NS.pushLog('repost', `🔄 ${t.key.slice(0, 40)}`);
        }
        if (count) NS.saveSettings();
        return count;
    };

    NS.waitForConfirmModal = async function (maxWaitMs, myGen) {
        maxWaitMs = maxWaitMs || 5000;
        const start = Date.now();
        while (Date.now() - start < maxWaitMs) {
            if (myGen !== NS.loopGeneration) return null;
            const confirm = Array.from(document.querySelectorAll('button, [role="button"], [role="menuitem"]'))
                .find(b => {
                    if (NS.isInsidePanel(b)) return false;
                    const t = (b.innerText || '').trim().toLowerCase();
                    const l = (b.getAttribute('aria-label') || '').toLowerCase();
                    return t === 'unfollow' || t === 'إلغاء المتابعة' || l.includes('unfollow') || l.includes('إلغاء المتابعة');
                });
            if (confirm) return confirm;
            await NS.sleep(200);
        }
        return null;
    };

    NS.doCleanupNonFollowers = async function (myGen) {
        if (!/\/profile\/[^/]+\/(follows|following)/.test(location.pathname)) return 0;
        if (!NS.state.autoUnfollow) return 0;
        if (NS.state.knownFollowers.length === 0) { NS.pushLog('cleanup', '⚠️ زُر /followers أولاً'); return 0; }
        const followers = new Set(NS.state.knownFollowers);
        const buttonsData = [], seen = new Set();
        const allBtns = document.querySelectorAll('button, [role="button"]');
        for (const btn of allBtns) {
            if (NS.isInsidePanel(btn) || !NS.isAlreadyFollowing(btn)) continue;
            let container = btn, found = false;
            for (let i = 0; i < 15 && container; i++) {
                if (container.querySelector && container.querySelector('a[href^="/profile/"]')) { found = true; break; }
                container = container.parentElement;
            }
            if (!found || !container) continue;
            const h = NS.getHandleFromContainer(container);
            if (!h || seen.has(h)) continue;
            seen.add(h);
            buttonsData.push({ btn, container, handle: h });
        }
        NS.pushLog('cleanup', `📋 ${buttonsData.length} زر متابَع`);
        if (!buttonsData.length) return 0;
        let n = 0, skipped = 0, failed = 0;
        for (const item of buttonsData) {
            if (myGen !== NS.loopGeneration) return n;
            if (!NS.rateCheck()) break;
            const h = item.handle;
            if (followers.has(h)) { skipped++; continue; }
            if (NS.state.unfollowedUsers.includes(h)) continue;
            if (NS.state.dryRun) { NS.pushLog('dry', `إلغاء: ${h}`); continue; }
            item.btn.scrollIntoView({ block: 'center', behavior: 'instant' });
            if (!await NS.sleepGen(NS.rand(500, 1000), myGen)) return n;
            NS.rateRecord();
            NS.fire(item.btn);
            let confirm = null, waitMs = 0;
            while (waitMs < 5000 && !confirm) {
                if (myGen !== NS.loopGeneration) return n;
                await NS.sleep(200);
                waitMs += 200;
                confirm = await NS.waitForConfirmModal(100, myGen);
            }
            if (confirm) {
                await NS.sleepGen(NS.rand(300, 600), myGen);
                NS.fire(confirm);
                await NS.sleepGen(NS.rand(1500, 2500), myGen);
                NS.bumpStat('unfollows');
                NS.state.unfollowedUsers.push(h);
                NS.pushLog('cleanup-unfollow', `🧹 ${h}`);
                n++;
            } else {
                failed++;
                NS.pushLog('cleanup-fail', `⚠️ ${h}`);
            }
            if (!await NS.sleepGen(NS.rand(1500, 3000), myGen)) return n;
        }
        NS.pushLog('cleanup', `📊 ألغيت ${n} | تخطّيت ${skipped} | فشل ${failed}`);
        if (n) NS.saveSettings();
        return n;
    };

    /* ═══════════════════════════════════════════════════════════
       ✅ v1.0.15: الرد على الإشعارات — مُحدد صحيح
       ═══════════════════════════════════════════════════════════ */
    NS.doReplyToNotifications = async function (myGen) {
        if (!location.pathname.includes('/notifications')) return 0;
        if (!NS.dailyCheck('notifReplies')) return 0;

        const notifications = Array.from(document.querySelectorAll('[data-testid^="feedItem-by-"]'));
        if (!notifications.length) return 0;

        let count = 0;
        for (const n of notifications) {
            if (myGen !== NS.loopGeneration) return count;
            if (!NS.rateCheck()) break;

            const txt = (n.innerText || '').slice(0, 500);
            const type = NS.detectNotificationType(txt);
            if (type !== 'reply') continue;

            const key = txt.slice(0, 100);
            if (NS.state.processedNotifReplies.includes(key)) continue;
            if (NS.state.onlyArabic && !NS.isArabicText(txt)) continue;
            if (NS.containsBlacklisted(txt)) continue;

            const replyBtn = n.querySelector('[data-testid="replyBtn"]');
            if (!replyBtn) continue;

            if (NS.state.dryRun) {
                NS.pushLog('dry', `رد إشعار: "${txt.slice(0, 40)}"`);
                NS.state.processedNotifReplies.push(key);
                continue;
            }

            replyBtn.scrollIntoView({ block: 'center', behavior: 'instant' });
            if (!await NS.sleepGen(NS.rand(800, 1500), myGen)) return count;

            NS.rateRecord();
            NS.fire(replyBtn);

            const editor = await NS.waitForComposer(myGen, 10000);
            if (!editor) {
                NS.pushLog('reply-fail', '❌ محرر رد الإشعار لم يظهر');
                NS.state.processedNotifReplies.push(key);
                try { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true })); } catch (e) {}
                await NS.sleepGen(800, myGen);
                continue;
            }
            await NS.sleepGen(NS.rand(800, 1500), myGen);

            let pool;
            if (NS.state.sentimentAnalysis) {
                const sent = NS.analyzeSentiment(txt);
                pool = sent === 'negative'
                    ? ["أتمنى لك الأفضل 💙", "الله يعينك 🙏"]
                    : String(NS.state.customReplyText || '').split('\n').map(s => s.trim()).filter(Boolean);
            } else {
                pool = String(NS.state.customReplyText || '').split('\n').map(s => s.trim()).filter(Boolean);
            }
            let selected = pool.length > 0 ? pool[NS.rand(0, pool.length - 1)] : "شكراً! 🙏";
            selected = NS.applyTemplateVars(selected, { name: 'صديقي', post: txt });
            selected = NS.appendHashtags(selected);

            NS.setInputValue(editor, selected);
            if (!await NS.sleepGen(NS.rand(1200, 2000), myGen)) return count;

            const written = (editor.value || editor.innerText || '').trim();
            if (!written) {
                NS.pushLog('reply-fail', '❌ النص لم يُكتب');
                NS.state.processedNotifReplies.push(key);
                continue;
            }

            const send = NS.findComposerSend();
            if (!send || send.disabled) {
                NS.pushLog('reply-fail', '❌ زر الإرسال غير متاح');
                NS.state.processedNotifReplies.push(key);
                continue;
            }
            NS.rateRecord();
            NS.fire(send);
            await NS.sleepGen(NS.rand(1500, 2500), myGen);

            NS.bumpStat('notifReplies');
            NS.dailyIncrement('notifReplies');
            count++;
            NS.state.processedNotifReplies.push(key);
            NS.pushLog('notif-reply', `✅ "${selected.slice(0, 30)}"`);
            NS.notify('رد إشعار', selected.slice(0, 40));
        }
        if (count) NS.saveSettings();
        return count;
    };

    /* ═══════════════════════════════════════════════════════════
       ✅ v1.0.14: الرد على الرسائل — مُحدد صحيح
       ═══════════════════════════════════════════════════════════ */
    NS.goBackToMessagesList = async function (myGen) {
        if (location.pathname === '/messages' || location.pathname.endsWith('/messages')) return;
        const backBtn = document.querySelector('a[href="/messages"]')
                     || document.querySelector('button[aria-label*="Back"]')
                     || document.querySelector('button[aria-label*="رجوع"]');
        if (backBtn) { NS.fire(backBtn); await NS.sleepGen(NS.rand(1500, 2000), myGen); }
        else { history.back(); await NS.sleepGen(2000, myGen); }
    };

    NS.doReplyToMessages = async function (myGen) {
        if (!location.pathname.includes('/messages')) return 0;
        if (location.pathname.includes('/messages/') && location.pathname !== '/messages' && location.pathname !== '/messages/') {
            // داخل محادثة معيّنة — ارجع للقائمة أولاً
            await NS.goBackToMessagesList(myGen);
            return 0;
        }
        if (!NS.dailyCheck('messages')) return 0;

        const convos = Array.from(document.querySelectorAll('a[href^="/messages/"][role="link"]'))
            .filter(a => {
                const href = a.getAttribute('href') || '';
                if (href === '/messages' || href === '/messages/inbox') return false;
                const name = a.getAttribute('aria-label') || '';
                if (!name) return false;
                const hasAvatar = !!a.querySelector('[data-testid="userAvatarImage"]');
                return hasAvatar || /^\/messages\/[a-z0-9]+/i.test(href);
            });

        if (!convos.length) { NS.pushLog('message-info', 'ℹ️ لا توجد محادثات'); return 0; }

        let count = 0;
        for (const c of convos) {
            if (myGen !== NS.loopGeneration) return count;
            if (!NS.rateCheck()) break;

            const href = c.getAttribute('href') || '';
            const name = c.getAttribute('aria-label') || '';
            const previewText = (c.innerText || '').slice(0, 300);
            const key = `${href}|${previewText.slice(0, 60)}`;

            if (NS.state.processedMessages.includes(key)) continue;
            if (name.toLowerCase().includes('deleted account')) {
                NS.state.processedMessages.push(key);
                continue;
            }
            if (/^You:/.test(previewText.trim()) || previewText.indexOf('You:') === 0) {
                NS.state.processedMessages.push(key);
                continue;
            }
            if (NS.containsBlacklisted(previewText)) { NS.state.processedMessages.push(key); continue; }
            if (NS.state.onlyArabic && !NS.isArabicText(previewText)) { NS.state.processedMessages.push(key); continue; }

            if (NS.state.dryRun) {
                NS.pushLog('dry', `رد رسالة: ${name}`);
                NS.state.processedMessages.push(key);
                continue;
            }

            NS.fire(c);
            NS.pushLog('message-open', `📨 فتح: ${name}`);
            if (!await NS.sleepGen(NS.rand(2000, 3500), myGen)) return count;

            const editor = await NS.waitForComposer(myGen, 8000);
            if (!editor) {
                NS.pushLog('message-fail', `❌ محرر لم يظهر — ${name}`);
                NS.state.processedMessages.push(key);
                await NS.goBackToMessagesList(myGen);
                continue;
            }
            await NS.sleepGen(NS.rand(500, 900), myGen);

            const pool = String(NS.state.messageReplyText || '').split('\n').map(s => s.trim()).filter(Boolean);
            let selected = pool.length > 0 ? pool[NS.rand(0, pool.length - 1)] : "شكراً 🙏";
            selected = NS.applyTemplateVars(selected, { name, post: previewText });
            if (NS.state.autoHashtags) selected = NS.appendHashtags(selected);

            NS.setInputValue(editor, selected);
            if (!await NS.sleepGen(NS.rand(1200, 2000), myGen)) return count;

            const written = (editor.value || editor.innerText || '').trim();
            if (!written) {
                NS.pushLog('message-fail', `❌ النص لم يُكتب — ${name}`);
                NS.state.processedMessages.push(key);
                await NS.goBackToMessagesList(myGen);
                continue;
            }

            const send = Array.from(document.querySelectorAll('button, [role="button"]')).find(b => {
                if (NS.isInsidePanel(b)) return false;
                const l = (b.getAttribute('aria-label') || '').toLowerCase();
                const t = (b.innerText || '').trim().toLowerCase();
                const tid = (b.getAttribute('data-testid') || '').toLowerCase();
                return (l === 'send' || l.includes('send message') || l === 'إرسال' ||
                        t === 'send' || t === 'إرسال' || tid.includes('send')) && !b.disabled;
            }) || NS.findComposerSend();

            if (!send) {
                NS.pushLog('message-fail', `❌ زر الإرسال — ${name}`);
                NS.state.processedMessages.push(key);
                await NS.goBackToMessagesList(myGen);
                continue;
            }

            NS.rateRecord();
            NS.fire(send);
            await NS.sleepGen(NS.rand(1500, 2500), myGen);

            NS.bumpStat('messageReplies');
            NS.dailyIncrement('messages');
            count++;
            NS.state.processedMessages.push(key);
            NS.pushLog('message-reply', `✅ رد على ${name}`);
            NS.notify('رد رسالة', name);

            await NS.goBackToMessagesList(myGen);
        }
        if (count) NS.saveSettings();
        return count;
    };

    /* ════════════════ الرد العام ════════════════ */
    NS.doAutoReply = async function (myGen) {
        if (!NS.state.autoReply) return 0;
        if (!NS.rateCheck()) return 0;
        if (!NS.dailyCheck('replies')) { NS.pushLog('limit', '⛔ حد الردود'); return 0; }

        const btns = NS.findReplyButtons();
        if (!btns.length) { NS.pushLog('reply-info', 'ℹ️ لا توجد أزرار رد'); return 0; }

        const btn = btns[NS.rand(0, btns.length - 1)];
        const c = btn.closest('[data-testid^="feedItem-by-"]')
               || btn.closest('[role="link"][data-testid]')
               || btn.closest('[role="article"]')
               || btn.closest('div[role="link"]')
               || btn.closest('div');

        if (c) {
            const postTextCheck = (c.innerText || '').slice(0, 800);
            if (NS.containsBlacklisted(postTextCheck)) { NS.pushLog('reply-skip', '⏭️ محظور'); return 0; }
            if (NS.state.useKeywordFilter && !NS.matchesKeywords(postTextCheck)) { NS.pushLog('reply-skip', '⏭️ كلمات مفتاحية'); return 0; }
            if (NS.state.onlyArabic && !NS.isArabicText(postTextCheck)) { NS.pushLog('reply-skip', '⏭️ ليس عربي'); return 0; }
        }

        let pool;
        if (c && (NS.postHasVideo(c) || NS.postHasImage(c))) {
            pool = String(NS.state.replyWithImage || '').split('\n').map(s => s.trim()).filter(Boolean);
        } else {
            pool = String(NS.state.replyTextOnly || '').split('\n').map(s => s.trim()).filter(Boolean);
        }
        if (!pool.length) pool = String(NS.state.customReplyText || '').split('\n').map(s => s.trim()).filter(Boolean);
        if (!pool.length) pool = ["منشور رائع! ✨", "Great post! 👍", "Nice! 👏"];

        let selected = pool[NS.rand(0, pool.length - 1)];
        const postText = c ? (c.innerText || '').slice(0, 200) : '';
        selected = NS.applyTemplateVars(selected, { post: postText });
        selected = NS.appendHashtags(selected);

        if (NS.state.dryRun) { NS.pushLog('dry', `رد: "${selected.slice(0, 40)}"`); return 0; }

        for (let attempt = 1; attempt <= 2; attempt++) {
            if (myGen !== NS.loopGeneration) return 0;
            try {
                btn.scrollIntoView({ block: 'center', behavior: 'instant' });
                if (!await NS.sleepGen(NS.rand(500, 900), myGen)) return 0;
                NS.rateRecord();
                NS.fire(btn);

                const editor = await NS.waitForComposer(myGen, 10000);
                if (!editor) {
                    NS.pushLog('reply-fail', `❌ محرر (محاولة ${attempt})`);
                    try { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true })); } catch (e) {}
                    await NS.sleepGen(800, myGen);
                    continue;
                }
                await NS.sleepGen(NS.rand(500, 900), myGen);
                NS.setInputValue(editor, selected);
                if (!await NS.sleepGen(NS.rand(1200, 1800), myGen)) return 0;

                const written = (editor.value || editor.innerText || '').trim();
                if (!written) { NS.pushLog('reply-fail', '❌ النص لم يُكتب'); continue; }

                const send = NS.findComposerSend();
                if (!send) { NS.pushLog('reply-fail', '❌ زر الإرسال'); continue; }
                if (send.disabled) {
                    await NS.sleepGen(800, myGen);
                    if (send.disabled) { NS.pushLog('reply-fail', '❌ معطّل'); continue; }
                }

                NS.rateRecord();
                NS.fire(send);
                await NS.sleepGen(NS.rand(1500, 2500), myGen);

                NS.bumpStat('replies');
                NS.dailyIncrement('replies');
                NS.pushLog('reply', `✅ "${selected.slice(0, 40)}"`);
                NS.state.lastClickResult = `✅ رد: ${selected.slice(0, 30)}`;
                NS.notify('رد تلقائي', selected.slice(0, 40));
                return 1;
            } catch (e) {
                NS.captureError(e, 'doAutoReply');
                await NS.sleepGen(1000, myGen);
            }
        }
        return 0;
    };

    /* ════════════════ متابعة المتفاعلين ════════════════ */
    NS.doFollowEngagers = async function (myGen) {
        if (!NS.state.followEngagers || !NS.dailyCheck('engagerFollows')) return 0;
        if (NS.state.engagerQueue.length === 0) return 0;
        const handle = NS.state.engagerQueue.shift();
        NS.saveSettings();
        try {
            const url = `/profile/${handle}`;
            if (location.pathname !== url) {
                NS.state.engagerQueue.push(handle);
                if (!NS.state.engagerAttempts) NS.state.engagerAttempts = {};
                NS.state.engagerAttempts[handle] = (NS.state.engagerAttempts[handle] || 0) + 1;
                if (NS.state.engagerAttempts[handle] > 3) {
                    delete NS.state.engagerAttempts[handle];
                    NS.pushLog('engager-skip', `⏭️ ${handle}`);
                }
                NS.saveSettings();
                return 0;
            }
            if (NS.state.engagerAttempts && NS.state.engagerAttempts[handle]) delete NS.state.engagerAttempts[handle];
            const followBtn = NS.collectAllFollowButtons().find(b => b.handle === handle);
            if (!followBtn) return 0;
            if (NS.state.dryRun) { NS.pushLog('dry', `متابعة متفاعل: ${handle}`); return 0; }
            NS.rateRecord();
            NS.fire(followBtn.btn);
            if (!await NS.sleepGen(2000, myGen)) return 0;
            if (NS.isAlreadyFollowing(followBtn.btn)) {
                NS.bumpStat('engagerFollows');
                NS.dailyIncrement('engagerFollows');
                NS.pushLog('engager', `✅ ${handle}`);
                return 1;
            }
        } catch (e) {}
        return 0;
    };

    /* ✅ جمع المتفاعلين — مُحدد صحيح */
    NS.collectEngagers = function () {
        if (!NS.state.followEngagers) return;
        if (!location.pathname.includes('/notifications')) return;
        const notifications = document.querySelectorAll('[data-testid^="feedItem-by-"]');
        for (const n of notifications) {
            const txt = (n.innerText || '').slice(0, 300);
            const type = NS.detectNotificationType(txt);
            if (type !== 'like' && type !== 'reply' && type !== 'repost') continue;
            const handle = NS.getHandleFromContainer(n);
            if (!handle || handle === NS.state.myHandle) continue;
            if (NS.containsBlacklisted(handle)) continue;
            if (NS.state.knownFollowers.includes(handle)) continue;
            if (!NS.state.engagerQueue.includes(handle)) {
                NS.state.engagerQueue.push(handle);
                if (NS.state.engagerQueue.length > 200) NS.state.engagerQueue.shift();
            }
        }
        NS.saveSettings();
    };

    NS.trackCurrentFollowers = function () {
        if (!NS.state.trackUnfollowers) return;
        if (!location.pathname.includes('/followers')) return;
        const handles = new Set();
        document.querySelectorAll('a[href^="/profile/"]').forEach(a => {
            if (NS.isInsidePanel(a)) return;
            const h = a.getAttribute('href').replace('/profile/', '').split('/')[0];
            if (h && h !== NS.state.myHandle && !h.includes('?')) handles.add(h);
        });
        if (!handles.size) return;
        if (NS.state.knownFollowers.length === 0) {
            NS.state.knownFollowers = Array.from(handles).slice(-2000);
            NS.forceSaveSettings();
            NS.pushLog('tracker', `📥 حفظ ${handles.size} متابع`);
            return;
        }
        const prev = new Set(NS.state.knownFollowers);
        const lost = Array.from(prev).filter(h => !handles.has(h));
        if (lost.length > 0 && prev.size > 0) {
            lost.slice(0, 5).forEach(h => NS.pushLog('unfollower', `👋 ألغى: ${h}`));
        }
        const merged = new Set([...NS.state.knownFollowers, ...handles]);
        NS.state.knownFollowers = Array.from(merged).slice(-2000);
        NS.forceSaveSettings();
    };

    console.log('📦 actions.js محمّل - v' + NS.version);
})();


/* ═══════════════════════════════════════════════════════════
   src/ui.js
   ═══════════════════════════════════════════════════════════ */
(function () {
    'use strict';
    const NS = window.__BSKY;
    if (!NS) { console.error('❌ ui.js'); return; }

    NS.autoDetectMyHandle = function () {
        if (NS.state.myHandle) return;
        let link = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]')
                || document.querySelector('nav a[aria-label="Profile"]')
                || document.querySelector('a[href^="/profile/"][aria-label*="rofile"]')
                || document.querySelector('a[aria-label="Profile"][role="link"]');
        if (link) {
            const m = (link.getAttribute('href') || '').match(/\/profile\/([^/]+)/);
            if (m && m[1]) {
                NS.state.myHandle = m[1];
                NS.forceSaveSettings();
                NS.notify('تم الاكتشاف', m[1]);
                return;
            }
        }
        const feedback = document.querySelector('a[href*="zendesk.com"][href*="="]');
        if (feedback) {
            const m = (feedback.getAttribute('href') || '').match(/=([a-z0-9.-]+\.bsky\.social)/i);
            if (m && m[1]) {
                NS.state.myHandle = m[1];
                NS.forceSaveSettings();
                NS.notify('تم الاكتشاف', m[1]);
            }
        }
    };

    NS.findScrollContainer = function () {
        const now = Date.now();
        if (NS.scrollCache.el && now - NS.scrollCache.ts < 5000 &&
            NS.scrollCache.path === location.pathname &&
            document.contains(NS.scrollCache.el) &&
            NS.scrollCache.el.scrollHeight > NS.scrollCache.el.clientHeight + 100) {
            return NS.scrollCache.el;
        }
        const de = document.scrollingElement || document.documentElement;
        if (de && de.scrollHeight > de.clientHeight + 300) {
            NS.scrollCache = { el: de, ts: now, path: location.pathname };
            return de;
        }
        let best = null, bestScore = 0;
        for (const el of document.querySelectorAll('main, main *')) {
            if (NS.isInsidePanel(el)) continue;
            const s = getComputedStyle(el);
            if (s.overflowY !== 'auto' && s.overflowY !== 'scroll') continue;
            const sc = el.scrollHeight - el.clientHeight;
            if (sc < 300) continue;
            let d = 0, p = el;
            while (p) { d++; p = p.parentElement; }
            const score = sc - d;
            if (score > bestScore) { bestScore = score; best = el; }
        }
        const result = best || de;
        NS.scrollCache = { el: result, ts: now, path: location.pathname };
        return result;
    };

    NS.autoScrollDown = async function (aggressive, myGen) {
        if (!NS.state.autoScroll) return;
        const c = NS.findScrollContainer();
        if (!c || NS.isInsidePanel(c)) return;
        const b = c.scrollTop;
        const step = aggressive ? c.clientHeight * 1.5 : c.clientHeight * 0.85;
        c.scrollTop = b + step;
        c.dispatchEvent(new Event('scroll', { bubbles: true }));
        await NS.sleepGen(aggressive ? NS.rand(2500, 4000) : NS.rand(1500, 3000), myGen);
    };

    NS.maybeResetMemory = function () {
        const e = (Date.now() - NS.lastMemoryReset) / 60000;
        if (e >= NS.state.resetMemoryEveryMin) {
            ['processedLikes','processedFollows','processedFollowBacks','processedCommentLikes',
             'processedNotifReplies','processedMessages','processedReposts','processedPosts']
                .forEach(k => NS.state[k] = NS.state[k].slice(-200));
            NS.lastMemoryReset = Date.now();
            NS.saveSettings();
        }
    };

    NS.botLoop = async function () {
        const myGen = ++NS.loopGeneration;
        NS.activeLoopId = myGen;
        NS.cyclesWithoutAction = 0;
        if (!NS.state.myHandle && NS.handleDetectionAttempts < 5) {
            NS.autoDetectMyHandle();
            NS.handleDetectionAttempts++;
        }
        console.log(`▶️ جيل ${myGen}`);
        await NS.waitForContent(myGen, 15000);

        while (NS.activeLoopId === myGen && myGen === NS.loopGeneration) {
            let actionCount = 0;
            try {
                if (NS.state.scheduleEnabled && !NS.isWithinSchedule()) {
                    NS.setFooter('⏰ خارج الجدولة');
                    await NS.sleepGen(60000, myGen);
                    continue;
                }
                if (!NS.state.paused) {
                    NS.checkScheduledPosts();
                    NS.checkContentCalendar();

                    const onN = location.pathname.includes('/notifications');
                    const onM = location.pathname.includes('/messages');
                    const onF = location.pathname.includes('/followers');

                    if (onF) NS.trackCurrentFollowers();
                    if (onN) NS.collectEngagers();

                    if (NS.state.autoReplyMessages && onM) actionCount += await NS.doReplyToMessages(myGen);
                    if (myGen !== NS.loopGeneration) break;
                    if (NS.state.autoFollowBack && onN) actionCount += await NS.doFollowBack(myGen);
                    if (myGen !== NS.loopGeneration) break;
                    if (NS.state.autoReplyNotifications && onN) actionCount += await NS.doReplyToNotifications(myGen);
                    if (myGen !== NS.loopGeneration) break;
                    if (NS.state.autoLikeCommenters && (onN || /\/profile\//.test(location.pathname)))
                        actionCount += await NS.doLikeCommenters(myGen);
                    if (myGen !== NS.loopGeneration) break;
                    if (NS.state.autoLike) actionCount += await NS.doAutoLike(myGen);
                    if (myGen !== NS.loopGeneration) break;
                    if (NS.state.autoRepost) actionCount += await NS.doAutoRepost(myGen);
                    if (myGen !== NS.loopGeneration) break;
                    if (NS.state.autoFollow && !(onN && NS.state.autoFollowBack))
                        actionCount += await NS.doAutoFollow(myGen);
                    if (myGen !== NS.loopGeneration) break;
                    if (NS.state.autoUnfollow) actionCount += await NS.doCleanupNonFollowers(myGen);
                    if (myGen !== NS.loopGeneration) break;
                    if (NS.state.followEngagers) actionCount += await NS.doFollowEngagers(myGen);
                    if (myGen !== NS.loopGeneration) break;
                    if (NS.state.autoReply && !onN && !onM) actionCount += await NS.doAutoReply(myGen);
                    if (myGen !== NS.loopGeneration) break;

                    NS.maybeResetMemory();
                    await NS.maybeAutoNavigate(myGen);
                    if (myGen !== NS.loopGeneration) break;

                    if (actionCount === 0) {
                        NS.cyclesWithoutAction++;
                        NS.setFooter(`⚠️ لا جديد (${NS.cyclesWithoutAction}/${NS.state.stuckThreshold})`);
                        if (NS.cyclesWithoutAction >= NS.state.stuckThreshold) {
                            await NS.autoScrollDown(true, myGen);
                            NS.cyclesWithoutAction = 0;
                        } else {
                            await NS.autoScrollDown(false, myGen);
                        }
                    } else {
                        NS.cyclesWithoutAction = 0;
                        await NS.autoScrollDown(false, myGen);
                        if (NS.state.humanBreakEnabled) {
                            NS.state.actionCounter = (NS.state.actionCounter || 0) + actionCount;
                            const threshold = NS.rand(NS.state.humanBreakEveryMin, NS.state.humanBreakEveryMax);
                            if (NS.state.actionCounter >= threshold) {
                                const bm = NS.rand(NS.state.breakDurationMin, NS.state.breakDurationMax);
                                NS.pushLog('break', `☕ ${bm} د`);
                                NS.setFooter(`☕ استراحة ${bm} دقيقة...`);
                                NS.state.actionCounter = 0;
                                NS.forceSaveSettings();
                                if (!await NS.sleepGen(bm * 60000 + NS.rand(0, 30000), myGen)) break;
                            } else NS.forceSaveSettings();
                        }
                    }
                }
            } catch (err) {
                console.error('🔴 خطأ:', err);
                NS.captureError(err, 'botLoop');
                if (actionCount === 0) NS.cyclesWithoutAction++;
            }
            NS.setFooter(NS.state.paused ? '⏸️ موقوف' : `⏱️ يعمل — ${actionCount} فعل`);
            const wait = actionCount > 0 ? NS.state.fastCycleMs : NS.rand(4000, 7000);
            if (!await NS.sleepGen(wait, myGen)) break;
        }
        if (NS.activeLoopId === myGen) NS.activeLoopId = null;
        console.log(`🔚 خرج جيل ${myGen}`);
    };

    NS.setFooter = function (msg) {
        const el = document.getElementById('b11-footer');
        if (el) el.innerText = msg + ' • Shift+B';
    };

    NS.exportToSheets = function () {
        const rows = [['التاريخ','إعجابات','متابعات','إلغاء','ردود','رد متابعة','إعجاب معلق','رد إشعار','رد رسالة','منشورات','إعادة نشر']];
        NS.stats.history.forEach(h => rows.push([h.d, h.likes||0, h.follows||0, h.unfollows||0, h.replies||0,
            h.followBacks||0, h.commentLikes||0, h.notifReplies||0, h.messageReplies||0, h.posts||0, h.reposts||0]));
        const tsv = rows.map(r => r.join('\t')).join('\n');
        if (typeof GM_setClipboard === 'function') GM_setClipboard(tsv);
        else navigator.clipboard.writeText(tsv);
        alert('✅ تم النسخ');
    };

    NS.exportSettings = function () {
        const data = { version: NS.version, exported: new Date().toISOString(),
            state: Object.assign({}, NS.state), stats: NS.stats, profiles: NS.profiles };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `bsky-bot-${NS.todayStr()}.json`;
        a.click();
    };

    NS.importSettings = function (file) {
        const r = new FileReader();
        r.onload = e => {
            try {
                const d = JSON.parse(e.target.result);
                if (d.state) Object.assign(NS.state, d.state);
                if (d.stats) { Object.assign(NS.stats, d.stats); NS.saveStats(); }
                if (d.profiles) { NS.profiles = d.profiles; NS.saveProfiles(); }
                NS.forceSaveSettings();
                alert('✅ تم الاستيراد');
                location.reload();
            } catch (err) { alert('❌ ملف غير صالح: ' + err.message); }
        };
        r.readAsText(file);
    };

    NS.saveCurrentAsProfile = function (name) {
        const cleanSettings = JSON.parse(JSON.stringify(NS.state));
        delete cleanSettings.processedLikes;
        delete cleanSettings.activityLog;
        NS.profiles.push({
            name: name,
            handle: NS.state.myHandle,
            appPassword: NS.state.blueskyAppPassword,
            did: NS.sessionCache.did || null,
            settings: cleanSettings
        });
        NS.saveProfiles();
        alert(`✅ حُفظ: ${name}\n📛 ${NS.state.myHandle}\n🔑 ${NS.state.blueskyAppPassword ? 'محفوظة' : '⚠️ فارغة'}`);
    };

    NS.addNewProfile = function (handle, appPassword, displayName) {
        handle = String(handle || '').trim();
        appPassword = String(appPassword || '').trim();
        displayName = String(displayName || '').trim() || handle;
        if (!handle) { alert('⚠️ أدخل اسم الحساب'); return false; }
        if (!appPassword) { alert('⚠️ أدخل كلمة مرور التطبيق'); return false; }
        const exists = NS.profiles.some(p => {
            const h = p.handle || (p.settings && p.settings.myHandle) || '';
            return h.toLowerCase() === handle.toLowerCase();
        });
        if (exists) { alert(`⚠️ الحساب موجود: ${handle}`); return false; }

        const encPass = NS.state.encryptPasswords ? NS.encrypt(appPassword) : appPassword;
        NS.profiles.push({
            name: displayName,
            handle: handle,
            appPassword: encPass,
            did: null,
            settings: Object.assign({}, NS.defaultState, {
                myHandle: handle,
                blueskyAppPassword: encPass
            })
        });
        NS.saveProfiles();
        alert(`✅ تمت الإضافة: ${displayName}`);
        NS.renderProfiles();
        NS.populatePostAccountSelect();
        return true;
    };

    NS.switchProfile = function (idx) {
        if (!NS.profiles[idx]) return;
        const current = NS.profiles[NS.activeProfileIdx];
        if (current) {
            current.settings = JSON.parse(JSON.stringify(NS.state));
            current.handle = NS.state.myHandle;
            current.appPassword = NS.state.blueskyAppPassword;
        }
        const p = NS.profiles[idx];
        NS.state = Object.assign({}, NS.defaultState, p.settings || {});
        if (p.handle) NS.state.myHandle = p.handle;
        if (p.appPassword) NS.state.blueskyAppPassword = p.appPassword;
        NS.sessionCache = { accessJwt: null, refreshJwt: null, did: null, expiresAt: 0 };
        NS.accountSessions = {};
        window.__bskyState = NS.state;
        ['unfollowedUsers','processedLikes','processedFollows','processedFollowBacks',
         'processedCommentLikes','processedNotifReplies','processedMessages','processedReposts',
         'processedPosts','activityLog','scheduledPosts','knownFollowers','engagerQueue']
            .forEach(k => { if (!Array.isArray(NS.state[k])) NS.state[k] = []; });
        NS.activeProfileIdx = idx;
        NS.forceSaveSettings();
        NS.saveProfiles();
        NS.notify('تم التبديل', p.name);
        setTimeout(() => location.reload(), 800);
    };

    NS.deleteProfile = function (idx) {
        if (!confirm('حذف الحساب؟')) return;
        NS.profiles.splice(idx, 1);
        if (NS.activeProfileIdx >= NS.profiles.length) NS.activeProfileIdx = 0;
        NS.saveProfiles();
        NS.renderProfiles();
    };

    NS.populatePostAccountSelect = function () {
        const sel = document.getElementById('b11-post-account');
        if (!sel) return;
        const prevVal = sel.value;
        sel.innerHTML = '';
        const optCur = document.createElement('option');
        optCur.value = '-1';
        optCur.textContent = `الحساب الحالي (${NS.state.myHandle || 'غير محدد'})`;
        sel.appendChild(optCur);
        NS.profiles.forEach((p, i) => {
            const opt = document.createElement('option');
            opt.value = String(i);
            const h = p.handle || (p.settings && p.settings.myHandle) || '—';
            const hasPass = !!(p.appPassword || (p.settings && p.settings.blueskyAppPassword));
            opt.textContent = `${p.name} — ${h}${hasPass ? '' : ' ⚠️ بلا كلمة مرور'}`;
            sel.appendChild(opt);
        });
        if (prevVal && Array.from(sel.options).some(o => o.value === prevVal)) sel.value = prevVal;
    };

    /* ════════════════ اللوحة ════════════════ */
    NS.createDashboard = function () {
        if (document.getElementById(NS.PANEL_ID)) return;
        const s = NS.state;

        const mini = document.createElement('div');
        mini.id = NS.PANEL_ID + '-mini';
        mini.innerHTML = 'B';
        Object.assign(mini.style, {
            position: 'fixed', bottom: '20px', right: '20px', zIndex: '99998',
            width: '50px', height: '50px', borderRadius: '12px',
            background: 'linear-gradient(135deg, #0085ff, #0066cc)',
            color: '#fff', fontSize: '26px', fontWeight: '900',
            display: s.collapsed ? 'flex' : 'none',
            alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', boxShadow: '0 4px 16px rgba(0,133,255,0.5)',
            fontFamily: 'Arial, sans-serif', userSelect: 'none'
        });
        mini.onclick = () => {
            mini.style.display = 'none';
            const p = document.getElementById(NS.PANEL_ID);
            if (p) p.style.display = 'flex';
            NS.state.collapsed = false;
            NS.saveSettings();
        };
        document.body.appendChild(mini);

        const panel = document.createElement('div');
        panel.id = NS.PANEL_ID;
        panel.style.display = s.collapsed ? 'none' : 'flex';
        panel.innerHTML = NS.buildDashboardHTML();
        document.body.appendChild(panel);

        NS.injectCSS();
        NS.bindDashboardEvents(panel, mini);
        NS.renderAll();
        NS.populatePostAccountSelect();
    };

    NS.buildDashboardHTML = function () {
        const s = NS.state, esc = NS.esc, passValue = esc(NS.getDecryptedPass());
        return `
        <div id="b11-header">
            <div class="b11-brand">
                <div class="b11-logo">B</div>
                <div>
                    <div class="b11-title">بوت بلو سكاي</div>
                    <div class="b11-ver">v${NS.version} PRO</div>
                </div>
            </div>
            <div class="b11-controls">
                <button class="b11-icon" id="b11-theme">🌓</button>
                <button class="b11-icon" id="b11-collapse">➖</button>
                <button class="b11-icon" id="b11-close">✖</button>
            </div>
        </div>
        <div id="b11-tabs">
            <button class="b11-tab active" data-t="inter">🎯 تفاعل</button>
            <button class="b11-tab" data-t="schedule">⏰ نشر</button>
            <button class="b11-tab" data-t="filter">🛡️ فلاتر</button>
            <button class="b11-tab" data-t="advanced">🚀 متقدم</button>
            <button class="b11-tab" data-t="analytic">📊 تحليل</button>
            <button class="b11-tab" data-t="settings">⚙️ إعدادات</button>
            <button class="b11-tab" data-t="errors">🐛 أخطاء</button>
            <button class="b11-tab" data-t="log">📜 سجل</button>
        </div>
        <div id="b11-body">

        <div class="b11-pane" data-p="inter">
            <div class="b11-status">
                <span id="b11-dbg-like">❤️?</span>
                <span id="b11-dbg-follow">👤?</span>
                <span id="b11-dbg-loop">🔄0</span>
                <span id="b11-dbg-cycle">📊0</span>
                <span id="b11-dbg-break">☕0</span>
            </div>
            <div class="b11-last"><b>🎯 آخر نتيجة:</b> <span id="b11-last-result">—</span></div>
            <div class="b11-btn-row">
                <button id="b11-test" class="b11-btn blue">🧪 فحص</button>
                <button id="b11-restart" class="b11-btn green">🔄 إعادة</button>
            </div>
            <div class="b11-btn-row">
                <button id="b11-pause" class="b11-btn gray">⏸️ إيقاف</button>
                <button id="b11-scroll" class="b11-btn purple">⬇️ تمرير</button>
            </div>
            <div class="b11-section">
                <div class="b11-section-title" style="color:#f59e0b;">🔄 من الإشعارات</div>
                <label><input type="checkbox" id="b11-fback" ${s.autoFollowBack?'checked':''}> رد المتابعة</label>
                <label><input type="checkbox" id="b11-clike" ${s.autoLikeCommenters?'checked':''}> إعجاب المعلّقين</label>
                <label><input type="checkbox" id="b11-notif-reply" ${s.autoReplyNotifications?'checked':''}> الرد على الإشعارات</label>
            </div>
            <div class="b11-section">
                <div class="b11-section-title" style="color:#a855f7;">📨 الرسائل</div>
                <label><input type="checkbox" id="b11-msg-reply" ${s.autoReplyMessages?'checked':''}> الرد على الرسائل</label>
                <textarea id="b11-msg-txt" rows="2" class="b11-textarea">${esc(s.messageReplyText)}</textarea>
            </div>
            <div class="b11-section">
                <div class="b11-section-title" style="color:#0085ff;">🎯 عام</div>
                <label><input type="checkbox" id="b11-like" ${s.autoLike?'checked':''}> إعجاب تلقائي</label>
                <label><input type="checkbox" id="b11-follow" ${s.autoFollow?'checked':''}> متابعة تلقائية</label>
                <label><input type="checkbox" id="b11-repost" ${s.autoRepost?'checked':''}> إعادة نشر</label>
                <label><input type="checkbox" id="b11-scroll-on" ${s.autoScroll?'checked':''}> تمرير تلقائي</label>
                <label><input type="checkbox" id="b11-nav" ${s.navEnabled?'checked':''}> 🧭 تنقّل آلي</label>
                <label><input type="checkbox" id="b11-unfollow" ${s.autoUnfollow?'checked':''}> 🧹 إلغاء متابعة</label>
                <label><input type="checkbox" id="b11-reply" ${s.autoReply?'checked':''}> رد تلقائي عام</label>
                <label><input type="checkbox" id="b11-dry" ${s.dryRun?'checked':''}> 🧪 وضع التجربة</label>
            </div>
            <div class="b11-section">
                <div class="b11-section-title">💬 قوالب الردود</div>
                <label style="font-size:10px;">📝 نص فقط:</label>
                <textarea id="b11-reply-txt" rows="2" class="b11-textarea">${esc(s.replyTextOnly)}</textarea>
                <label style="font-size:10px;">🖼️ صور/فيديو:</label>
                <textarea id="b11-reply-img" rows="2" class="b11-textarea">${esc(s.replyWithImage)}</textarea>
                <label style="font-size:10px;">💬 عام:</label>
                <textarea id="b11-reply-general" rows="2" class="b11-textarea">${esc(s.customReplyText)}</textarea>
            </div>
            <div class="b11-section">
                <label>👤 اسم حسابك:</label>
                <input type="text" id="b11-myhandle" value="${esc(s.myHandle)}" placeholder="username.bsky.social">
            </div>
        </div>

        <div class="b11-pane" data-p="schedule" style="display:none">
            <div class="b11-section">
                <div class="b11-section-title" style="color:#3b82f6;">🔑 كلمة مرور التطبيق</div>
                <input type="password" id="b11-app-pass" value="${passValue}" placeholder="xxxx-xxxx-xxxx-xxxx">
                <div style="font-size:9px;color:#94a3b8;">${s.blueskyAppPassword ? '✅ محفوظة' : 'أدخلها مرة واحدة'}</div>
                <label style="margin-top:6px;"><input type="checkbox" id="b11-encrypt" ${s.encryptPasswords?'checked':''}> 🔐 تشفير</label>
                <div class="b11-app-pass-hint">
                    ⚠️ من: <a href="${NS.APP_PASSWORD_URL}" target="_blank">${NS.APP_PASSWORD_URL}</a>
                </div>
            </div>
            <div class="b11-section">
                <div class="b11-section-title">📝 منشور جديد</div>
                <label style="font-size:10px;">👤 الحساب الناشر:</label>
                <select id="b11-post-account" class="b11-textarea" style="padding:6px 8px;">
                    <option value="-1">الحساب الحالي</option>
                </select>
                <textarea id="b11-post-text" rows="3" class="b11-textarea" placeholder="نص المنشور..."></textarea>
                <label style="font-size:10px;">🖼️ صورة/فيديو:</label>
                <input type="file" id="b11-post-media" accept="image/*,video/*">
                <label style="font-size:10px;">📝 Alt:</label>
                <input type="text" id="b11-post-alt" placeholder="وصف الصورة">
                <label style="font-size:10px;">⏰ وقت النشر:</label>
                <input type="datetime-local" id="b11-post-time">
                <button id="b11-add-post" class="b11-btn green">➕ إضافة منشور</button>
            </div>
            <div class="b11-section">
                <div class="b11-section-title">📋 المنشورات المجدولة</div>
                <div id="b11-post-list"></div>
                <button id="b11-clear-posts" class="b11-btn gray">🗑️ مسح المنشورات المنشورة</button>
            </div>
            <div class="b11-section">
                <div class="b11-section-title">🌤️ الطقس</div>
                <label><input type="checkbox" id="b11-weather-on" ${s.weatherPosts?'checked':''}> إضافة الطقس</label>
                <input type="text" id="b11-weather-city" value="${esc(s.weatherCity)}" placeholder="المدينة">
                <div class="b11-btn-row" style="grid-template-columns:1fr 1fr;">
                    <input type="number" id="b11-weather-lat" value="${s.weatherLat}" step="0.001">
                    <input type="number" id="b11-weather-lon" value="${s.weatherLon}" step="0.001">
                </div>
                <button id="b11-check-weather" class="b11-btn blue">🔍 فحص الطقس</button>
            </div>
            <div class="b11-section">
                <div class="b11-section-title">📅 تقويم المحتوى</div>
                <label><input type="checkbox" id="b11-cal-on" ${s.calendarEnabled?'checked':''}> تفعيل (10 ص)</label>
                ${['sun','mon','tue','wed','thu','fri','sat'].map(d =>
                  `<input type="text" id="b11-cal-${d}" value="${esc(s.calendar[d] || '')}" placeholder="${d}" class="b11-textarea" style="padding:4px;">`
                ).join('')}
            </div>
            <div class="b11-section">
                <div class="b11-section-title">🗓️ أحداث عالمية</div>
                <label><input type="checkbox" id="b11-events" ${s.worldEvents?'checked':''}> إضافة تحية</label>
            </div>
        </div>

        <div class="b11-pane" data-p="filter" style="display:none">
            <label style="background:#1e3a5f;padding:8px;border-radius:6px;display:block;margin:8px 0;border:1px solid #3b82f6;">
                <input type="checkbox" id="b11-only-arabic" ${s.onlyArabic?'checked':''}>
                <b style="color:#60a5fa;">🇸🇦 محتوى عربي فقط</b>
            </label>
            <label>🌍 رمز اللغة (فارغ = بدون قيد):</label>
            <input type="text" id="b11-lang-filter" value="${esc(s.languageFilter)}" placeholder="ar / en / fr">
            <div class="b11-section">
                <div class="b11-section-title" style="color:#ef4444;">🚫 كلمات محظورة</div>
                <textarea id="b11-blacklist" rows="4" class="b11-textarea">${esc(s.blacklistWords)}</textarea>
            </div>
            <div class="b11-section">
                <label><input type="checkbox" id="b11-kw-on" ${s.useKeywordFilter?'checked':''}> تفعيل كلمات مفتاحية</label>
                <textarea id="b11-keywords" rows="3" class="b11-textarea">${esc(s.keywordFilter)}</textarea>
            </div>
            <label><input type="checkbox" id="b11-noavatar" ${s.skipNoAvatar?'checked':''}> تجاهل بلا صورة</label>
            <button id="b11-clear-mem" class="b11-btn gray">🧠 مسح ذاكرة التفاعل</button>
        </div>

        <div class="b11-pane" data-p="advanced" style="display:none">
            <div class="b11-section">
                <div class="b11-section-title" style="color:#a855f7;">🤝 متابعة المتفاعلين</div>
                <label><input type="checkbox" id="b11-engagers" ${s.followEngagers?'checked':''}> متابعة من تفاعل</label>
                <div style="font-size:10px;color:#94a3b8;">الطابور: ${s.engagerQueue.length}</div>
            </div>
            <div class="b11-section">
                <div class="b11-section-title" style="color:#10b981;">🔍 تحليل المشاعر</div>
                <label><input type="checkbox" id="b11-sentiment" ${s.sentimentAnalysis?'checked':''}> تحليل قبل الرد</label>
            </div>
            <div class="b11-section">
                <div class="b11-section-title" style="color:#f59e0b;">🎯 متغيرات القوالب</div>
                <label><input type="checkbox" id="b11-tmpl-vars" ${s.useTemplateVars?'checked':''}> {name} {handle} {post} {time} {date}</label>
            </div>
            <div class="b11-section">
                <div class="b11-section-title" style="color:#3b82f6;">📝 هاشتاجات تلقائية</div>
                <label><input type="checkbox" id="b11-hashtags" ${s.autoHashtags?'checked':''}> إضافة هاشتاجات</label>
                <label style="font-size:10px;">🏷️ ثابتة (كل منشور):</label>
                <input type="text" id="b11-default-hashtags" value="${esc(s.defaultHashtags || '')}" placeholder="تصوير, فن">
                <label style="font-size:10px;">🔑 حسب الكلمة المفتاحية:</label>
                <textarea id="b11-hashtag-map" rows="3" class="b11-textarea">${esc(s.hashtagMap)}</textarea>
            </div>
            <div class="b11-section">
                <div class="b11-section-title" style="color:#ec4899;">📊 A/B Testing</div>
                <label><input type="checkbox" id="b11-ab" ${s.abTesting?'checked':''}> تتبع أداء القوالب</label>
                <div id="b11-ab-report" style="font-size:10px;background:#0f172a;padding:6px;border-radius:4px;"></div>
            </div>
            <div class="b11-section">
                <div class="b11-section-title" style="color:#22c55e;">🧠 تعلّم التفضيلات</div>
                <label><input type="checkbox" id="b11-ml" ${s.mlPreferences?'checked':''}> تتبع أفضل الأوقات</label>
                <div id="b11-ml-report" style="font-size:10px;background:#0f172a;padding:6px;border-radius:4px;"></div>
            </div>
            <div class="b11-section">
                <div class="b11-section-title" style="color:#06b6d4;">📈 تتبع إلغاء المتابعة</div>
                <label><input type="checkbox" id="b11-track-unf" ${s.trackUnfollowers?'checked':''}> تتبع من ألغى</label>
                <div style="font-size:10px;color:#94a3b8;">متابعون: ${s.knownFollowers.length}</div>
            </div>
        </div>

        <div class="b11-pane" data-p="analytic" style="display:none">
            <div class="b11-stats">
                <div>❤️ <b id="st-likes">0</b></div>
                <div>👤 <b id="st-follows">0</b></div>
                <div>🧹 <b id="st-unfollows">0</b></div>
            </div>
            <div class="b11-stats">
                <div>💬 <b id="st-replies">0</b></div>
                <div>🔄 <b id="st-followbacks">0</b></div>
                <div>❤️‍🔥 <b id="st-commentlikes">0</b></div>
            </div>
            <div class="b11-stats">
                <div>💬 <b id="st-notifreplies">0</b></div>
                <div>📨 <b id="st-msgreplies">0</b></div>
                <div>📝 <b id="st-posts">0</b></div>
            </div>
            <div class="b11-stats">
                <div>🔁 <b id="st-reposts">0</b></div>
                <div>🤝 <b id="st-engagerfollows">0</b></div>
                <div>—</div>
            </div>
            <div class="b11-section">
                <div class="b11-section-title">📊 العدادات اليومية</div>
                <div id="b11-daily" style="font-size:10px;background:#0f172a;padding:6px;border-radius:4px;"></div>
            </div>
            <div class="b11-section">
                <div class="b11-section-title">📈 رسم بياني (7 أيام)</div>
                <canvas id="b11-chart" width="340" height="120" style="background:#0f172a;border-radius:6px;"></canvas>
            </div>
            <div class="b11-btn-row">
                <button id="b11-export-csv" class="b11-btn gray">⬇️ CSV</button>
                <button id="b11-export-sheets" class="b11-btn green">📊 Sheets</button>
            </div>
            <button id="b11-reset-stats" class="b11-btn gray">🗑️ تصفير الإحصائيات</button>
        </div>

        <div class="b11-pane" data-p="settings" style="display:none">
            <div class="b11-section" style="border:1px solid #22c55e;">
                <div class="b11-section-title" style="color:#22c55e;">🔄 تحديثات البوت</div>
                <div style="font-size:11px;text-align:center;">v${NS.version}</div>
                <div id="b11-update-status" style="font-size:10px;text-align:center;">✅ فحص كل 24 ساعة</div>
                <button id="b11-check-update" class="b11-btn green">🔄 فحص التحديثات</button>
                <label style="font-size:10px;"><input type="checkbox" id="b11-auto-update" ${s.autoUpdateCheck !== false ? 'checked' : ''}> فحص تلقائي</label>
                <div id="b11-last-check" style="font-size:9px;text-align:center;"></div>
            </div>
            <div class="b11-section">
                <div class="b11-section-title">⏰ جدولة زمنية</div>
                <label><input type="checkbox" id="b11-sch-on" ${s.scheduleEnabled?'checked':''}> تفعيل</label>
                <div class="b11-btn-row">
                    <input type="number" id="b11-sch-start" value="${s.scheduleStart}" min="0" max="23">
                    <input type="number" id="b11-sch-end" value="${s.scheduleEnd}" min="0" max="24">
                </div>
            </div>
            <div class="b11-section">
                <div class="b11-section-title">🔢 حد يومي</div>
                <label><input type="checkbox" id="b11-dl-on" ${s.dailyLimitsEnabled?'checked':''}> تفعيل</label>
                <div class="b11-btn-row">
                    <input type="number" id="b11-dl-likes" value="${s.dailyLimitLikes}" placeholder="إعجابات">
                    <input type="number" id="b11-dl-follows" value="${s.dailyLimitFollows}" placeholder="متابعات">
                    <input type="number" id="b11-dl-replies" value="${s.dailyLimitReplies}" placeholder="ردود">
                    <input type="number" id="b11-dl-msgs" value="${s.dailyLimitMessages}" placeholder="رسائل">
                    <input type="number" id="b11-dl-posts" value="${s.dailyLimitPosts}" placeholder="منشورات">
                    <input type="number" id="b11-dl-reposts" value="${s.dailyLimitReposts}" placeholder="إعادة">
                </div>
            </div>
            <div class="b11-section">
                <div class="b11-section-title">⚙️ معدل</div>
                <input type="number" id="b11-rate" value="${s.rateLimitPerMin}" min="1" max="30">
            </div>
            <div class="b11-section">
                <div class="b11-section-title">☕ استراحة</div>
                <label><input type="checkbox" id="b11-hb-on" ${s.humanBreakEnabled?'checked':''}> تفعيل</label>
                <div class="b11-btn-row">
                    <input type="number" id="b11-hb-min" value="${s.humanBreakEveryMin}">
                    <input type="number" id="b11-hb-max" value="${s.humanBreakEveryMax}">
                    <input type="number" id="b11-br-min" value="${s.breakDurationMin}">
                    <input type="number" id="b11-br-max" value="${s.breakDurationMax}">
                </div>
            </div>
            <div class="b11-section">
                <div class="b11-section-title" style="color:#a855f7;">👥 الحسابات المتعددة</div>
                <div id="b11-profiles"></div>
                <button id="b11-add-profile" class="b11-btn green">➕ حفظ الحالي كحساب</button>
            </div>
            <div class="b11-section">
                <div class="b11-section-title">💾 الإعدادات</div>
                <button id="b11-export-settings" class="b11-btn blue">⬇️ تصدير</button>
                <button id="b11-import-settings" class="b11-btn green">⬆️ استيراد</button>
                <input type="file" id="b11-import-file" accept=".json" style="display:none;">
            </div>
            <div class="b11-section" style="border:1px solid #ff5e5b;">
                <div class="b11-section-title" style="color:#ff5e5b;">❤️ دعم المطوّر</div>
                <button id="b11-donate" class="b11-btn" style="background:linear-gradient(135deg,#ff5e5b,#d946ef);">☕ Ko-fi</button>
            </div>
            <div class="b11-section" style="border:1px solid #0085ff;">
                <div class="b11-section-title" style="color:#0085ff;">👨‍💻 المطوّر</div>
                <button id="b11-dev" class="b11-btn blue">🌐 الموقع</button>
                <button id="b11-github" class="b11-btn gray">🐙 GitHub</button>
            </div>
        </div>

        <div class="b11-pane" data-p="errors" style="display:none">
            <div class="b11-section">
                <div class="b11-section-title" style="color:#ef4444;">🐛 سجل الأخطاء</div>
                <div id="b11-error-count" style="font-size:11px;text-align:center;"></div>
                <button id="b11-report-error" class="b11-btn" style="background:linear-gradient(135deg,#ef4444,#dc2626);">📤 إرسال إلى GitHub</button>
                <div class="b11-btn-row">
                    <button id="b11-export-errors" class="b11-btn gray">⬇️ تصدير</button>
                    <button id="b11-clear-errors" class="b11-btn gray">🗑️ مسح</button>
                </div>
            </div>
            <div class="b11-section">
                <div class="b11-section-title">📋 آخر الأخطاء:</div>
                <div id="b11-error-list" style="font-size:10px;font-family:monospace;background:#0a121e;padding:8px;border-radius:6px;max-height:280px;overflow-y:auto;"></div>
            </div>
        </div>

        <div class="b11-pane" data-p="log" style="display:none">
            <button id="b11-log-clear" class="b11-btn gray">🗑️ مسح السجل</button>
            <div id="b11-log-box" class="b11-list"></div>
        </div>

        </div>
        <div id="b11-resize"></div>
        <div id="b11-footer">جاهز • Shift+B</div>
        `;
    };

    NS.injectCSS = function () {
        if (document.getElementById('b11-css')) return;
        const s = NS.state;
        const css = document.createElement('style');
        css.id = 'b11-css';
        css.textContent = `
            #${NS.PANEL_ID}{position:fixed;top:70px;right:20px;z-index:99999;width:${s.panelSize.w}px;height:${s.panelSize.h}px;background:linear-gradient(160deg,#0d1420 0%,#161e27 100%);color:#e2e8f0;border-radius:14px;border:1px solid #1e293b;box-shadow:0 12px 40px rgba(0,0,0,0.6);font-family:-apple-system,'Segoe UI',sans-serif;font-size:12px;flex-direction:column;overflow:hidden;}
            #b11-header{padding:12px 14px;background:linear-gradient(135deg,#1e293b,#0f172a);display:flex;justify-content:space-between;align-items:center;cursor:move;border-bottom:1px solid #1e293b;}
            .b11-brand{display:flex;align-items:center;gap:10px;}
            .b11-logo{width:34px;height:34px;border-radius:9px;background:linear-gradient(135deg,#0085ff,#0066cc);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:19px;}
            .b11-title{font-weight:700;font-size:13px;color:#fff;}
            .b11-ver{font-size:9px;color:#60a5fa;font-weight:600;}
            .b11-controls{display:flex;gap:4px;}
            .b11-icon{width:26px;height:26px;border:none;border-radius:6px;background:rgba(255,255,255,0.06);color:#cbd5e1;cursor:pointer;font-size:12px;}
            .b11-icon:hover{background:rgba(255,255,255,0.15);color:#fff;}
            #b11-tabs{display:flex;gap:2px;padding:6px;background:#0a121e;overflow-x:auto;flex-shrink:0;}
            .b11-tab{flex:1;min-width:44px;background:transparent;color:#64748b;border:none;padding:6px 2px;border-radius:6px;font-size:9px;cursor:pointer;font-weight:600;white-space:nowrap;}
            .b11-tab.active{background:linear-gradient(135deg,#0085ff,#0066cc);color:#fff;}
            #b11-body{flex:1;padding:12px;overflow-y:auto;overflow-x:hidden;}
            #b11-body::-webkit-scrollbar{width:6px;}
            #b11-body::-webkit-scrollbar-thumb{background:#334155;border-radius:3px;}
            .b11-section{background:rgba(15,23,42,0.5);border:1px solid #1e293b;border-radius:8px;padding:8px 10px;margin:6px 0;}
            .b11-section-title{font-weight:700;font-size:11px;margin-bottom:6px;color:#cbd5e1;}
            #${NS.PANEL_ID} label{display:flex;align-items:center;gap:6px;font-size:11px;margin:4px 0;cursor:pointer;color:#cbd5e1;}
            #${NS.PANEL_ID} input[type="checkbox"]{accent-color:#0085ff;}
            #${NS.PANEL_ID} input[type="text"],#${NS.PANEL_ID} input[type="number"],#${NS.PANEL_ID} input[type="password"],#${NS.PANEL_ID} input[type="datetime-local"],#${NS.PANEL_ID} input[type="file"]{width:100%;font-size:11px;padding:6px 8px;margin:3px 0;background:#0a121e;color:#e2e8f0;border:1px solid #1e293b;border-radius:6px;box-sizing:border-box;}
            #${NS.PANEL_ID} input:focus{outline:none;border-color:#0085ff;}
            #${NS.PANEL_ID} .b11-textarea{width:100%;font-size:11px;padding:6px 8px;margin:3px 0;background:#0a121e;color:#e2e8f0;border:1px solid #1e293b;border-radius:6px;box-sizing:border-box;font-family:'Consolas',monospace;resize:vertical;}
            #${NS.PANEL_ID} select{width:100%;font-size:11px;padding:6px 8px;margin:3px 0;background:#0a121e;color:#e2e8f0;border:1px solid #1e293b;border-radius:6px;box-sizing:border-box;cursor:pointer;}
            .b11-btn{width:100%;padding:8px;border:none;border-radius:6px;font-weight:700;font-size:11px;cursor:pointer;margin:3px 0;color:#fff;font-family:inherit;}
            .b11-btn:hover{filter:brightness(1.1);}
            .b11-btn.green{background:linear-gradient(135deg,#22c55e,#16a34a);}
            .b11-btn.blue{background:linear-gradient(135deg,#0085ff,#0066cc);}
            .b11-btn.gray{background:linear-gradient(135deg,#475569,#334155);}
            .b11-btn.purple{background:linear-gradient(135deg,#6366f1,#4f46e5);}
            .b11-btn-row{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:4px 0;}
            .b11-btn-row .b11-btn{margin:0;}
            .b11-status{display:flex;gap:8px;padding:8px;background:#0a121e;border:1px solid #1e293b;border-radius:8px;font-size:10px;margin-bottom:6px;justify-content:space-around;}
            .b11-last{background:#0a121e;padding:8px;border-radius:6px;font-size:10px;margin-bottom:6px;border:1px solid #1e293b;}
            #b11-log-box{background:#0a121e;padding:8px;border-radius:6px;font-size:10px;color:#cbd5e1;max-height:380px;overflow-y:auto;font-family:'Consolas',monospace;line-height:1.6;}
            .b11-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:8px;}
            .b11-stats div{background:#0a121e;padding:8px 4px;border-radius:6px;text-align:center;font-size:11px;border:1px solid #1e293b;font-weight:600;}
            #b11-resize{position:absolute;bottom:0;left:0;width:20px;height:20px;cursor:nwse-resize;background:linear-gradient(135deg,transparent 50%,#0085ff 50%,#0085ff 60%,transparent 60%,transparent 70%,#0085ff 70%,#0085ff 80%,transparent 80%);opacity:0.6;}
            #b11-footer{padding:6px 12px;font-size:10px;color:#10b981;background:#0a121e;border-top:1px solid #1e293b;text-align:center;border-bottom-left-radius:14px;border-bottom-right-radius:14px;}
            .b11-missing-media{cursor:help;color:#ef4444;font-weight:bold;}
            .b11-new-profile-form{background:#0f1a2e;border:1px dashed #3b82f6;border-radius:8px;padding:8px;margin:6px 0;}
            .b11-app-pass-hint{background:#1e3a5f;border-radius:6px;padding:6px 8px;font-size:9px;color:#93c5fd;margin:4px 0;}
            .b11-app-pass-hint a{color:#60a5fa;text-decoration:underline;word-break:break-all;}
        `;
        document.head.appendChild(css);
    };

    NS.bindDashboardEvents = function (panel, mini) {
        document.querySelectorAll('.b11-tab').forEach(tab => {
            tab.onclick = () => {
                document.querySelectorAll('.b11-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.b11-pane').forEach(p => p.style.display = 'none');
                tab.classList.add('active');
                document.querySelector(`.b11-pane[data-p="${tab.dataset.t}"]`).style.display = 'block';
                if (tab.dataset.t === 'log') NS.renderLog();
                if (tab.dataset.t === 'analytic') { NS.renderChart(); NS.renderDailyStats(); }
                if (tab.dataset.t === 'advanced') { NS.renderABReport(); NS.renderMLReport(); }
                if (tab.dataset.t === 'errors') NS.renderErrorTab();
                if (tab.dataset.t === 'schedule') NS.populatePostAccountSelect();
            };
        });

        const bind = (id, key, isCheck) => {
            const el = document.getElementById(id);
            if (!el) return;
            el[isCheck ? 'onchange' : 'oninput'] = e => {
                NS.state[key] = isCheck ? e.target.checked : e.target.value;
                NS.saveSettings();
            };
            if (!isCheck) {
                el.onblur = () => NS.forceSaveSettings();
                el.onkeydown = e => { if (e.key === 'Enter' && el.tagName !== 'TEXTAREA') { NS.forceSaveSettings(); el.blur(); } };
            }
        };
        const bn = (id, key, min, max) => {
            min = min || 0; max = max || 100000;
            const el = document.getElementById(id);
            if (!el) return;
            el.oninput = e => {
                const v = parseInt(e.target.value, 10);
                if (!isNaN(v) && v >= min && v <= max) { NS.state[key] = v; NS.saveSettings(); }
            };
            el.onblur = () => NS.forceSaveSettings();
        };

        ['b11-like','autoLike',true,'b11-follow','autoFollow',true,'b11-unfollow','autoUnfollow',true,
         'b11-reply','autoReply',true,'b11-scroll-on','autoScroll',true,'b11-dry','dryRun',true,
         'b11-nav','navEnabled',true,'b11-fback','autoFollowBack',true,'b11-clike','autoLikeCommenters',true,
         'b11-notif-reply','autoReplyNotifications',true,'b11-msg-reply','autoReplyMessages',true,
         'b11-repost','autoRepost',true].forEach((v, i, arr) => {
            if (i % 3 === 0) bind(arr[i], arr[i+1], arr[i+2]);
        });

        bind('b11-myhandle','myHandle');
        bind('b11-reply-txt','replyTextOnly');
        bind('b11-reply-img','replyWithImage');
        bind('b11-reply-general','customReplyText');
        bind('b11-msg-txt','messageReplyText');
        bind('b11-blacklist','blacklistWords');
        bind('b11-keywords','keywordFilter');
        bind('b11-kw-on','useKeywordFilter',true);
        bind('b11-noavatar','skipNoAvatar',true);
        bind('b11-hb-on','humanBreakEnabled',true);
        bind('b11-only-arabic','onlyArabic',true);
        bind('b11-lang-filter','languageFilter');
        bind('b11-encrypt','encryptPasswords',true);
        bind('b11-sch-on','scheduleEnabled',true);
        bind('b11-dl-on','dailyLimitsEnabled',true);
        bind('b11-weather-on','weatherPosts',true);
        bind('b11-weather-city','weatherCity');
        bind('b11-cal-on','calendarEnabled',true);
        bind('b11-events','worldEvents',true);
        bind('b11-engagers','followEngagers',true);
        bind('b11-sentiment','sentimentAnalysis',true);
        bind('b11-tmpl-vars','useTemplateVars',true);
        bind('b11-hashtags','autoHashtags',true);
        bind('b11-default-hashtags','defaultHashtags');
        bind('b11-hashtag-map','hashtagMap');
        bind('b11-ab','abTesting',true);
        bind('b11-ml','mlPreferences',true);
        bind('b11-track-unf','trackUnfollowers',true);

        const passEl = document.getElementById('b11-app-pass');
        if (passEl) {
            const savePass = () => {
                const v = passEl.value.trim();
                if (v) {
                    NS.setEncryptedPass(v);
                    NS.notify('✅', 'كلمة المرور محفوظة');
                    const hint = passEl.parentElement.querySelector('div[style*="font-size:9px"]');
                    if (hint) hint.innerText = '✅ محفوظة';
                }
            };
            passEl.onchange = savePass;
            passEl.onblur = savePass;
        }

        ['sun','mon','tue','wed','thu','fri','sat'].forEach(d => {
            const el = document.getElementById(`b11-cal-${d}`);
            if (el) {
                el.oninput = e => { NS.state.calendar[d] = e.target.value; NS.saveSettings(); };
                el.onblur = () => NS.forceSaveSettings();
            }
        });

        bn('b11-rate','rateLimitPerMin',1,30);
        bn('b11-hb-min','humanBreakEveryMin',5,100);
        bn('b11-hb-max','humanBreakEveryMax',5,200);
        bn('b11-br-min','breakDurationMin',1,30);
        bn('b11-br-max','breakDurationMax',1,60);
        bn('b11-sch-start','scheduleStart',0,23);
        bn('b11-sch-end','scheduleEnd',0,24);
        bn('b11-dl-likes','dailyLimitLikes',0,100000);
        bn('b11-dl-follows','dailyLimitFollows',0,100000);
        bn('b11-dl-replies','dailyLimitReplies',0,100000);
        bn('b11-dl-msgs','dailyLimitMessages',0,100000);
        bn('b11-dl-posts','dailyLimitPosts',0,1000);
        bn('b11-dl-reposts','dailyLimitReposts',0,10000);
        bn('b11-weather-lat','weatherLat',-90,90);
        bn('b11-weather-lon','weatherLon',-180,180);

        document.getElementById('b11-add-post').onclick = () => {
            const text = document.getElementById('b11-post-text').value.trim();
            const timeInput = document.getElementById('b11-post-time').value;
            const mediaInput = document.getElementById('b11-post-media');
            const alt = document.getElementById('b11-post-alt').value;
            const accountIdx = parseInt(document.getElementById('b11-post-account').value, 10);

            if (!text && !mediaInput.files[0]) { alert('أدخل نصاً أو وسائط'); return; }
            if (!timeInput) { alert('حدد الوقت'); return; }
            const time = new Date(timeInput).getTime();
            if (isNaN(time)) { alert('وقت غير صالح'); return; }

            let targetLabel = `الحساب الحالي (${NS.state.myHandle || 'غير محدد'})`;
            if (accountIdx >= 0) {
                const p = NS.profiles[accountIdx];
                if (!p) { alert('❌ الحساب غير موجود'); return; }
                const hasPass = !!(p.appPassword || (p.settings && p.settings.blueskyAppPassword));
                if (!hasPass) { alert(`⚠️ "${p.name}" بلا كلمة مرور`); return; }
                targetLabel = p.name;
            }

            const id = Date.now() + '_' + Math.random().toString(36).slice(2, 8);
            const file = mediaInput.files[0] || null;
            if (file) {
                NS.mediaBlobs.set(id, file);
                if (NS.mediaBlobs.size > NS.MAX_MEDIA_BLOBS) {
                    const firstKey = NS.mediaBlobs.keys().next().value;
                    NS.mediaBlobs.delete(firstKey);
                }
            }
            NS.state.scheduledPosts.push({
                id, text, time, posted: false,
                hasMedia: !!file, mediaAlt: alt,
                mediaType: file && file.type && file.type.startsWith('video') ? 'video' : 'image',
                accountIdx
            });
            NS.forceSaveSettings();
            document.getElementById('b11-post-text').value = '';
            document.getElementById('b11-post-time').value = '';
            document.getElementById('b11-post-alt').value = '';
            document.getElementById('b11-post-media').value = '';
            NS.renderScheduledPosts();
            NS.notify('تمت الإضافة', `سيُنشر من: ${targetLabel}`);
        };

        document.getElementById('b11-clear-posts').onclick = () => {
            NS.state.scheduledPosts = NS.state.scheduledPosts.filter(p => !p.posted);
            NS.forceSaveSettings();
            NS.renderScheduledPosts();
        };

        document.getElementById('b11-check-weather').onclick = async () => {
            const w = await NS.fetchWeather();
            if (w) alert(`🌤️ ${NS.state.weatherCity}: ${w.temp}°C ${w.desc}`);
            else alert('❌ فشل');
        };

        document.getElementById('b11-add-profile').onclick = () => {
            const name = prompt('اسم الحساب:');
            if (name) { NS.saveCurrentAsProfile(name); NS.renderProfiles(); }
        };

        document.getElementById('b11-donate').onclick = () => window.open(NS.DONATE_URL, '_blank');
        document.getElementById('b11-dev').onclick = () => window.open(NS.DEV_URL, '_blank');
        document.getElementById('b11-github').onclick = () => window.open(`https://github.com/${NS.GITHUB_REPO}`, '_blank');
        document.getElementById('b11-report-error').onclick = () => NS.reportErrorToGitHub();
        document.getElementById('b11-export-errors').onclick = NS.exportErrorLog;
        document.getElementById('b11-clear-errors').onclick = NS.clearErrorLog;

        document.getElementById('b11-export-settings').onclick = NS.exportSettings;
        document.getElementById('b11-import-settings').onclick = () => document.getElementById('b11-import-file').click();
        document.getElementById('b11-import-file').onchange = e => {
            if (e.target.files[0]) NS.importSettings(e.target.files[0]);
        };

        document.getElementById('b11-restart').onclick = () => {
            NS.setFooter('⏳ إعادة...');
            NS.loopGeneration++;
            setTimeout(() => { NS.botLoop(); NS.setFooter('✅'); }, 300);
        };
        document.getElementById('b11-pause').onclick = e => {
            NS.state.paused = !NS.state.paused;
            e.target.innerText = NS.state.paused ? '▶️ استئناف' : '⏸️ إيقاف';
            e.target.className = NS.state.paused ? 'b11-btn green' : 'b11-btn gray';
            NS.saveSettings();
        };
        document.getElementById('b11-scroll').onclick = () => NS.autoScrollDown(true, NS.loopGeneration);

        document.getElementById('b11-test').onclick = () => {
            const f = NS.collectAllFollowButtons();
            const l = NS.collectAllLikeButtons();
            const r = NS.collectAllRepostButtons();
            const rb = NS.findReplyButtons();
            const notifs = document.querySelectorAll('[data-testid^="feedItem-by-"]').length;
            const convos = document.querySelectorAll('a[href^="/messages/"][role="link"]').length;
            alert([
                `📄 ${location.pathname}`,
                `👤 اسمك: ${NS.state.myHandle || '؟'}`,
                `🔑 كلمة المرور: ${NS.state.blueskyAppPassword ? 'محفوظة ✅' : '⚠️'}`,
                `👥 متابعة: ${f.length} | ❤️ إعجاب: ${l.length}`,
                `🔁 إعادة: ${r.length} | 💬 ردود: ${rb.length}`,
                `📬 إشعارات: ${notifs}`,
                `💌 محادثات: ${convos}`,
                `🌐 لغة: ${NS.state.languageFilter || 'بدون قيد'}`,
                `🇸🇦 عربي فقط: ${NS.state.onlyArabic ? 'نعم' : 'لا'}`,
                `🏷️ هاشتاجات: ${NS.state.autoHashtags ? 'مفعّلة' : 'معطّلة'}`,
                `📎 مرفقات: ${NS.mediaBlobs.size}`,
                `💼 حسابات: ${NS.profiles.length}`,
                `🐛 أخطاء: ${NS.errorLog.length}`
            ].join('\n'));
        };

        document.getElementById('b11-clear-mem').onclick = () => {
            if (confirm('مسح ذاكرة التفاعل؟')) {
                ['processedLikes','processedFollows','processedFollowBacks','processedCommentLikes',
                 'processedNotifReplies','processedMessages','processedReposts','processedPosts']
                    .forEach(k => NS.state[k] = []);
                NS.state.unfollowedUsers = [];
                NS.state.actionCounter = 0;
                NS.forceSaveSettings();
                NS.pushLog('info', '🧠 مسح الذاكرة');
            }
        };

        document.getElementById('b11-theme').onclick = () => {
            NS.state.theme = NS.state.theme === 'dark' ? 'light' : 'dark';
            panel.style.background = NS.state.theme === 'light' ? '#f1f5f9' : '#161e27';
            panel.style.color = NS.state.theme === 'light' ? '#0f172a' : '#e2e8f0';
            NS.saveSettings();
        };
        document.getElementById('b11-collapse').onclick = () => {
            panel.style.display = 'none';
            mini.style.display = 'flex';
            NS.state.collapsed = true;
            NS.saveSettings();
        };
        document.getElementById('b11-close').onclick = () => {
            panel.style.display = 'none';
            mini.style.display = 'flex';
            NS.state.collapsed = true;
            NS.saveSettings();
        };

        document.addEventListener('keydown', e => {
            if (e.shiftKey && e.key.toLowerCase() === 'b') {
                const vis = panel.style.display !== 'none';
                panel.style.display = vis ? 'none' : 'flex';
                mini.style.display = vis ? 'flex' : 'none';
                NS.state.collapsed = vis;
                NS.saveSettings();
            }
        });

        const handle = document.getElementById('b11-header');
        let p1 = 0, p2 = 0, p3 = 0, p4 = 0;
        handle.onmousedown = e => {
            if (e.target.closest('.b11-icon')) return;
            e.preventDefault();
            p3 = e.clientX; p4 = e.clientY;
            document.onmouseup = () => { document.onmouseup = null; document.onmousemove = null; };
            document.onmousemove = ev => {
                ev.preventDefault();
                p1 = p3 - ev.clientX;
                p2 = p4 - ev.clientY;
                p3 = ev.clientX; p4 = ev.clientY;
                panel.style.top = (panel.offsetTop - p2) + "px";
                panel.style.left = (panel.offsetLeft - p1) + "px";
                panel.style.right = 'auto';
            };
        };

        const resizer = document.getElementById('b11-resize');
        let rw = 0, rh = 0, rx = 0, ry = 0;
        resizer.onmousedown = e => {
            e.preventDefault();
            rx = e.clientX; ry = e.clientY;
            rw = panel.offsetWidth; rh = panel.offsetHeight;
            document.onmouseup = () => { document.onmouseup = null; document.onmousemove = null; };
            document.onmousemove = ev => {
                const w = Math.max(320, Math.min(900, rw + (rx - ev.clientX)));
                const h = Math.max(300, Math.min(900, rh + (ev.clientY - ry)));
                panel.style.width = w + 'px';
                panel.style.height = h + 'px';
                NS.state.panelSize = { w, h };
            };
        };
        resizer.onmouseup = () => NS.forceSaveSettings();

        document.getElementById('b11-export-csv').onclick = () => {
            const rows = [['date','likes','follows','unfollows','replies','followBacks',
                           'commentLikes','notifReplies','messageReplies','posts','reposts']];
            NS.stats.history.forEach(h => rows.push([
                h.d, h.likes||0, h.follows||0, h.unfollows||0, h.replies||0,
                h.followBacks||0, h.commentLikes||0, h.notifReplies||0,
                h.messageReplies||0, h.posts||0, h.reposts||0
            ]));
            const blob = new Blob([rows.map(r => r.join(',')).join('\n')], { type: 'text/csv' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'bsky-stats.csv';
            a.click();
        };
        document.getElementById('b11-export-sheets').onclick = NS.exportToSheets;
        document.getElementById('b11-reset-stats').onclick = () => {
            if (confirm('تصفير الإحصائيات؟')) {
                NS.stats = { likes: 0, follows: 0, unfollows: 0, replies: 0, followBacks: 0,
                    commentLikes: 0, notifReplies: 0, messageReplies: 0, posts: 0,
                    reposts: 0, engagerFollows: 0, history: [] };
                NS.saveStats();
                NS.updateStatsUI();
                NS.renderChart();
            }
        };
        document.getElementById('b11-log-clear').onclick = () => {
            if (confirm('مسح السجل؟')) {
                NS.state.activityLog = [];
                NS.forceSaveSettings();
                NS.renderLog();
            }
        };

        const checkUpdBtn = document.getElementById('b11-check-update');
        if (checkUpdBtn) {
            checkUpdBtn.onclick = async () => {
                const status = document.getElementById('b11-update-status');
                checkUpdBtn.disabled = true;
                checkUpdBtn.innerText = '⏳...';
                if (status) status.innerText = '⏳ GitHub...';
                const hasUpdate = await NS.checkForUpdate(false);
                checkUpdBtn.disabled = false;
                checkUpdBtn.innerText = '🔄 فحص التحديثات';
                if (status) status.innerText = hasUpdate ? '🆕 تحديث!' : '✅ أحدث نسخة';
                const lastEl = document.getElementById('b11-last-check');
                if (lastEl) lastEl.innerText = `آخر فحص: ${new Date().toLocaleString('ar-EG')}`;
            };
        }
        const autoUpdEl = document.getElementById('b11-auto-update');
        if (autoUpdEl) autoUpdEl.onchange = e => { NS.state.autoUpdateCheck = e.target.checked; NS.saveSettings(); };

        const lastCheckEl = document.getElementById('b11-last-check');
        if (lastCheckEl) {
            const last = parseInt(localStorage.getItem('bsky_bot_last_update_check') || '0', 10);
            if (last > 0) lastCheckEl.innerText = `آخر فحص: ${new Date(last).toLocaleString('ar-EG')}`;
        }
    };

    NS.renderAll = function () {
        NS.renderLog();
        NS.updateStatsUI();
        NS.renderScheduledPosts();
        NS.renderDailyStats();
        NS.renderProfiles();
        NS.renderChart();
        NS.renderABReport();
        NS.renderMLReport();
        NS.renderErrorTab();
    };

    NS.updateStatsUI = function () {
        const s = (id, v) => { const e = document.getElementById(id); if (e) e.innerText = v; };
        s('st-likes', NS.stats.likes); s('st-follows', NS.stats.follows);
        s('st-unfollows', NS.stats.unfollows); s('st-replies', NS.stats.replies);
        s('st-followbacks', NS.stats.followBacks || 0);
        s('st-commentlikes', NS.stats.commentLikes || 0);
        s('st-notifreplies', NS.stats.notifReplies || 0);
        s('st-msgreplies', NS.stats.messageReplies || 0);
        s('st-posts', NS.stats.posts || 0);
        s('st-reposts', NS.stats.reposts || 0);
        s('st-engagerfollows', NS.stats.engagerFollows || 0);
    };

    NS.updateDebugInfo = function (type, val) {
        const map = { like: 'b11-dbg-like', follow: 'b11-dbg-follow' };
        const icons = { like: '❤️', follow: '👤' };
        const el = document.getElementById(map[type]);
        if (!el) return;
        const c = val > 0 ? '#10b981' : '#ef4444';
        el.innerHTML = `${icons[type]}<b style="color:${c}">${val}</b>`;
    };

    NS.renderLog = function () {
        const el = document.getElementById('b11-log-box');
        if (!el) return;
        el.innerHTML = NS.state.activityLog.slice(-100).reverse().map(l => {
            const color = l.type.includes('fail') ? '#ef4444'
                : l.type.includes('break') ? '#a855f7'
                : l.type.includes('follow-back') ? '#f59e0b'
                : l.type.includes('comment-like') ? '#ec4899'
                : l.type.includes('notif-reply') ? '#3b82f6'
                : l.type.includes('message-reply') ? '#8b5cf6'
                : l.type.includes('post') ? '#22c55e'
                : l.type.includes('repost') ? '#06b6d4'
                : l.type.includes('engager') ? '#10b981'
                : l.type.includes('cleanup') ? '#f97316'
                : l.type.includes('unfollower') ? '#ef4444'
                : l.type.includes('reply') ? '#06b6d4'
                : '#cbd5e1';
            return `<div style="color:${color}">${new Date(l.t).toLocaleTimeString()} • ${l.type} • ${NS.esc(l.detail)}</div>`;
        }).join('');
        const last = document.getElementById('b11-last-result');
        if (last && NS.state.lastClickResult) last.innerText = NS.state.lastClickResult;
    };

    NS.renderScheduledPosts = function () {
        const el = document.getElementById('b11-post-list');
        if (!el) return;
        if (!NS.state.scheduledPosts.length) {
            el.innerHTML = '<div style="color:#64748b;text-align:center;padding:6px;">لا توجد منشورات</div>';
            return;
        }
        el.innerHTML = NS.state.scheduledPosts.slice(-20).reverse().map(p => {
            const d = new Date(p.time);
            const st = p.posted ? '✅' : '⏳';
            let mediaIcon = '';
            if (p.hasMedia) {
                if (NS.mediaBlobs.has(p.id)) {
                    mediaIcon = `<span title="✅ المرفق جاهز" style="cursor:help;">📎</span>`;
                } else {
                    mediaIcon = `<span class="b11-missing-media" title="⚠️ الملف فقد (المتصفح أُغلق) — أعد رفعه">⚠️</span>`;
                }
            }
            let accLabel = `👤 الحالي`;
            if (typeof p.accountIdx === 'number' && p.accountIdx >= 0) {
                if (NS.profiles[p.accountIdx]) accLabel = `👤 ${NS.esc(NS.profiles[p.accountIdx].name)}`;
                else accLabel = `👤 <span style="color:#ef4444;" title="⚠️ الحساب محذوف">(محذوف)</span>`;
            }
            return `<div style="background:#0a121e;padding:6px 8px;border-radius:5px;margin:4px 0;font-size:10px;border:1px solid #1e293b;">
                <div style="display:flex;justify-content:space-between;gap:6px;">
                    <div style="overflow:hidden;flex:1;min-width:0;">
                        <div style="color:#cbd5e1;word-break:break-word;">${st} ${mediaIcon} ${NS.esc((p.text || '').slice(0, 45))}${(p.text || '').length > 45 ? '...' : ''}</div>
                        <div style="color:#60a5fa;margin-top:3px;">${accLabel}</div>
                        <div style="color:#94a3b8;font-size:9px;">⏰ ${d.toLocaleString('ar-EG')}</div>
                    </div>
                    <button data-del-post="${p.id}" title="🗑️ حذف" style="background:linear-gradient(135deg,#ef4444,#dc2626);border:none;color:#fff;padding:5px 8px;border-radius:4px;cursor:pointer;font-size:12px;font-weight:bold;">🗑️</button>
                </div>
            </div>`;
        }).join('');
        el.querySelectorAll('[data-del-post]').forEach(b => {
            b.onclick = e => { e.stopPropagation(); NS.deleteScheduledPost(b.dataset.delPost); };
        });
    };

    NS.deleteScheduledPost = function (id) {
        const idx = NS.state.scheduledPosts.findIndex(p => p.id === id);
        if (idx === -1) return;
        const post = NS.state.scheduledPosts[idx];
        const preview = (post.text || '').slice(0, 40) || '(بدون نص)';
        if (!confirm(`🗑️ حذف المنشور؟\n\n"${preview}"`)) return;
        if (NS.mediaBlobs.has(id)) NS.mediaBlobs.delete(id);
        NS.state.scheduledPosts.splice(idx, 1);
        NS.forceSaveSettings();
        NS.renderScheduledPosts();
        NS.notify('✅', 'حُذف');
    };

    NS.renderDailyStats = function () {
        const el = document.getElementById('b11-daily');
        if (!el) return;
        const c = NS.getDailyCounters();
        el.innerHTML = `❤️ ${c.likes||0}/${NS.state.dailyLimitLikes} | 👤 ${c.follows||0}/${NS.state.dailyLimitFollows} |
            💬 ${c.replies||0}/${NS.state.dailyLimitReplies} | 📨 ${c.messages||0}/${NS.state.dailyLimitMessages} |
            📝 ${c.posts||0}/${NS.state.dailyLimitPosts} | 🔁 ${c.reposts||0}/${NS.state.dailyLimitReposts}`;
    };

    NS.renderProfiles = function () {
        const el = document.getElementById('b11-profiles');
        if (!el) return;
        let html = `
            <div class="b11-new-profile-form">
                <div class="b11-section-title">➕ إضافة حساب جديد</div>
                <input type="text" id="b11-new-profile-handle" placeholder="اسم الحساب (username.bsky.social)" style="margin-bottom:4px;">
                <input type="password" id="b11-new-profile-pass" placeholder="كلمة مرور التطبيق" style="margin-bottom:4px;">
                <input type="text" id="b11-new-profile-name" placeholder="اسم مستعار (اختياري)" style="margin-bottom:4px;">
                <div class="b11-app-pass-hint">
                    ⚠️ من: <a href="${NS.APP_PASSWORD_URL}" target="_blank">${NS.APP_PASSWORD_URL}</a>
                </div>
                <button id="b11-add-new-profile" class="b11-btn blue">💾 حفظ</button>
            </div>`;
        if (NS.profiles.length === 0) {
            html += '<div style="color:#64748b;font-size:10px;text-align:center;padding:4px;">لا توجد حسابات محفوظة</div>';
        } else {
            html += NS.profiles.map((p, i) => `
                <div style="display:flex;justify-content:space-between;align-items:center;background:#0a121e;padding:5px 8px;border-radius:5px;margin:3px 0;font-size:11px;">
                    <div style="overflow:hidden;flex:1;">
                        <div>${i === NS.activeProfileIdx ? '🟢' : '⚪'} ${NS.esc(p.name)}</div>
                        <div style="font-size:9px;color:#94a3b8;">📛 ${NS.esc(p.handle || '—')} | 🔑 ${p.appPassword ? 'محفوظة ✅' : '⚠️'}</div>
                    </div>
                    <div>
                        <button data-sw="${i}" style="background:#22c55e;border:none;color:#fff;padding:2px 6px;border-radius:3px;cursor:pointer;font-size:9px;margin-right:3px;">تبديل</button>
                        <button data-del="${i}" style="background:#ef4444;border:none;color:#fff;padding:2px 6px;border-radius:3px;cursor:pointer;font-size:9px;">حذف</button>
                    </div>
                </div>
            `).join('');
        }
        el.innerHTML = html;
        el.querySelectorAll('[data-sw]').forEach(b => b.onclick = () => NS.switchProfile(+b.dataset.sw));
        el.querySelectorAll('[data-del]').forEach(b => b.onclick = () => NS.deleteProfile(+b.dataset.del));
        const addBtn = document.getElementById('b11-add-new-profile');
        if (addBtn) {
            addBtn.onclick = () => {
                const h = document.getElementById('b11-new-profile-handle');
                const p = document.getElementById('b11-new-profile-pass');
                const n = document.getElementById('b11-new-profile-name');
                const ok = NS.addNewProfile(h.value, p.value, n.value);
                if (ok) { h.value = ''; p.value = ''; n.value = ''; }
            };
        }
        NS.populatePostAccountSelect();
    };

    NS.renderChart = function () {
        const cv = document.getElementById('b11-chart');
        if (!cv) return;
        const ctx = cv.getContext('2d');
        const W = cv.width, H = cv.height;
        ctx.clearRect(0, 0, W, H);
        const last7 = NS.stats.history.slice(-7);
        if (!last7.length) {
            ctx.fillStyle = '#64748b'; ctx.font = '12px sans-serif';
            ctx.fillText('لا توجد بيانات', 10, H / 2);
            return;
        }
        const max = Math.max(...last7.map(h => (h.likes||0) + (h.follows||0)), 10);
        const bw = W / last7.length;
        last7.forEach((h, i) => {
            const lh = ((h.likes||0) / max) * (H - 30);
            const fh = ((h.follows||0) / max) * (H - 30);
            const x = i * bw + 4;
            ctx.fillStyle = '#ef4444';
            ctx.fillRect(x, H - 20 - lh, bw / 2 - 2, lh);
            ctx.fillStyle = '#0085ff';
            ctx.fillRect(x + bw / 2, H - 20 - fh, bw / 2 - 2, fh);
            ctx.fillStyle = '#64748b'; ctx.font = '9px sans-serif';
            ctx.fillText(h.d.slice(5), x, H - 6);
        });
    };

    NS.renderABReport = function () {
        const el = document.getElementById('b11-ab-report');
        if (!el) return;
        const entries = Object.entries(NS.state.replyPerf || {}).sort((a, b) => b[1].uses - a[1].uses).slice(0, 5);
        if (!entries.length) { el.innerText = 'لا توجد بيانات'; return; }
        el.innerHTML = entries.map(([t, d]) => `<div>• "${NS.esc(t.slice(0, 20))}" — ${d.uses}</div>`).join('');
    };

    NS.renderMLReport = function () {
        const el = document.getElementById('b11-ml-report');
        if (!el) return;
        const best = NS.getBestHour();
        el.innerText = best.count > 0 ? `⏰ أفضل ساعة: ${best.hour}:00 (${best.count} فعل)` : 'لا توجد بيانات';
    };

    console.log('📦 ui.js محمّل - v' + NS.version);
})();


/* ═══════════════════════════════════════════════════════════
   src/update.js
   ═══════════════════════════════════════════════════════════ */
(function () {
    'use strict';
    const NS = window.__BSKY;
    if (!NS) return;

    const UPDATE_URL = `https://raw.githubusercontent.com/${NS.GITHUB_REPO}/main/bsky-bot.user.js`;
    const LAST_CHECK_KEY = 'bsky_bot_last_update_check';
    const AUTO_CHECK_INTERVAL = 24 * 60 * 60 * 1000;

    NS.compareVersions = function (a, b) {
        const pa = String(a).split('.').map(Number);
        const pb = String(b).split('.').map(Number);
        const len = Math.max(pa.length, pb.length);
        for (let i = 0; i < len; i++) {
            const na = pa[i] || 0, nb = pb[i] || 0;
            if (na > nb) return 1;
            if (na < nb) return -1;
        }
        return 0;
    };

    NS.fetchLatestVersion = function () {
        return new Promise(resolve => {
            const url = UPDATE_URL + '?t=' + Date.now();
            if (typeof GM_xmlhttpRequest === 'function') {
                try {
                    GM_xmlhttpRequest({
                        method: 'GET', url,
                        headers: { 'Cache-Control': 'no-cache' },
                        timeout: 15000,
                        onload: res => {
                            try {
                                if (res.status !== 200) { resolve({ ok: false, error: 'HTTP ' + res.status }); return; }
                                const m = (res.responseText || '').match(/@version\s+([\d.]+)/);
                                if (!m) { resolve({ ok: false, error: 'لا يوجد إصدار' }); return; }
                                resolve({ ok: true, version: m[1] });
                            } catch (e) { resolve({ ok: false, error: e.message }); }
                        },
                        onerror: () => resolve({ ok: false, error: 'فشل الاتصال' }),
                        ontimeout: () => resolve({ ok: false, error: 'انتهت المهلة' })
                    });
                } catch (e) { resolve({ ok: false, error: e.message }); }
            } else {
                fetch(url, { cache: 'no-cache' })
                    .then(r => r.text())
                    .then(text => {
                        const m = text.match(/@version\s+([\d.]+)/);
                        if (!m) throw new Error('لا يوجد إصدار');
                        resolve({ ok: true, version: m[1] });
                    })
                    .catch(e => resolve({ ok: false, error: e.message }));
            }
        });
    };

    NS.checkForUpdate = async function (silent) {
        silent = silent === true;
        if (!silent) NS.setFooter('🔄 فحص...');
        const result = await NS.fetchLatestVersion();
        if (!result.ok) {
            if (!silent) { NS.setFooter('❌ فشل'); alert(`❌ فشل: ${result.error}`); }
            return false;
        }
        const latest = result.version, current = NS.version;
        const cmp = NS.compareVersions(latest, current);
        try { localStorage.setItem(LAST_CHECK_KEY, Date.now().toString()); } catch (e) {}

        if (cmp > 0) {
            NS.pushLog('update', `🆕 v${latest}`);
            NS.setFooter(`🆕 v${latest}`);
            NS.notify('🆕 تحديث', `v${latest}`);
            const should = confirm(`🆕 تحديث متوفر!\n\nالحالي: v${current}\nالجديد: v${latest}\n\nتحديث الآن؟`);
            if (should) NS.installUpdate();
            return true;
        }
        if (cmp === 0 && !silent) {
            NS.setFooter(`✅ v${current}`);
            alert(`✅ أحدث نسخة: v${current}`);
        }
        return false;
    };

    NS.installUpdate = function () {
        const url = UPDATE_URL + '?t=' + Date.now();
        const win = window.open(url, '_blank');
        if (!win || win.closed) setTimeout(() => { if (confirm('فتح صفحة التثبيت؟')) location.href = url; }, 300);
    };

    NS.autoCheckUpdate = function () {
        if (NS.state.autoUpdateCheck === false) return;
        const lastCheck = parseInt(localStorage.getItem(LAST_CHECK_KEY) || '0', 10);
        if (Date.now() - lastCheck >= AUTO_CHECK_INTERVAL) setTimeout(() => NS.checkForUpdate(true), 30000);
        setInterval(() => {
            if (NS.state.autoUpdateCheck === false) return;
            const last = parseInt(localStorage.getItem(LAST_CHECK_KEY) || '0', 10);
            if (Date.now() - last >= AUTO_CHECK_INTERVAL) NS.checkForUpdate(true);
        }, 6 * 60 * 60 * 1000);
    };

    NS.checkUpdateOnInstall = function () {
        const last = parseInt(localStorage.getItem(LAST_CHECK_KEY) || '0', 10);
        if (last === 0) setTimeout(() => NS.checkForUpdate(true), 60000);
    };

    console.log('📦 update.js محمّل - v' + NS.version);
})();


/* ═══════════════════════════════════════════════════════════
   navigator.js — التنقّل الآلي
   ═══════════════════════════════════════════════════════════ */
(function () {
    'use strict';
    const NS = window.__BSKY;
    if (!NS) return;
    NS.pageArrivedAt = Date.now();

    NS.pageHasWork = function (path) {
        const s = NS.state;
        if (path === '/messages') return !!s.autoReplyMessages;
        if (path === '/notifications') {
            return !!(s.autoFollowBack || s.autoReplyNotifications || s.autoLikeCommenters || s.followEngagers);
        }
        return !!(s.autoLike || s.autoFollow || s.autoReply || s.autoRepost || s.autoUnfollow);
    };

    NS.waitForContent = async function (myGen, timeoutMs) {
        timeoutMs = timeoutMs || 15000;
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            if (myGen !== NS.loopGeneration) return false;
            const onM = location.pathname.includes('/messages');
            if (onM) {
                if (document.querySelector('a[href^="/messages/"][role="link"]')) return true;
            } else {
                const l = NS.collectAllLikeButtons().length;
                const f = NS.collectAllFollowButtons().length;
                const n = document.querySelectorAll('[data-testid^="feedItem-by-"]').length;
                if (l + f + n > 0) return true;
            }
            await NS.sleep(500);
        }
        return false;
    };

    NS.maybeAutoNavigate = async function (myGen) {
        if (!NS.state.navEnabled) return;
        if (!NS.isWithinSchedule()) return;
        const stayMin = (Number(NS.state.navStayMin) || 3) * 60000;
        const stayMax = Math.max(stayMin, (Number(NS.state.navStayMax) || 6) * 60000);
        const stay = NS.rand(stayMin, stayMax);
        if (Date.now() - NS.pageArrivedAt < stay) return;
        const pages = (Array.isArray(NS.state.navPages) && NS.state.navPages.length)
            ? NS.state.navPages : ['/', '/notifications', '/messages'];
        const cur = location.pathname === '/' ? '/'
            : location.pathname.startsWith('/notifications') ? '/notifications'
            : location.pathname.startsWith('/messages') ? '/messages' : null;
        const idx = cur ? pages.indexOf(cur) : -1;
        for (let i = 1; i <= pages.length; i++) {
            const next = pages[(idx + i + pages.length) % pages.length];
            if (next === cur) continue;
            if (!NS.pageHasWork(next)) continue;
            if (myGen !== NS.loopGeneration) return;
            NS.pushLog('nav', '🧭 → ' + next);
            NS.setFooter('🧭 → ' + next);
            NS.forceSaveSettings();
            await NS.sleep(1200);
            location.href = 'https://bsky.app' + next;
            return;
        }
    };

    console.log('📦 navigator.js محمّل');
})();


/* ════════════════ بدء التشغيل ════════════════ */
(function () {
    'use strict';
    const NS = window.__BSKY;
    if (!NS) { console.error('❌ فشل تهيئة البوت'); return; }

    const requiredFunctions = [
        'createDashboard', 'botLoop', 'autoCheckUpdate', 'checkForUpdate',
        'doCleanupNonFollowers', 'doFollowBack', 'doAutoLike', 'doAutoFollow',
        'doAutoReply', 'findReplyButtons', 'findComposer', 'findComposerSend',
        'setInputValue', 'waitForComposer', 'appendHashtags', 'generateHashtags',
        'getSessionFor', 'refreshSessionFor', 'populatePostAccountSelect',
        'addNewProfile', 'doReplyToNotifications', 'doReplyToMessages', 'collectEngagers'
    ];
    const missing = requiredFunctions.filter(fn => typeof NS[fn] !== 'function');
    if (missing.length) { console.error('❌ دوال مفقودة:', missing.join(', ')); return; }
    console.log('✅ كل وحدات البوت جاهزة');

    NS.waitForReactApp = async function (timeoutMs) {
        timeoutMs = timeoutMs || 60000;
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            const root = document.getElementById('root');
            const splash = document.getElementById('splash');
            if (root && root.children.length > 0 && !splash) {
                const hasContent = document.querySelector('main') &&
                    (document.querySelectorAll('button, [role="button"]').length > 5 ||
                     document.querySelectorAll('[data-testid^="feedItem-by-"]').length > 0 ||
                     document.querySelectorAll('a[href^="/messages/"]').length > 0);
                if (hasContent) {
                    await NS.sleep(1500);
                    return true;
                }
            }
            await NS.sleep(300);
        }
        console.warn('⚠️ انتهت المهلة');
        return false;
    };

    (async function startup() {
        try {
            await NS.waitForReactApp(60000);
            NS.createDashboard();
            NS.botLoop();
            NS.autoCheckUpdate();
            NS.checkUpdateOnInstall();
            console.log(`🚀 بوت بلو سكاي v${NS.version} يعمل`);
            console.log('💡 Shift+B للوحة');
        } catch (e) {
            console.error('❌ فشل بدء التشغيل:', e);
            NS.captureError(e, 'startup');
        }
    })();

    window.addEventListener('beforeunload', () => {
        try { NS.loopGeneration++; NS.stopKeepAlive(); } catch (e) {}
    });
})();
