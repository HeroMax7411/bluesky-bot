(function () {
    'use strict';
    const NS = window.__BSKY;
    if (!NS) return;

    /* ════════════════ Auto Detect Handle ════════════════ */
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

    /* ════════════════ Scroll ════════════════ */
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

    /* ════════════════ Memory Reset ════════════════ */
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

    /* ════════════════ Main Loop ════════════════ */
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

    /* ════════════════ Create Dashboard ════════════════ */
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
            fontFamily: 'Arial, sans-serif', userSelect: 'none', transition: 'transform 0.2s'
        });
        mini.onmouseenter = () => mini.style.transform = 'scale(1.1)';
        mini.onmouseleave = () => mini.style.transform = 'scale(1)';
        mini.onclick = () => {
            mini.style.display = 'none';
            const p = document.getElementById(NS.PANEL_ID);
            if (p) p.style.display = 'flex';
            NS.state.collapsed = false; NS.saveSettings();
        };
        document.body.appendChild(mini);

        const s = NS.state;
        const esc = NS.esc;

        panel.innerHTML = `
        <div id="b11-header">
            <div class="b11-brand">
                <div class="b11-logo">B</div>
                <div>
                    <div class="b11-title">بوت بلو سكاي</div>
                    <div class="b11-ver">v${NS.version} PRO</div>
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
                <label><input type="checkbox" id="b11-unfollow" ${s.autoUnfollow?'checked':''}> 🧹 إلغاء متابعة غير المتابعين</label>
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
                <input type="password" id="b11-app-pass" value="${esc(s.encryptPasswords ? '' : s.blueskyAppPassword)}" placeholder="xxxx-xxxx-xxxx-xxxx">
                <div style="font-size:9px;color:#94a3b8;">${s.blueskyAppPassword ? '✅ محفوظة (مشفرة)' : 'أدخلها مرة واحدة'}</div>
                <label style="margin-top:6px;"><input type="checkbox" id="b11-encrypt" ${s.encryptPasswords?'checked':''}> 🔐 تشفير كلمة المرور</label>
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
                <label><input type="checkbox" id="b11-weather-on" ${s.weatherPosts?'checked':''}> إضافة الطقس للمنشورات</label>
                <input type="text" id="b11-weather-city" value="${esc(s.weatherCity)}" placeholder="المدينة">
                <div class="b11-btn-row" style="grid-template-columns:1fr 1fr;">
                    <input type="number" id="b11-weather-lat" value="${s.weatherLat}" placeholder="Lat" step="0.001">
                    <input type="number" id="b11-weather-lon" value="${s.weatherLon}" placeholder="Lon" step="0.001">
                </div>
                <button id="b11-check-weather" class="b11-btn blue">🔍 فحص الطقس الآن</button>
            </div>
            <div class="b11-section">
                <div class="b11-section-title">📅 تقويم المحتوى</div>
                <label><input type="checkbox" id="b11-cal-on" ${s.calendarEnabled?'checked':''}> تفعيل (ينشر الساعة 10 ص)</label>
                ${['sun','mon','tue','wed','thu','fri','sat'].map(d =>
                  `<input type="text" id="b11-cal-${d}" value="${esc(s.calendar[d])}" placeholder="${d}" class="b11-textarea" style="padding:4px;">`
                ).join('')}
            </div>
            <div class="b11-section">
                <div class="b11-section-title">🗓️ أحداث عالمية</div>
                <label><input type="checkbox" id="b11-events" ${s.worldEvents?'checked':''}> إضافة تحية في المناسبات</label>
            </div>
        </div>

        <div class="b11-pane" data-p="filter" style="display:none">
            <label style="background:#1e3a5f;padding:8px;border-radius:6px;display:block;margin:8px 0;border:1px solid #3b82f6;">
                <input type="checkbox" id="b11-only-arabic" ${s.onlyArabic?'checked':''}>
                <b style="color:#60a5fa;">🇸🇦 محتوى عربي فقط</b>
            </label>
            <label>🌍 رمز اللغة:</label>
            <input type="text" id="b11-lang-filter" value="${esc(s.languageFilter)}" placeholder="ar / en / fr">
            <div class="b11-section">
                <div class="b11-section-title" style="color:#ef4444;">🚫 كلمات محظورة</div>
                <textarea id="b11-blacklist" rows="4" class="b11-textarea">${esc(s.blacklistWords)}</textarea>
            </div>
            <div class="b11-section">
                <label><input type="checkbox" id="b11-kw-on" ${s.useKeywordFilter?'checked':''}> تفعيل كلمات مفتاحية</label>
                <textarea id="b11-keywords" rows="3" class="b11-textarea">${esc(s.keywordFilter)}</textarea>
            </div>
            <label><input type="checkbox" id="b11-noavatar" ${s.skipNoAvatar?'checked':''}> تجاهل الحسابات بلا صورة</label>
            <button id="b11-clear-mem" class="b11-btn gray">🧠 مسح ذاكرة التفاعل</button>
        </div>

        <div class="b11-pane" data-p="advanced" style="display:none">
            <div class="b11-section">
                <div class="b11-section-title" style="color:#a855f7;">🤝 متابعة المتفاعلين</div>
                <label><input type="checkbox" id="b11-engagers" ${s.followEngagers?'checked':''}> متابعة من تفاعل معك</label>
                <div style="font-size:10px;color:#94a3b8;">الطابور: ${s.engagerQueue.length} حساب</div>
            </div>
            <div class="b11-section">
                <div class="b11-section-title" style="color:#10b981;">🔍 تحليل المشاعر</div>
                <label><input type="checkbox" id="b11-sentiment" ${s.sentimentAnalysis?'checked':''}> تحليل قبل الرد</label>
            </div>
            <div class="b11-section">
                <div class="b11-section-title" style="color:#f59e0b;">🎯 متغيرات القوالب</div>
                <label><input type="checkbox" id="b11-tmpl-vars" ${s.useTemplateVars?'checked':''}> تفعيل {name} {handle} {post} {time} {date}</label>
            </div>
            <div class="b11-section">
                <div class="b11-section-title" style="color:#3b82f6;">📝 هاشتاجات تلقائية</div>
                <label><input type="checkbox" id="b11-hashtags" ${s.autoHashtags?'checked':''}> إضافة هاشتاجات</label>
                <textarea id="b11-hashtag-map" rows="3" class="b11-textarea" placeholder="كلمة:hashtag1,hashtag2">${esc(s.hashtagMap)}</textarea>
            </div>
            <div class="b11-section">
                <div class="b11-section-title" style="color:#ec4899;">📊 A/B Testing</div>
                <label><input type="checkbox" id="b11-ab" ${s.abTesting?'checked':''}> تتبع أداء القوالب</label>
                <div id="b11-ab-report" style="font-size:10px;background:#0f172a;padding:6px;border-radius:4px;margin-top:4px;"></div>
            </div>
            <div class="b11-section">
                <div class="b11-section-title" style="color:#22c55e;">🧠 تعلّم التفضيلات</div>
                <label><input type="checkbox" id="b11-ml" ${s.mlPreferences?'checked':''}> تتبع أفضل الأوقات</label>
                <div id="b11-ml-report" style="font-size:10px;background:#0f172a;padding:6px;border-radius:4px;margin-top:4px;"></div>
            </div>
            <div class="b11-section">
                <div class="b11-section-title" style="color:#06b6d4;">📈 تتبع إلغاء المتابعة</div>
                <label><input type="checkbox" id="b11-track-unf" ${s.trackUnfollowers?'checked':''}> تتبع من ألغى متابعتك</label>
                <div style="font-size:10px;color:#94a3b8;">متابعون معروفون: ${s.knownFollowers.length}</div>
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
                <label><input type="checkbox" id="b11-sch-on" ${s.scheduleEnabled?'checked':''}> تفعيل</label>
                <div class="b11-btn-row" style="grid-template-columns:1fr 1fr;">
                    <input type="number" id="b11-sch-start" value="${s.scheduleStart}" min="0" max="23">
                    <input type="number" id="b11-sch-end" value="${s.scheduleEnd}" min="0" max="24">
                </div>
            </div>
            <div class="b11-section">
                <div class="b11-section-title">🔢 حد يومي</div>
                <label><input type="checkbox" id="b11-dl-on" ${s.dailyLimitsEnabled?'checked':''}> تفعيل</label>
                <div class="b11-btn-row" style="grid-template-columns:1fr 1fr;">
                    <input type="number" id="b11-dl-likes" value="${s.dailyLimitLikes}" placeholder="إعجابات">
                    <input type="number" id="b11-dl-follows" value="${s.dailyLimitFollows}" placeholder="متابعات">
                    <input type="number" id="b11-dl-replies" value="${s.dailyLimitReplies}" placeholder="ردود">
                    <input type="number" id="b11-dl-msgs" value="${s.dailyLimitMessages}" placeholder="رسائل">
                    <input type="number" id="b11-dl-posts" value="${s.dailyLimitPosts}" placeholder="منشورات">
                    <input type="number" id="b11-dl-reposts" value="${s.dailyLimitReposts}" placeholder="إعادة نشر">
                </div>
            </div>
            <div class="b11-section">
                <div class="b11-section-title">⚙️ معدل</div>
                <input type="number" id="b11-rate" value="${s.rateLimitPerMin}" min="1" max="30">
            </div>
            <div class="b11-section">
                <div class="b11-section-title">☕ استراحة بشرية</div>
                <label><input type="checkbox" id="b11-hb-on" ${s.humanBreakEnabled?'checked':''}> تفعيل</label>
                <div class="b11-btn-row" style="grid-template-columns:1fr 1fr;">
                    <input type="number" id="b11-hb-min" value="${s.humanBreakEveryMin}" placeholder="كل">
                    <input type="number" id="b11-hb-max" value="${s.humanBreakEveryMax}" placeholder="إلى">
                    <input type="number" id="b11-br-min" value="${s.breakDurationMin}" placeholder="دقيقة">
                    <input type="number" id="b11-br-max" value="${s.breakDurationMax}" placeholder="إلى">
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
                    Sayed Alhlwani — v${NS.version}
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
                <button id="b11-report-error" class="b11-btn" style="background:linear-gradient(135deg,#ef4444,#dc2626);">
                    📤 إرسال آخر 5 أخطاء إلى GitHub
                </button>
                <div class="b11-btn-row">
                    <button id="b11-export-errors" class="b11-btn gray">⬇️ تصدير JSON</button>
                    <button id="b11-clear-errors" class="b11-btn gray">🗑️ مسح الكل</button>
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
        <div id="b11-footer">جاهز • Shift+B للإظهار/الإخفاء</div>
        `;
        document.body.appendChild(panel);

        /* ═══ CSS ═══ */
        const css = document.createElement('style');
        css.id = 'b11-css';
        css.textContent = `
            #${NS.PANEL_ID}{position:fixed;top:70px;right:20px;z-index:99999;width:${s.panelSize.w}px;height:${s.panelSize.h}px;background:linear-gradient(160deg,#0d1420 0%,#161e27 100%);color:#e2e8f0;border-radius:14px;border:1px solid #1e293b;box-shadow:0 12px 40px rgba(0,0,0,0.6),0 0 0 1px rgba(0,133,255,0.1);font-family:-apple-system,'Segoe UI',sans-serif;font-size:12px;flex-direction:column;overflow:hidden;}
            #b11-header{padding:12px 14px;background:linear-gradient(135deg,#1e293b,#0f172a);display:flex;justify-content:space-between;align-items:center;cursor:move;border-bottom:1px solid #1e293b;}
            .b11-brand{display:flex;align-items:center;gap:10px;}
            .b11-logo{width:34px;height:34px;border-radius:9px;background:linear-gradient(135deg,#0085ff,#0066cc);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:19px;box-shadow:0 4px 12px rgba(0,133,255,0.4);}
            .b11-title{font-weight:700;font-size:13px;color:#fff;}
            .b11-ver{font-size:9px;color:#60a5fa;font-weight:600;}
            .b11-controls{display:flex;gap:4px;}
            .b11-icon{width:26px;height:26px;border:none;border-radius:6px;background:rgba(255,255,255,0.06);color:#cbd5e1;cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:center;transition:all 0.15s;}
            .b11-icon:hover{background:rgba(255,255,255,0.15);color:#fff;}
            #b11-tabs{display:flex;gap:2px;padding:6px;background:#0a121e;overflow-x:auto;flex-shrink:0;}
            .b11-tab{flex:1;min-width:44px;background:transparent;color:#64748b;border:none;padding:6px 2px;border-radius:6px;font-size:9px;cursor:pointer;font-weight:600;transition:all 0.15s;white-space:nowrap;}
            .b11-tab:hover{color:#94a3b8;background:rgba(255,255,255,0.03);}
            .b11-tab.active{background:linear-gradient(135deg,#0085ff,#0066cc);color:#fff;box-shadow:0 2px 8px rgba(0,133,255,0.4);}
            #b11-body{flex:1;padding:12px;overflow-y:auto;overflow-x:hidden;}
            #b11-body::-webkit-scrollbar{width:6px;}
            #b11-body::-webkit-scrollbar-thumb{background:#334155;border-radius:3px;}
            #b11-body::-webkit-scrollbar-track{background:transparent;}
            .b11-section{background:rgba(15,23,42,0.5);border:1px solid #1e293b;border-radius:8px;padding:8px 10px;margin:6px 0;}
            .b11-section-title{font-weight:700;font-size:11px;margin-bottom:6px;color:#cbd5e1;display:flex;align-items:center;gap:4px;}
            #${NS.PANEL_ID} label{display:flex;align-items:center;gap:6px;font-size:11px;margin:4px 0;cursor:pointer;color:#cbd5e1;}
            #${NS.PANEL_ID} input[type="checkbox"]{accent-color:#0085ff;}
            #${NS.PANEL_ID} input[type="text"],#${NS.PANEL_ID} input[type="number"],#${NS.PANEL_ID} input[type="password"],#${NS.PANEL_ID} input[type="datetime-local"],#${NS.PANEL_ID} input[type="file"]{width:100%;font-size:11px;padding:6px 8px;margin:3px 0;background:#0a121e;color:#e2e8f0;border:1px solid #1e293b;border-radius:6px;box-sizing:border-box;transition:border 0.15s;}
            #${NS.PANEL_ID} input:focus{outline:none;border-color:#0085ff;box-shadow:0 0 0 2px rgba(0,133,255,0.15);}
            #${NS.PANEL_ID} .b11-textarea{width:100%;font-size:11px;padding:6px 8px;margin:3px 0;background:#0a121e;color:#e2e8f0;border:1px solid #1e293b;border-radius:6px;box-sizing:border-box;font-family:'Consolas',monospace;resize:vertical;transition:border 0.15s;}
            #${NS.PANEL_ID} .b11-textarea:focus{outline:none;border-color:#0085ff;box-shadow:0 0 0 2px rgba(0,133,255,0.15);}
            .b11-btn{width:100%;padding:8px;border:none;border-radius:6px;font-weight:700;font-size:11px;cursor:pointer;margin:3px 0;color:#fff;transition:all 0.15s;font-family:inherit;}
            .b11-btn:hover{transform:translateY(-1px);filter:brightness(1.1);}
            .b11-btn:active{transform:translateY(0);}
            .b11-btn.green{background:linear-gradient(135deg,#22c55e,#16a34a);}
            .b11-btn.blue{background:linear-gradient(135deg,#0085ff,#0066cc);}
            .b11-btn.gray{background:linear-gradient(135deg,#475569,#334155);}
            .b11-btn.purple{background:linear-gradient(135deg,#6366f1,#4f46e5);}
            .b11-btn-row{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:4px 0;}
            .b11-btn-row .b11-btn{margin:0;}
            .b11-status{display:flex;gap:8px;padding:8px;background:linear-gradient(135deg,#0a121e,#0f172a);border:1px solid #1e293b;border-radius:8px;font-size:10px;margin-bottom:6px;justify-content:space-around;}
            .b11-last{background:#0a121e;padding:8px;border-radius:6px;font-size:10px;margin-bottom:6px;border:1px solid #1e293b;}
            #b11-log-box{background:#0a121e;padding:8px;border-radius:6px;font-size:10px;color:#cbd5e1;max-height:380px;overflow-y:auto;margin:4px 0;font-family:'Consolas',monospace;line-height:1.6;}
            .b11-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:8px;}
            .b11-stats div{background:linear-gradient(135deg,#0a121e,#0f172a);padding:8px 4px;border-radius:6px;text-align:center;font-size:11px;border:1px solid #1e293b;font-weight:600;}
            #b11-resize{position:absolute;bottom:0;left:0;width:20px;height:20px;cursor:nwse-resize;background:linear-gradient(135deg,transparent 50%,#0085ff 50%,#0085ff 60%,transparent 60%,transparent 70%,#0085ff 70%,#0085ff 80%,transparent 80%);opacity:0.6;}
            #b11-resize:hover{opacity:1;}
            #b11-footer{padding:6px 12px;font-size:10px;color:#10b981;background:#0a121e;border-top:1px solid #1e293b;text-align:center;border-bottom-left-radius:14px;border-bottom-right-radius:14px;}
        `;
        document.head.appendChild(css);

        /* ═══ Tabs ═══ */
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
            };
        });

        /* ═══ Binds ═══ */
        const bind = (id, key, isCheck = false) => {
            const el = document.getElementById(id);
            if (!el) return;
            const ev = isCheck ? 'onchange' : 'oninput';
            el[ev] = e => { NS.state[key] = isCheck ? e.target.checked : e.target.value; NS.saveSettings(); };
        };
        const bn = (id, key, min = 0, max = 100000) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.oninput = e => {
                const v = parseInt(e.target.value, 10);
                if (!isNaN(v) && v >= min && v <= max) { NS.state[key] = v; NS.saveSettings(); }
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
        if (passEl) passEl.onchange = e => { NS.setEncryptedPass(e.target.value); e.target.value = ''; };

        ['sun','mon','tue','wed','thu','fri','sat'].forEach(d => {
            const el = document.getElementById(`b11-cal-${d}`);
            if (el) el.oninput = e => { NS.state.calendar[d] = e.target.value; NS.saveSettings(); };
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

        /* ═══ Buttons ═══ */
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
                NS.state.scheduledPosts.push({
                    id: Date.now() + '_' + Math.random().toString(36).slice(2, 8),
                    text, time, posted: false,
                    mediaBlob: blob, mediaAlt: alt,
                    mediaType: blob && blob.type && blob.type.startsWith('video') ? 'video' : 'image'
                });
                NS.forceSaveSettings();
                document.getElementById('b11-post-text').value = '';
                document.getElementById('b11-post-time').value = '';
                document.getElementById('b11-post-alt').value = '';
                document.getElementById('b11-post-media').value = '';
                NS.renderScheduledPosts();
                NS.notify('تمت الإضافة', 'سيُنشر في الموعد');
            };
            if (mediaInput.files[0]) addPost(mediaInput.files[0]);
            else addPost();
        };

        document.getElementById('b11-clear-posts').onclick = () => {
            NS.state.scheduledPosts = NS.state.scheduledPosts.filter(p => !p.posted);
            NS.forceSaveSettings(); NS.renderScheduledPosts();
        };

        document.getElementById('b11-check-weather').onclick = async () => {
            const w = await NS.fetchWeather();
            if (w) alert(`🌤️ ${NS.state.weatherCity}: ${w.temp}°C ${w.desc}`);
            else alert('❌ فشل جلب الطقس');
        };

        document.getElementById('b11-add-profile').onclick = () => {
            const name = prompt('اسم الحساب:');
            if (name) { NS.saveCurrentAsProfile(name); NS.renderProfiles(); }
        };

        document.getElementById('b11-donate').onclick = () => {
            window.open(NS.DONATE_URL, '_blank');
            NS.notify('شكراً 💙', 'شكراً لدعمك!');
        };

        document.getElementById('b11-dev').onclick = () => { window.open(NS.DEV_URL, '_blank'); };
        document.getElementById('b11-github').onclick = () => { window.open(`https://github.com/${NS.GITHUB_REPO}`, '_blank'); };

        document.getElementById('b11-report-error').onclick = () => NS.reportErrorToGitHub();
        document.getElementById('b11-export-errors').onclick = NS.exportErrorLog;
        document.getElementById('b11-clear-errors').onclick = NS.clearErrorLog;

        document.getElementById('b11-export-settings').onclick = NS.exportSettings;
        document.getElementById('b11-import-settings').onclick = () => {
            document.getElementById('b11-import-file').click();
        };
        document.getElementById('b11-import-file').onchange = e => {
            if (e.target.files[0]) NS.importSettings(e.target.files[0]);
        };

        document.getElementById('b11-restart').onclick = () => {
            NS.setFooter('⏳ إعادة تشغيل...');
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
            const f = NS.collectAllFollowButtons(), l = NS.collectAllLikeButtons(), r = NS.collectAllRepostButtons();
            alert([
                `📄 ${location.pathname}`,
                `👤 اسمك: ${NS.state.myHandle || '؟'}`,
                `👥 متابعة: ${f.length} | ❤️ إعجاب: ${l.length} | 🔄 إعادة: ${r.length}`,
                `🌐 لغة: ${NS.state.languageFilter || 'معطّلة'}`,
                `⏰ جدولة: ${NS.state.scheduleEnabled ? 'مفعّلة' : 'معطّلة'}`,
                `🔢 حد يومي: ${NS.state.dailyLimitsEnabled ? 'مفعّل' : 'معطّل'}`,
                `📊 طابور متفاعلين: ${NS.state.engagerQueue.length}`,
                `👥 متابعون معروفون: ${NS.state.knownFollowers.length}`,
                `🐛 أخطاء: ${NS.errorLog.length}`
            ].join('\n'));
        };

        document.getElementById('b11-clear-mem').onclick = () => {
            if (confirm('مسح ذاكرة التفاعل؟')) {
                ['processedLikes','processedFollows','processedFollowBacks','processedCommentLikes',
                 'processedNotifReplies','processedMessages','processedReposts','processedPosts']
                    .forEach(k => NS.state[k] = []);
                NS.state.unfollowedUsers = []; NS.state.actionCounter = 0;
                NS.forceSaveSettings();
                NS.pushLog('info', '🧠 مسح الذاكرة');
                alert('✅');
            }
        };

        document.getElementById('b11-theme').onclick = () => {
            NS.state.theme = NS.state.theme === 'dark' ? 'light' : 'dark';
            const bg = NS.state.theme === 'light' ? '#f1f5f9' : '#161e27';
            const cl = NS.state.theme === 'light' ? '#0f172a' : '#e2e8f0';
            panel.style.background = bg; panel.style.color = cl;
            NS.saveSettings();
        };

        document.getElementById('b11-collapse').onclick = () => {
            panel.style.display = 'none';
            mini.style.display = 'flex';
            NS.state.collapsed = true; NS.saveSettings();
        };

        document.getElementById('b11-close').onclick = () => {
            panel.style.display = 'none';
            mini.style.display = 'flex';
            NS.state.collapsed = true; NS.saveSettings();
        };

        document.addEventListener('keydown', e => {
            if (e.shiftKey && e.key.toLowerCase() === 'b') {
                const vis = panel.style.display !== 'none';
                panel.style.display = vis ? 'none' : 'flex';
                mini.style.display = vis ? 'flex' : 'none';
                NS.state.collapsed = vis; NS.saveSettings();
            }
        });

        /* ═══ Drag ═══ */
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

        /* ═══ Resize ═══ */
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
                NS.state.panelSize = { w, h };
            };
        };
        resizer.onmouseup = () => { NS.forceSaveSettings(); };

        /* ═══ Export/Stats ═══ */
        document.getElementById('b11-export-csv').onclick = () => {
            const rows = [['date','likes','follows','unfollows','replies','followBacks',
                           'commentLikes','notifReplies','messageReplies','posts','reposts']];
            NS.stats.history.forEach(h => rows.push([h.d, h.likes||0, h.follows||0,
                h.unfollows||0, h.replies||0, h.followBacks||0, h.commentLikes||0,
                h.notifReplies||0, h.messageReplies||0, h.posts||0, h.reposts||0]));
            const blob = new Blob([rows.map(r => r.join(',')).join('\n')], {type:'text/csv'});
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'bsky-stats.csv'; a.click();
        };
        document.getElementById('b11-export-sheets').onclick = NS.exportToSheets;

        document.getElementById('b11-reset-stats').onclick = () => {
            if (confirm('تصفير الإحصائيات؟')) {
                NS.stats = { likes:0, follows:0, unfollows:0, replies:0, followBacks:0,
                          commentLikes:0, notifReplies:0, messageReplies:0, posts:0,
                          reposts:0, engagerFollows:0, history:[] };
                NS.saveStats(); NS.updateStatsUI(); NS.renderChart();
            }
        };
        document.getElementById('b11-log-clear').onclick = () => {
            if (confirm('مسح السجل؟')) {
                NS.state.activityLog = []; NS.forceSaveSettings(); NS.renderLog();
            }
        };

        /* ═══ Render all ═══ */
        NS.renderLog(); NS.updateStatsUI(); NS.renderScheduledPosts();
        NS.renderDailyStats(); NS.renderProfiles(); NS.renderChart();
        NS.renderABReport(); NS.renderMLReport(); NS.renderErrorTab();
    };

    /* ════════════════ Render Functions ════════════════ */
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
                        : l.type.includes('comment-like') ? '#ec4899'
                        : l.type.includes('notif-reply') ? '#3b82f6'
                        : l.type.includes('message-reply') ? '#8b5cf6'
                        : l.type.includes('post') ? '#22c55e'
                        : l.type.includes('repost') ? '#06b6d4'
                        : l.type.includes('engager') ? '#10b981'
                        : l.type.includes('cleanup') ? '#f97316'
                        : l.type.includes('unfollower') ? '#ef4444'
                        : '#cbd5e1';
            return `<div style="color:${color}">${new Date(l.t).toLocaleTimeString()} • ${l.type} • ${NS.esc(l.detail)}</div>`;
        }).join('');
        const last = document.getElementById('b11-last-result');
        if (last && NS.state.lastClickResult) last.innerText = NS.state.lastClickResult;
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
            const media = p.mediaBlob ? ' 📎' : '';
            return `<div style="background:#0a121e;padding:5px 8px;border-radius:5px;margin:3px 0;display:flex;justify-content:space-between;align-items:center;font-size:10px;">
                <span>${st}${media} ${NS.esc(p.text.slice(0, 25))}...</span>
                <span style="color:#94a3b8;font-size:9px;">${d.toLocaleString('ar-EG')}</span>
            </div>`;
        }).join('');
    };

    NS.renderDailyStats = function () {
        const el = document.getElementById('b11-daily'); if (!el) return;
        const c = NS.getDailyCounters();
        el.innerHTML = `
            ❤️ ${c.likes||0}/${NS.state.dailyLimitLikes} |
            👤 ${c.follows||0}/${NS.state.dailyLimitFollows} |
            💬 ${c.replies||0}/${NS.state.dailyLimitReplies} |
            📨 ${c.messages||0}/${NS.state.dailyLimitMessages} |
            📝 ${c.posts||0}/${NS.state.dailyLimitPosts} |
            🔁 ${c.reposts||0}/${NS.state.dailyLimitReposts}
        `;
    };

    NS.renderProfiles = function () {
        const el = document.getElementById('b11-profiles'); if (!el) return;
        if (NS.profiles.length === 0) {
            el.innerHTML = '<div style="color:#64748b;font-size:10px;">لا توجد حسابات محفوظة</div>';
            return;
        }
        el.innerHTML = NS.profiles.map((p, i) => `
            <div style="display:flex;justify-content:space-between;align-items:center;background:#0a121e;padding:5px 8px;border-radius:5px;margin:3px 0;font-size:11px;">
                <span>${i === NS.activeProfileIdx ? '🟢' : '⚪'} ${NS.esc(p.name)}</span>
                <div>
                    <button data-sw="${i}" style="background:#22c55e;border:none;color:#fff;padding:2px 6px;border-radius:3px;cursor:pointer;font-size:9px;margin-right:3px;">تبديل</button>
                    <button data-del="${i}" style="background:#ef4444;border:none;color:#fff;padding:2px 6px;border-radius:3px;cursor:pointer;font-size:9px;">حذف</button>
                </div>
            </div>
        `).join('');
        el.querySelectorAll('[data-sw]').forEach(b => b.onclick = () => NS.switchProfile(+b.dataset.sw));
        el.querySelectorAll('[data-del]').forEach(b => b.onclick = () => NS.deleteProfile(+b.dataset.del));
    };

    NS.renderChart = function () {
        const cv = document.getElementById('b11-chart'); if (!cv) return;
        const ctx = cv.getContext('2d');
        const W = cv.width, H = cv.height;
        ctx.clearRect(0, 0, W, H);
        const last7 = NS.stats.history.slice(-7);
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
    };

    NS.renderABReport = function () {
        const el = document.getElementById('b11-ab-report'); if (!el) return;
        const entries = Object.entries(NS.state.replyPerf || {}).sort((a, b) => b[1].uses - a[1].uses).slice(0, 5);
        if (entries.length === 0) { el.innerText = 'لا توجد بيانات بعد'; return; }
        el.innerHTML = entries.map(([t, d]) =>
            `<div>• "${NS.esc(t.slice(0, 20))}" — ${d.uses} استخدام</div>`
        ).join('');
    };

    NS.renderMLReport = function () {
        const el = document.getElementById('b11-ml-report'); if (!el) return;
        const best = NS.getBestHour();
        el.innerText = best.count > 0 ? `⏰ أفضل ساعة: ${best.hour}:00 (${best.count} فعل)` : 'لا توجد بيانات';
    };
})();
