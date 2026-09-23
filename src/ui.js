/* ═══════════════════════════════════════════════════════════
   src/ui.js — واجهة المستخدم والحلقة الرئيسية (مكتمل)
   يحتوي على: اللوحة، الحلقة، دوال العرض، التصدير
   ═══════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    const NS = window.__BSKY;
    if (!NS) {
        console.error('❌ ui.js: يجب تحميل core.js و dom.js و actions.js أولاً');
        return;
    }

    /* ════════════════ كشف اسم المستخدم ════════════════ */
    NS.autoDetectMyHandle = function () {
        if (NS.state.myHandle) return;
        const link = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]') ||
                     document.querySelector('a[href^="/profile/"][aria-label*="rofile"]') ||
                     document.querySelector('a[href^="/profile/"]');
        if (link) {
            const m = (link.getAttribute('href') || '').match(/\/profile\/([^/]+)/);
            if (m && m[1]) {
                NS.state.myHandle = m[1];
                NS.forceSaveSettings();
                NS.notify('تم الاكتشاف', m[1]);
            }
        }
    };

    /* ════════════════ التمرير ════════════════ */
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

    /* ════════════════ تصفير الذاكرة الدوري ════════════════ */
    NS.maybeResetMemory = function () {
        const e = (Date.now() - NS.lastMemoryReset) / 60000;
        if (e >= NS.state.resetMemoryEveryMin) {
            ['processedLikes','processedFollows','processedFollowBacks','processedCommentLikes',
             'processedNotifReplies','processedMessages','processedReposts','processedPosts']
                .forEach(k => NS.state[k] = (NS.state[k] || []).slice(-200));
            NS.lastMemoryReset = Date.now();
            NS.saveSettings();
        }
    };

    /* ════════════════ الحلقة الرئيسية ════════════════ */
    NS.botLoop = async function () {
        const myGen = ++NS.loopGeneration;
        NS.activeLoopId = myGen;
        NS.cyclesWithoutAction = 0;

        if (!NS.state.myHandle && NS.handleDetectionAttempts < 5) {
            NS.autoDetectMyHandle();
            NS.handleDetectionAttempts++;
        }

        console.log(`▶️ جيل ${myGen}`);

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

                    if (NS.state.autoReplyMessages && onM)
                        actionCount += await NS.doReplyToMessages(myGen);
                    if (myGen !== NS.loopGeneration) break;

                    if (NS.state.autoFollowBack && onN)
                        actionCount += await NS.doFollowBack(myGen);
                    if (myGen !== NS.loopGeneration) break;

                    if (NS.state.autoReplyNotifications && onN)
                        actionCount += await NS.doReplyToNotifications(myGen);
                    if (myGen !== NS.loopGeneration) break;

                    if (NS.state.autoLikeCommenters && (onN || /\/profile\//.test(location.pathname)))
                        actionCount += await NS.doLikeCommenters(myGen);
                    if (myGen !== NS.loopGeneration) break;

                    if (NS.state.autoLike)
                        actionCount += await NS.doAutoLike(myGen);
                    if (myGen !== NS.loopGeneration) break;

                    if (NS.state.autoRepost)
                        actionCount += await NS.doAutoRepost(myGen);
                    if (myGen !== NS.loopGeneration) break;

                    if (NS.state.autoFollow && !(onN && NS.state.autoFollowBack))
                        actionCount += await NS.doAutoFollow(myGen);
                    if (myGen !== NS.loopGeneration) break;

                    if (NS.state.autoUnfollow)
                        actionCount += await NS.doCleanupNonFollowers(myGen);
                    if (myGen !== NS.loopGeneration) break;

                    if (NS.state.followEngagers)
                        actionCount += await NS.doFollowEngagers(myGen);
                    if (myGen !== NS.loopGeneration) break;

                    if (NS.state.autoReply && !onN && !onM)
                        actionCount += await NS.doAutoReply(myGen);
                    if (myGen !== NS.loopGeneration) break;

                    NS.maybeResetMemory();

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
                                NS.pushLog('break', `☕ استراحة ${bm} د`);
                                NS.setFooter(`☕ استراحة ${bm} دقيقة...`);
                                NS.state.actionCounter = 0;
                                NS.forceSaveSettings();
                                if (!await NS.sleepGen(bm * 60000 + NS.rand(0, 30000), myGen)) break;
                            } else {
                                NS.forceSaveSettings();
                            }
                        }
                    }
                }
            } catch (err) {
                console.error('🔴 خطأ في الحلقة:', err);
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

    /* ════════════════ دوال التصدير ════════════════ */
    NS.exportToSheets = function () {
        const rows = [['التاريخ','إعجابات','متابعات','إلغاء','ردود','رد متابعة','إعجاب معلق','رد إشعار','رد رسالة','منشورات','إعادة نشر']];
        (NS.stats.history || []).forEach(h => rows.push([
            h.d, h.likes || 0, h.follows || 0, h.unfollows || 0,
            h.replies || 0, h.followBacks || 0, h.commentLikes || 0,
            h.notifReplies || 0, h.messageReplies || 0, h.posts || 0, h.reposts || 0
        ]));
        const tsv = rows.map(r => r.join('\t')).join('\n');
        if (typeof GM_setClipboard === 'function') GM_setClipboard(tsv);
        else navigator.clipboard.writeText(tsv);
        alert('✅ تم نسخ البيانات بصيغة TSV.\nالصقها في Google Sheets (Ctrl+V)');
    };

    NS.exportSettings = function () {
        const data = {
            version: NS.version,
            exported: new Date().toISOString(),
            state: { ...NS.state },
            stats: NS.stats,
            profiles: NS.profiles
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `bsky-bot-${NS.todayStr()}.json`;
        a.click();
        NS.notify('تصدير', 'تم');
    };

    NS.importSettings = function (file) {
        const r = new FileReader();
        r.onload = (e) => {
            try {
                const d = JSON.parse(e.target.result);
                if (d.state) Object.assign(NS.state, d.state);
                if (d.stats) { Object.assign(NS.stats, d.stats); NS.saveStats(); }
                if (d.profiles) { NS.profiles = d.profiles; NS.saveProfiles(); }
                NS.forceSaveSettings();
                alert('✅ تم الاستيراد. جاري إعادة التحميل...');
                location.reload();
            } catch (err) {
                alert('❌ ملف غير صالح: ' + err.message);
            }
        };
        r.readAsText(file);
    };

    /* ════════════════ إنشاء اللوحة ════════════════ */
    NS.createDashboard = function () {
        if (document.getElementById(NS.PANEL_ID)) return;

        const s = NS.state;

        // 1. الزر المصغّر (B)
        const mini = document.createElement('div');
        mini.id = NS.PANEL_ID + '-mini';
        mini.innerHTML = 'B';
        Object.assign(mini.style, {
            position: 'fixed', bottom: '20px', right: '20px', zIndex: '99998',
            width: '50px', height: '50px', borderRadius: '50%',
            background: 'linear-gradient(135deg, #0085ff, #0052cc)',
            color: '#fff', fontSize: '22px', fontWeight: 'bold',
            display: s.collapsed ? 'flex' : 'none', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', boxShadow: '0 4px 15px rgba(0,133,255,0.4)', userSelect: 'none'
        });

        // 2. اللوحة الرئيسية
        const panel = document.createElement('div');
        panel.id = NS.PANEL_ID;
        Object.assign(panel.style, {
            position: 'fixed', bottom: '20px', right: '20px', zIndex: '99999',
            width: `${s.panelSize.w}px`, height: `${s.panelSize.h}px`,
            background: '#121824', color: '#f1f5f9', borderRadius: '16px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)', display: s.collapsed ? 'none' : 'flex',
            flexDirection: 'column', overflow: 'hidden', fontFamily: 'system-ui, sans-serif',
            border: '1px solid #1e293b', direction: 'rtl'
        });

        panel.innerHTML = `
            <div style="padding:12px 16px;background:#0f172a;border-bottom:1px solid #1e293b;display:flex;justify-between;align-items:center;">
                <span style="font-weight:bold;color:#38bdf8;">🤖 Bluesky Bot v${NS.version}</span>
                <div>
                    <button id="b11-toggle-pause" style="background:#0284c7;color:#fff;border:none;padding:4px 10px;border-radius:6px;cursor:pointer;font-size:12px;">
                        ${s.paused ? '▶️ تشغيل' : '⏸️ إيقاف'}
                    </button>
                    <button id="b11-close" style="background:transparent;color:#94a3b8;border:none;font-size:16px;cursor:pointer;margin-right:8px;">✖</button>
                </div>
            </div>
            <div style="flex:1;padding:16px;overflow-y:auto;font-size:13px;line-height:1.6;">
                <label style="display:block;margin-bottom:10px;">
                    <input type="checkbox" id="chk-autoLike" ${s.autoLike ? 'checked' : ''}> ❤️ الإعجاب التلقائي
                </label>
                <label style="display:block;margin-bottom:10px;">
                    <input type="checkbox" id="chk-autoFollow" ${s.autoFollow ? 'checked' : ''}> 👤 المتابعة التلقائية
                </label>
                <label style="display:block;margin-bottom:10px;color:#f43f5e;">
                    <input type="checkbox" id="chk-autoUnfollow" ${s.autoUnfollow ? 'checked' : ''}> 🧹 إلغاء متابعة غير المتابعين
                </label>
                <label style="display:block;margin-bottom:10px;">
                    <input type="checkbox" id="chk-autoFollowBack" ${s.autoFollowBack ? 'checked' : ''}> 🔄 رد المتابعة (الإشعارات)
                </label>
                <label style="display:block;margin-bottom:10px;">
                    <input type="checkbox" id="chk-autoReply" ${s.autoReply ? 'checked' : ''}> 💬 الرد الآلي
                </label>
                <hr style="border:0;border-top:1px solid #1e293b;margin:12px 0;">
                <div style="margin-bottom:10px;">
                    <label style="display:block;margin-bottom:4px;color:#94a3b8;">كلمات الرد الآلي (سطر لكل رد):</label>
                    <textarea id="txt-customReply" style="width:100%;height:60px;background:#0f172a;color:#fff;border:1px solid #334155;border-radius:6px;padding:6px;box-sizing:border-box;">${s.customReplyText}</textarea>
                </div>
            </div>
            <div id="b11-footer" style="padding:8px 16px;background:#0f172a;border-top:1px solid #1e293b;font-size:11px;color:#94a3b8;text-align:center;">
                ⏱️ جاري البدء...
            </div>
        `;

        document.body.appendChild(mini);
        document.body.appendChild(panel);

        // ربط الأحداث للواجهة
        mini.onclick = () => {
            mini.style.display = 'none';
            panel.style.display = 'flex';
            s.collapsed = false;
            NS.saveSettings();
        };

        document.getElementById('b11-close').onclick = () => {
            panel.style.display = 'none';
            mini.style.display = 'flex';
            s.collapsed = true;
            NS.saveSettings();
        };

        const pauseBtn = document.getElementById('b11-toggle-pause');
        pauseBtn.onclick = () => {
            s.paused = !s.paused;
            pauseBtn.innerText = s.paused ? '▶️ تشغيل' : '⏸️ إيقاف';
            NS.saveSettings();
        };

        // ربط خانات الإختيار
        const bindCheck = (id, key) => {
            const el = document.getElementById(id);
            if (el) el.onchange = (e) => { s[key] = e.target.checked; NS.saveSettings(); };
        };

        bindCheck('chk-autoLike', 'autoLike');
        bindCheck('chk-autoFollow', 'autoFollow');
        bindCheck('chk-autoUnfollow', 'autoUnfollow');
        bindCheck('chk-autoFollowBack', 'autoFollowBack');
        bindCheck('chk-autoReply', 'autoReply');

        const txtReply = document.getElementById('txt-customReply');
        if (txtReply) {
            txtReply.onchange = (e) => { s.customReplyText = e.target.value; NS.saveSettings(); };
        }
    };

    /* ════════════════ اختصارات لوحة المفاتيح والتهيئة ════════════════ */
    window.addEventListener('keydown', (e) => {
        if (e.shiftKey && e.key.toUpperCase() === 'B') {
            NS.state.collapsed = !NS.state.collapsed;
            const p = document.getElementById(NS.PANEL_ID);
            const m = document.getElementById(NS.PANEL_ID + '-mini');
            if (p && m) {
                p.style.display = NS.state.collapsed ? 'none' : 'flex';
                m.style.display = NS.state.collapsed ? 'flex' : 'none';
            }
            NS.saveSettings();
        }
    });

    // تشغيل التطبيق
    NS.createDashboard();
    NS.botLoop();

    console.log('📦 ui.js محمّل ومُكتمل بنجاح');
})();
