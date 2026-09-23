(function () {
    'use strict';
    const NS = window.__BSKY;
    if (!NS) return;

    // ═══ Text Analysis ═══
    NS.isArabicText = function (text) {
        if (!text) return false;
        const a = (text.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g) || []).length;
        const t = text.replace(/[^a-zA-Z\u0600-\u06FF]/g, '').length;
        if (t === 0) return false;
        return (a / t) > 0.3;
    };
    NS.parseList = function (s) {
        return String(s || '').split(/[\n,،]/).map(w => w.trim().toLowerCase()).filter(Boolean);
    };
    NS.getBlacklist = function () { return NS.parseList(NS.state.blacklistWords); };
    NS.getKeywords = function () { return NS.parseList(NS.state.keywordFilter); };
    NS.containsBlacklisted = function (text) {
        const l = NS.getBlacklist();
        if (!l.length) return false;
        const low = String(text || '').toLowerCase();
        return l.some(w => low.includes(w));
    };
    NS.matchesKeywords = function (text) {
        if (!NS.state.useKeywordFilter) return true;
        const l = NS.getKeywords();
        if (!l.length) return true;
        const low = String(text || '').toLowerCase();
        return l.some(w => low.includes(w));
    };
    NS.hasAvatar = function (c) {
        if (!c) return false;
        for (const img of c.querySelectorAll('img')) {
            const src = img.getAttribute('src') || '';
            if (!src || src.includes('default-avatar') || src.includes('/default')) continue;
            if (/avatar/i.test(src)) return true;
        }
        return false;
    };
    NS.postHasImage = function (c) {
        return c ? c.querySelectorAll('img[src*="cdn.bsky.app"], img[src*="bsky"]').length > 0 : false;
    };
    NS.postHasVideo = function (c) {
        return c ? c.querySelectorAll('video').length > 0 : false;
    };

    // ═══ Sentiment ═══
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

    // ═══ Template Vars ═══
    NS.applyTemplateVars = function (template, ctx) {
        if (!NS.state.useTemplateVars) return template;
        return template
            .replace(/\{name\}/g, ctx.name || 'صديقي')
            .replace(/\{handle\}/g, ctx.handle || '')
            .replace(/\{post\}/g, (ctx.post || '').slice(0, 60))
            .replace(/\{time\}/g, new Date().toLocaleTimeString('ar-EG'))
            .replace(/\{date\}/g, NS.todayStr());
    };

    // ═══ Hashtags ═══
    NS.generateHashtags = function (text) {
        if (!NS.state.autoHashtags) return '';
        const map = {};
        String(NS.state.hashtagMap || '').split('\n').forEach(line => {
            const [kw, tags] = line.split(':');
            if (kw && tags) map[kw.trim()] = tags.split(',').map(t => t.trim()).filter(Boolean);
        });
        const low = String(text || '').toLowerCase();
        const found = new Set();
        for (const [kw, tags] of Object.entries(map)) {
            if (low.includes(kw.toLowerCase())) tags.forEach(t => found.add(t));
        }
        return Array.from(found).slice(0, 5).map(t => '#' + t).join(' ');
    };

    // ═══ World Events ═══
    NS.getWorldEvent = function () {
        if (!NS.state.worldEvents) return '';
        const now = new Date();
        const m = now.getMonth() + 1, d = now.getDate();
        const events = {
            '1-1': '🎉 سنة جديدة سعيدة!', '3-21': '🌸 عيد الأم',
            '5-1': '👷 عيد العمال', '6-1': '👶 عيد الطفولة',
            '7-23': '🇪🇬 عيد ثورة يوليو', '10-6': '🎖️ ذكرى أكتوبر',
            '12-25': '🎄 عيد الميلاد',
        };
        return events[`${m}-${d}`] || '';
    };

    // ═══ Weather ═══
    NS.fetchWeather = async function () {
        if (!NS.state.weatherPosts) return null;
        if (NS.cachedWeather && Date.now() - NS.state.lastWeatherCheck < 3600000) return NS.cachedWeather;
        try {
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${NS.state.weatherLat}&longitude=${NS.state.weatherLon}&current=temperature_2m,weather_code`;
            const res = await fetch(url);
            const data = await res.json();
            const temp = data.current?.temperature_2m;
            const code = data.current?.weather_code;
            const desc = NS.weatherCodeToArabic(code);
            NS.cachedWeather = { temp, code, desc };
            NS.state.lastWeatherCheck = Date.now();
            NS.forceSaveSettings();
            return NS.cachedWeather;
        } catch (e) { return null; }
    };
    NS.weatherCodeToArabic = function (code) {
        const m = {0:'صافٍ ☀️',1:'صافٍ جزئياً 🌤️',2:'غائم جزئياً ⛅',3:'غائم ☁️',
                   45:'ضباب 🌫️',48:'ضباب متجمد 🌫️',51:'رذاذ 🌦️',61:'مطر 🌧️',
                   63:'مطر متوسط 🌧️',65:'مطر غزير ⛈️',71:'ثلج 🌨️',80:'زخات 🌦️',
                   95:'عاصفة ⛈️'};
        return m[code] || 'معتدل 🌡️';
    };

    // ═══ Password ═══
    NS.getDecryptedPass = function () {
        const p = NS.state.blueskyAppPassword || '';
        return p.startsWith('ENC:') ? NS.decrypt(p) : p;
    };
    NS.setEncryptedPass = function (plain) {
        NS.state.blueskyAppPassword = NS.state.encryptPasswords ? NS.encrypt(plain) : plain;
        NS.forceSaveSettings();
    };

    // ═══ DOM utils ═══
    NS.getPostKey = function (el) {
        const l = el?.querySelector('a[href*="/post/"]');
        return l ? l.getAttribute('href') : (el?.innerText || '').slice(0, 80);
    };
    NS.getHandleFromContainer = function (c) {
        const l = c?.querySelector('a[href^="/profile/"]');
        return l ? l.getAttribute('href').replace('/profile/','').split('/')[0] : null;
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
    };
    NS.setInputValue = function (el, value) {
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
    };

    // ═══ Button detection ═══
    NS.isFollowButton = function (btn) {
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
    };
    NS.isLikeButton = function (btn) {
        const tid = (btn.getAttribute('data-testid') || '').toLowerCase();
        if (tid === 'likebtn') return true;
        if (tid === 'unlikebtn') return false;
        const l = (btn.getAttribute('aria-label') || '').toLowerCase().trim();
        const t = (btn.innerText || '').trim().toLowerCase();
        const has = (l === 'like' || l.startsWith('like ') || l.includes('إعجاب') ||
                     t === 'like' || t.includes('إعجاب'));
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
        if (tid === 'unfollowbtn') return true;
        const l = (btn.getAttribute('aria-label') || '').toLowerCase();
        const t = (btn.innerText || '').trim().toLowerCase();
        return l.includes('following') || l.includes('unfollow') || t === 'following';
    };
    NS.isRepostButton = function (btn) {
        const tid = (btn.getAttribute('data-testid') || '').toLowerCase();
        if (tid === 'repostbtn') return true;
        if (tid === 'unrepostbtn') return false;
        const l = (btn.getAttribute('aria-label') || '').toLowerCase();
        return (l.includes('repost') && !l.includes('un')) || l.includes('إعادة نشر');
    };

    // ═══ Collectors ═══
    NS.collectAllFollowButtons = function () {
        const r = [], seen = new Set();
        for (const btn of document.querySelectorAll('button, [role="button"]')) {
            if (NS.isInsidePanel(btn) || !NS.isFollowButton(btn)) continue;
            let c = btn;
            for (let i = 0; i < 12 && c; i++) {
                if (c.querySelector('a[href^="/profile/"]')) break;
                c = c.parentElement;
            }
            if (!c) continue;
            const h = NS.getHandleFromContainer(c);
            if (!h || seen.has(h) || h === NS.state.myHandle) continue;
            if (NS.containsBlacklisted(h)) continue;
            if (NS.state.skipNoAvatar && !NS.hasAvatar(c)) continue;
            if (NS.state.onlyArabic) {
                const bio = (c.innerText || '').slice(0, 500);
                if (bio.trim() && !NS.isArabicText(bio)) continue;
            }
            seen.add(h);
            r.push({ btn, post: c, key: h, handle: h });
        }
        return r;
    };
    NS.collectAllLikeButtons = function () {
        const r = [], seen = new Set();
        for (const btn of document.querySelectorAll('button, [role="button"]')) {
            if (NS.isInsidePanel(btn) || !NS.isLikeButton(btn) || NS.isAlreadyLiked(btn)) continue;
            let c = btn;
            for (let i = 0; i < 10 && c; i++) {
                if (c.querySelector('a[href*="/post/"]')) break;
                c = c.parentElement;
            }
            if (!c) continue;
            const k = NS.getPostKey(c);
            if (!k || seen.has(k)) continue;
            const postText = (c.innerText || '').slice(0, 800);
            if (NS.containsBlacklisted(postText) || !NS.matchesKeywords(postText)) continue;
            if (NS.state.onlyArabic && !NS.isArabicText(postText)) continue;
            seen.add(k);
            r.push({ btn, post: c, key: k });
        }
        return r;
    };
    NS.collectAllRepostButtons = function () {
        const r = [], seen = new Set();
        for (const btn of document.querySelectorAll('button, [role="button"]')) {
            if (NS.isInsidePanel(btn) || !NS.isRepostButton(btn)) continue;
            let c = btn;
            for (let i = 0; i < 10 && c; i++) {
                if (c.querySelector('a[href*="/post/"]')) break;
                c = c.parentElement;
            }
            if (!c) continue;
            const k = NS.getPostKey(c);
            if (!k || seen.has(k)) continue;
            const postText = (c.innerText || '').slice(0, 800);
            if (NS.containsBlacklisted(postText)) continue;
            if (NS.state.onlyArabic && !NS.isArabicText(postText)) continue;
            seen.add(k);
            r.push({ btn, post: c, key: k });
        }
        return r;
    };

    NS.detectNotificationType = function (text) {
        const t = (text || '').toLowerCase();
        if (t.includes('followed you') || t.includes('تابعك') || t.includes('followed back')) return 'follow';
        if (t.includes('replied to you') || t.includes('رد على') || t.includes('أجاب على')) return 'reply';
        if (t.includes('liked your') || t.includes('أعجب بمنشورك')) return 'like';
        if (t.includes('mentioned you') || t.includes('أشار إليك')) return 'mention';
        if (t.includes('reposted') || t.includes('أعاد نشر')) return 'repost';
        return null;
    };
})();