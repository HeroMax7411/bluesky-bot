/* ═══════════════════════════════════════════════════════════
   src/dom.js — أدوات DOM وكشف الأزرار (v1.0.6)
   يحتوي على: تحليل النصوص، كشف الأزرار، جمع العناصر
   ✅ إصلاح اكتشاف أزرار "متابَع" بالعربية
   ═══════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    const NS = window.__BSKY;
    if (!NS) {
        console.error('❌ dom.js: يجب تحميل core.js أولاً');
        return;
    }

    /* ════════════════ تحليل النصوص ════════════════ */
    NS.isArabicText = function (text) {
        if (!text) return false;
        const arabic = (text.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g) || []).length;
        const total = text.replace(/[^a-zA-Z\u0600-\u06FF]/g, '').length;
        if (total === 0) return false;
        return (arabic / total) > 0.3;
    };

    NS.matchesLanguage = function (text) {
        if (!NS.state.languageFilter || !NS.state.languageFilter.trim()) return true;
        const l = NS.state.languageFilter.trim().toLowerCase();
        if (l === 'ar' || l === 'arabic' || l === 'عربي') {
            return NS.isArabicText(text);
        }
        return true;
    };

    /* ════════════════ قوائم الفلترة ════════════════ */
    NS.parseList = function (s) {
        return String(s || '')
            .split(/[\n,،]/)
            .map(w => w.trim().toLowerCase())
            .filter(Boolean);
    };

    NS.getBlacklist = function () {
        return NS.parseList(NS.state.blacklistWords);
    };

    NS.getKeywords = function () {
        return NS.parseList(NS.state.keywordFilter);
    };

    NS.containsBlacklisted = function (text) {
        const list = NS.getBlacklist();
        if (!list.length) return false;
        const low = String(text || '').toLowerCase();
        return list.some(w => low.includes(w));
    };

    NS.matchesKeywords = function (text) {
        if (!NS.state.useKeywordFilter) return true;
        const list = NS.getKeywords();
        if (!list.length) return true;
        const low = String(text || '').toLowerCase();
        return list.some(w => low.includes(w));
    };

    /* ════════════════ كشف الصور ════════════════ */
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

    /* ════════════════ تحليل المشاعر ════════════════ */
    const POSITIVE_WORDS = [
        'رائع', 'جميل', 'ممتاز', 'شكراً', 'شكرا', 'أحب', 'حب', 'سعيد',
        'فرح', 'مبدع', 'إبداع', 'تحفة', 'Nice', 'great', 'love',
        'amazing', 'awesome', 'happy', 'good'
    ];
    const NEGATIVE_WORDS = [
        'سيء', 'حزين', 'غاضب', 'كره', 'مؤلم', 'فاشل', 'صعب', 'سيئة',
        'terrible', 'sad', 'angry', 'hate', 'awful', 'bad'
    ];

    NS.analyzeSentiment = function (text) {
        if (!text) return 'neutral';
        const low = text.toLowerCase();
        let pos = 0, neg = 0;
        POSITIVE_WORDS.forEach(w => {
            if (low.includes(w.toLowerCase())) pos++;
        });
        NEGATIVE_WORDS.forEach(w => {
            if (low.includes(w.toLowerCase())) neg++;
        });
        if (pos > neg) return 'positive';
        if (neg > pos) return 'negative';
        return 'neutral';
    };

    /* ════════════════ متغيرات القوالب ════════════════ */
    NS.applyTemplateVars = function (template, ctx) {
        if (!NS.state.useTemplateVars) return template;
        return template
            .replace(/\{name\}/g, ctx.name || 'صديقي')
            .replace(/\{handle\}/g, ctx.handle || '')
            .replace(/\{post\}/g, (ctx.post || '').slice(0, 60))
            .replace(/\{time\}/g, new Date().toLocaleTimeString('ar-EG'))
            .replace(/\{date\}/g, NS.todayStr());
    };

    /* ════════════════ الهاشتاجات التلقائية ════════════════ */
    NS.generateHashtags = function (text) {
        if (!NS.state.autoHashtags) return '';
        const map = {};
        String(NS.state.hashtagMap || '').split('\n').forEach(line => {
            const parts = line.split(':');
            const kw = parts[0];
            const tags = parts[1];
            if (kw && tags) {
                map[kw.trim()] = tags.split(',').map(t => t.trim()).filter(Boolean);
            }
        });
        const low = String(text || '').toLowerCase();
        const found = new Set();
        for (const [kw, tags] of Object.entries(map)) {
            if (low.includes(kw.toLowerCase())) {
                tags.forEach(t => found.add(t));
            }
        }
        return Array.from(found).slice(0, 5).map(t => '#' + t).join(' ');
    };

    /* ════════════════ الأحداث العالمية ════════════════ */
    NS.getWorldEvent = function () {
        if (!NS.state.worldEvents) return '';
        const now = new Date();
        const m = now.getMonth() + 1;
        const d = now.getDate();
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
    };

    /* ════════════════ الطقس ════════════════ */
    NS.fetchWeather = async function () {
        if (!NS.state.weatherPosts) return null;
        if (NS.cachedWeather && Date.now() - NS.state.lastWeatherCheck < 3600000) {
            return NS.cachedWeather;
        }
        try {
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${NS.state.weatherLat}&longitude=${NS.state.weatherLon}&current=temperature_2m,weather_code`;
            const res = await fetch(url);
            const data = await res.json();
            const temp = data.current && data.current.temperature_2m;
            const code = data.current && data.current.weather_code;
            const desc = NS.weatherCodeToArabic(code);
            NS.cachedWeather = { temp, code, desc };
            NS.state.lastWeatherCheck = Date.now();
            NS.forceSaveSettings();
            return NS.cachedWeather;
        } catch (e) {
            return null;
        }
    };

    NS.weatherCodeToArabic = function (code) {
        const m = {
            0: 'صافٍ ☀️', 1: 'صافٍ جزئياً 🌤️', 2: 'غائم جزئياً ⛅', 3: 'غائم ☁️',
            45: 'ضباب 🌫️', 48: 'ضباب متجمد 🌫️', 51: 'رذاذ خفيف 🌦️',
            61: 'مطر 🌧️', 63: 'مطر متوسط 🌧️', 65: 'مطر غزير ⛈️',
            71: 'ثلج 🌨️', 80: 'زخات 🌦️', 95: 'عاصفة رعدية ⛈️'
        };
        return m[code] || 'معتدل 🌡️';
    };

    /* ════════════════ كلمة المرور ════════════════ */
    NS.getDecryptedPass = function () {
        const p = NS.state.blueskyAppPassword || '';
        return p.startsWith('ENC:') ? NS.decrypt(p) : p;
    };

    NS.setEncryptedPass = function (plain) {
        NS.state.blueskyAppPassword = NS.state.encryptPasswords ? NS.encrypt(plain) : plain;
        NS.forceSaveSettings();
    };

    /* ════════════════ مفاتيح المنشورات والبروفايل ════════════════ */
    NS.getPostKey = function (el) {
        const l = el && el.querySelector ? el.querySelector('a[href*="/post/"]') : null;
        return l ? l.getAttribute('href') : ((el && el.innerText) || '').slice(0, 80);
    };

    NS.getHandleFromContainer = function (c) {
        const l = c && c.querySelector ? c.querySelector('a[href^="/profile/"]') : null;
        if (!l) return null;
        return l.getAttribute('href').replace('/profile/', '').split('/')[0];
    };

    /* ════════════════ فحص اللوحة ════════════════ */
    NS.isInsidePanel = function (el) {
        if (!el) return false;
        let cur = el;
        while (cur) {
            if (cur.id === NS.PANEL_ID || cur.id === NS.PANEL_ID + '-mini') return true;
            cur = cur.parentElement;
        }
        return false;
    };

    /* ════════════════ الضغط على الأزرار ════════════════ */
    NS.fire = function (btn) {
        if (!btn) return;
        try { btn.click(); } catch (e) {}
        try {
            const r = btn.getBoundingClientRect();
            const opts = {
                bubbles: true, cancelable: true, view: window,
                clientX: r.left + r.width / 2,
                clientY: r.top + r.height / 2,
                button: 0, buttons: 1, pointerId: 1
            };
            btn.dispatchEvent(new PointerEvent('pointerdown', opts));
            btn.dispatchEvent(new MouseEvent('mousedown', opts));
            btn.dispatchEvent(new PointerEvent('pointerup', opts));
            btn.dispatchEvent(new MouseEvent('mouseup', opts));
        } catch (e) {}
    };

    /* ════════════════ تعيين قيمة إدخال (متوافق مع React) ════════════════ */
    NS.setInputValue = function (el, value) {
        el.focus();
        if (el.getAttribute('contenteditable') === 'true') {
            el.textContent = '';
            el.appendChild(document.createTextNode(value));
            try {
                el.dispatchEvent(new InputEvent('input', {
                    bubbles: true,
                    cancelable: true,
                    inputType: 'insertText',
                    data: value
                }));
            } catch (e) {
                el.dispatchEvent(new Event('input', { bubbles: true }));
            }
            el.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
            const proto = el.tagName === 'TEXTAREA'
                ? window.HTMLTextAreaElement.prototype
                : window.HTMLInputElement.prototype;
            const setter = Object.getOwnPropertyDescriptor(proto, 'value');
            if (setter && setter.set) {
                setter.set.call(el, value);
            } else {
                el.value = value;
            }
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        }
    };

    /* ════════════════ كشف الأزرار ════════════════ */
    NS.isFollowButton = function (btn) {
        const tid = (btn.getAttribute('data-testid') || '').toLowerCase();
        if (tid === 'followbtn' || tid === 'follow-button') return true;
        if (tid === 'unfollowbtn' || tid === 'following-button') return false;

        const l = (btn.getAttribute('aria-label') || '').toLowerCase().trim();
        const t = (btn.innerText || '').trim().toLowerCase();
        const tClean = t.replace(/[^\u0600-\u06FFa-z]/gi, '').trim();

        const matchesFollow = 
            t === 'follow' ||
            t === 'follow back' ||
            t.startsWith('follow ') ||
            tClean === 'follow' ||
            tClean === 'followback' ||
            t === 'متابعة' ||
            t === 'متابعة بالمقابل' ||
            tClean === 'متابعة' ||
            tClean === 'متابعةبالمقابل' ||
            t.includes('follow back') ||
            l === 'follow' ||
            l.startsWith('follow ') ||
            l === 'متابعة' ||
            l.includes('follow back');

        const matchesFollowing = 
            t.includes('following') ||
            t.includes('unfollow') ||
            t === 'متابَع' ||
            t.includes('إلغاء المتابعة') ||
            tClean === 'following' ||
            tClean === 'متابع' ||
            l.includes('following') ||
            l.includes('unfollow');

        return matchesFollow && !matchesFollowing;
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

    /* ✅ v1.0.6: دالة شاملة لاكتشاف أزرار "متابَع" */
    NS.isAlreadyFollowing = function (btn) {
        // 1) data-testid (الأدق)
        const tid = (btn.getAttribute('data-testid') || '').toLowerCase();
        if (tid === 'unfollowbtn' || tid === 'following-button') return true;
        if (tid === 'followbtn' || tid === 'follow-button') return false;

        // 2) aria-label
        const l = (btn.getAttribute('aria-label') || '').toLowerCase();

        // 3) النص المرئي
        const t = (btn.innerText || '').trim().toLowerCase();

        // 4) النص بدون رموز (لإزالة ✓ أو أيقونات)
        const tClean = t.replace(/[^\u0600-\u06FFa-z]/gi, '').trim();

        // أزرار "متابَع" / "Following" / "Unfollow"
        const isFollowing = 
            l.includes('following') ||
            l.includes('unfollow') ||
            l.includes('إلغاء المتابعة') ||
            t.includes('following') ||
            t.includes('unfollow') ||
            t.includes('إلغاء المتابعة') ||
            tClean === 'following' ||
            tClean === 'متابع' ||
            tClean === 'unfollow' ||
            t.includes('متابَع') ||
            /^متابع/.test(tClean);

        // أزرار "متابعة" (يجب ألا نطابقها)
        const isFollowNotFollowing =
            tClean === 'follow' ||
            tClean === 'متابعة' ||
            tClean === 'followback' ||
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

    /* ════════════════ جمع كل أزرار المتابعة ════════════════ */
    NS.collectAllFollowButtons = function () {
        const results = [];
        const seen = new Set();
        const allBtns = document.querySelectorAll('button, [role="button"]');

        for (const btn of allBtns) {
            if (NS.isInsidePanel(btn)) continue;
            if (!NS.isFollowButton(btn)) continue;

            let container = btn;
            for (let i = 0; i < 12 && container; i++) {
                if (container.querySelector('a[href^="/profile/"]')) break;
                container = container.parentElement;
            }
            if (!container) continue;

            const handle = NS.getHandleFromContainer(container);
            if (!handle || seen.has(handle)) continue;
            if (handle === NS.state.myHandle) continue;
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

    /* ════════════════ جمع كل أزرار الإعجاب ════════════════ */
    NS.collectAllLikeButtons = function () {
        const results = [];
        const seen = new Set();
        const allBtns = document.querySelectorAll('button, [role="button"]');

        for (const btn of allBtns) {
            if (NS.isInsidePanel(btn)) continue;
            if (!NS.isLikeButton(btn)) continue;
            if (NS.isAlreadyLiked(btn)) continue;

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
            if (!NS.matchesKeywords(postText)) continue;
            if (NS.state.onlyArabic && !NS.isArabicText(postText)) continue;
            if (NS.state.languageFilter && NS.state.languageFilter !== 'ar' &&
                !NS.matchesLanguage(postText)) continue;

            seen.add(key);
            results.push({ btn, post: container, key });
        }
        return results;
    };

    /* ════════════════ جمع كل أزرار إعادة النشر ════════════════ */
    NS.collectAllRepostButtons = function () {
        const results = [];
        const seen = new Set();
        const allBtns = document.querySelectorAll('button, [role="button"]');

        for (const btn of allBtns) {
            if (NS.isInsidePanel(btn)) continue;
            if (!NS.isRepostButton(btn)) continue;

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

    /* ════════════════ كشف نوع الإشعار ════════════════ */
    NS.detectNotificationType = function (text) {
        const t = (text || '').toLowerCase();
        if (t.includes('followed you') || t.includes('تابعك') ||
            t.includes('بدأ متابعتك') || t.includes('followed back')) {
            return 'follow';
        }
        if (t.includes('replied to you') || t.includes('رد على') ||
            t.includes('أجاب على')) {
            return 'reply';
        }
        if (t.includes('liked your') || t.includes('أعجب بمنشورك')) {
            return 'like';
        }
        if (t.includes('mentioned you') || t.includes('أشار إليك')) {
            return 'mention';
        }
        if (t.includes('reposted') || t.includes('أعاد نشر')) {
            return 'repost';
        }
        return null;
    };

    console.log('📦 dom.js محمّل بنجاح - v1.0.6 (إصلاح الأزرار)');

})();
