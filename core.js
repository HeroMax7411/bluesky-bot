(function () {
    'use strict';
    if (window.__BSKY && window.__BSKY.version === '1.0.6') return;
    const NS = window.__BSKY = window.__BSKY || {};

    NS.version = '1.0.6';
    NS.GITHUB_REPO = 'HeroMax7411/bluesky-bot';
    NS.GITHUB_ISSUES_URL = `https://github.com/${NS.GITHUB_REPO}/issues/new`;
    NS.DEV_URL = 'https://sayedalhlwani.blogspot.com/';
    NS.DONATE_URL = 'https://ko-fi.com/heromax7411';
    NS.STORAGE_KEY = 'bsky_bot_v75_settings';
    NS.STATS_KEY = 'bsky_bot_v75_stats';
    NS.PROFILES_KEY = 'bsky_bot_v75_profiles';
    NS.ERROR_LOG_KEY = 'bsky_bot_error_log_v1';
    NS.PANEL_ID = 'bsky-bot-v75';

    // ═══ Utilities ═══
    NS.sleep = ms => new Promise(r => setTimeout(r, ms));
    NS.rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
    NS.todayStr = () => new Date().toISOString().slice(0, 10);
    NS.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
        c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

    NS.notify = function (title, text) {
        try { if (typeof GM_notification === 'function')
            GM_notification({ title, text, timeout: 4000 }); } catch(e){}
    };

    // ═══ Encryption ═══
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
    NS.encrypt = function (text) {
        if (!text) return '';
        try {
            const bytes = strToU8(text);
            const keyBytes = strToU8(XOR_KEY);
            const out = new Uint8Array(bytes.length);
            for (let i = 0; i < bytes.length; i++)
                out[i] = bytes[i] ^ keyBytes[i % keyBytes.length];
            return 'ENC:' + u8ToB64(out);
        } catch (e) { return text; }
    };
    NS.decrypt = function (enc) {
        if (!enc || !enc.startsWith('ENC:')) return enc || '';
        try {
            const bytes = b64ToU8(enc.slice(4));
            const keyBytes = strToU8(XOR_KEY);
            const out = new Uint8Array(bytes.length);
            for (let i = 0; i < bytes.length; i++)
                out[i] = bytes[i] ^ keyBytes[i % keyBytes.length];
            return u8ToStr(out);
        } catch (e) { return ''; }
    };

    // ═══ Error Logging ═══
    let errorLog = [];
    try {
        errorLog = JSON.parse(localStorage.getItem(NS.ERROR_LOG_KEY) || '[]');
        if (!Array.isArray(errorLog)) errorLog = [];
    } catch(e) { errorLog = []; }
    NS.errorLog = errorLog;

    NS.saveErrorLog = function () {
        try {
            NS.errorLog = NS.errorLog.slice(-50);
            localStorage.setItem(NS.ERROR_LOG_KEY, JSON.stringify(NS.errorLog));
        } catch(e) {}
    };

    NS.captureError = function (err, context) {
        try {
            const entry = {
                t: Date.now(),
                version: NS.version,
                message: 'Unknown',
                stack: '',
                context: String(context || '').slice(0, 200),
                url: (location.href || '').slice(0, 200),
                userAgent: (navigator.userAgent || '').slice(0, 200),
                handle: (NS.state && NS.state.myHandle) || '',
                viewport: window.innerWidth + 'x' + window.innerHeight,
            };
            if (err) {
                try { entry.message = String(err.message || err).slice(0, 500); } catch(e){}
                try { entry.stack = String(err.stack || '').slice(0, 1500); } catch(e){}
            }
            NS.errorLog.push(entry);
            NS.saveErrorLog();
            console.error('🔴 خطأ:', entry);
        } catch(e) {}
    };

    window.addEventListener('error', function (ev) {
        try {
            let errObj;
            if (ev && ev.error) errObj = ev.error;
            else if (ev && ev.message) errObj = new Error(String(ev.message));
            else return;
            let ctx = 'global error';
            if (ev && ev.lineno) ctx += ' @ line ' + ev.lineno;
            NS.captureError(errObj, ctx);
        } catch(e) {}
    }, true);

    window.addEventListener('unhandledrejection', function (ev) {
        try {
            if (ev && ev.reason) NS.captureError(ev.reason, 'promise rejection');
        } catch(e) {}
    }, true);

    NS.buildErrorReport = function (errors) {
        let out = `## 🐛 تقرير خطأ تلقائي\n\n`;
        out += `**الإصدار**: \`v${NS.version}\`\n`;
        out += `**التاريخ**: ${new Date().toLocaleString('ar-EG')}\n`;
        out += `**المتصفح**: ${navigator.userAgent}\n`;
        out += `**الصفحة**: ${location.href}\n`;
        out += `**الحساب**: ${(NS.state && NS.state.myHandle) || 'غير معروف'}\n\n---\n\n`;
        errors.forEach((e, i) => {
            out += `### خطأ #${i + 1}\n`;
            out += `- **الوقت**: ${new Date(e.t).toLocaleString('ar-EG')}\n`;
            out += `- **الرسالة**: \`${e.message}\`\n`;
            out += `- **السياق**: ${e.context || 'غير محدد'}\n`;
            if (e.stack) out += `- **Stack**:\n\`\`\`\n${e.stack}\n\`\`\`\n`;
            out += `\n`;
        });
        out += `---\n\n_تم إنشاؤه تلقائياً من بوت بلو سكاي_`;
        return out;
    };

    NS.reportErrorToGitHub = function () {
        const errors = NS.errorLog.slice(-5);
        if (errors.length === 0) { alert('✅ لا توجد أخطاء'); return; }
        const title = encodeURIComponent(`[Auto] خطأ v${NS.version} - ${errors[0].message.slice(0, 60)}`);
        const body = encodeURIComponent(NS.buildErrorReport(errors));
        window.open(`${NS.GITHUB_ISSUES_URL}?title=${title}&body=${body}&labels=bug`, '_blank');
        NS.notify('إرسال', 'تم فتح GitHub Issues');
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

    NS.renderErrorTab = function () {
        const countEl = document.getElementById('b11-error-count');
        if (countEl) countEl.innerHTML = `📊 عدد الأخطاء: <b style="color:#ef4444">${NS.errorLog.length}</b>`;
        const listEl = document.getElementById('b11-error-list');
        if (!listEl) return;
        if (NS.errorLog.length === 0) {
            listEl.innerHTML = '<div style="color:#22c55e;text-align:center;padding:10px;">✅ لا توجد أخطاء</div>';
            return;
        }
        listEl.innerHTML = NS.errorLog.slice(-20).reverse().map(e => `
            <div style="background:#1a0f0f;padding:6px;border-radius:4px;margin:4px 0;border-right:3px solid #ef4444;">
                <div style="color:#fbbf24;font-weight:bold;font-size:10px;">${new Date(e.t).toLocaleTimeString('ar-EG')} - v${NS.esc(e.version)}</div>
                <div style="color:#fca5a5;margin:3px 0;word-break:break-all;">${NS.esc(e.message.slice(0, 120))}</div>
                ${e.context ? `<div style="color:#94a3b8;font-size:9px;">${NS.esc(e.context)}</div>` : ''}
            </div>
        `).join('');
    };

    // ═══ Default State ═══
    NS.defaultState = {
        autoLike: false, autoFollow: false, autoUnfollow: false,
        autoReply: false, autoFollowBack: false, autoLikeCommenters: false,
        autoReplyNotifications: false, autoReplyMessages: false, autoRepost: false,
        messageReplyText: "شكراً على رسالتك! 🙏\nأهلاً بك! كيف يمكنني مساعدتك؟",
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
        hashtagMap: "تصوير:photography,art\nبرمجة:javascript,coding",
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

    const savedRaw = localStorage.getItem(NS.STORAGE_KEY);
    NS.state = Object.assign({}, NS.defaultState, JSON.parse(savedRaw || '{}'));
    if (savedRaw === null) NS.state.collapsed = false;
    window.__bskyState = NS.state;

    ['unfollowedUsers','processedLikes','processedFollows','processedFollowBacks',
     'processedCommentLikes','processedNotifReplies','processedMessages','processedReposts',
     'processedPosts','activityLog','scheduledPosts','knownFollowers','engagerQueue']
        .forEach(k => { if (!Array.isArray(NS.state[k])) NS.state[k] = []; });

    if (!NS.state.dailyCounters || typeof NS.state.dailyCounters !== 'object') NS.state.dailyCounters = {};
    if (!NS.state.replyPerf || typeof NS.state.replyPerf !== 'object') NS.state.replyPerf = {};
    if (!NS.state.actionPerf || typeof NS.state.actionPerf !== 'object') NS.state.actionPerf = {};
    if (!NS.state.engagerAttempts || typeof NS.state.engagerAttempts !== 'object') NS.state.engagerAttempts = {};
    if (!NS.state.calendar) NS.state.calendar = NS.defaultState.calendar;

    NS.stats = JSON.parse(localStorage.getItem(NS.STATS_KEY) || 'null') || {
        likes: 0, follows: 0, unfollows: 0, replies: 0, followBacks: 0,
        commentLikes: 0, notifReplies: 0, messageReplies: 0, posts: 0,
        reposts: 0, engagerFollows: 0, history: []
    };
    NS.profiles = JSON.parse(localStorage.getItem(NS.PROFILES_KEY) || '[]');
    NS.activeProfileIdx = 0;
    NS.loopGeneration = 0;
    NS.activeLoopId = null;
    NS.lastMemoryReset = Date.now();
    NS.cyclesWithoutAction = 0;
    NS.actionTimestamps = [];
    NS.scrollCache = { el: null, ts: 0, path: '' };
    NS.cachedWeather = null;
    NS.sessionCache = { accessJwt: null, refreshJwt: null, did: null, expiresAt: 0 };
    NS.handleDetectionAttempts = 0;

    // ═══ Save/Load ═══
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
            .forEach(k => NS.state[k] = NS.state[k].slice(-2000));
        NS.state.unfollowedUsers = NS.state.unfollowedUsers.slice(-300);
        NS.state.activityLog = NS.state.activityLog.slice(-500);
        NS.state.scheduledPosts = NS.state.scheduledPosts.slice(-100);
        NS.state.knownFollowers = NS.state.knownFollowers.slice(-2000);
        try { localStorage.setItem(NS.STORAGE_KEY, JSON.stringify(NS.state)); } catch(e){}
    };
    NS.saveStats = function () {
        NS.stats.history = NS.stats.history.slice(-90);
        try { localStorage.setItem(NS.STATS_KEY, JSON.stringify(NS.stats)); } catch(e){}
    };
    NS.saveProfiles = function () {
        try { localStorage.setItem(NS.PROFILES_KEY, JSON.stringify(NS.profiles)); } catch(e){}
    };

    NS.bumpStat = function (key, inc = 1) {
        NS.stats[key] = (NS.stats[key] || 0) + inc;
        const t = NS.todayStr();
        let day = NS.stats.history.find(h => h.d === t);
        if (!day) {
            day = { d: t, likes:0, follows:0, unfollows:0, replies:0, followBacks:0,
                    commentLikes:0, notifReplies:0, messageReplies:0, posts:0,
                    reposts:0, engagerFollows:0 };
            NS.stats.history.push(day);
        }
        day[key] = (day[key] || 0) + inc;
        NS.saveStats(); NS.updateStatsUI();
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

    // ═══ Push Log ═══
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
                    logDirty = false; NS.renderLog();
                }
            });
        }
    };

    // ═══ Rate Limit ═══
    NS.rateCheck = function () {
        const now = Date.now();
        NS.actionTimestamps = NS.actionTimestamps.filter(t => now - t < 60000);
        return NS.actionTimestamps.length < NS.state.rateLimitPerMin;
    };
    NS.rateRecord = function () { NS.actionTimestamps.push(Date.now()); };

    // ═══ Daily Counters ═══
    NS.getDailyCounters = function () {
        const today = NS.todayStr();
        if (!NS.state.dailyCounters || NS.state.dailyCounters.date !== today) {
            NS.state.dailyCounters = { date: today, likes:0, follows:0, replies:0, messages:0,
                posts:0, followBacks:0, commentLikes:0, notifReplies:0, reposts:0, engagerFollows:0 };
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
    NS.dailyIncrement = function (key, inc = 1) {
        const c = NS.getDailyCounters();
        c[key] = (c[key] || 0) + inc;
        NS.forceSaveSettings();
    };

    NS.isWithinSchedule = function () {
        if (!NS.state.scheduleEnabled) return true;
        const h = new Date().getHours();
        const s = Number(NS.state.scheduleStart) || 0;
        const e = Number(NS.state.scheduleEnd) || 24;
        if (s <= e) return h >= s && h < e;
        return h >= s || h < e;
    };

    // ═══ Keep-Alive ═══
    let keepAliveWorker = null, keepAliveURL = null;
    NS.startKeepAlive = function () {
        try {
            if (keepAliveWorker) return;
            const blob = new Blob(['setInterval(()=>postMessage("p"),30000)'], {type:'text/javascript'});
            keepAliveURL = URL.createObjectURL(blob);
            keepAliveWorker = new Worker(keepAliveURL);
            keepAliveWorker.onmessage = () => {};
        } catch(e){}
    };
    NS.stopKeepAlive = function () {
        try {
            if (keepAliveWorker) { keepAliveWorker.terminate(); keepAliveWorker = null; }
            if (keepAliveURL) { URL.revokeObjectURL(keepAliveURL); keepAliveURL = null; }
        } catch(e){}
    };
    NS.startKeepAlive();

    // ═══ sleepGen ═══
    NS.sleepGen = async function (ms, myGen) {
        const end = Date.now() + ms;
        while (Date.now() < end) {
            if (myGen !== undefined && myGen !== NS.loopGeneration) return false;
            await NS.sleep(Math.min(150, end - Date.now()));
        }
        return true;
    };

    // ═══ Getters to keep in sync ═══
    Object.defineProperty(NS, 'getState', { get: () => NS.state });
})();