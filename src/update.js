(function () {
    'use strict';
    const NS = window.__BSKY;
    if (!NS) return;

    const UPDATE_URL = `https://raw.githubusercontent.com/${NS.GITHUB_REPO}/main/bsky-bot.user.js`;
    const LAST_CHECK_KEY = 'bsky_bot_last_update_check';
    const AUTO_CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24 ساعة

    /* ════════════════ مقارنة الإصدارات ════════════════ */
    function compareVersions(a, b) {
        const pa = String(a).split('.').map(Number);
        const pb = String(b).split('.').map(Number);
        for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
            const na = pa[i] || 0, nb = pb[i] || 0;
            if (na > nb) return 1;
            if (na < nb) return -1;
        }
        return 0;
    }

    /* ════════════════ قراءة الإصدار من ملف GitHub ════════════════ */
    NS.fetchLatestVersion = async function () {
        try {
            const res = await fetch(UPDATE_URL + '?t=' + Date.now(), {
                cache: 'no-cache',
                headers: { 'Cache-Control': 'no-cache' }
            });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const text = await res.text();
            const match = text.match(/@version\s+([\d.]+)/);
            if (!match) throw new Error('لا يمكن قراءة الإصدار');
            return { ok: true, version: match[1] };
        } catch (e) {
            return { ok: false, error: e.message };
        }
    };

    /* ════════════════ التحقق من التحديث ════════════════ */
    NS.checkForUpdate = async function (silent = false) {
        if (!silent) NS.setFooter('🔄 جاري التحقق من التحديثات...');
        
        const result = await NS.fetchLatestVersion();
        
        if (!result.ok) {
            if (!silent) {
                NS.setFooter('❌ فشل التحقق');
                alert(`❌ فشل التحقق من التحديثات\n\nالسبب: ${result.error}\n\nتحقق من اتصالك بالإنترنت.`);
            }
            return false;
        }
        
        const latest = result.version;
        const current = NS.version;
        const cmp = compareVersions(latest, current);
        
        // حفظ وقت آخر فحص
        localStorage.setItem(LAST_CHECK_KEY, Date.now().toString());
        
        if (cmp > 0) {
            // يوجد تحديث
            NS.pushLog('update', `🆕 يتوفر تحديث: v${latest} (الحالي: v${current})`);
            NS.setFooter(`🆕 تحديث متوفر: v${latest}`);
            
            const shouldUpdate = confirm(
                `🆕 تحديث جديد متوفر!\n\n` +
                `📦 الإصدار الحالي: v${current}\n` +
                `✨ الإصدار الجديد: v${latest}\n\n` +
                `هل تريد التحديث الآن؟\n\n` +
                `⚠️ سيتم إعادة تحميل الصفحة بعد التحديث.`
            );
            
            if (shouldUpdate) {
                NS.installUpdate();
            }
            return true;
        } else if (cmp === 0) {
            // أحدث نسخة
            if (!silent) {
                NS.setFooter(`✅ أحدث نسخة (v${current})`);
                alert(`✅ أنت تستخدم أحدث نسخة!\n\n📦 الإصدار: v${current}\n📅 التاريخ: ${new Date().toLocaleString('ar-EG')}`);
            }
            return false;
        } else {
            // نسخة تجريبية أحدث من الموقع
            if (!silent) {
                alert(`ℹ️ إصدارك (v${current}) أحدث من المتوفر (v${latest})\n\nربما أنت تستخدم نسخة تجريبية.`);
            }
            return false;
        }
    };

    /* ════════════════ تثبيت التحديث ════════════════ */
    NS.installUpdate = function () {
        NS.pushLog('update', '⏳ جاري فتح صفحة التحديث...');
        NS.notify('تحديث', 'سيتم فتح صفحة التثبيت');
        
        // فتح رابط التثبيت مع تحديث الكاش
        const installURL = UPDATE_URL + '?t=' + Date.now();
        const win = window.open(installURL, '_blank');
        
        if (!win) {
            // إذا كان النافذة محجوبة، حاول عبر location
            setTimeout(() => {
                if (confirm('لم يتم فتح الصفحة. هل تريد فتحها يدوياً؟')) {
                    location.href = installURL;
                }
            }, 300);
        }
        
        NS.pushLog('update', '✅ فُتحت صفحة التحديث - وافق على Install في Tampermonkey');
    };

    /* ════════════════ فحص تلقائي كل 24 ساعة ════════════════ */
    NS.autoCheckUpdate = function () {
        const lastCheck = parseInt(localStorage.getItem(LAST_CHECK_KEY) || '0', 10);
        const elapsed = Date.now() - lastCheck;
        
        if (elapsed >= AUTO_CHECK_INTERVAL) {
            // مرّت 24 ساعة - افحص
            setTimeout(() => {
                NS.checkForUpdate(true); // silent
            }, 30000); // بعد 30 ثانية من التحميل
        } else {
            const hoursLeft = Math.floor((AUTO_CHECK_INTERVAL - elapsed) / (60 * 60 * 1000));
            console.log(`⏰ الفحص التلقائي القادم بعد: ${hoursLeft} ساعة`);
        }
        
        // جدول فحص كل 6 ساعات (يتحقق من الوقت المنقضي)
        setInterval(() => {
            const last = parseInt(localStorage.getItem(LAST_CHECK_KEY) || '0', 10);
            if (Date.now() - last >= AUTO_CHECK_INTERVAL) {
                NS.checkForUpdate(true);
            }
        }, 6 * 60 * 60 * 1000); // كل 6 ساعات
    };

    NS.compareVersions = compareVersions;
})();
