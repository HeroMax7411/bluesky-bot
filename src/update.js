/* ═══════════════════════════════════════════════════════════
   src/update.js — نظام التحديثات التلقائية (v1.0.6)
   يحتوي على: فحص الإصدارات، التحديث التلقائي كل 24 ساعة
   ✅ إصلاح CORS باستخدام GM_xmlhttpRequest
   ═══════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    const NS = window.__BSKY;
    if (!NS) {
        console.error('❌ update.js: يجب تحميل core.js أولاً');
        return;
    }

    /* ════════════════ الثوابت ════════════════ */
    const UPDATE_URL = `https://raw.githubusercontent.com/${NS.GITHUB_REPO}/main/bsky-bot.user.js`;
    const LAST_CHECK_KEY = 'bsky_bot_last_update_check';
    const AUTO_CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24 ساعة

    /* ════════════════ مقارنة الإصدارات ════════════════ */
    NS.compareVersions = function (a, b) {
        const pa = String(a).split('.').map(Number);
        const pb = String(b).split('.').map(Number);
        const len = Math.max(pa.length, pb.length);
        for (let i = 0; i < len; i++) {
            const na = pa[i] || 0;
            const nb = pb[i] || 0;
            if (na > nb) return 1;
            if (na < nb) return -1;
        }
        return 0;
    };

    /* ════════════════ قراءة الإصدار من GitHub (مع CORS fix) ════════════════ */
    NS.fetchLatestVersion = function () {
        return new Promise((resolve) => {
            const url = UPDATE_URL + '?t=' + Date.now();

            // ✅ الحل الأساسي: GM_xmlhttpRequest (يتجاوز CORS)
            if (typeof GM_xmlhttpRequest === 'function') {
                try {
                    GM_xmlhttpRequest({
                        method: 'GET',
                        url: url,
                        headers: {
                            'Cache-Control': 'no-cache, no-store, must-revalidate',
                            'Pragma': 'no-cache'
                        },
                        timeout: 15000,
                        onload: function (res) {
                            try {
                                if (res.status !== 200) {
                                    resolve({ ok: false, error: 'HTTP ' + res.status });
                                    return;
                                }
                                const text = res.responseText || '';
                                const match = text.match(/@version\s+([\d.]+)/);
                                if (!match) {
                                    resolve({ ok: false, error: 'لا يمكن قراءة الإصدار من الملف' });
                                    return;
                                }
                                resolve({ ok: true, version: match[1] });
                            } catch (e) {
                                resolve({ ok: false, error: e.message });
                            }
                        },
                        onerror: function () {
                            resolve({ ok: false, error: 'فشل الاتصال بـ GitHub' });
                        },
                        ontimeout: function () {
                            resolve({ ok: false, error: 'انتهت مهلة الاتصال (15 ثانية)' });
                        },
                        onabort: function () {
                            resolve({ ok: false, error: 'تم إلغاء الطلب' });
                        }
                    });
                } catch (e) {
                    resolve({ ok: false, error: 'خطأ في GM_xmlhttpRequest: ' + e.message });
                }
            } else {
                // احتياطي: fetch (قد يفشل بسبب CORS)
                console.warn('⚠️ GM_xmlhttpRequest غير متاح - استخدام fetch');
                fetch(url, { cache: 'no-cache' })
                    .then(res => {
                        if (!res.ok) throw new Error('HTTP ' + res.status);
                        return res.text();
                    })
                    .then(text => {
                        const match = text.match(/@version\s+([\d.]+)/);
                        if (!match) throw new Error('لا يمكن قراءة الإصدار');
                        resolve({ ok: true, version: match[1] });
                    })
                    .catch(e => resolve({ ok: false, error: e.message }));
            }
        });
    };

    /* ════════════════ التحقق من التحديث ════════════════ */
    NS.checkForUpdate = async function (silent) {
        silent = silent === true;

        if (!silent) {
            NS.setFooter('🔄 جاري التحقق من التحديثات...');
        }

        const result = await NS.fetchLatestVersion();

        // فشل الاتصال
        if (!result.ok) {
            if (!silent) {
                NS.setFooter('❌ فشل التحقق');

                let helpMsg = '';
                const errLower = String(result.error).toLowerCase();

                if (errLower.includes('cors') || errLower.includes('fetch') || errLower.includes('failed to fetch')) {
                    helpMsg = '\n\n💡 الحل:\n' +
                              '• السكربت يحتاج تحديثاً لاستخدام GM_xmlhttpRequest\n' +
                              '• تحقق من وجود @grant GM_xmlhttpRequest في رأس السكربت\n' +
                              '• تحقق من @connect raw.githubusercontent.com';
                } else if (errLower.includes('timeout') || errLower.includes('انتهت')) {
                    helpMsg = '\n\n💡 تحقق من اتصالك بالإنترنت';
                } else if (errLower.includes('http 404')) {
                    helpMsg = '\n\n💡 الملف غير موجود على GitHub\n' +
                              'تحقق من رفع bsky-bot.user.js في الفرع main';
                }

                alert(
                    `❌ فشل التحقق من التحديثات\n\n` +
                    `السبب: ${result.error}${helpMsg}`
                );
            }
            return false;
        }

        const latest = result.version;
        const current = NS.version;
        const cmp = NS.compareVersions(latest, current);

        // حفظ وقت آخر فحص
        try {
            localStorage.setItem(LAST_CHECK_KEY, Date.now().toString());
        } catch (e) {}

        // ✅ يوجد تحديث
        if (cmp > 0) {
            NS.pushLog('update', `🆕 تحديث متوفر: v${latest} (الحالي: v${current})`);
            NS.setFooter(`🆕 تحديث متوفر: v${latest}`);

            NS.notify('🆕 تحديث متوفر', `v${latest} متاح الآن`);

            const shouldUpdate = confirm(
                `🆕 تحديث جديد متوفر!\n\n` +
                `📦 الإصدار الحالي: v${current}\n` +
                `✨ الإصدار الجديد: v${latest}\n\n` +
                `هل تريد التحديث الآن؟\n\n` +
                `⚠️ سيتم فتح صفحة التثبيت.\n` +
                `وافق على "Install" أو "Update" في Tampermonkey.`
            );

            if (shouldUpdate) {
                NS.installUpdate();
            }
            return true;
        }

        // ✅ أحدث نسخة
        if (cmp === 0) {
            if (!silent) {
                NS.setFooter(`✅ أحدث نسخة (v${current})`);
                alert(
                    `✅ أنت تستخدم أحدث نسخة!\n\n` +
                    `📦 الإصدار: v${current}\n` +
                    `📅 التاريخ: ${new Date().toLocaleString('ar-EG')}`
                );
            }
            return false;
        }

        // ℹ️ نسخة تجريبية
        if (!silent) {
            NS.setFooter(`ℹ️ نسخة تجريبية (v${current})`);
            alert(
                `ℹ️ إصدارك أحدث من المتوفر!\n\n` +
                `📦 إصدارك: v${current}\n` +
                `🌐 المتوفر: v${latest}\n\n` +
                `ربما أنت تستخدم نسخة تجريبية.`
            );
        }
        return false;
    };

    /* ════════════════ تثبيت التحديث ════════════════ */
    NS.installUpdate = function () {
        NS.pushLog('update', '⏳ جاري فتح صفحة التثبيت...');
        NS.notify('تحديث', 'سيتم فتح صفحة التثبيت');

        // إضافة timestamp لتجاوز cache
        const installURL = UPDATE_URL + '?t=' + Date.now();

        // فتح في نافذة جديدة
        const win = window.open(installURL, '_blank');

        // إذا حجب المتصفح النافذة
        if (!win || win.closed || typeof win.closed === 'undefined') {
            setTimeout(() => {
                if (confirm('لم يتم فتح النافذة تلقائياً.\n\nهل تريد فتحها الآن؟')) {
                    location.href = installURL;
                }
            }, 300);
        } else {
            NS.pushLog('update', '✅ فُتحت صفحة التحديث - وافق على Install في Tampermonkey');
        }
    };

    /* ════════════════ الفحص التلقائي كل 24 ساعة ════════════════ */
    NS.autoCheckUpdate = function () {
        // إذا كان الفحص التلقائي معطّلاً
        if (NS.state.autoUpdateCheck === false) {
            console.log('⏸️ الفحص التلقائي معطّل');
            return;
        }

        const lastCheck = parseInt(localStorage.getItem(LAST_CHECK_KEY) || '0', 10);
        const elapsed = Date.now() - lastCheck;

        if (elapsed >= AUTO_CHECK_INTERVAL) {
            // مرّت 24 ساعة - افحص بعد 30 ثانية
            console.log('⏰ حان وقت الفحص التلقائي');
            setTimeout(() => {
                NS.checkForUpdate(true);
            }, 30000);
        } else {
            const hoursLeft = Math.floor((AUTO_CHECK_INTERVAL - elapsed) / (60 * 60 * 1000));
            const minsLeft = Math.floor(((AUTO_CHECK_INTERVAL - elapsed) % (60 * 60 * 1000)) / 60000);
            console.log(`⏰ الفحص التلقائي القادم بعد: ${hoursLeft}س ${minsLeft}د`);
        }

        // جدولة فحص دوري كل 6 ساعات
        setInterval(() => {
            if (NS.state.autoUpdateCheck === false) return;
            const last = parseInt(localStorage.getItem(LAST_CHECK_KEY) || '0', 10);
            if (Date.now() - last >= AUTO_CHECK_INTERVAL) {
                NS.checkForUpdate(true);
            }
        }, 6 * 60 * 60 * 1000);
    };

    /* ════════════════ فحص فوري للمستخدمين الجدد ════════════════ */
    NS.checkUpdateOnInstall = function () {
        const lastCheck = parseInt(localStorage.getItem(LAST_CHECK_KEY) || '0', 10);
        if (lastCheck === 0) {
            console.log('🆕 أول استخدام - سيتم الفحص بعد دقيقة');
            setTimeout(() => {
                NS.checkForUpdate(true);
            }, 60000);
        }
    };

    console.log('📦 update.js محمّل بنجاح - v1.0.6 (CORS fix)');

})();
