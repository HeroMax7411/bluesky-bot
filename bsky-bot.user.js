// ==UserScript==
// @name         بوت إدارة بلو سكاي v1.0.3 PRO
// @name:en      Bluesky Bot Manager v1.0.3 PRO
// @namespace    https://github.com/YOUR_USERNAME/bsky-bot
// @version      1.0.3
// @description  بوت إدارة بلو سكاي الاحترافي - 30 ميزة متقدمة + دعم عربي كامل + تتبع أخطاء
// @description:en Professional Bluesky bot - 30 advanced features + full Arabic support + error tracking
// @author       Sayed Alhlwani
// @homepageURL  https://sayedalhlwani.blogspot.com/
// @supportURL   https://github.com/YOUR_USERNAME/bsky-bot/issues
// @updateURL    https://raw.githubusercontent.com/YOUR_USERNAME/bsky-bot/main/bsky-bot.user.js
// @downloadURL  https://raw.githubusercontent.com/YOUR_USERNAME/bsky-bot/main/bsky-bot.user.js
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

(function () {
    'use strict';

    /* ══════════════════════════════════════════════════
       ⚙️ الإعدادات الأساسية - عدّلي YOUR_USERNAME هنا
    ══════════════════════════════════════════════════ */
    const VERSION = '1.0.3';
    const GITHUB_REPO = 'YOUR_USERNAME/bsky-bot';      // ← استبدلي هذا
    const GITHUB_ISSUES_URL = `https://github.com/${GITHUB_REPO}/issues/new`;
    const DEV_URL    = 'https://sayedalhlwani.blogspot.com/';
    const DONATE_URL = 'https://ko-fi.com/heromax7411';

    const STORAGE_KEY   = 'bsky_bot_v75_settings';
    const STATS_KEY     = 'bsky_bot_v75_stats';
    const PROFILES_KEY  = 'bsky_bot_v75_profiles';
    const ERROR_LOG_KEY = 'bsky_bot_error_log_v1';
    const PANEL_ID      = 'bsky-bot-v75';

    /* ════════════════ أدوات مساعدة ════════════════ */
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
    const todayStr = () => new Date().toISOString().slice(0, 10);
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
        c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

    function notify(title, text) {
        try { if (typeof GM_notification === 'function')
            GM_notification({ title, text, timeout: 4000 }); } catch(e){}
    }

    /* ════════════════ 🐛 نظام تتبع الأخطاء ════════════════ */
    let errorLog = [];
    try {
        errorLog = JSON.parse(localStorage.getItem(ERROR_LOG_KEY) || '[]');
        if (!Array.isArray(errorLog)) errorLog = [];
    } catch(e) { errorLog = []; }

    function saveErrorLog() {
        try {
            errorLog = errorLog.slice(-50);
            localStorage.setItem(ERROR_LOG_KEY, JSON.stringify(errorLog));
        } catch(e) {}
    }

    function captureError(err, context = '') {
        try {
            const entry = {
                t: Date.now(),
                version: VERSION,
                message: (err && err.message ? err.message : String(err)).slice(0, 500),
                stack: ((err && err.stack) ? err.stack : '').slice(0, 1500),
                context: String(context || '').slice(0, 200),
                url: location.href.slice(0, 200),
                userAgent: navigator.userAgent.slice(0, 200),
                handle: (typeof state !== 'undefined' && state && state.myHandle) ? state.myHandle : '',
                viewport: `${window.innerWidth}x${window.innerHeight}`,
            };
            errorLog.push(entry);
            saveErrorLog();
            console.error('🔴 خطأ مُسجّل:', entry);
        } catch(e) {
            console.error('فشل تسجيل الخطأ', e);
        }
    }

    window.addEventListener('error', (e) => {
        captureError(e.error || new Error(e.message), `global error @ line ${e.lineno}`);
    });
    window.addEventListener('unhandledrejection', (e) => {
        captureError(e.reason, 'unhandled promise rejection');
    });

    function buildErrorReport(errors) {
        let out = `## 🐛 تقرير خطأ تلقائي\n\n`;
        out += `**الإصدار**: \`v${VERSION}\`\n`;
        out += `**التاريخ**: ${new Date().toLocaleString('ar-EG')}\n`;
        out += `**المتصفح**: ${navigator.userAgent}\n`;
        out += `**الصفحة**: ${location.href}\n`;
        out += `**الحساب**: ${(state && state.myHandle) || 'غير معروف'}\n`;
        out += `**الشاشة**: ${window.innerWidth}x${window.innerHeight}\n\n`;
        out += `---\n\n`;
        errors.forEach((e, i) => {
            out += `### خطأ #${i + 1}\n`;
            out += `- **الوقت**: ${new Date(e.t).toLocaleString('ar-EG')}\n`;
            out += `- **الرسالة**: \`${e.message}\`\n`;
            out += `- **السياق**: ${e.context || 'غير محدد'}\n`;
            if (e.stack) {
                out += `- **Stack**:\n\`\`\`\n${e.stack}\n\`\`\`\n`;
            }
            out += `\n`;
        });
        out += `---\n\n_تم إنشاء هذا التقرير تلقائياً من بوت بلو سكاي_`;
        return out;
    }

    function reportErrorToGitHub(errorEntry = null) {
        const errors = errorEntry ? [errorEntry] : errorLog.slice(-5);
        if (errors.length === 0) {
            alert('✅ لا توجد أخطاء مسجلة');
            return;
        }
        const title = encodeURIComponent(
            `[Auto-Report] خطأ في v${VERSION} - ${errors[0].message.slice(0, 60)}`
        );
        const body = encodeURIComponent(buildErrorReport(errors));
        const url = `${GITHUB_ISSUES_URL}?title=${title}&body=${body}&labels=bug,auto-report`;
        window.open(url, '_blank');
        notify('إرسال خطأ', 'تم فتح صفحة GitHub Issues');
    }

    function exportErrorLog() {
        const blob = new Blob([JSON.stringify(errorLog, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `bsky-errors-${todayStr()}.json`;
        a.click();
        notify('تصدير', `تم تصدير ${errorLog.length} خطأ`);
    }

    function clearErrorLog() {
        if (!confirm('مسح جميع الأخطاء المسجلة؟')) return;
        errorLog = [];
        saveErrorLog();
        renderErrorTab();
        alert('✅ تم المسح');
    }

    function renderErrorTab() {
        const countEl = document.getElementById('b11-error-count');
        if (countEl) {
            countEl.innerHTML = `📊 عدد الأخطاء المسجلة: <b style="color:#ef4444">${errorLog.length}</b>`;
        }
        const listEl = document.getElementById('b11-error-list');
        if (!listEl) return;
        if (errorLog.length === 0) {
            listEl.innerHTML = '<div style="color:#22c55e;text-align:center;padding:10px;">✅ لا توجد أخطاء</div>';
            return;
        }
        listEl.innerHTML = errorLog.slice(-20).reverse().map(e => `
            <div style="background:#1a0f0f;padding:6px;border-radius:4px;margin:4px 0;
                border-right:3px solid #ef4444;">
                <div style="color:#fbbf24;font-weight:bold;font-size:10px;">
                    ${new Date(e.t).toLocaleTimeString('ar-EG')} - v${esc(e.version)}
                </div>
                <div style="color:#fca5a5;margin:3px 0;word-break:break-all;">
                    ${esc(e.message.slice(0, 120))}
                </div>
                ${e.context ? `<div style="color:#94a3b8;font-size:9px;">${esc(e.context)}</div>` : ''}
            </div>
        `).join('');
    }

    /* ════════════════ تشفير UTF-8 آمن ════════════════ */
    const XOR_KEY = 'bsky-v75-pro-key-2026';
    function strToU8(str) { return new TextEncoder().encode(str); }
    function u8ToStr(u8) { return new TextDecoder().decode(u8); }
    function u8ToB64(u8) {
        let bin = '';
        for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
        return btoa(bin);
    }
    function b64ToU8(b64) {
        const bin = atob(b64);
        const u8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        return u8;
    }
    function encrypt(text) {
        if (!text) return '';
        try {
            const bytes = strToU8(text);
            const keyBytes = strToU8(XOR_KEY);
            const out = new Uint8Array(bytes.length);
            for (let i = 0; i < bytes.length; i++)
                out[i] = bytes[i] ^ keyBytes[i % keyBytes.length];
            return 'ENC:' + u8ToB64(out);
        } catch (e) { return text; }
    }
    function decrypt(enc) {
        if (!enc || !enc.startsWith('ENC:')) return enc || '';
        try {
            const bytes = b64ToU8(enc.slice(4));
            const keyBytes = strToU8(XOR_KEY);
            const out = new Uint8Array(bytes.length);
            for (let i = 0; i < bytes.length; i++)
                out[i] = bytes[i] ^ keyBytes[i % keyBytes.length];
            return u8ToStr(out);
        } catch (e) { return ''; }
    }

    /* ════════════════ Keep-Alive ════════════════ */
    let keepAliveWorker = null, keepAliveURL = null;
    function startKeepAlive() {
        try {
            if (keepAliveWorker) return;
            const blob = new Blob(['setInterval(()=>postMessage("p"),30000)'], {type:'text/javascript'});
            keepAliveURL = URL.createObjectURL(blob);
            keepAliveWorker = new Worker(keepAliveURL);
            keepAliveWorker.onmessage = () => {};
        } catch(e){}
    }
    function stopKeepAlive() {
        try {
            if (keepAliveWorker) { keepAliveWorker.terminate(); keepAliveWorker = null; }
            if (keepAliveURL) { URL.revokeObjectURL(keepAliveURL); keepAliveURL = null; }
        } catch(e){}
    }
    startKeepAlive();

    /* ════════════════ الحالة الافتراضية ════════════════ */
    const defaultState = {
        autoLike: false, autoFollow: false, autoUnfollow: false,
        autoReply: false, autoFollowBack: false, autoLikeCommenters: false,
        autoReplyNotifications: false, autoReplyMessages: false, autoRepost: false,

        messageReplyText: "شكراً على رسالتك! سأرد عليك قريباً 🙏\nأهلاً بك! كيف يمكنني مساعدتك؟",
        customReplyText: "منشور رائع! ✨\nتفاعل جميل 🌟\nشكراً على المشاركة 🙏",
        replyTextOnly: "منشور رائع! ✨\nكلام جميل 🌟",
        replyWithImage: "صورة جميلة! 📸\nإبداع رائع! 🎨",
        repostKeywords: "",

        blacklistWords: "spam\ncrypto\nnft\nاعلانات",
        keywordFilter: "", useKeywordFilter: false,
        skipNoAvatar: false, onlyArabic: true, languageFilter: "ar",

        scheduleEnabled: false, scheduleStart: 9, scheduleEnd: 23,

        dailyLimitsEnabled: false,
        dailyLimitLikes: 1000, dailyLimitFollows: 500,
        dailyLimitReplies: 200, dailyLimitMessages: 100, dailyLimitPosts: 10,
        dailyLimitReposts: 50, dailyLimitFollows21: 50,
        dailyCounters: {},

        humanBreakEnabled: true, humanBreakEveryMin: 15, humanBreakEveryMax: 25,
        breakDurationMin: 3, breakDurationMax: 7, actionCounter: 0,

        scheduledPosts: [],
        blueskyAppPassword: '',
        encryptPasswords: true,

        useTemplateVars: false,
        calendarEnabled: false,
        calendar: { sun: "", mon: "", tue: "", wed: "", thu: "", fri: "", sat: "" },
        sentimentAnalysis: false,
        trackUnfollowers: true, knownFollowers: [],
        followEngagers: false, engagerQueue: [], engagerAttempts: {},
        weatherPosts: false, weatherCity: "Cairo",
        lastWeatherCheck: 0, weatherLat: 30.0444, weatherLon: 31.2357,
        abTesting: false, replyPerf: {},
        autoHashtags: false,
        hashtagMap: "تصوير:photography,art\nبرمجة:javascript,coding\nرياضة:sports",
        worldEvents: false,
        mlPreferences: false, actionPerf: {},

        likeRatio: 100, followRatio: 100,
        dryRun: true, rateLimitPerMin: 8, paused: false,
        processedLikes: [], processedFollows: [], processedFollowBacks: [],
        processedCommentLikes: [], processedNotifReplies: [], processedMessages: [],
        processedReposts: [], processedPosts: [], unfollowedUsers: [], activityLog: [],
        theme: 'dark', autoScroll: true,
        resetMemoryEveryMin: 60, stuckThreshold: 3, fastCycleMs: 4000,
        lastClickResult: '', myHandle: '',
        panelSize: { w: 400, h: 600 },
        collapsed: false,
    };

    let state = Object.assign({}, defaultState,
        JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'));

    ['unfollowedUsers','processedLikes','processedFollows','processedFollowBacks',
     'processedCommentLikes','processedNotifReplies','processedMessages','processedReposts',
     'processedPosts','activityLog','scheduledPosts','knownFollowers','engagerQueue']
        .forEach(k => { if (!Array.isArray(state[k])) state[k] = []; });

    if (!state.dailyCounters || typeof state.dailyCounters !== 'object') state.dailyCounters = {};
    if (!state.replyPerf || typeof state.replyPerf !== 'object') state.replyPerf = {};
    if (!state.actionPerf || typeof state.actionPerf !== 'object') state.actionPerf = {};
    if (!state.engagerAttempts || typeof state.engagerAttempts !== 'object') state.engagerAttempts = {};
    if (!state.calendar) state.calendar = defaultState.calendar;

    let stats = JSON.parse(localStorage.getItem(STATS_KEY) || 'null') || {
        likes: 0, follows: 0, unfollows: 0, replies: 0, followBacks: 0,
        commentLikes: 0, notifReplies: 0, messageReplies: 0, posts: 0,
        reposts: 0, engagerFollows: 0, history: []
    };

    let profiles = JSON.parse(localStorage.getItem(PROFILES_KEY) || '[]');
    let activeProfileIdx = 0;

    let loopGeneration = 0, activeLoopId = null;
    let lastMemoryReset = Date.now(), cyclesWithoutAction = 0;

    async function sleepGen(ms, myGen) {
        const end = Date.now() + ms;
        while (Date.now() < end) {
            if (myGen !== undefined && myGen !== loopGeneration) return false;
            await sleep(Math.min(150, end - Date.now()));
        }
        return true;
    }

    /* ════════════════ حفظ ════════════════ */
    let saveScheduled = false;
    function saveSettings() {
        if (saveScheduled) return;
        saveScheduled = true;
        setTimeout(forceSaveSettings, 400);
    }
    function forceSaveSettings() {
        saveScheduled = false;
        ['processedLikes','processedFollows','processedFollowBacks','processedCommentLikes',
         'processedNotifReplies','processedMessages','processedReposts','processedPosts','engagerQueue']
            .forEach(k => state[k] = state[k].slice(-2000));
        state.unfollowedUsers = state.unfollowedUsers.slice(-300);
        state.activityLog = state.activityLog.slice(-500);
        state.scheduledPosts = state.scheduledPosts.slice(-100);
        state.knownFollowers = state.knownFollowers.slice(-2000);
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch(e){}
    }
    function saveStats() {
        stats.history = stats.history.slice(-90);
        try { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); } catch(e){}
    }
    function saveProfiles() {
        try { localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles)); } catch(e){}
    }
    function bumpStat(key, inc = 1) {
        stats[key] = (stats[key] || 0) + inc;
        const t = todayStr();
        let day = stats.history.find(h => h.d === t);
        if (!day) {
            day = { d: t, likes:0, follows:0, unfollows:0, replies:0, followBacks:0,
                    commentLikes:0, notifReplies:0, messageReplies:0, posts:0,
                    reposts:0, engagerFollows:0 };
            stats.history.push(day);
        }
        day[key] = (day[key] || 0) + inc;
        saveStats(); updateStatsUI();
        if (state.mlPreferences) trackActionPerf(key);
    }

    /* ════════════════ ML Preferences ════════════════ */
    function trackActionPerf(key) {
        const hour = new Date().getHours();
        if (!state.actionPerf[key]) state.actionPerf[key] = {};
        state.actionPerf[key][hour] = (state.actionPerf[key][hour] || 0) + 1;
        saveSettings();
    }
    function getBestHour() {
        const totals = {};
        Object.values(state.actionPerf).forEach(hours => {
            Object.entries(hours).forEach(([h, c]) => { totals[h] = (totals[h] || 0) + c; });
        });
        let best = 0, bestCount = 0;
        for (let h = 0; h < 24; h++) {
            if ((totals[h] || 0) > bestCount) { bestCount = totals[h]; best = h; }
        }
        return { hour: best, count: bestCount };
    }

    /* ════════════════ سجل ════════════════ */
    let logDirty = false, logRenderScheduled = false;
    function pushLog(type, detail) {
        state.activityLog.push({ t: Date.now(), type, detail });
        saveSettings();
        logDirty = true;
        if (!logRenderScheduled) {
            logRenderScheduled = true;
            requestAnimationFrame(() => {
                logRenderScheduled = false;
                const pane = document.querySelector('.b11-pane[data-p="log"]');
                if (logDirty && pane && pane.style.display !== 'none') {
                    logDirty = false; renderLog();
                }
            });
        }
    }

    /* ════════════════ Rate + Daily ════════════════ */
    let actionTimestamps = [];
    function rateCheck() {
        const now = Date.now();
        actionTimestamps = actionTimestamps.filter(t => now - t < 60000);
        return actionTimestamps.length < state.rateLimitPerMin;
    }
    function rateRecord() { actionTimestamps.push(Date.now()); }

    function getDailyCounters() {
        const today = todayStr();
        if (!state.dailyCounters || state.dailyCounters.date !== today) {
            state.dailyCounters = {
                date: today, likes: 0, follows: 0, replies: 0, messages: 0,
                posts: 0, followBacks: 0, commentLikes: 0, notifReplies: 0,
                reposts: 0, engagerFollows: 0
            };
            forceSaveSettings();
        }
        return state.dailyCounters;
    }
    function dailyCheck(key) {
        if (!state.dailyLimitsEnabled) return true;
        const c = getDailyCounters();
        const limits = {
            likes: state.dailyLimitLikes, follows: state.dailyLimitFollows,
            replies: state.dailyLimitReplies, messages: state.dailyLimitMessages,
            posts: state.dailyLimitPosts, reposts: state.dailyLimitReposts,
            engagerFollows: state.dailyLimitFollows21,
        };
        return (c[key] || 0) < (limits[key] || Infinity);
    }
    function dailyIncrement(key, inc = 1) {
        const c = getDailyCounters();
        c[key] = (c[key] || 0) + inc;
        forceSaveSettings();
    }

    /* ════════════════ الجدولة ════════════════ */
    function isWithinSchedule() {
        if (!state.scheduleEnabled) return true;
        const h = new Date().getHours();
        const s = Number(state.scheduleStart) || 0;
        const e = Number(state.scheduleEnd) || 24;
        if (s <= e) return h >= s && h < e;
        return h >= s || h < e;
    }

    /* ════════════════ اللغة ════════════════ */
    function isArabicText(text) {
        if (!text) return false;
        const a = (text.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g) || []).length;
        const t = text.replace(/[^a-zA-Z\u0600-\u06FF]/g, '').length;
        if (t === 0) return false;
        return (a / t) > 0.3;
    }
    function matchesLanguage(text) {
        if (!state.languageFilter || !state.languageFilter.trim()) return true;
        const l = state.languageFilter.trim().toLowerCase();
        if (l === 'ar' || l === 'arabic' || l === 'عربي') return isArabicText(text);
        return true;
    }

    /* ════════════════ فلاتر ════════════════ */
    function parseList(s) {
        return String(s || '').split(/[\n,،]/).map(w => w.trim().toLowerCase()).filter(Boolean);
    }
    function getBlacklist() { return parseList(state.blacklistWords); }
    function getKeywords()  { return parseList(state.keywordFilter); }
    function containsBlacklisted(text) {
        const l = getBlacklist();
        if (!l.length) return false;
        const low = String(text || '').toLowerCase();
        return l.some(w => low.includes(w));
    }
    function matchesKeywords(text) {
        if (!state.useKeywordFilter) return true;
        const l = getKeywords();
        if (!l.length) return true;
        const low = String(text || '').toLowerCase();
        return l.some(w => low.includes(w));
    }
    function hasAvatar(c) {
        if (!c) return false;
        for (const img of c.querySelectorAll('img')) {
            const src = img.getAttribute('src') || '';
            if (!src || src.includes('default-avatar') || src.includes('/default')) continue;
            if (/avatar/i.test(src)) return true;
        }
        return false;
    }
    function postHasImage(c) {
        if (!c) return false;
        return c.querySelectorAll('img[src*="cdn.bsky.app"], img[src*="bsky"]').length > 0;
    }
    function postHasVideo(c) {
        if (!c) return false;
        return c.querySelectorAll('video').length > 0;
    }

    /* ════════════════ Sentiment Analysis ════════════════ */
    const POSITIVE_WORDS = ['رائع','جميل','ممتاز','شكراً','شكرا','أحب','حب','سعيد','فرح','مبدع','إبداع','تحفة','Nice','great','love','amazing','awesome','happy','good'];
    const NEGATIVE_WORDS = ['سيء','حزين','غاضب','كره','مؤلم','فاشل','صعب','سيئة','terrible','sad','angry','hate','awful','bad'];
    function analyzeSentiment(text) {
        if (!text) return 'neutral';
        const low = text.toLowerCase();
        let pos = 0, neg = 0;
        POSITIVE_WORDS.forEach(w => { if (low.includes(w.toLowerCase())) pos++; });
        NEGATIVE_WORDS.forEach(w => { if (low.includes(w.toLowerCase())) neg++; });
        if (pos > neg) return 'positive';
        if (neg > pos) return 'negative';
        return 'neutral';
    }

    /* ════════════════ Template Variables ════════════════ */
    function applyTemplateVars(template, ctx) {
        if (!state.useTemplateVars) return template;
        return template
            .replace(/\{name\}/g, ctx.name || 'صديقي')
            .replace(/\{handle\}/g, ctx.handle || '')
            .replace(/\{post\}/g, (ctx.post || '').slice(0, 60))
            .replace(/\{time\}/g, new Date().toLocaleTimeString('ar-EG'))
            .replace(/\{date\}/g, todayStr());
    }

    /* ════════════════ Auto Hashtags ════════════════ */
    function generateHashtags(text) {
        if (!state.autoHashtags) return '';
        const map = {};
        String(state.hashtagMap || '').split('\n').forEach(line => {
            const [kw, tags] = line.split(':');
            if (kw && tags) map[kw.trim()] = tags.split(',').map(t => t.trim()).filter(Boolean);
        });
        const low = String(text || '').toLowerCase();
        const found = new Set();
        for (const [kw, tags] of Object.entries(map)) {
            if (low.includes(kw.toLowerCase())) tags.forEach(t => found.add(t));
        }
        return Array.from(found).slice(0, 5).map(t => '#' + t).join(' ');
    }

    /* ════════════════ World Events ════════════════ */
    function getWorldEvent() {
        if (!state.worldEvents) return '';
        const now = new Date();
        const m = now.getMonth() + 1, d = now.getDate();
        const events = {
            '1-1': '🎉 سنة جديدة سعيدة!',
            '3-21': '🌸 عيد الأم',
            '5-1': '👷 عيد العمال',
            '6-1': '👶 عيد الطفولة',
            '7-23': '🇪🇬 عيد ثورة يوليو',
            '10-6': '🎖️ ذكرى انتصارات أكتوبر',
            '12-25': '🎄 عيد الميلاد',
        };
        return events[`${m}-${d}`] || '';
    }

    /* ════════════════ Weather ════════════════ */
    let cachedWeather = null;
    async function fetchWeather() {
        if (!state.weatherPosts) return null;
        if (cachedWeather && Date.now() - state.lastWeatherCheck < 3600000) return cachedWeather;
        try {
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${state.weatherLat}&longitude=${state.weatherLon}&current=temperature_2m,weather_code`;
            const res = await fetch(url);
            const data = await res.json();
            const temp = data.current?.temperature_2m;
            const code = data.current?.weather_code;
            const desc = weatherCodeToArabic(code);
            cachedWeather = { temp, code, desc };
            state.lastWeatherCheck = Date.now();
            forceSaveSettings();
            return cachedWeather;
        } catch (e) { return null; }
    }
    function weatherCodeToArabic(code) {
        const m = {0:'صافٍ ☀️',1:'صافٍ جزئياً 🌤️',2:'غائم جزئياً ⛅',3:'غائم ☁️',
                   45:'ضباب 🌫️',48:'ضباب متجمد 🌫️',51:'رذاذ خفيف 🌦️',61:'مطر 🌧️',
                   63:'مطر متوسط 🌧️',65:'مطر غزير ⛈️',71:'ثلج 🌨️',80:'زخات 🌦️',
                   95:'عاصفة رعدية ⛈️'};
        return m[code] || 'معتدل 🌡️';
    }

    /* ════════════════ تشفير كلمات المرور ════════════════ */
    function getDecryptedPass() {
        const p = state.blueskyAppPassword || '';
        return p.startsWith('ENC:') ? decrypt(p) : p;
    }
    function setEncryptedPass(plain) {
        state.blueskyAppPassword = state.encryptPasswords ? encrypt(plain) : plain;
        forceSaveSettings();
    }

    /* ════════════════ أدوات DOM ════════════════ */
    function getPostKey(el) {
        const l = el?.querySelector('a[href*="/post/"]');
        return l ? l.getAttribute('href') : (el?.innerText || '').slice(0, 80);
    }
    function getHandleFromContainer(c) {
        const l = c?.querySelector('a[href^="/profile/"]');
        return l ? l.getAttribute('href').replace('/profile/','').split('/')[0] : null;
    }
    function isInsidePanel(el) {
        if (!el) return false;
        let cur = el;
        while (cur) { if (cur.id === PANEL_ID || cur.id === PANEL_ID + '-mini') return true; cur = cur.parentElement; }
        return false;
    }
    function fire(btn) {
        if (!btn) return;
        try { btn.click(); } catch(e){}
        try {
            const r = btn.getBoundingClientRect();
            const opts = { bubbles: true, cancelable: true, view: window,
                clientX: r.left + r.width/2, clientY: r.top + r.height/2,
                button: 0, buttons: 1, pointerId: 1 };
            btn.dispatchEvent(new PointerEvent('pointerdown', opts));
            btn.dispatchEvent(new MouseEvent('mousedown', opts));
            btn.dispatchEvent(new PointerEvent('pointerup', opts));
            btn.dispatchEvent(new MouseEvent('mouseup', opts));
        } catch(e){}
    }
    function setInputValue(el, value) {
        el.focus();
        if (el.getAttribute('contenteditable') === 'true') {
            el.textContent = '';
            el.appendChild(document.createTextNode(value));
            try {
                el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true,
                    inputType: 'insertText', data: value }));
            } catch (e) { el.dispatchEvent(new Event('input', { bubbles: true })); }
            el.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
            const proto = el.tagName === 'TEXTAREA'
                ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
            const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
            if (setter) setter.call(el, value); else el.value = value;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    /* ════════════════ كشف الأزرار ════════════════ */
    function isFollowButton(btn) {
        const tid = (btn.getAttribute('data-testid') || '').toLowerCase();
        if (tid === 'followbtn' || tid === 'follow-button') return true;
        if (tid === 'unfollowbtn' || tid === 'following-button') return false;
        const l = (btn.getAttribute('aria-label') || '').toLowerCase().trim();
        const t = (btn.innerText || '').trim().toLowerCase();
        const mF = t === 'follow' || t === 'follow back' || t.startsWith('follow ') ||
                   t === 'متابعة' || t === 'متابعة بالمقابل' || t.includes('follow back') ||
                   l === 'follow' || l.startsWith('follow ') || l === 'متابعة' || l.includes('follow back');
        const mFo = t.includes('following') || t.includes('unfollow') || t === 'متابَع' ||
                    t.includes('إلغاء المتابعة') || l.includes('following') || l.includes('unfollow');
        return mF && !mFo;
    }
    function isLikeButton(btn) {
        const tid = (btn.getAttribute('data-testid') || '').toLowerCase();
        if (tid === 'likebtn') return true;
        if (tid === 'unlikebtn') return false;
        const l = (btn.getAttribute('aria-label') || '').toLowerCase().trim();
        const t = (btn.innerText || '').trim().toLowerCase();
        const has = (l === 'like' || l.startsWith('like ') || l.includes('إعجاب') ||
                     t === 'like' || t.includes('إعجاب'));
        return has && !l.includes('unlike') && !l.includes('إلغاء');
    }
    function isAlreadyLiked(btn) {
        const tid = (btn.getAttribute('data-testid') || '').toLowerCase();
        if (tid === 'unlikebtn') return true;
        const l = (btn.getAttribute('aria-label') || '').toLowerCase();
        return l.includes('unlike') || l.includes('إلغاء الإعجاب');
    }
    function isAlreadyFollowing(btn) {
        const tid = (btn.getAttribute('data-testid') || '').toLowerCase();
        if (tid === 'unfollowbtn') return true;
        const l = (btn.getAttribute('aria-label') || '').toLowerCase();
        const t = (btn.innerText || '').trim().toLowerCase();
        return l.includes('following') || l.includes('unfollow') || t === 'following';
    }
    function isRepostButton(btn) {
        const tid = (btn.getAttribute('data-testid') || '').toLowerCase();
        if (tid === 'repostbtn') return true;
        if (tid === 'unrepostbtn') return false;
        const l = (btn.getAttribute('aria-label') || '').toLowerCase();
        return (l.includes('repost') && !l.includes('un')) || l.includes('إعادة نشر');
    }

    /* ════════════════ جمع الأزرار ════════════════ */
    function collectAllFollowButtons() {
        const r = [], seen = new Set();
        for (const btn of document.querySelectorAll('button, [role="button"]')) {
            if (isInsidePanel(btn) || !isFollowButton(btn)) continue;
            let c = btn;
            for (let i = 0; i < 12 && c; i++) {
                if (c.querySelector('a[href^="/profile/"]')) break;
                c = c.parentElement;
            }
            if (!c) continue;
            const h = getHandleFromContainer(c);
            if (!h || seen.has(h) || h === state.myHandle) continue;
            if (containsBlacklisted(h)) continue;
            if (state.skipNoAvatar && !hasAvatar(c)) continue;
            if (state.onlyArabic) {
                const bio = (c.innerText || '').slice(0, 500);
                if (bio.trim() && !isArabicText(bio)) continue;
            }
            seen.add(h);
            r.push({ btn, post: c, key: h, handle: h });
        }
        return r;
    }
    function collectAllLikeButtons() {
        const r = [], seen = new Set();
        for (const btn of document.querySelectorAll('button, [role="button"]')) {
            if (isInsidePanel(btn) || !isLikeButton(btn) || isAlreadyLiked(btn)) continue;
            let c = btn;
            for (let i = 0; i < 10 && c; i++) {
                if (c.querySelector('a[href*="/post/"]')) break;
                c = c.parentElement;
            }
            if (!c) continue;
            const k = getPostKey(c);
            if (!k || seen.has(k)) continue;
            const postText = (c.innerText || '').slice(0, 800);
            if (containsBlacklisted(postText) || !matchesKeywords(postText)) continue;
            if (state.onlyArabic && !isArabicText(postText)) continue;
            if (state.languageFilter && state.languageFilter !== 'ar' && !matchesLanguage(postText)) continue;
            seen.add(k);
            r.push({ btn, post: c, key: k });
        }
        return r;
    }
    function collectAllRepostButtons() {
        const r = [], seen = new Set();
        for (const btn of document.querySelectorAll('button, [role="button"]')) {
            if (isInsidePanel(btn) || !isRepostButton(btn)) continue;
            let c = btn;
            for (let i = 0; i < 10 && c; i++) {
                if (c.querySelector('a[href*="/post/"]')) break;
                c = c.parentElement;
            }
            if (!c) continue;
            const k = getPostKey(c);
            if (!k || seen.has(k)) continue;
            const postText = (c.innerText || '').slice(0, 800);
            if (containsBlacklisted(postText)) continue;
            if (state.repostKeywords) {
                const kws = parseList(state.repostKeywords);
                const low = postText.toLowerCase();
                if (!kws.some(w => low.includes(w))) continue;
            }
            if (state.onlyArabic && !isArabicText(postText)) continue;
            seen.add(k);
            r.push({ btn, post: c, key: k });
        }
        return r;
    }

    /* ════════════════ كشف الإشعارات ════════════════ */
    function detectNotificationType(text) {
        const t = (text || '').toLowerCase();
        if (t.includes('followed you') || t.includes('تابعك') ||
            t.includes('بدأ متابعتك') || t.includes('followed back')) return 'follow';
        if (t.includes('replied to you') || t.includes('رد على') ||
            t.includes('أجاب على')) return 'reply';
        if (t.includes('liked your') || t.includes('أعجب بمنشورك')) return 'like';
        if (t.includes('mentioned you') || t.includes('أشار إليك')) return 'mention';
        if (t.includes('reposted') || t.includes('أعاد نشر')) return 'repost';
        return null;
    }

    /* ════════════════ تتبع من ألغى متابعتك ════════════════ */
    function trackCurrentFollowers() {
        if (!state.trackUnfollowers) return;
        if (!location.pathname.includes('/followers')) return;
        const handles = new Set();
        document.querySelectorAll('a[href^="/profile/"]').forEach(a => {
            if (isInsidePanel(a)) return;
            const h = a.getAttribute('href').replace('/profile/','').split('/')[0];
            if (h && h !== state.myHandle) handles.add(h);
        });
        if (handles.size === 0) return;
        const prev = new Set(state.knownFollowers);
        const lost = Array.from(prev).filter(h => !handles.has(h));
        if (lost.length > 0 && prev.size > 0) {
            lost.slice(0, 5).forEach(h => pushLog('unfollower', `👋 ألغى متابعتك: ${h}`));
        }
        const merged = new Set([...state.knownFollowers, ...handles]);
        state.knownFollowers = Array.from(merged).slice(-2000);
        forceSaveSettings();
    }

    /* ════════════════ متابعة المتفاعلين ════════════════ */
    function collectEngagers() {
        if (!state.followEngagers) return;
        if (!location.pathname.includes('/notifications')) return;
        const notifications = document.querySelectorAll('[data-testid="notification"], [role="article"]');
        for (const n of notifications) {
            const txt = (n.innerText || '').slice(0, 300);
            const type = detectNotificationType(txt);
            if (type !== 'like' && type !== 'reply' && type !== 'repost') continue;
            const handle = getHandleFromContainer(n);
            if (!handle || handle === state.myHandle) continue;
            if (containsBlacklisted(handle)) continue;
            if (state.knownFollowers.includes(handle)) continue;
            if (!state.engagerQueue.includes(handle)) {
                state.engagerQueue.push(handle);
                if (state.engagerQueue.length > 200) state.engagerQueue.shift();
            }
        }
        saveSettings();
    }

    async function doFollowEngagers(myGen) {
        if (!state.followEngagers || !dailyCheck('engagerFollows')) return 0;
        if (state.engagerQueue.length === 0) return 0;
        const handle = state.engagerQueue.shift();
        saveSettings();
        try {
            const url = `/profile/${handle}`;
            if (location.pathname !== url) {
                state.engagerQueue.push(handle);
                if (!state.engagerAttempts) state.engagerAttempts = {};
                state.engagerAttempts[handle] = (state.engagerAttempts[handle] || 0) + 1;
                if (state.engagerAttempts[handle] > 3) {
                    delete state.engagerAttempts[handle];
                    pushLog('engager-skip', `⏭️ تخطّي ${handle} (فشل الانتقال)`);
                } else {
                    pushLog('engager', `⏭️ سأتخطى ${handle} مؤقتاً`);
                }
                saveSettings();
                return 0;
            }
            if (state.engagerAttempts && state.engagerAttempts[handle]) {
                delete state.engagerAttempts[handle];
            }
            const followBtn = collectAllFollowButtons().find(b => b.handle === handle);
            if (!followBtn) return 0;
            if (state.dryRun) { pushLog('dry', `متابعة متفاعل: ${handle}`); return 0; }
            rateRecord(); fire(followBtn.btn);
            if (!await sleepGen(2000, myGen)) return 0;
            if (isAlreadyFollowing(followBtn.btn)) {
                bumpStat('engagerFollows'); dailyIncrement('engagerFollows');
                pushLog('engager', `✅ تابعت متفاعل: ${handle}`);
                return 1;
            }
        } catch(e){}
        return 0;
    }

    /* ════════════════ رد المتابعة ════════════════ */
    async function doFollowBack(myGen) {
        if (!location.pathname.includes('/notifications')) return 0;
        if (!dailyCheck('followBacks')) { pushLog('limit', '⛔ حد المتابعة'); return 0; }
        const targets = collectAllFollowButtons();
        updateDebugInfo('follow', targets.length);
        let count = 0;
        for (const t of targets) {
            if (myGen !== loopGeneration) return count;
            if (!rateCheck()) break;
            if (state.processedFollowBacks.includes(t.handle)) continue;
            if (state.dryRun) { pushLog('dry', `رد متابعة: ${t.handle}`); continue; }
            t.btn.scrollIntoView({ block: 'center', behavior: 'instant' });
            if (!await sleepGen(rand(700, 1500), myGen)) return count;
            rateRecord(); fire(t.btn);
            if (!await sleepGen(rand(2000, 3000), myGen)) return count;
            if (!isFollowButton(t.btn) || isAlreadyFollowing(t.btn)) {
                state.processedFollowBacks.push(t.handle);
                bumpStat('followBacks'); dailyIncrement('followBacks'); count++;
                pushLog('follow-back', `🔄 ${t.handle}`);
                notify('رد متابعة', `تابعت ${t.handle}`);
            } else {
                state.processedFollowBacks.push(t.handle);
                pushLog('follow-back-fail', `❌ ${t.handle}`);
            }
        }
        if (count) saveSettings();
        return count;
    }

    /* ════════════════ إعجاب المعلّقين ════════════════ */
    async function doLikeCommenters(myGen) {
        const onN = location.pathname.includes('/notifications');
        const onP = /\/profile\/[^/]+/.test(location.pathname);
        if (!onN && !onP) return 0;
        if (!dailyCheck('commentLikes')) return 0;
        const targets = collectAllLikeButtons();
        updateDebugInfo('like', targets.length);
        let count = 0;
        for (const t of targets) {
            if (myGen !== loopGeneration) return count;
            if (!rateCheck()) break;
            if (state.processedCommentLikes.includes(t.key)) continue;
            if (state.dryRun) { pushLog('dry', `إعجاب`); continue; }
            t.btn.scrollIntoView({ block: 'center', behavior: 'instant' });
            if (!await sleepGen(rand(700, 1400), myGen)) return count;
            rateRecord(); fire(t.btn);
            if (!await sleepGen(rand(1500, 2500), myGen)) return count;
            if (isAlreadyLiked(t.btn)) {
                state.processedCommentLikes.push(t.key);
                bumpStat('commentLikes'); dailyIncrement('commentLikes'); count++;
                pushLog('comment-like', `❤️ ${t.key.slice(0, 40)}`);
            } else {
                state.processedCommentLikes.push(t.key);
                pushLog('comment-like-fail', `❌ ${t.key.slice(0, 40)}`);
            }
        }
        if (count) saveSettings();
        return count;
    }

    /* ════════════════ إعجاب عام ════════════════ */
    async function doAutoLike(myGen) {
        if (Math.random() * 100 > state.likeRatio) return 0;
        if (!dailyCheck('likes')) { pushLog('limit', '⛔ حد الإعجاب'); return 0; }
        const targets = collectAllLikeButtons();
        updateDebugInfo('like', targets.length);
        let count = 0;
        for (const t of targets) {
            if (myGen !== loopGeneration) return count;
            if (!rateCheck()) break;
            if (state.processedLikes.includes(t.key)) continue;
            t.btn.scrollIntoView({ block: 'center', behavior: 'instant' });
            if (!await sleepGen(rand(700, 1400), myGen)) return count;
            if (state.dryRun) { pushLog('dry', `إعجاب`); continue; }
            rateRecord(); fire(t.btn);
            if (!await sleepGen(rand(1500, 2500), myGen)) return count;
            if (isAlreadyLiked(t.btn)) {
                state.processedLikes.push(t.key);
                bumpStat('likes'); dailyIncrement('likes'); count++;
                pushLog('like', `✅ ${t.key.slice(0, 50)}`);
                state.lastClickResult = `✅ إعجاب`;
            } else {
                state.processedLikes.push(t.key);
                pushLog('like-fail', `❌ ${t.key.slice(0, 40)}`);
            }
        }
        if (count) saveSettings();
        return count;
    }

    /* ════════════════ متابعة عامة ════════════════ */
    async function doAutoFollow(myGen) {
        if (Math.random() * 100 > state.followRatio) return 0;
        if (!dailyCheck('follows')) { pushLog('limit', '⛔ حد المتابعة'); return 0; }
        const targets = collectAllFollowButtons();
        updateDebugInfo('follow', targets.length);
        let count = 0;
        for (const t of targets) {
            if (myGen !== loopGeneration) return count;
            if (!rateCheck()) break;
            if (state.processedFollows.includes(t.handle)) continue;
            if (state.autoFollowBack && location.pathname.includes('/notifications')) continue;
            t.btn.scrollIntoView({ block: 'center', behavior: 'instant' });
            if (!await sleepGen(rand(700, 1400), myGen)) return count;
            if (state.dryRun) { pushLog('dry', `متابعة: ${t.handle}`); continue; }
            rateRecord(); fire(t.btn);
            if (!await sleepGen(rand(2000, 3200), myGen)) return count;
            if (isAlreadyFollowing(t.btn)) {
                state.processedFollows.push(t.handle);
                bumpStat('follows'); dailyIncrement('follows'); count++;
                pushLog('follow', `✅ ${t.handle}`);
            } else {
                state.processedFollows.push(t.handle);
                pushLog('follow-fail', `❌ ${t.handle}`);
            }
        }
        if (count) saveSettings();
        return count;
    }

    /* ════════════════ إعادة نشر ════════════════ */
    async function doAutoRepost(myGen) {
        if (!state.autoRepost) return 0;
        if (!dailyCheck('reposts')) { pushLog('limit', '⛔ حد إعادة النشر'); return 0; }
        const targets = collectAllRepostButtons();
        let count = 0;
        for (const t of targets.slice(0, 3)) {
            if (myGen !== loopGeneration) return count;
            if (!rateCheck()) break;
            if (state.processedReposts.includes(t.key)) continue;
            if (state.dryRun) { pushLog('dry', `إعادة نشر تجربة`); continue; }
            t.btn.scrollIntoView({ block: 'center', behavior: 'instant' });
            if (!await sleepGen(rand(700, 1400), myGen)) return count;
            rateRecord(); fire(t.btn);
            if (!await sleepGen(rand(2000, 3000), myGen)) return count;
            const confirm = Array.from(document.querySelectorAll('[role="menuitem"], button'))
                .find(b => {
                    const txt = (b.innerText || '').trim().toLowerCase();
                    return txt === 'repost' || txt === 'إعادة نشر';
                });
            if (confirm) { fire(confirm); await sleepGen(1500, myGen); }
            state.processedReposts.push(t.key);
            bumpStat('reposts'); dailyIncrement('reposts'); count++;
            pushLog('repost', `🔄 ${t.key.slice(0, 40)}`);
        }
        if (count) saveSettings();
        return count;
    }

    /* ════════════════ إلغاء متابعة ════════════════ */
    async function waitForConfirmModal(maxWaitMs = 5000, myGen) {
        const start = Date.now();
        while (Date.now() - start < maxWaitMs) {
            if (myGen !== loopGeneration) return null;
            const confirm = Array.from(document.querySelectorAll('button, [role="button"]'))
                .find(b => {
                    if (isInsidePanel(b)) return false;
                    const t = (b.innerText || '').trim().toLowerCase();
                    return t === 'unfollow' || t === 'إلغاء المتابعة';
                });
            if (confirm) return confirm;
            await sleep(200);
        }
        return null;
    }
    async function doAutoUnfollow(myGen) {
        if (!/\/profile\/[^/]+\/following/.test(location.pathname)) return 0;
        const btns = Array.from(document.querySelectorAll('button, [role="button"]'))
            .filter(b => !isInsidePanel(b) && isAlreadyFollowing(b));
        let n = 0;
        for (const btn of btns.slice(0, 3)) {
            if (myGen !== loopGeneration) return n;
            if (!rateCheck()) break;
            const c = btn.closest('[role="article"]') || btn.closest('div');
            const h = getHandleFromContainer(c) || 'unknown';
            if (state.dryRun) { pushLog('dry', `إلغاء: ${h}`); continue; }
            fire(btn);
            const confirm = await waitForConfirmModal(5000, myGen);
            if (confirm) {
                rateRecord(); fire(confirm);
                bumpStat('unfollows');
                state.unfollowedUsers.push(h);
                pushLog('unfollow', `✅ ${h}`); n++;
            }
            if (!await sleepGen(rand(2500, 4500), myGen)) return n;
        }
        if (n) saveSettings();
        return n;
    }

    /* ════════════════ إلغاء متابعة غير المتابعين ════════════════ */
    async function doCleanupNonFollowers(myGen) {
        if (!/\/profile\/[^/]+\/following/.test(location.pathname)) return 0;
        if (!state.autoUnfollow) return 0;
        if (state.knownFollowers.length === 0) {
            pushLog('cleanup', '⚠️ لا توجد قائمة متابعين. زُر /followers أولاً.');
            return 0;
        }
        const followers = new Set(state.knownFollowers);
        const btns = Array.from(document.querySelectorAll('button, [role="button"]'))
            .filter(b => !isInsidePanel(b) && isAlreadyFollowing(b));
        let n = 0;
        for (const btn of btns) {
            if (myGen !== loopGeneration) return n;
            if (!rateCheck()) break;
            const c = btn.closest('[role="article"]') || btn.closest('div');
            const h = getHandleFromContainer(c);
            if (!h || followers.has(h)) continue;
            if (state.processedFollows.includes(h)) continue;
            if (state.dryRun) { pushLog('dry', `إلغاء غير متابع: ${h}`); continue; }
            fire(btn);
            const confirm = await waitForConfirmModal(5000, myGen);
            if (confirm) {
                rateRecord(); fire(confirm);
                bumpStat('unfollows');
                state.unfollowedUsers.push(h);
                pushLog('cleanup-unfollow', `🧹 ${h}`);
                n++;
            }
            if (!await sleepGen(rand(2500, 4500), myGen)) return n;
        }
        return n;
    }

    /* ════════════════ الردود على الإشعارات ════════════════ */
    async function doReplyToNotifications(myGen) {
        if (!location.pathname.includes('/notifications')) return 0;
        if (!dailyCheck('notifReplies')) return 0;
        const notifications = document.querySelectorAll('[data-testid="notification"], [role="article"]');
        let count = 0;
        for (const n of notifications) {
            if (myGen !== loopGeneration) return count;
            if (!rateCheck()) break;
            const txt = (n.innerText || '').slice(0, 500);
            const type = detectNotificationType(txt);
            if (type !== 'reply') continue;
            const key = txt.slice(0, 100);
            if (state.processedNotifReplies.includes(key)) continue;
            if (state.onlyArabic && !isArabicText(txt)) continue;
            if (containsBlacklisted(txt)) continue;
            const replyBtn = n.querySelector('[data-testid="replyBtn"]') ||
                Array.from(n.querySelectorAll('button, [role="button"]')).find(b => {
                    const l = (b.getAttribute('aria-label') || '').toLowerCase();
                    const t = (b.innerText || '').trim().toLowerCase();
                    return l.includes('reply') || t === 'رد';
                });
            if (!replyBtn) continue;
            if (state.dryRun) { pushLog('dry', `رد إشعار`); state.processedNotifReplies.push(key); continue; }
            replyBtn.scrollIntoView({ block: 'center', behavior: 'instant' });
            if (!await sleepGen(rand(800, 1500), myGen)) return count;
            rateRecord(); fire(replyBtn);
            if (!await sleepGen(rand(2000, 3000), myGen)) return count;
            const editor = document.querySelector('div[contenteditable="true"][role="textbox"]');
            if (!editor) { state.processedNotifReplies.push(key); continue; }
            let pool;
            if (state.sentimentAnalysis) {
                const sent = analyzeSentiment(txt);
                pool = sent === 'positive'
                    ? String(state.customReplyText || '').split('\n').filter(Boolean)
                    : sent === 'negative'
                        ? ["أتمنى لك الأفضل 💙", "الله يعينك 🙏", "بالتوفيق 🌟"]
                        : String(state.customReplyText || '').split('\n').filter(Boolean);
            } else {
                pool = String(state.customReplyText || '').split('\n').map(s => s.trim()).filter(Boolean);
            }
            let selected = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : "شكراً! 🙏";
            selected = applyTemplateVars(selected, { name: 'صديقي', post: txt });
            if (state.autoHashtags) {
                const tags = generateHashtags(txt);
                if (tags) selected += ' ' + tags;
            }
            setInputValue(editor, selected);
            if (!await sleepGen(rand(1200, 2000), myGen)) return count;
            const send = Array.from(document.querySelectorAll('button'))
                .find(b => ['reply','رد','post','نشر'].includes((b.innerText||'').trim().toLowerCase()) && !b.disabled);
            if (send) {
                rateRecord(); fire(send);
                bumpStat('notifReplies'); dailyIncrement('notifReplies'); count++;
                state.processedNotifReplies.push(key);
                pushLog('notif-reply', `✅`);
                if (state.abTesting) {
                    if (!state.replyPerf[selected]) state.replyPerf[selected] = { uses: 0, perf: 0 };
                    state.replyPerf[selected].uses++;
                    saveSettings();
                }
            }
            if (!await sleepGen(rand(1500, 2500), myGen)) return count;
        }
        if (count) saveSettings();
        return count;
    }

    /* ════════════════ الردود على الرسائل ════════════════ */
    async function doReplyToMessages(myGen) {
        if (!location.pathname.includes('/messages')) return 0;
        if (!dailyCheck('messages')) return 0;
        const convos = document.querySelectorAll('[data-testid="DMConversation"], [role="listitem"]');
        let count = 0;
        for (const c of convos) {
            if (myGen !== loopGeneration) return count;
            if (!rateCheck()) break;
            const txt = (c.innerText || '').slice(0, 300);
            const key = txt.slice(0, 80);
            if (state.processedMessages.includes(key)) continue;
            fire(c);
            if (!await sleepGen(rand(1500, 2500), myGen)) return count;
            const msgs = document.querySelectorAll('[data-testid="messageText"], .messageText, [role="article"]');
            if (msgs.length === 0) { state.processedMessages.push(key); continue; }
            const last = msgs[msgs.length - 1];
            const msgTxt = (last.innerText || '').slice(0, 500);
            if (state.onlyArabic && !isArabicText(msgTxt)) { state.processedMessages.push(key); continue; }
            if (containsBlacklisted(msgTxt)) { state.processedMessages.push(key); continue; }
            const editor = document.querySelector('div[contenteditable="true"][role="textbox"]') ||
                           document.querySelector('textarea[placeholder*="message" i]') ||
                           document.querySelector('textarea[placeholder*="رسالة" i]');
            if (!editor) { state.processedMessages.push(key); continue; }
            if (state.dryRun) { pushLog('dry', `رد رسالة`); state.processedMessages.push(key); continue; }
            const pool = String(state.messageReplyText || '').split('\n').map(s => s.trim()).filter(Boolean);
            let selected = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : "شكراً 🙏";
            selected = applyTemplateVars(selected, { post: msgTxt });
            setInputValue(editor, selected);
            if (!await sleepGen(rand(1200, 2000), myGen)) return count;
            const send = Array.from(document.querySelectorAll('button')).find(b => {
                const l = (b.getAttribute('aria-label') || '').toLowerCase();
                const t = (b.innerText || '').trim().toLowerCase();
                return (l.includes('send') || t === 'send' || t === 'إرسال') && !b.disabled;
            });
            if (send) {
                rateRecord(); fire(send);
                bumpStat('messageReplies'); dailyIncrement('messages'); count++;
                state.processedMessages.push(key);
                pushLog('message-reply', `✅`);
            }
            if (!await sleepGen(rand(2000, 3500), myGen)) return count;
        }
        if (count) saveSettings();
        return count;
    }

    /* ════════════════ الرد العام بقوالب ════════════════ */
    async function doAutoReply(myGen) {
        const btns = Array.from(document.querySelectorAll('[data-testid="replyBtn"], [data-testid*="reply" i]'))
            .filter(b => !isInsidePanel(b));
        if (!btns.length) return 0;
        if (!rateCheck()) return 0;
        if (!dailyCheck('replies')) return 0;
        if (state.dryRun) { pushLog('dry', 'رد'); return 0; }
        const btn = btns[Math.floor(Math.random() * Math.min(btns.length, 3))];
        const c = btn.closest('[role="article"]') || btn.closest('div');
        if (state.onlyArabic && c) {
            const t = (c.innerText || '').slice(0, 800);
            if (!isArabicText(t)) return 0;
        }
        let pool;
        if (c && postHasVideo(c)) pool = String(state.replyWithImage || '').split('\n').map(s => s.trim()).filter(Boolean);
        else if (c && postHasImage(c)) pool = String(state.replyWithImage || '').split('\n').map(s => s.trim()).filter(Boolean);
        else pool = String(state.replyTextOnly || '').split('\n').map(s => s.trim()).filter(Boolean);
        if (!pool.length) pool = String(state.customReplyText || '').split('\n').map(s => s.trim()).filter(Boolean);
        let selected = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : "منشور رائع! ✨";
        const postText = c ? (c.innerText || '').slice(0, 200) : '';
        selected = applyTemplateVars(selected, { post: postText });
        if (state.autoHashtags) {
            const tags = generateHashtags(postText);
            if (tags) selected += ' ' + tags;
        }
        try {
            rateRecord(); fire(btn);
            if (!await sleepGen(rand(2200, 3500), myGen)) return 0;
            const editor = document.querySelector('div[contenteditable="true"][role="textbox"]');
            if (!editor) return 0;
            setInputValue(editor, selected);
            if (!await sleepGen(rand(1200, 2000), myGen)) return 0;
            const send = Array.from(document.querySelectorAll('button'))
                .find(b => ['reply','رد','post','نشر'].includes((b.innerText||'').trim().toLowerCase()) && !b.disabled);
            if (send) {
                rateRecord(); fire(send);
                bumpStat('replies'); dailyIncrement('replies');
                pushLog('reply', `✅ "${selected.slice(0, 30)}"`);
                if (state.abTesting) {
                    if (!state.replyPerf[selected]) state.replyPerf[selected] = { uses: 0, perf: 0 };
                    state.replyPerf[selected].uses++;
                    saveSettings();
                }
                return 1;
            }
        } catch(e){}
        return 0;
    }

    /* ════════════════ الجلسة + uploadBlob + النشر ════════════════ */
    let sessionCache = { accessJwt: null, refreshJwt: null, did: null, expiresAt: 0 };

    async function getSession() {
        const pass = getDecryptedPass();
        if (!pass) throw new Error('لا توجد كلمة مرور');
        if (sessionCache.accessJwt && Date.now() < sessionCache.expiresAt) {
            return sessionCache;
        }
        const loginRes = await fetch('https://bsky.social/xrpc/com.atproto.server.createSession', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier: state.myHandle || 'sayed1993.bsky.social', password: pass })
        });
        if (!loginRes.ok) throw new Error('فشل تسجيل الدخول');
        const s = await loginRes.json();
        sessionCache = {
            accessJwt: s.accessJwt,
            refreshJwt: s.refreshJwt,
            did: s.did,
            expiresAt: Date.now() + 100 * 60 * 1000
        };
        return sessionCache;
    }

    async function refreshSession() {
        if (!sessionCache.refreshJwt) return getSession();
        try {
            const res = await fetch('https://bsky.social/xrpc/com.atproto.server.refreshSession', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${sessionCache.refreshJwt}` }
            });
            if (!res.ok) throw new Error('refresh failed');
            const s = await res.json();
            sessionCache = {
                accessJwt: s.accessJwt, refreshJwt: s.refreshJwt, did: s.did,
                expiresAt: Date.now() + 100 * 60 * 1000
            };
            return sessionCache;
        } catch (e) {
            sessionCache = { accessJwt: null, refreshJwt: null, did: null, expiresAt: 0 };
            return getSession();
        }
    }

    async function uploadBlob(accessJwt, file) {
        if (!file || !(file instanceof Blob)) throw new Error('ملف غير صالح');
        const MAX_SIZE = 100 * 1024 * 1024;
        if (file.size > MAX_SIZE) throw new Error('الملف أكبر من 100 MB');
        const buf = await file.arrayBuffer();
        let res = await fetch('https://bsky.social/xrpc/com.atproto.repo.uploadBlob', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${accessJwt}`,
                       'Content-Type': file.type || 'application/octet-stream' },
            body: buf
        });
        if (res.status === 401) {
            const s = await refreshSession();
            res = await fetch('https://bsky.social/xrpc/com.atproto.repo.uploadBlob', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${s.accessJwt}`,
                           'Content-Type': file.type || 'application/octet-stream' },
                body: buf
            });
        }
        if (!res.ok) throw new Error('فشل رفع الوسائط: HTTP ' + res.status);
        const j = await res.json();
        if (!j.blob) throw new Error('استجابة غير صالحة من الخادم');
        return j.blob;
    }

    async function publishScheduledPost(post) {
        const pass = getDecryptedPass();
        if (!pass) { pushLog('post-fail', '❌ لا توجد كلمة مرور'); return false; }
        try {
            let s = await getSession();
            let text = post.text || '';
            if (state.weatherPosts) {
                const w = await fetchWeather();
                if (w) text += `\n\n🌤️ الطقس في ${state.weatherCity}: ${w.temp}°C ${w.desc}`;
            }
            if (state.worldEvents) {
                const ev = getWorldEvent();
                if (ev) text = ev + '\n\n' + text;
            }
            if (state.autoHashtags) {
                const tags = generateHashtags(text);
                if (tags && !text.includes('#')) text += ' ' + tags;
            }
            let embed = null;
            if (post.mediaBlob) {
                try {
                    const blob = await uploadBlob(s.accessJwt, post.mediaBlob);
                    if (post.mediaType === 'video') {
                        embed = { $type: 'app.bsky.embed.video', video: blob };
                    } else {
                        embed = { $type: 'app.bsky.embed.images',
                            images: [{ image: blob, alt: post.mediaAlt || '' }] };
                    }
                } catch(e) { console.warn('media upload failed', e); }
            }
            const record = {
                $type: 'app.bsky.feed.post',
                text, createdAt: new Date().toISOString(),
                langs: [state.languageFilter || 'ar']
            };
            if (embed) record.embed = embed;

            let postRes = await fetch('https://bsky.social/xrpc/com.atproto.repo.createRecord', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${s.accessJwt}` },
                body: JSON.stringify({ repo: s.did, collection: 'app.bsky.feed.post', record })
            });
            if (postRes.status === 401) {
                pushLog('post', '🔄 تجديد التوكن...');
                s = await refreshSession();
                postRes = await fetch('https://bsky.social/xrpc/com.atproto.repo.createRecord', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${s.accessJwt}` },
                    body: JSON.stringify({ repo: s.did, collection: 'app.bsky.feed.post', record })
                });
            }
            if (!postRes.ok) throw new Error('فشل النشر: HTTP ' + postRes.status);
            bumpStat('posts'); dailyIncrement('posts');
            pushLog('post', `✅ "${text.slice(0, 40)}..."`);
            notify('تم النشر', text.slice(0, 40));
            return true;
        } catch (err) {
            pushLog('post-fail', `❌ ${err.message}`);
            notify('فشل النشر', err.message);
            captureError(err, 'publishScheduledPost');
            return false;
        }
    }

    function checkScheduledPosts() {
        const now = Date.now();
        state.scheduledPosts.forEach(p => {
            if (p.posted || p.time > now) return;
            publishScheduledPost(p).then(ok => {
                if (ok) { p.posted = true; forceSaveSettings(); }
            });
        });
    }
    function checkContentCalendar() {
        if (!state.calendarEnabled) return;
        const now = new Date();
        const hour = now.getHours();
        const dayNames = ['sun','mon','tue','wed','thu','fri','sat'];
        const dayKey = dayNames[now.getDay()];
        const content = state.calendar[dayKey];
        if (!content) return;
        const todayKey = `${todayStr()}_calendar_${dayKey}`;
        if (state.processedPosts.includes(todayKey)) return;
        if (hour !== 10) return;
        publishScheduledPost({ text: content }).then(ok => {
            if (ok) {
                state.processedPosts.push(todayKey);
                forceSaveSettings();
            }
        });
    }

    /* ════════════════ الحلقة الرئيسية ════════════════ */
    let handleDetectionAttempts = 0;
    async function botLoop() {
        const myGen = ++loopGeneration;
        activeLoopId = myGen;
        cyclesWithoutAction = 0;
        if (!state.myHandle && handleDetectionAttempts < 5) {
            autoDetectMyHandle();
            handleDetectionAttempts++;
        }
        console.log(`▶️ جيل ${myGen}`);
        while (activeLoopId === myGen && myGen === loopGeneration) {
            let actionCount = 0;
            try {
                if (state.scheduleEnabled && !isWithinSchedule()) {
                    log('⏰ خارج الجدولة');
                    await sleepGen(60000, myGen); continue;
                }
                if (!state.paused) {
                    checkScheduledPosts();
                    checkContentCalendar();
                    const onN = location.pathname.includes('/notifications');
                    const onM = location.pathname.includes('/messages');
                    const onF = location.pathname.includes('/followers');

                    if (onF) trackCurrentFollowers();
                    if (onN) collectEngagers();

                    if (state.autoReplyMessages && onM)
                        actionCount += await doReplyToMessages(myGen);
                    if (myGen !== loopGeneration) break;

                    if (state.autoFollowBack && onN)
                        actionCount += await doFollowBack(myGen);
                    if (myGen !== loopGeneration) break;

                    if (state.autoReplyNotifications && onN)
                        actionCount += await doReplyToNotifications(myGen);
                    if (myGen !== loopGeneration) break;

                    if (state.autoLikeCommenters && (onN || /\/profile\//.test(location.pathname)))
                        actionCount += await doLikeCommenters(myGen);
                    if (myGen !== loopGeneration) break;

                    if (state.autoLike) actionCount += await doAutoLike(myGen);
                    if (myGen !== loopGeneration) break;

                    if (state.autoRepost) actionCount += await doAutoRepost(myGen);
                    if (myGen !== loopGeneration) break;

                    if (state.autoFollow && !(onN && state.autoFollowBack))
                        actionCount += await doAutoFollow(myGen);
                    if (myGen !== loopGeneration) break;

                    if (state.autoUnfollow)
                        actionCount += await doCleanupNonFollowers(myGen);
                    if (myGen !== loopGeneration) break;

                    if (state.followEngagers) actionCount += await doFollowEngagers(myGen);
                    if (myGen !== loopGeneration) break;

                    if (state.autoReply && !onN && !onM)
                        actionCount += await doAutoReply(myGen);
                    if (myGen !== loopGeneration) break;

                    maybeResetMemory();

                    if (actionCount === 0) {
                        cyclesWithoutAction++;
                        log(`⚠️ لا جديد (${cyclesWithoutAction}/${state.stuckThreshold})`);
                        if (cyclesWithoutAction >= state.stuckThreshold) {
                            await autoScrollDown(true, myGen);
                            cyclesWithoutAction = 0;
                        } else await autoScrollDown(false, myGen);
                    } else {
                        cyclesWithoutAction = 0;
                        await autoScrollDown(false, myGen);
                        if (state.humanBreakEnabled) {
                            state.actionCounter = (state.actionCounter || 0) + actionCount;
                            const threshold = rand(state.humanBreakEveryMin, state.humanBreakEveryMax);
                            if (state.actionCounter >= threshold) {
                                const bm = rand(state.breakDurationMin, state.breakDurationMax);
                                pushLog('break', `☕ استراحة ${bm} د`);
                                log(`☕ استراحة ${bm} د...`);
                                state.actionCounter = 0;
                                forceSaveSettings();
                                if (!await sleepGen(bm * 60000 + rand(0, 30000), myGen)) break;
                            } else forceSaveSettings();
                        }
                    }
                }
            } catch(err) {
                console.error('🔴', err);
                captureError(err, 'botLoop');
                if (actionCount === 0) cyclesWithoutAction++;
            }
            log(state.paused ? '⏸️ موقوف' : `⏱️ يعمل — ${actionCount} فعل`);
            const wait = actionCount > 0 ? state.fastCycleMs : rand(4000, 7000);
            if (!await sleepGen(wait, myGen)) break;
        }
        if (activeLoopId === myGen) activeLoopId = null;
        console.log(`🔚 خرج جيل ${myGen}`);
    }

    function maybeResetMemory() {
        const e = (Date.now() - lastMemoryReset) / 60000;
        if (e >= state.resetMemoryEveryMin) {
            ['processedLikes','processedFollows','processedFollowBacks','processedCommentLikes',
             'processedNotifReplies','processedMessages','processedReposts','processedPosts']
                .forEach(k => state[k] = state[k].slice(-200));
            lastMemoryReset = Date.now(); saveSettings();
        }
    }

    /* ════════════════ التمرير مع تخزين مؤقت ════════════════ */
    let scrollCache = { el: null, ts: 0, path: '' };
    function findScrollContainer() {
        const now = Date.now();
        if (scrollCache.el && now - scrollCache.ts < 5000 &&
            scrollCache.path === location.pathname &&
            document.contains(scrollCache.el) &&
            scrollCache.el.scrollHeight > scrollCache.el.clientHeight + 100) {
            return scrollCache.el;
        }
        const de = document.scrollingElement || document.documentElement;
        if (de && de.scrollHeight > de.clientHeight + 300) {
            scrollCache = { el: de, ts: now, path: location.pathname };
            return de;
        }
        let best = null, bestScore = 0;
        for (const el of document.querySelectorAll('main, main *')) {
            if (isInsidePanel(el)) continue;
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
        scrollCache = { el: result, ts: now, path: location.pathname };
        return result;
    }
    async function autoScrollDown(aggressive = false, myGen) {
        if (!state.autoScroll) return;
        const c = findScrollContainer();
        if (!c || isInsidePanel(c)) return;
        const b = c.scrollTop;
        const step = aggressive ? c.clientHeight * 1.5 : c.clientHeight * 0.85;
        c.scrollTop = b + step;
        c.dispatchEvent(new Event('scroll', { bubbles: true }));
        await sleepGen(aggressive ? rand(2500, 4000) : rand(1500, 3000), myGen);
    }

    /* ════════════════ كشف اسم المستخدم ════════════════ */
    function autoDetectMyHandle() {
        if (state.myHandle) return;
        const link = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]') ||
                     document.querySelector('a[href^="/profile/"][aria-label*="rofile"]') ||
                     document.querySelector('a[href^="/profile/"]');
        if (link) {
            const m = (link.getAttribute('href') || '').match(/\/profile\/([^/]+)/);
            if (m && m[1]) {
                state.myHandle = m[1];
                forceSaveSettings();
                notify('تم الاكتشاف', state.myHandle);
            }
        }
    }

    /* ════════════════ تصدير Google Sheets ════════════════ */
    function exportToSheets() {
        const rows = [['التاريخ','إعجابات','متابعات','إلغاء','ردود','رد متابعة','إعجاب معلق','رد إشعار','رد رسالة','منشورات','إعادة نشر']];
        stats.history.forEach(h => rows.push([h.d, h.likes||0, h.follows||0, h.unfollows||0,
            h.replies||0, h.followBacks||0, h.commentLikes||0, h.notifReplies||0,
            h.messageReplies||0, h.posts||0, h.reposts||0]));
        const tsv = rows.map(r => r.join('\t')).join('\n');
        if (typeof GM_setClipboard === 'function') GM_setClipboard(tsv);
        else navigator.clipboard.writeText(tsv);
        alert('✅ تم نسخ البيانات بصيغة TSV.\nالصقها مباشرة في Google Sheets (Ctrl+V)');
    }

    /* ════════════════ Multi-Account ════════════════ */
    function saveCurrentAsProfile(name) {
        const profile = {
            name, handle: state.myHandle,
            appPassword: state.blueskyAppPassword,
            settings: JSON.parse(JSON.stringify(state))
        };
        delete profile.settings.processedLikes;
        delete profile.settings.activityLog;
        profiles.push(profile);
        saveProfiles();
        alert(`✅ حُفظ الحساب: ${name}`);
    }
    function switchProfile(idx) {
        if (!profiles[idx]) return;
        const current = profiles[activeProfileIdx];
        if (current) current.settings = JSON.parse(JSON.stringify(state));
        const p = profiles[idx];
        state = Object.assign({}, defaultState, p.settings);
        ['unfollowedUsers','processedLikes','processedFollows','processedFollowBacks',
         'processedCommentLikes','processedNotifReplies','processedMessages','processedReposts',
         'processedPosts','activityLog','scheduledPosts','knownFollowers','engagerQueue']
            .forEach(k => { if (!Array.isArray(state[k])) state[k] = []; });
        activeProfileIdx = idx;
        forceSaveSettings();
        saveProfiles();
        location.reload();
    }
    function deleteProfile(idx) {
        if (!confirm('حذف الحساب؟')) return;
        profiles.splice(idx, 1);
        if (activeProfileIdx >= profiles.length) activeProfileIdx = 0;
        saveProfiles();
        renderProfiles();
    }

    /* ════════════════ تصدير/استيراد ════════════════ */
    function exportSettings() {
        const data = { version: VERSION, exported: new Date().toISOString(),
            state: { ...state }, stats, profiles };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `bsky-bot-${todayStr()}.json`;
        a.click();
        notify('تصدير', 'تم');
    }
    function importSettings(file) {
        const r = new FileReader();
        r.onload = (e) => {
            try {
                const d = JSON.parse(e.target.result);
                if (d.state) Object.assign(state, d.state);
                if (d.stats) { Object.assign(stats, d.stats); saveStats(); }
                if (d.profiles) { profiles = d.profiles; saveProfiles(); }
                forceSaveSettings();
                alert('✅ تم الاستيراد. جاري إعادة التحميل...');
                location.reload();
            } catch (err) { alert('❌ ملف غير صالح: ' + err.message); }
        };
        r.readAsText(file);
    }

    /* ════════════════ اللوحة الاحترافية ════════════════ */
    function createDashboard() {
        if (document.getElementById(PANEL_ID)) return;

        const mini = document.createElement('div');
        mini.id = PANEL_ID + '-mini';
        mini.innerHTML = 'B';
        Object.assign(mini.style, {
            position: 'fixed', bottom: '20px', right: '20px', zIndex: '99998',
            width: '50px', height: '50px', borderRadius: '12px',
            background: 'linear-gradient(135deg, #0085ff, #0066cc)',
            color: '#fff', fontSize: '26px', fontWeight: '900',
            display: 'none', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', boxShadow: '0 4px 16px rgba(0,133,255,0.5)',
            fontFamily: 'Arial, sans-serif', userSelect: 'none',
            transition: 'transform 0.2s'
        });
        mini.onmouseenter = () => mini.style.transform = 'scale(1.1)';
        mini.onmouseleave = () => mini.style.transform = 'scale(1)';
        mini.onclick = () => {
            mini.style.display = 'none';
            const p = document.getElementById(PANEL_ID);
            if (p) p.style.display = 'flex';
            state.collapsed = false; saveSettings();
        };
        document.body.appendChild(mini);

        const panel = document.createElement('div');
        panel.id = PANEL_ID;
        panel.innerHTML = `
        <div id="b11-header">
            <div class="b11-brand">
                <div class="b11-logo">B</div>
                <div>
                    <div class="b11-title">بوت بلو سكاي</div>
                    <div class="b11-ver">v${VERSION} PRO</div>
                </div>
            </div>
            <div class="b11-controls">
                <button class="b11-icon" id="b11-theme" title="الثيم">🌓</button>
                <button class="b11-icon" id="b11-collapse" title="طي">➖</button>
                <button class="b11-icon" id="b11-close" title="إغلاق">✖</button>
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
                <label><input type="checkbox" id="b11-fback" ${state.autoFollowBack?'checked':''}> رد المتابعة</label>
                <label><input type="checkbox" id="b11-clike" ${state.autoLikeCommenters?'checked':''}> إعجاب المعلّقين</label>
                <label><input type="checkbox" id="b11-notif-reply" ${state.autoReplyNotifications?'checked':''}> الرد على الإشعارات</label>
            </div>
            <div class="b11-section">
                <div class="b11-section-title" style="color:#a855f7;">📨 الرسائل</div>
                <label><input type="checkbox" id="b11-msg-reply" ${state.autoReplyMessages?'checked':''}> الرد على الرسائل</label>
                <textarea id="b11-msg-txt" rows="2" class="b11-textarea">${esc(state.messageReplyText)}</textarea>
            </div>
            <div class="b11-section">
                <div class="b11-section-title" style="color:#0085ff;">🎯 عام</div>
                <label><input type="checkbox" id="b11-like" ${state.autoLike?'checked':''}> إعجاب تلقائي</label>
                <label><input type="checkbox" id="b11-follow" ${state.autoFollow?'checked':''}> متابعة تلقائية</label>
                <label><input type="checkbox" id="b11-repost" ${state.autoRepost?'checked':''}> إعادة نشر</label>
                <label><input type="checkbox" id="b11-scroll-on" ${state.autoScroll?'checked':''}> تمرير تلقائي</label>
                <label><input type="checkbox" id="b11-unfollow" ${state.autoUnfollow?'checked':''}> 🧹 إلغاء متابعة غير المتابعين</label>
                <label><input type="checkbox" id="b11-reply" ${state.autoReply?'checked':''}> رد تلقائي عام</label>
                <label><input type="checkbox" id="b11-dry" ${state.dryRun?'checked':''}> 🧪 وضع التجربة</label>
            </div>
            <div class="b11-section">
                <div class="b11-section-title">💬 قوالب الردود</div>
                <label style="font-size:10px;">📝 نص فقط:</label>
                <textarea id="b11-reply-txt" rows="2" class="b11-textarea">${esc(state.replyTextOnly)}</textarea>
                <label style="font-size:10px;">🖼️ صور/فيديو:</label>
                <textarea id="b11-reply-img" rows="2" class="b11-textarea">${esc(state.replyWithImage)}</textarea>
                <label style="font-size:10px;">💬 عام:</label>
                <textarea id="b11-reply-general" rows="2" class="b11-textarea">${esc(state.customReplyText)}</textarea>
            </div>
            <div class="b11-section">
                <label>👤 اسم حسابك:</label>
                <input type="text" id="b11-myhandle" value="${esc(state.myHandle)}" placeholder="username.bsky.social">
            </div>
        </div>

        <div class="b11-pane" data-p="schedule" style="display:none">
            <div class="b11-section">
                <div class="b11-section-title" style="color:#3b82f6;">🔑 كلمة مرور التطبيق</div>
                <input type="password" id="b11-app-pass" value="${esc(state.encryptPasswords ? '' : state.blueskyAppPassword)}" placeholder="xxxx-xxxx-xxxx-xxxx">
                <div style="font-size:9px;color:#94a3b8;">
                    ${state.blueskyAppPassword ? '✅ محفوظة (مشفرة)' : 'أدخلها مرة واحدة'}
                </div>
                <label style="margin-top:6px;"><input type="checkbox" id="b11-encrypt" ${state.encryptPasswords?'checked':''}> 🔐 تشفير كلمة المرور</label>
            </div>
            <div class="b11-section">
                <div class="b11-section-title">📝 منشور جديد</div>
                <textarea id="b11-post-text" rows="3" class="b11-textarea" placeholder="نص المنشور..."></textarea>
                <label style="font-size:10px;">🖼️ صورة/فيديو (اختياري):</label>
                <input type="file" id="b11-post-media" accept="image/*,video/*">
                <label style="font-size:10px;">📝 وصف الصورة (Alt):</label>
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
                <label><input type="checkbox" id="b11-weather-on" ${state.weatherPosts?'checked':''}> إضافة الطقس للمنشورات</label>
                <input type="text" id="b11-weather-city" value="${esc(state.weatherCity)}" placeholder="المدينة">
                <div class="b11-btn-row" style="grid-template-columns:1fr 1fr;">
                    <input type="number" id="b11-weather-lat" value="${state.weatherLat}" placeholder="Lat" step="0.001">
                    <input type="number" id="b11-weather-lon" value="${state.weatherLon}" placeholder="Lon" step="0.001">
                </div>
                <button id="b11-check-weather" class="b11-btn blue">🔍 فحص الطقس الآن</button>
            </div>
            <div class="b11-section">
                <div class="b11-section-title">📅 تقويم المحتوى</div>
                <label><input type="checkbox" id="b11-cal-on" ${state.calendarEnabled?'checked':''}> تفعيل (ينشر الساعة 10 ص)</label>
                ${['sun','mon','tue','wed','thu','fri','sat'].map(d =>
                  `<input type="text" id="b11-cal-${d}" value="${esc(state.calendar[d])}" placeholder="${d}" class="b11-textarea" style="padding:4px;">`
                ).join('')}
            </div>
            <div class="b11-section">
                <div class="b11-section-title">🗓️ أحداث عالمية</div>
                <label><input type="checkbox" id="b11-events" ${state.worldEvents?'checked':''}> إضافة تحية في المناسبات</label>
            </div>
        </div>

        <div class="b11-pane" data-p="filter" style="display:none">
            <label style="background:#1e3a5f;padding:8px;border-radius:6px;display:block;margin:8px 0;border:1px solid #3b82f6;">
                <input type="checkbox" id="b11-only-arabic" ${state.onlyArabic?'checked':''}>
                <b style="color:#60a5fa;">🇸🇦 محتوى عربي فقط</b>
            </label>
            <label>🌍 رمز اللغة:</label>
            <input type="text" id="b11-lang-filter" value="${esc(state.languageFilter)}" placeholder="ar / en / fr">
            <div class="b11-section">
                <div class="b11-section-title" style="color:#ef4444;">🚫 كلمات محظورة</div>
                <textarea id="b11-blacklist" rows="4" class="b11-textarea">${esc(state.blacklistWords)}</textarea>
            </div>
            <div class="b11-section">
                <label><input type="checkbox" id="b11-kw-on" ${state.useKeywordFilter?'checked':''}> تفعيل كلمات مفتاحية</label>
                <textarea id="b11-keywords" rows="3" class="b11-textarea">${esc(state.keywordFilter)}</textarea>
            </div>
            <label><input type="checkbox" id="b11-noavatar" ${state.skipNoAvatar?'checked':''}> تجاهل الحسابات بلا صورة</label>
            <button id="b11-clear-mem" class="b11-btn gray">🧠 مسح ذاكرة التفاعل</button>
        </div>

        <div class="b11-pane" data-p="advanced" style="display:none">
            <div class="b11-section">
                <div class="b11-section-title" style="color:#a855f7;">🤝 متابعة المتفاعلين</div>
                <label><input type="checkbox" id="b11-engagers" ${state.followEngagers?'checked':''}> متابعة من تفاعل معك</label>
                <div style="font-size:10px;color:#94a3b8;">الطابور: ${state.engagerQueue.length} حساب</div>
            </div>
            <div class="b11-section">
                <div class="b11-section-title" style="color:#10b981;">🔍 تحليل المشاعر</div>
                <label><input type="checkbox" id="b11-sentiment" ${state.sentimentAnalysis?'checked':''}> تحليل قبل الرد</label>
            </div>
            <div class="b11-section">
                <div class="b11-section-title" style="color:#f59e0b;">🎯 متغيرات القوالب</div>
                <label><input type="checkbox" id="b11-tmpl-vars" ${state.useTemplateVars?'checked':''}> تفعيل {name} {handle} {post} {time} {date}</label>
            </div>
            <div class="b11-section">
                <div class="b11-section-title" style="color:#3b82f6;">📝 هاشتاجات تلقائية</div>
                <label><input type="checkbox" id="b11-hashtags" ${state.autoHashtags?'checked':''}> إضافة هاشتاجات</label>
                <textarea id="b11-hashtag-map" rows="3" class="b11-textarea" placeholder="كلمة:hashtag1,hashtag2">${esc(state.hashtagMap)}</textarea>
            </div>
            <div class="b11-section">
                <div class="b11-section-title" style="color:#ec4899;">📊 A/B Testing</div>
                <label><input type="checkbox" id="b11-ab" ${state.abTesting?'checked':''}> تتبع أداء القوالب</label>
                <div id="b11-ab-report" style="font-size:10px;background:#0f172a;padding:6px;border-radius:4px;margin-top:4px;"></div>
            </div>
            <div class="b11-section">
                <div class="b11-section-title" style="color:#22c55e;">🧠 تعلّم التفضيلات</div>
                <label><input type="checkbox" id="b11-ml" ${state.mlPreferences?'checked':''}> تتبع أفضل الأوقات</label>
                <div id="b11-ml-report" style="font-size:10px;background:#0f172a;padding:6px;border-radius:4px;margin-top:4px;"></div>
            </div>
            <div class="b11-section">
                <div class="b11-section-title" style="color:#06b6d4;">📈 تتبع إلغاء المتابعة</div>
                <label><input type="checkbox" id="b11-track-unf" ${state.trackUnfollowers?'checked':''}> تتبع من ألغى متابعتك</label>
                <div style="font-size:10px;color:#94a3b8;">متابعون معروفون: ${state.knownFollowers.length}</div>
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
                <div class="b11-section-title">📈 الرسم البياني (7 أيام)</div>
                <canvas id="b11-chart" width="340" height="120" style="background:#0f172a;border-radius:6px;"></canvas>
            </div>
            <div class="b11-btn-row">
                <button id="b11-export-csv" class="b11-btn gray">⬇️ CSV</button>
                <button id="b11-export-sheets" class="b11-btn green">📊 Sheets</button>
            </div>
            <button id="b11-reset-stats" class="b11-btn gray">🗑️ تصفير الإحصائيات</button>
        </div>

        <div class="b11-pane" data-p="settings" style="display:none">
            <div class="b11-section">
                <div class="b11-section-title">⏰ جدولة زمنية</div>
                <label><input type="checkbox" id="b11-sch-on" ${state.scheduleEnabled?'checked':''}> تفعيل</label>
                <div class="b11-btn-row" style="grid-template-columns:1fr 1fr;">
                    <input type="number" id="b11-sch-start" value="${state.scheduleStart}" min="0" max="23">
                    <input type="number" id="b11-sch-end" value="${state.scheduleEnd}" min="0" max="24">
                </div>
            </div>
            <div class="b11-section">
                <div class="b11-section-title">🔢 حد يومي</div>
                <label><input type="checkbox" id="b11-dl-on" ${state.dailyLimitsEnabled?'checked':''}> تفعيل</label>
                <div class="b11-btn-row" style="grid-template-columns:1fr 1fr;">
                    <input type="number" id="b11-dl-likes" value="${state.dailyLimitLikes}" placeholder="إعجابات">
                    <input type="number" id="b11-dl-follows" value="${state.dailyLimitFollows}" placeholder="متابعات">
                    <input type="number" id="b11-dl-replies" value="${state.dailyLimitReplies}" placeholder="ردود">
                    <input type="number" id="b11-dl-msgs" value="${state.dailyLimitMessages}" placeholder="رسائل">
                    <input type="number" id="b11-dl-posts" value="${state.dailyLimitPosts}" placeholder="منشورات">
                    <input type="number" id="b11-dl-reposts" value="${state.dailyLimitReposts}" placeholder="إعادة نشر">
                </div>
            </div>
            <div class="b11-section">
                <div class="b11-section-title">⚙️ معدل</div>
                <input type="number" id="b11-rate" value="${state.rateLimitPerMin}" min="1" max="30">
            </div>
            <div class="b11-section">
                <div class="b11-section-title">☕ استراحة بشرية</div>
                <label><input type="checkbox" id="b11-hb-on" ${state.humanBreakEnabled?'checked':''}> تفعيل</label>
                <div class="b11-btn-row" style="grid-template-columns:1fr 1fr;">
                    <input type="number" id="b11-hb-min" value="${state.humanBreakEveryMin}" placeholder="كل">
                    <input type="number" id="b11-hb-max" value="${state.humanBreakEveryMax}" placeholder="إلى">
                    <input type="number" id="b11-br-min" value="${state.breakDurationMin}" placeholder="دقيقة">
                    <input type="number" id="b11-br-max" value="${state.breakDurationMax}" placeholder="إلى">
                </div>
            </div>
            <div class="b11-section">
                <div class="b11-section-title" style="color:#a855f7;">👥 الحسابات المتعددة</div>
                <div id="b11-profiles" style="margin-bottom:6px;"></div>
                <button id="b11-add-profile" class="b11-btn green">➕ حفظ الحالي كحساب</button>
            </div>
            <div class="b11-section">
                <div class="b11-section-title">💾 الإعدادات</div>
                <button id="b11-export-settings" class="b11-btn blue">⬇️ تصدير JSON</button>
                <button id="b11-import-settings" class="b11-btn green">⬆️ استيراد JSON</button>
                <input type="file" id="b11-import-file" accept=".json" style="display:none;">
            </div>
            <div class="b11-section" style="border:1px solid #ff5e5b;background:linear-gradient(135deg,#2a1810,#1a0f08);">
                <div class="b11-section-title" style="color:#ff5e5b;">❤️ دعم المطوّر</div>
                <div style="font-size:11px;color:#fbbf24;text-align:center;margin:6px 0;font-weight:600;">
                    ادعم البوت بتبرع صغير 💙
                </div>
                <button id="b11-donate" class="b11-btn" style="background:linear-gradient(135deg,#ff5e5b,#d946ef);font-size:13px;padding:10px;">
                    ☕ تبرع عبر Ko-fi
                </button>
                <div style="font-size:9px;color:#94a3b8;text-align:center;margin-top:4px;">
                    ko-fi.com/heromax7411
                </div>
            </div>
            <div class="b11-section" style="border:1px solid #0085ff;">
                <div class="b11-section-title" style="color:#0085ff;">👨‍💻 المطوّر</div>
                <button id="b11-dev" class="b11-btn blue">🌐 زيارة موقع المطوّر</button>
                <button id="b11-github" class="b11-btn gray">🐙 GitHub Repository</button>
                <div style="font-size:10px;color:#94a3b8;text-align:center;margin-top:4px;">
                    Sayed Alhlwani — v${VERSION}
                </div>
            </div>
        </div>

        <div class="b11-pane" data-p="errors" style="display:none">
            <div class="b11-section">
                <div class="b11-section-title" style="color:#ef4444;">🐛 سجل الأخطاء</div>
                <div style="font-size:10px;color:#94a3b8;margin:4px 0;">
                    يتم تسجيل كل خطأ تلقائياً (آخر 50 خطأ)
                </div>
                <div id="b11-error-count" style="font-size:11px;color:#fbbf24;text-align:center;margin:6px 0;"></div>
                <button id="b11-report-error" class="b11-btn" 
                    style="background:linear-gradient(135deg,#ef4444,#dc2626);">
                    📤 إرسال آخر 5 أخطاء إلى GitHub
                </button>
                <div class="b11-btn-row">
                    <button id="b11-export-errors" class="b11-btn gray">⬇️ تصدير JSON</button>
                    <button id="b11-clear-errors" class="b11-btn gray">🗑️ مسح الكل</button>
                </div>
            </div>
            <div class="b11-section">
                <div class="b11-section-title">📋 آخر الأخطاء:</div>
                <div id="b11-error-list" style="font-size:10px;font-family:monospace;
                    background:#0a121e;padding:8px;border-radius:6px;max-height:280px;overflow-y:auto;">
                </div>
            </div>
        </div>

        <div class="b11-pane" data-p="log" style="display:none">
            <button id="b11-log-clear" class="b11-btn gray">🗑️ مسح السجل</button>
            <div id="b11-log-box" class="b11-list"></div>
        </div>

        </div>
        <div id="b11-resize"></div>
        <div id="b11-footer">جاهز • Shift+B للإظهار/الإخفاء</div>
        `;
        document.body.appendChild(panel);

        const css = document.createElement('style');
        css.textContent = `
            #${PANEL_ID}{
                position:fixed;top:70px;right:20px;z-index:99999;
                width:${state.panelSize.w}px;height:${state.panelSize.h}px;
                background:linear-gradient(160deg,#0d1420 0%,#161e27 100%);
                color:#e2e8f0;border-radius:14px;border:1px solid #1e293b;
                box-shadow:0 12px 40px rgba(0,0,0,0.6),0 0 0 1px rgba(0,133,255,0.1);
                font-family:-apple-system,'Segoe UI',sans-serif;font-size:12px;
                display:${state.collapsed ? 'none' : 'flex'};flex-direction:column;overflow:hidden;
            }
            #b11-header{padding:12px 14px;background:linear-gradient(135deg,#1e293b,#0f172a);
                display:flex;justify-content:space-between;align-items:center;cursor:move;
                border-bottom:1px solid #1e293b;}
            .b11-brand{display:flex;align-items:center;gap:10px;}
            .b11-logo{width:34px;height:34px;border-radius:9px;
                background:linear-gradient(135deg,#0085ff,#0066cc);color:#fff;
                display:flex;align-items:center;justify-content:center;
                font-weight:900;font-size:19px;box-shadow:0 4px 12px rgba(0,133,255,0.4);}
            .b11-title{font-weight:700;font-size:13px;color:#fff;}
            .b11-ver{font-size:9px;color:#60a5fa;font-weight:600;}
            .b11-controls{display:flex;gap:4px;}
            .b11-icon{width:26px;height:26px;border:none;border-radius:6px;
                background:rgba(255,255,255,0.06);color:#cbd5e1;cursor:pointer;
                font-size:12px;display:flex;align-items:center;justify-content:center;
                transition:all 0.15s;}
            .b11-icon:hover{background:rgba(255,255,255,0.15);color:#fff;}
            #b11-tabs{display:flex;gap:2px;padding:6px;background:#0a121e;overflow-x:auto;flex-shrink:0;}
            .b11-tab{flex:1;min-width:44px;background:transparent;color:#64748b;border:none;
                padding:6px 2px;border-radius:6px;font-size:9px;cursor:pointer;
                font-weight:600;transition:all 0.15s;white-space:nowrap;}
            .b11-tab:hover{color:#94a3b8;background:rgba(255,255,255,0.03);}
            .b11-tab.active{background:linear-gradient(135deg,#0085ff,#0066cc);color:#fff;
                box-shadow:0 2px 8px rgba(0,133,255,0.4);}
            #b11-body{flex:1;padding:12px;overflow-y:auto;overflow-x:hidden;}
            #b11-body::-webkit-scrollbar{width:6px;}
            #b11-body::-webkit-scrollbar-thumb{background:#334155;border-radius:3px;}
            #b11-body::-webkit-scrollbar-track{background:transparent;}
            .b11-section{background:rgba(15,23,42,0.5);border:1px solid #1e293b;
                border-radius:8px;padding:8px 10px;margin:6px 0;}
            .b11-section-title{font-weight:700;font-size:11px;margin-bottom:6px;
                color:#cbd5e1;display:flex;align-items:center;gap:4px;}
            #${PANEL_ID} label{display:flex;align-items:center;gap:6px;
                font-size:11px;margin:4px 0;cursor:pointer;color:#cbd5e1;}
            #${PANEL_ID} input[type="checkbox"]{accent-color:#0085ff;}
            #${PANEL_ID} input[type="text"],
            #${PANEL_ID} input[type="number"],
            #${PANEL_ID} input[type="password"],
            #${PANEL_ID} input[type="datetime-local"],
            #${PANEL_ID} input[type="file"]{
                width:100%;font-size:11px;padding:6px 8px;margin:3px 0;
                background:#0a121e;color:#e2e8f0;border:1px solid #1e293b;
                border-radius:6px;box-sizing:border-box;transition:border 0.15s;}
            #${PANEL_ID} input:focus{outline:none;border-color:#0085ff;
                box-shadow:0 0 0 2px rgba(0,133,255,0.15);}
            #${PANEL_ID} .b11-textarea{width:100%;font-size:11px;padding:6px 8px;
                margin:3px 0;background:#0a121e;color:#e2e8f0;border:1px solid #1e293b;
                border-radius:6px;box-sizing:border-box;font-family:'Consolas',monospace;
                resize:vertical;transition:border 0.15s;}
            #${PANEL_ID} .b11-textarea:focus{outline:none;border-color:#0085ff;
                box-shadow:0 0 0 2px rgba(0,133,255,0.15);}
            .b11-btn{width:100%;padding:8px;border:none;border-radius:6px;
                font-weight:700;font-size:11px;cursor:pointer;margin:3px 0;
                color:#fff;transition:all 0.15s;font-family:inherit;}
            .b11-btn:hover{transform:translateY(-1px);filter:brightness(1.1);}
            .b11-btn:active{transform:translateY(0);}
            .b11-btn.green{background:linear-gradient(135deg,#22c55e,#16a34a);}
            .b11-btn.blue{background:linear-gradient(135deg,#0085ff,#0066cc);}
            .b11-btn.gray{background:linear-gradient(135deg,#475569,#334155);}
            .b11-btn.purple{background:linear-gradient(135deg,#6366f1,#4f46e5);}
            .b11-btn-row{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:4px 0;}
            .b11-btn-row .b11-btn{margin:0;}
            .b11-status{display:flex;gap:8px;padding:8px;background:linear-gradient(135deg,#0a121e,#0f172a);
                border:1px solid #1e293b;border-radius:8px;font-size:10px;margin-bottom:6px;
                justify-content:space-around;}
            .b11-last{background:#0a121e;padding:8px;border-radius:6px;font-size:10px;
                margin-bottom:6px;border:1px solid #1e293b;}
            #b11-log-box{background:#0a121e;padding:8px;border-radius:6px;font-size:10px;
                color:#cbd5e1;max-height:380px;overflow-y:auto;margin:4px 0;
                font-family:'Consolas',monospace;line-height:1.6;}
            .b11-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:8px;}
            .b11-stats div{background:linear-gradient(135deg,#0a121e,#0f172a);
                padding:8px 4px;border-radius:6px;text-align:center;font-size:11px;
                border:1px solid #1e293b;font-weight:600;}
            #b11-resize{position:absolute;bottom:0;left:0;width:20px;height:20px;
                cursor:nwse-resize;
                background:linear-gradient(135deg,transparent 50%,#0085ff 50%,#0085ff 60%,transparent 60%,transparent 70%,#0085ff 70%,#0085ff 80%,transparent 80%);
                opacity:0.6;}
            #b11-resize:hover{opacity:1;}
            #b11-footer{padding:6px 12px;font-size:10px;color:#10b981;
                background:#0a121e;border-top:1px solid #1e293b;text-align:center;
                border-bottom-left-radius:14px;border-bottom-right-radius:14px;}
        `;
        document.head.appendChild(css);

        document.querySelectorAll('.b11-tab').forEach(tab => {
            tab.onclick = () => {
                document.querySelectorAll('.b11-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.b11-pane').forEach(p => p.style.display = 'none');
                tab.classList.add('active');
                document.querySelector(`.b11-pane[data-p="${tab.dataset.t}"]`).style.display = 'block';
                if (tab.dataset.t === 'log') { logDirty = false; renderLog(); }
                if (tab.dataset.t === 'analytic') { renderChart(); renderDailyStats(); }
                if (tab.dataset.t === 'advanced') { renderABReport(); renderMLReport(); }
                if (tab.dataset.t === 'errors') { renderErrorTab(); }
            };
        });

        const bind = (id, key, isCheck = false) => {
            const el = document.getElementById(id);
            if (!el) return;
            const ev = isCheck ? 'onchange' : 'oninput';
            el[ev] = e => {
                state[key] = isCheck ? e.target.checked : e.target.value;
                saveSettings();
            };
        };
        const bn = (id, key, min = 0, max = 100000) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.oninput = e => {
                const v = parseInt(e.target.value, 10);
                if (!isNaN(v) && v >= min && v <= max) { state[key] = v; saveSettings(); }
            };
        };

        bind('b11-like','autoLike',true); bind('b11-follow','autoFollow',true);
        bind('b11-unfollow','autoUnfollow',true); bind('b11-reply','autoReply',true);
        bind('b11-scroll-on','autoScroll',true); bind('b11-dry','dryRun',true);
        bind('b11-fback','autoFollowBack',true); bind('b11-clike','autoLikeCommenters',true);
        bind('b11-notif-reply','autoReplyNotifications',true);
        bind('b11-msg-reply','autoReplyMessages',true);
        bind('b11-repost','autoRepost',true);
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
        bind('b11-hashtag-map','hashtagMap');
        bind('b11-ab','abTesting',true);
        bind('b11-ml','mlPreferences',true);
        bind('b11-track-unf','trackUnfollowers',true);

        const passEl = document.getElementById('b11-app-pass');
        if (passEl) passEl.onchange = e => {
            setEncryptedPass(e.target.value);
            e.target.value = '';
        };

        ['sun','mon','tue','wed','thu','fri','sat'].forEach(d => {
            const el = document.getElementById(`b11-cal-${d}`);
            if (el) el.oninput = e => {
                state.calendar[d] = e.target.value;
                saveSettings();
            };
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
            if (!text && !mediaInput.files[0]) { alert('أدخل نصاً أو وسائط'); return; }
            if (!timeInput) { alert('حدد الوقت'); return; }
            const time = new Date(timeInput).getTime();
            if (isNaN(time)) { alert('وقت غير صالح'); return; }
            const addPost = (blob = null) => {
                state.scheduledPosts.push({
                    id: Date.now() + '_' + Math.random().toString(36).slice(2, 8),
                    text, time, posted: false,
                    mediaBlob: blob, mediaAlt: alt,
                    mediaType: blob && blob.type && blob.type.startsWith('video') ? 'video' : 'image'
                });
                forceSaveSettings();
                document.getElementById('b11-post-text').value = '';
                document.getElementById('b11-post-time').value = '';
                document.getElementById('b11-post-alt').value = '';
                document.getElementById('b11-post-media').value = '';
                renderScheduledPosts();
                notify('تمت الإضافة', 'سيُنشر في الموعد');
            };
            if (mediaInput.files[0]) addPost(mediaInput.files[0]);
            else addPost();
        };

        document.getElementById('b11-clear-posts').onclick = () => {
            state.scheduledPosts = state.scheduledPosts.filter(p => !p.posted);
            forceSaveSettings(); renderScheduledPosts();
        };

        document.getElementById('b11-check-weather').onclick = async () => {
            const w = await fetchWeather();
            if (w) alert(`🌤️ ${state.weatherCity}: ${w.temp}°C ${w.desc}`);
            else alert('❌ فشل جلب الطقس');
        };

        document.getElementById('b11-add-profile').onclick = () => {
            const name = prompt('اسم الحساب:');
            if (name) { saveCurrentAsProfile(name); renderProfiles(); }
        };

        document.getElementById('b11-donate').onclick = () => {
            window.open(DONATE_URL, '_blank');
            notify('شكراً 💙', 'شكراً لدعمك!');
        };

        document.getElementById('b11-dev').onclick = () => {
            window.open(DEV_URL, '_blank');
        };

        document.getElementById('b11-github').onclick = () => {
            window.open(`https://github.com/${GITHUB_REPO}`, '_blank');
        };

        // 🐛 أزرار تبويب الأخطاء
        document.getElementById('b11-report-error').onclick = () => reportErrorToGitHub();
        document.getElementById('b11-export-errors').onclick = exportErrorLog;
        document.getElementById('b11-clear-errors').onclick = clearErrorLog;

        document.getElementById('b11-export-settings').onclick = exportSettings;
        document.getElementById('b11-import-settings').onclick = () => {
            document.getElementById('b11-import-file').click();
        };
        document.getElementById('b11-import-file').onchange = e => {
            if (e.target.files[0]) importSettings(e.target.files[0]);
        };

        document.getElementById('b11-restart').onclick = () => {
            log('⏳ إعادة تشغيل...');
            loopGeneration++;
            setTimeout(() => { botLoop(); log('✅'); }, 300);
        };
        document.getElementById('b11-pause').onclick = e => {
            state.paused = !state.paused;
            e.target.innerText = state.paused ? '▶️ استئناف' : '⏸️ إيقاف';
            e.target.className = state.paused ? 'b11-btn green' : 'b11-btn gray';
            saveSettings();
        };
        document.getElementById('b11-scroll').onclick = () => autoScrollDown(true, loopGeneration);

        document.getElementById('b11-test').onclick = () => {
            const f = collectAllFollowButtons(), l = collectAllLikeButtons(), r = collectAllRepostButtons();
            alert([
                `📄 ${location.pathname}`,
                `👤 اسمك: ${state.myHandle || '؟'}`,
                `👥 متابعة: ${f.length} | ❤️ إعجاب: ${l.length} | 🔄 إعادة: ${r.length}`,
                `🌐 لغة: ${state.languageFilter || 'معطّلة'}`,
                `⏰ جدولة: ${state.scheduleEnabled ? 'مفعّلة' : 'معطّلة'}`,
                `🔢 حد يومي: ${state.dailyLimitsEnabled ? 'مفعّل' : 'معطّل'}`,
                `📊 طابور متفاعلين: ${state.engagerQueue.length}`,
                `👥 متابعون معروفون: ${state.knownFollowers.length}`,
                `🐛 أخطاء: ${errorLog.length}`
            ].join('\n'));
        };

        document.getElementById('b11-clear-mem').onclick = () => {
            if (confirm('مسح ذاكرة التفاعل؟')) {
                ['processedLikes','processedFollows','processedFollowBacks','processedCommentLikes',
                 'processedNotifReplies','processedMessages','processedReposts','processedPosts']
                    .forEach(k => state[k] = []);
                state.unfollowedUsers = []; state.actionCounter = 0;
                forceSaveSettings();
                pushLog('info', '🧠 مسح الذاكرة');
                alert('✅');
            }
        };

        document.getElementById('b11-theme').onclick = () => {
            state.theme = state.theme === 'dark' ? 'light' : 'dark';
            const bg = state.theme === 'light' ? '#f1f5f9' : '#161e27';
            const cl = state.theme === 'light' ? '#0f172a' : '#e2e8f0';
            panel.style.background = bg; panel.style.color = cl;
            saveSettings();
        };

        document.getElementById('b11-collapse').onclick = () => {
            panel.style.display = 'none';
            mini.style.display = 'flex';
            state.collapsed = true; saveSettings();
        };

        document.getElementById('b11-close').onclick = () => {
            panel.style.display = 'none';
            mini.style.display = 'flex';
            state.collapsed = true; saveSettings();
        };

        document.addEventListener('keydown', e => {
            if (e.shiftKey && e.key.toLowerCase() === 'b') {
                const vis = panel.style.display !== 'none';
                panel.style.display = vis ? 'none' : 'flex';
                mini.style.display = vis ? 'flex' : 'none';
                state.collapsed = vis; saveSettings();
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
                p1 = p3 - ev.clientX; p2 = p4 - ev.clientY;
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
                panel.style.width = w + 'px'; panel.style.height = h + 'px';
                state.panelSize = { w, h };
            };
        };
        resizer.onmouseup = () => { forceSaveSettings(); };

        document.getElementById('b11-export-csv').onclick = () => {
            const rows = [['date','likes','follows','unfollows','replies','followBacks',
                           'commentLikes','notifReplies','messageReplies','posts','reposts']];
            stats.history.forEach(h => rows.push([h.d, h.likes||0, h.follows||0,
                h.unfollows||0, h.replies||0, h.followBacks||0, h.commentLikes||0,
                h.notifReplies||0, h.messageReplies||0, h.posts||0, h.reposts||0]));
            const blob = new Blob([rows.map(r => r.join(',')).join('\n')], {type:'text/csv'});
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'bsky-stats.csv'; a.click();
        };
        document.getElementById('b11-export-sheets').onclick = exportToSheets;

        document.getElementById('b11-reset-stats').onclick = () => {
            if (confirm('تصفير الإحصائيات؟')) {
                stats = { likes:0, follows:0, unfollows:0, replies:0, followBacks:0,
                          commentLikes:0, notifReplies:0, messageReplies:0, posts:0,
                          reposts:0, engagerFollows:0, history:[] };
                saveStats(); updateStatsUI(); renderChart();
            }
        };
        document.getElementById('b11-log-clear').onclick = () => {
            if (confirm('مسح السجل؟')) {
                state.activityLog = []; forceSaveSettings(); renderLog();
            }
        };

        renderLog(); updateStatsUI(); renderScheduledPosts();
        renderDailyStats(); renderProfiles(); renderChart();
        renderABReport(); renderMLReport(); renderErrorTab();
    }

    /* ════════════════ واجهة ════════════════ */
    function updateStatsUI() {
        const s = (id, v) => { const e = document.getElementById(id); if (e) e.innerText = v; };
        s('st-likes', stats.likes); s('st-follows', stats.follows);
        s('st-unfollows', stats.unfollows); s('st-replies', stats.replies);
        s('st-followbacks', stats.followBacks || 0);
        s('st-commentlikes', stats.commentLikes || 0);
        s('st-notifreplies', stats.notifReplies || 0);
        s('st-msgreplies', stats.messageReplies || 0);
        s('st-posts', stats.posts || 0);
        s('st-reposts', stats.reposts || 0);
        s('st-engagerfollows', stats.engagerFollows || 0);
    }
    function updateDebugInfo(type, val) {
        const map = { like: 'b11-dbg-like', follow: 'b11-dbg-follow' };
        const icons = { like: '❤️', follow: '👤' };
        const el = document.getElementById(map[type]); if (!el) return;
        const c = val > 0 ? '#10b981' : '#ef4444';
        el.innerHTML = `${icons[type]}<b style="color:${c}">${val}</b>`;
    }
    function renderLog() {
        const el = document.getElementById('b11-log-box'); if (!el) return;
        el.innerHTML = state.activityLog.slice(-100).reverse().map(l => {
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
                        : '#cbd5e1';
            return `<div style="color:${color}">${new Date(l.t).toLocaleTimeString()} • ${l.type} • ${esc(l.detail)}</div>`;
        }).join('');
        const last = document.getElementById('b11-last-result');
        if (last && state.lastClickResult) last.innerText = state.lastClickResult;
    }
    function renderScheduledPosts() {
        const el = document.getElementById('b11-post-list'); if (!el) return;
        if (state.scheduledPosts.length === 0) {
            el.innerHTML = '<div style="color:#64748b;text-align:center;padding:6px;">لا توجد منشورات</div>';
            return;
        }
        el.innerHTML = state.scheduledPosts.slice(-20).reverse().map(p => {
            const d = new Date(p.time);
            const st = p.posted ? '✅' : '⏳';
            const media = p.mediaBlob ? ' 📎' : '';
            return `<div style="background:#0a121e;padding:5px 8px;border-radius:5px;margin:3px 0;
                display:flex;justify-content:space-between;align-items:center;font-size:10px;">
                <span>${st}${media} ${esc(p.text.slice(0, 25))}...</span>
                <span style="color:#94a3b8;font-size:9px;">${d.toLocaleString('ar-EG')}</span>
            </div>`;
        }).join('');
    }
    function renderDailyStats() {
        const el = document.getElementById('b11-daily'); if (!el) return;
        const c = getDailyCounters();
        el.innerHTML = `
            ❤️ ${c.likes||0}/${state.dailyLimitLikes} |
            👤 ${c.follows||0}/${state.dailyLimitFollows} |
            💬 ${c.replies||0}/${state.dailyLimitReplies} |
            📨 ${c.messages||0}/${state.dailyLimitMessages} |
            📝 ${c.posts||0}/${state.dailyLimitPosts} |
            🔁 ${c.reposts||0}/${state.dailyLimitReposts}
        `;
    }
    function renderProfiles() {
        const el = document.getElementById('b11-profiles'); if (!el) return;
        if (profiles.length === 0) {
            el.innerHTML = '<div style="color:#64748b;font-size:10px;">لا توجد حسابات محفوظة</div>';
            return;
        }
        el.innerHTML = profiles.map((p, i) => `
            <div style="display:flex;justify-content:space-between;align-items:center;
                background:#0a121e;padding:5px 8px;border-radius:5px;margin:3px 0;font-size:11px;">
                <span>${i === activeProfileIdx ? '🟢' : '⚪'} ${esc(p.name)}</span>
                <div>
                    <button data-sw="${i}" style="background:#22c55e;border:none;color:#fff;
                        padding:2px 6px;border-radius:3px;cursor:pointer;font-size:9px;margin-right:3px;">تبديل</button>
                    <button data-del="${i}" style="background:#ef4444;border:none;color:#fff;
                        padding:2px 6px;border-radius:3px;cursor:pointer;font-size:9px;">حذف</button>
                </div>
            </div>
        `).join('');
        el.querySelectorAll('[data-sw]').forEach(b => b.onclick = () => switchProfile(+b.dataset.sw));
        el.querySelectorAll('[data-del]').forEach(b => b.onclick = () => deleteProfile(+b.dataset.del));
    }
    function renderChart() {
        const cv = document.getElementById('b11-chart'); if (!cv) return;
        const ctx = cv.getContext('2d');
        const W = cv.width, H = cv.height;
        ctx.clearRect(0, 0, W, H);
        const last7 = stats.history.slice(-7);
        if (last7.length === 0) {
            ctx.fillStyle = '#64748b'; ctx.font = '12px sans-serif';
            ctx.fillText('لا توجد بيانات', 10, H/2); return;
        }
        const max = Math.max(...last7.map(h => (h.likes||0)+(h.follows||0)), 10);
        const bw = W / last7.length;
        last7.forEach((h, i) => {
            const lh = ((h.likes||0) / max) * (H - 30);
            const fh = ((h.follows||0) / max) * (H - 30);
            const x = i * bw + 4;
            ctx.fillStyle = '#ef4444';
            ctx.fillRect(x, H - 20 - lh, bw/2 - 2, lh);
            ctx.fillStyle = '#0085ff';
            ctx.fillRect(x + bw/2, H - 20 - fh, bw/2 - 2, fh);
            ctx.fillStyle = '#64748b'; ctx.font = '9px sans-serif';
            ctx.fillText(h.d.slice(5), x, H - 6);
        });
        ctx.fillStyle = '#ef4444'; ctx.fillRect(6, 6, 8, 8);
        ctx.fillStyle = '#cbd5e1'; ctx.font = '9px sans-serif'; ctx.fillText('إعجاب', 18, 13);
        ctx.fillStyle = '#0085ff'; ctx.fillRect(60, 6, 8, 8);
        ctx.fillStyle = '#cbd5e1'; ctx.fillText('متابعة', 72, 13);
    }
    function renderABReport() {
        const el = document.getElementById('b11-ab-report'); if (!el) return;
        const entries = Object.entries(state.replyPerf || {}).sort((a, b) => b[1].uses - a[1].uses).slice(0, 5);
        if (entries.length === 0) { el.innerText = 'لا توجد بيانات بعد'; return; }
        el.innerHTML = entries.map(([t, d]) =>
            `<div>• "${esc(t.slice(0, 20))}" — ${d.uses} استخدام</div>`
        ).join('');
    }
    function renderMLReport() {
        const el = document.getElementById('b11-ml-report'); if (!el) return;
        const best = getBestHour();
        el.innerText = best.count > 0 ? `⏰ أفضل ساعة: ${best.hour}:00 (${best.count} فعل)` : 'لا توجد بيانات';
    }
    function log(msg) {
        const el = document.getElementById('b11-footer');
        if (el) el.innerText = msg + ' • Shift+B';
    }

    /* ════════════════ بدء التشغيل ════════════════ */
    setInterval(() => {
        const l = document.getElementById('b11-dbg-loop');
        if (l) l.innerHTML = `🔄<b style="color:#10b981">${loopGeneration}</b>`;
        const c = document.getElementById('b11-dbg-cycle');
        if (c) c.innerHTML = `📊<b style="color:#f59e0b">${cyclesWithoutAction}</b>`;
        const b = document.getElementById('b11-dbg-break');
        if (b) b.innerHTML = `☕<b style="color:#a855f7">${state.actionCounter || 0}</b>`;
        renderDailyStats();
    }, 3000);

    window.addEventListener('beforeunload', () => { loopGeneration++; stopKeepAlive(); });

    setTimeout(() => { createDashboard(); botLoop(); }, 2000);

})();