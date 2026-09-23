(function () {
    'use strict';
    const NS = window.__BSKY;
    if (!NS) return;

    // ═══ Auto Detect Handle ═══
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

    // ═══ Scroll ═══
    NS.findScrollContainer = function () {
        const now = Date.now();
        if (NS.scrollCache.el && now - NS.scrollCache.ts < 5000 &&
            NS.scrollCache.path === location.pathname && document.contains(NS.scrollCache.el) &&
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
    NS.autoScrollDown = async function (aggressive = false, myGen) {
        if (!NS.state.autoScroll) return;
        const c = NS.findScrollContainer();
        if (!c || NS.isInsidePanel(c)) return;
        const b = c.scrollTop;
        const step = aggressive ? c.clientHeight * 1.5 : c.clientHeight * 0.85;
        c.scrollTop = b + step;
        c.dispatchEvent(new Event('scroll', { bubbles: true }));
        await NS.sleepGen(aggressive ? NS.rand(2500, 4000) : NS.rand(1500, 3000), myGen);
    };

    // ═══ Memory Reset ═══
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

    // ═══ Main Loop ═══
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
                    await NS.sleepGen(60000, myGen); continue;
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

                    if (NS.state.autoLike) actionCount += await NS.doAutoLike(myGen);
                    if (myGen !== NS.loopGeneration) break;

                    if (NS.state.autoRepost) actionCount += await NS.doAutoRepost(myGen);
                    if (myGen !== NS.loopGeneration) break;

                    if (NS.state.autoFollow && !(onN && NS.state.autoFollowBack))
                        actionCount += await NS.doAutoFollow(myGen);
                    if (myGen !== NS.loopGeneration) break;

                    if (NS.state.autoUnfollow)
                        actionCount += await NS.doCleanupNonFollowers(myGen);
                    if (myGen !== NS.loopGeneration) break;

                    if (NS.state.followEngagers) actionCount += await NS.doFollowEngagers(myGen);
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
                        } else await NS.autoScrollDown(false, myGen);
                    } else {
                        NS.cyclesWithoutAction = 0;
                        await NS.autoScrollDown(false, myGen);
                        if (NS.state.humanBreakEnabled) {
                            NS.state.actionCounter = (NS.state.actionCounter || 0) + actionCount;
                            const threshold = NS.rand(NS.state.humanBreakEveryMin, NS.state.humanBreakEveryMax);
                            if (NS.state.actionCounter >= threshold) {
                                const bm = NS.rand(NS.state.breakDurationMin, NS.state.breakDurationMax);
                                NS.pushLog('break', `☕ استراحة ${bm} د`);
                                NS.state.actionCounter = 0;
                                NS.forceSaveSettings();
                                if (!await NS.sleepGen(bm * 60000 + NS.rand(0, 30000), myGen)) break;
                            } else NS.forceSaveSettings();
                        }
                    }
                }
            } catch(err) {
                console.error('🔴', err);
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

    // ═══ Dashboard ═══
    NS.createDashboard = function () {
        if (document.getElementById(NS.PANEL_ID)) return;

        const panel = document.createElement('div');
        panel.id = NS.PANEL_ID;
        panel.style.display = NS.state.collapsed ? 'none' : 'flex';

        const mini = document.createElement('div');
        mini.id = NS.PANEL_ID + '-mini';
        mini.innerHTML = 'B';
        Object.assign(mini.style, {
            position: 'fixed', bottom: '20px', right: '20px', zIndex: '99998',
            width: '50px', height: '50px', borderRadius: '12px',
            background: 'linear-gradient(135deg, #0085ff, #0066cc)',
            color: '#fff', fontSize: '26px', fontWeight: '900',
            display: NS.state.collapsed ? 'flex' : 'none',
            alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', boxShadow: '0 4px 16px rgba(0,133,255,0.5)',
            fontFamily: 'Arial, sans-serif', userSelect: 'none'
        });
        mini.onclick = () => {
            mini.style.display = 'none';
            const p = document.getElementById(NS.PANEL_ID);
            if (p) p.style.display = 'flex';
            NS.state.collapsed = false; NS.saveSettings();
        };
        document.body.appendChild(mini);

        panel.innerHTML = NS.buildDashboardHTML();
        document.body.appendChild(panel);

        NS.injectCSS();
        NS.bindDashboardEvents(panel, mini);
        NS.renderAll();
    };

    NS.buildDashboardHTML = function () {
        const s = NS.state;
        const esc = NS.esc;
        // ⚠️ نفس HTML من v1.0.5 بالكامل
        // هذا المكان يجب نسخ كل HTML اللوحة من الكود الأصلي
        // (انظر v1.0.5 - من `<div id="b11-header">` إلى `<div id="b11-footer">`)
        return `<div id="b11-header">...</div>`; // ضع الـ HTML الكامل هنا
    };

    NS.injectCSS = function () {
        if (document.getElementById('b11-css')) return;
        const css = document.createElement('style');
        css.id = 'b11-css';
        css.textContent = `
            /* ضع كل الـ CSS من v1.0.5 هنا */
        `;
        document.head.appendChild(css);
    };

    NS.bindDashboardEvents = function (panel, mini) {
        // ضع كل الأحداث (tabs, binds, buttons) من v1.0.5 هنا
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

    // ═══ Render Functions ═══
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
        const el = document.getElementById(map[type]); if (!el) return;
        const c = val > 0 ? '#10b981' : '#ef4444';
        el.innerHTML = `${icons[type]}<b style="color:${c}">${val}</b>`;
    };
    NS.renderLog = function () {
        const el = document.getElementById('b11-log-box'); if (!el) return;
        el.innerHTML = NS.state.activityLog.slice(-100).reverse().map(l => {
            const color = l.type.includes('fail') ? '#ef4444'
                        : l.type.includes('break') ? '#a855f7'
                        : l.type.includes('follow-back') ? '#f59e0b'
                        : l.type.includes('post') ? '#22c55e'
                        : '#cbd5e1';
            return `<div style="color:${color}">${new Date(l.t).toLocaleTimeString()} • ${l.type} • ${NS.esc(l.detail)}</div>`;
        }).join('');
    };
    NS.renderScheduledPosts = function () {
        const el = document.getElementById('b11-post-list'); if (!el) return;
        if (NS.state.scheduledPosts.length === 0) {
            el.innerHTML = '<div style="color:#64748b;text-align:center;padding:6px;">لا توجد منشورات</div>';
            return;
        }
        el.innerHTML = NS.state.scheduledPosts.slice(-20).reverse().map(p => {
            const d = new Date(p.time);
            const st = p.posted ? '✅' : '⏳';
            return `<div style="background:#0a121e;padding:5px 8px;border-radius:5px;margin:3px 0;display:flex;justify-content:space-between;font-size:10px;">
                <span>${st} ${NS.esc(p.text.slice(0, 25))}...</span>
                <span style="color:#94a3b8;font-size:9px;">${d.toLocaleString('ar-EG')}</span>
            </div>`;
        }).join('');
    };
    NS.renderDailyStats = function () {
        const el = document.getElementById('b11-daily'); if (!el) return;
        const c = NS.getDailyCounters();
        el.innerHTML = `❤️ ${c.likes||0}/${NS.state.dailyLimitLikes} | 👤 ${c.follows||0}/${NS.state.dailyLimitFollows} | 💬 ${c.replies||0}/${NS.state.dailyLimitReplies}`;
    };
    NS.renderProfiles = function () { /* نفس v1.0.5 */ };
    NS.renderChart = function () { /* نفس v1.0.5 */ };
    NS.renderABReport = function () { /* نفس v1.0.5 */ };
    NS.renderMLReport = function () { /* نفس v1.0.5 */ };
})();