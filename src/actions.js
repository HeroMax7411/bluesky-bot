(function () {
    'use strict';
    const NS = window.__BSKY;
    if (!NS) return;

    // ═══ Session Management ═══
    NS.getSession = async function () {
        const pass = NS.getDecryptedPass();
        if (!pass) throw new Error('لا توجد كلمة مرور');
        if (NS.sessionCache.accessJwt && Date.now() < NS.sessionCache.expiresAt) return NS.sessionCache;
        const loginRes = await fetch('https://bsky.social/xrpc/com.atproto.server.createSession', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier: NS.state.myHandle || 'sayed1993.bsky.social', password: pass })
        });
        if (!loginRes.ok) throw new Error('فشل تسجيل الدخول');
        const s = await loginRes.json();
        NS.sessionCache = { accessJwt: s.accessJwt, refreshJwt: s.refreshJwt, did: s.did, expiresAt: Date.now() + 100 * 60 * 1000 };
        return NS.sessionCache;
    };

    NS.refreshSession = async function () {
        if (!NS.sessionCache.refreshJwt) return NS.getSession();
        try {
            const res = await fetch('https://bsky.social/xrpc/com.atproto.server.refreshSession', {
                method: 'POST', headers: { 'Authorization': `Bearer ${NS.sessionCache.refreshJwt}` }
            });
            if (!res.ok) throw new Error('refresh failed');
            const s = await res.json();
            NS.sessionCache = { accessJwt: s.accessJwt, refreshJwt: s.refreshJwt, did: s.did, expiresAt: Date.now() + 100 * 60 * 1000 };
            return NS.sessionCache;
        } catch (e) {
            NS.sessionCache = { accessJwt: null, refreshJwt: null, did: null, expiresAt: 0 };
            return NS.getSession();
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
        if (!res.ok) throw new Error('فشل رفع الوسائط: HTTP ' + res.status);
        const j = await res.json();
        return j.blob;
    };

    NS.publishScheduledPost = async function (post) {
        const pass = NS.getDecryptedPass();
        if (!pass) { NS.pushLog('post-fail', '❌ لا توجد كلمة مرور'); return false; }
        try {
            let s = await NS.getSession();
            let text = post.text || '';
            if (NS.state.weatherPosts) {
                const w = await NS.fetchWeather();
                if (w) text += `\n\n🌤️ ${NS.state.weatherCity}: ${w.temp}°C ${w.desc}`;
            }
            if (NS.state.worldEvents) {
                const ev = NS.getWorldEvent();
                if (ev) text = ev + '\n\n' + text;
            }
            if (NS.state.autoHashtags) {
                const tags = NS.generateHashtags(text);
                if (tags && !text.includes('#')) text += ' ' + tags;
            }
            let embed = null;
            if (post.mediaBlob) {
                try {
                    const blob = await NS.uploadBlob(s.accessJwt, post.mediaBlob);
                    if (post.mediaType === 'video') {
                        embed = { $type: 'app.bsky.embed.video', video: blob };
                    } else {
                        embed = { $type: 'app.bsky.embed.images', images: [{ image: blob, alt: post.mediaAlt || '' }] };
                    }
                } catch(e) { console.warn('media upload failed', e); }
            }
            const record = { $type: 'app.bsky.feed.post', text, createdAt: new Date().toISOString(), langs: [NS.state.languageFilter || 'ar'] };
            if (embed) record.embed = embed;

            let postRes = await fetch('https://bsky.social/xrpc/com.atproto.repo.createRecord', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${s.accessJwt}` },
                body: JSON.stringify({ repo: s.did, collection: 'app.bsky.feed.post', record })
            });
            if (postRes.status === 401) {
                s = await NS.refreshSession();
                postRes = await fetch('https://bsky.social/xrpc/com.atproto.repo.createRecord', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${s.accessJwt}` },
                    body: JSON.stringify({ repo: s.did, collection: 'app.bsky.feed.post', record })
                });
            }
            if (!postRes.ok) throw new Error('فشل النشر: HTTP ' + postRes.status);
            NS.bumpStat('posts'); NS.dailyIncrement('posts');
            NS.pushLog('post', `✅ "${text.slice(0, 40)}..."`);
            NS.notify('تم النشر', text.slice(0, 40));
            return true;
        } catch (err) {
            NS.pushLog('post-fail', `❌ ${err.message}`);
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
        const now = new Date();
        const hour = now.getHours();
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

    // ═══ Follow Back ═══
    NS.doFollowBack = async function (myGen) {
        if (!location.pathname.includes('/notifications')) return 0;
        if (!NS.dailyCheck('followBacks')) return 0;
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
            NS.rateRecord(); NS.fire(t.btn);
            if (!await NS.sleepGen(NS.rand(2000, 3000), myGen)) return count;
            if (!NS.isFollowButton(t.btn) || NS.isAlreadyFollowing(t.btn)) {
                NS.state.processedFollowBacks.push(t.handle);
                NS.bumpStat('followBacks'); NS.dailyIncrement('followBacks'); count++;
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

    // ═══ Like Commenters ═══
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
            if (NS.state.dryRun) { NS.pushLog('dry', `إعجاب`); continue; }
            t.btn.scrollIntoView({ block: 'center', behavior: 'instant' });
            if (!await NS.sleepGen(NS.rand(700, 1400), myGen)) return count;
            NS.rateRecord(); NS.fire(t.btn);
            if (!await NS.sleepGen(NS.rand(1500, 2500), myGen)) return count;
            if (NS.isAlreadyLiked(t.btn)) {
                NS.state.processedCommentLikes.push(t.key);
                NS.bumpStat('commentLikes'); NS.dailyIncrement('commentLikes'); count++;
                NS.pushLog('comment-like', `❤️ ${t.key.slice(0, 40)}`);
            } else {
                NS.state.processedCommentLikes.push(t.key);
                NS.pushLog('comment-like-fail', `❌ ${t.key.slice(0, 40)}`);
            }
        }
        if (count) NS.saveSettings();
        return count;
    };

    // ═══ Auto Like ═══
    NS.doAutoLike = async function (myGen) {
        if (Math.random() * 100 > NS.state.likeRatio) return 0;
        if (!NS.dailyCheck('likes')) return 0;
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
            NS.rateRecord(); NS.fire(t.btn);
            if (!await NS.sleepGen(NS.rand(1500, 2500), myGen)) return count;
            if (NS.isAlreadyLiked(t.btn)) {
                NS.state.processedLikes.push(t.key);
                NS.bumpStat('likes'); NS.dailyIncrement('likes'); count++;
                NS.pushLog('like', `✅ ${t.key.slice(0, 50)}`);
            } else {
                NS.state.processedLikes.push(t.key);
                NS.pushLog('like-fail', `❌ ${t.key.slice(0, 40)}`);
            }
        }
        if (count) NS.saveSettings();
        return count;
    };

    // ═══ Auto Follow ═══
    NS.doAutoFollow = async function (myGen) {
        if (Math.random() * 100 > NS.state.followRatio) return 0;
        if (!NS.dailyCheck('follows')) return 0;
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
            NS.rateRecord(); NS.fire(t.btn);
            if (!await NS.sleepGen(NS.rand(2000, 3200), myGen)) return count;
            if (NS.isAlreadyFollowing(t.btn)) {
                NS.state.processedFollows.push(t.handle);
                NS.bumpStat('follows'); NS.dailyIncrement('follows'); count++;
                NS.pushLog('follow', `✅ ${t.handle}`);
            } else {
                NS.state.processedFollows.push(t.handle);
                NS.pushLog('follow-fail', `❌ ${t.handle}`);
            }
        }
        if (count) NS.saveSettings();
        return count;
    };

    // ═══ Auto Repost ═══
    NS.doAutoRepost = async function (myGen) {
        if (!NS.state.autoRepost) return 0;
        if (!NS.dailyCheck('reposts')) return 0;
        const targets = NS.collectAllRepostButtons();
        let count = 0;
        for (const t of targets.slice(0, 3)) {
            if (myGen !== NS.loopGeneration) return count;
            if (!NS.rateCheck()) break;
            if (NS.state.processedReposts.includes(t.key)) continue;
            if (NS.state.dryRun) { NS.pushLog('dry', `إعادة نشر`); continue; }
            t.btn.scrollIntoView({ block: 'center', behavior: 'instant' });
            if (!await NS.sleepGen(NS.rand(700, 1400), myGen)) return count;
            NS.rateRecord(); NS.fire(t.btn);
            if (!await NS.sleepGen(NS.rand(2000, 3000), myGen)) return count;
            const confirm = Array.from(document.querySelectorAll('[role="menuitem"], button'))
                .find(b => {
                    const txt = (b.innerText || '').trim().toLowerCase();
                    return txt === 'repost' || txt === 'إعادة نشر';
                });
            if (confirm) { NS.fire(confirm); await NS.sleepGen(1500, myGen); }
            NS.state.processedReposts.push(t.key);
            NS.bumpStat('reposts'); NS.dailyIncrement('reposts'); count++;
            NS.pushLog('repost', `🔄 ${t.key.slice(0, 40)}`);
        }
        if (count) NS.saveSettings();
        return count;
    };

    // ═══ Wait Confirm Modal ═══
    NS.waitForConfirmModal = async function (maxWaitMs = 5000, myGen) {
        const start = Date.now();
        while (Date.now() - start < maxWaitMs) {
            if (myGen !== NS.loopGeneration) return null;
            const confirm = Array.from(document.querySelectorAll('button, [role="button"]'))
                .find(b => {
                    if (NS.isInsidePanel(b)) return false;
                    const t = (b.innerText || '').trim().toLowerCase();
                    return t === 'unfollow' || t === 'إلغاء المتابعة';
                });
            if (confirm) return confirm;
            await NS.sleep(200);
        }
        return null;
    };

    // ═══ Cleanup Non-Followers ═══
    NS.doCleanupNonFollowers = async function (myGen) {
        if (!/\/profile\/[^/]+\/following/.test(location.pathname)) return 0;
        if (!NS.state.autoUnfollow) return 0;
        if (NS.state.knownFollowers.length === 0) {
            NS.pushLog('cleanup', '⚠️ زُر /followers أولاً');
            return 0;
        }
        const followers = new Set(NS.state.knownFollowers);
        const btns = Array.from(document.querySelectorAll('button, [role="button"]'))
            .filter(b => !NS.isInsidePanel(b) && NS.isAlreadyFollowing(b));
        let n = 0;
        for (const btn of btns) {
            if (myGen !== NS.loopGeneration) return n;
            if (!NS.rateCheck()) break;
            const c = btn.closest('[role="article"]') || btn.closest('div');
            const h = NS.getHandleFromContainer(c);
            if (!h || followers.has(h)) continue;
            if (NS.state.processedFollows.includes(h)) continue;
            if (NS.state.dryRun) { NS.pushLog('dry', `إلغاء: ${h}`); continue; }
            NS.fire(btn);
            const confirm = await NS.waitForConfirmModal(5000, myGen);
            if (confirm) {
                NS.rateRecord(); NS.fire(confirm);
                NS.bumpStat('unfollows');
                NS.state.unfollowedUsers.push(h);
                NS.pushLog('cleanup-unfollow', `🧹 ${h}`);
                n++;
            }
            if (!await NS.sleepGen(NS.rand(2500, 4500), myGen)) return n;
        }
        return n;
    };

    // ═══ Reply to Notifications ═══
    NS.doReplyToNotifications = async function (myGen) {
        if (!location.pathname.includes('/notifications')) return 0;
        if (!NS.dailyCheck('notifReplies')) return 0;
        const notifications = document.querySelectorAll('[data-testid="notification"], [role="article"]');
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
            const replyBtn = n.querySelector('[data-testid="replyBtn"]') ||
                Array.from(n.querySelectorAll('button, [role="button"]')).find(b => {
                    const l = (b.getAttribute('aria-label') || '').toLowerCase();
                    const t = (b.innerText || '').trim().toLowerCase();
                    return l.includes('reply') || t === 'رد';
                });
            if (!replyBtn) continue;
            if (NS.state.dryRun) { NS.pushLog('dry', `رد إشعار`); NS.state.processedNotifReplies.push(key); continue; }
            replyBtn.scrollIntoView({ block: 'center', behavior: 'instant' });
            if (!await NS.sleepGen(NS.rand(800, 1500), myGen)) return count;
            NS.rateRecord(); NS.fire(replyBtn);
            if (!await NS.sleepGen(NS.rand(2000, 3000), myGen)) return count;
            const editor = document.querySelector('div[contenteditable="true"][role="textbox"]');
            if (!editor) { NS.state.processedNotifReplies.push(key); continue; }
            let pool;
            if (NS.state.sentimentAnalysis) {
                const sent = NS.analyzeSentiment(txt);
                pool = sent === 'positive'
                    ? String(NS.state.customReplyText || '').split('\n').filter(Boolean)
                    : sent === 'negative'
                        ? ["أتمنى لك الأفضل 💙", "الله يعينك 🙏"]
                        : String(NS.state.customReplyText || '').split('\n').filter(Boolean);
            } else {
                pool = String(NS.state.customReplyText || '').split('\n').map(s => s.trim()).filter(Boolean);
            }
            let selected = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : "شكراً! 🙏";
            selected = NS.applyTemplateVars(selected, { name: 'صديقي', post: txt });
            if (NS.state.autoHashtags) {
                const tags = NS.generateHashtags(txt);
                if (tags) selected += ' ' + tags;
            }
            NS.setInputValue(editor, selected);
            if (!await NS.sleepGen(NS.rand(1200, 2000), myGen)) return count;
            const send = Array.from(document.querySelectorAll('button'))
                .find(b => ['reply','رد','post','نشر'].includes((b.innerText||'').trim().toLowerCase()) && !b.disabled);
            if (send) {
                NS.rateRecord(); NS.fire(send);
                NS.bumpStat('notifReplies'); NS.dailyIncrement('notifReplies'); count++;
                NS.state.processedNotifReplies.push(key);
                NS.pushLog('notif-reply', `✅`);
            }
            if (!await NS.sleepGen(NS.rand(1500, 2500), myGen)) return count;
        }
        if (count) NS.saveSettings();
        return count;
    };

    // ═══ Reply to Messages ═══
    NS.doReplyToMessages = async function (myGen) {
        if (!location.pathname.includes('/messages')) return 0;
        if (!NS.dailyCheck('messages')) return 0;
        const convos = document.querySelectorAll('[data-testid="DMConversation"], [role="listitem"]');
        let count = 0;
        for (const c of convos) {
            if (myGen !== NS.loopGeneration) return count;
            if (!NS.rateCheck()) break;
            const txt = (c.innerText || '').slice(0, 300);
            const key = txt.slice(0, 80);
            if (NS.state.processedMessages.includes(key)) continue;
            NS.fire(c);
            if (!await NS.sleepGen(NS.rand(1500, 2500), myGen)) return count;
            const msgs = document.querySelectorAll('[data-testid="messageText"], .messageText, [role="article"]');
            if (msgs.length === 0) { NS.state.processedMessages.push(key); continue; }
            const last = msgs[msgs.length - 1];
            const msgTxt = (last.innerText || '').slice(0, 500);
            if (NS.state.onlyArabic && !NS.isArabicText(msgTxt)) { NS.state.processedMessages.push(key); continue; }
            if (NS.containsBlacklisted(msgTxt)) { NS.state.processedMessages.push(key); continue; }
            const editor = document.querySelector('div[contenteditable="true"][role="textbox"]') ||
                           document.querySelector('textarea[placeholder*="message" i]') ||
                           document.querySelector('textarea[placeholder*="رسالة" i]');
            if (!editor) { NS.state.processedMessages.push(key); continue; }
            if (NS.state.dryRun) { NS.pushLog('dry', `رد رسالة`); NS.state.processedMessages.push(key); continue; }
            const pool = String(NS.state.messageReplyText || '').split('\n').map(s => s.trim()).filter(Boolean);
            let selected = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : "شكراً 🙏";
            selected = NS.applyTemplateVars(selected, { post: msgTxt });
            NS.setInputValue(editor, selected);
            if (!await NS.sleepGen(NS.rand(1200, 2000), myGen)) return count;
            const send = Array.from(document.querySelectorAll('button')).find(b => {
                const l = (b.getAttribute('aria-label') || '').toLowerCase();
                const t = (b.innerText || '').trim().toLowerCase();
                return (l.includes('send') || t === 'send' || t === 'إرسال') && !b.disabled;
            });
            if (send) {
                NS.rateRecord(); NS.fire(send);
                NS.bumpStat('messageReplies'); NS.dailyIncrement('messages'); count++;
                NS.state.processedMessages.push(key);
                NS.pushLog('message-reply', `✅`);
            }
            if (!await NS.sleepGen(NS.rand(2000, 3500), myGen)) return count;
        }
        if (count) NS.saveSettings();
        return count;
    };

    // ═══ Auto Reply ═══
    NS.doAutoReply = async function (myGen) {
        const btns = Array.from(document.querySelectorAll('[data-testid="replyBtn"], [data-testid*="reply" i]'))
            .filter(b => !NS.isInsidePanel(b));
        if (!btns.length || !NS.rateCheck() || !NS.dailyCheck('replies')) return 0;
        if (NS.state.dryRun) { NS.pushLog('dry', 'رد'); return 0; }
        const btn = btns[Math.floor(Math.random() * Math.min(btns.length, 3))];
        const c = btn.closest('[role="article"]') || btn.closest('div');
        if (NS.state.onlyArabic && c) {
            const t = (c.innerText || '').slice(0, 800);
            if (!NS.isArabicText(t)) return 0;
        }
        let pool;
        if (c && (NS.postHasVideo(c) || NS.postHasImage(c)))
            pool = String(NS.state.replyWithImage || '').split('\n').map(s => s.trim()).filter(Boolean);
        else pool = String(NS.state.replyTextOnly || '').split('\n').map(s => s.trim()).filter(Boolean);
        if (!pool.length) pool = String(NS.state.customReplyText || '').split('\n').map(s => s.trim()).filter(Boolean);
        let selected = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : "منشور رائع! ✨";
        const postText = c ? (c.innerText || '').slice(0, 200) : '';
        selected = NS.applyTemplateVars(selected, { post: postText });
        if (NS.state.autoHashtags) {
            const tags = NS.generateHashtags(postText);
            if (tags) selected += ' ' + tags;
        }
        try {
            NS.rateRecord(); NS.fire(btn);
            if (!await NS.sleepGen(NS.rand(2200, 3500), myGen)) return 0;
            const editor = document.querySelector('div[contenteditable="true"][role="textbox"]');
            if (!editor) return 0;
            NS.setInputValue(editor, selected);
            if (!await NS.sleepGen(NS.rand(1200, 2000), myGen)) return 0;
            const send = Array.from(document.querySelectorAll('button'))
                .find(b => ['reply','رد','post','نشر'].includes((b.innerText||'').trim().toLowerCase()) && !b.disabled);
            if (send) {
                NS.rateRecord(); NS.fire(send);
                NS.bumpStat('replies'); NS.dailyIncrement('replies');
                NS.pushLog('reply', `✅ "${selected.slice(0, 30)}"`);
                return 1;
            }
        } catch(e){}
        return 0;
    };

    // ═══ Follow Engagers ═══
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
                if (NS.state.engagerAttempts[handle] > 3) delete NS.state.engagerAttempts[handle];
                NS.saveSettings();
                return 0;
            }
            const followBtn = NS.collectAllFollowButtons().find(b => b.handle === handle);
            if (!followBtn || NS.state.dryRun) return 0;
            NS.rateRecord(); NS.fire(followBtn.btn);
            if (!await NS.sleepGen(2000, myGen)) return 0;
            if (NS.isAlreadyFollowing(followBtn.btn)) {
                NS.bumpStat('engagerFollows'); NS.dailyIncrement('engagerFollows');
                NS.pushLog('engager', `✅ ${handle}`);
                return 1;
            }
        } catch(e){}
        return 0;
    };

    NS.collectEngagers = function () {
        if (!NS.state.followEngagers || !location.pathname.includes('/notifications')) return;
        const notifications = document.querySelectorAll('[data-testid="notification"], [role="article"]');
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
        if (!NS.state.trackUnfollowers || !location.pathname.includes('/followers')) return;
        const handles = new Set();
        document.querySelectorAll('a[href^="/profile/"]').forEach(a => {
            if (NS.isInsidePanel(a)) return;
            const h = a.getAttribute('href').replace('/profile/','').split('/')[0];
            if (h && h !== NS.state.myHandle) handles.add(h);
        });
        if (handles.size === 0) return;
        const prev = new Set(NS.state.knownFollowers);
        const lost = Array.from(prev).filter(h => !handles.has(h));
        if (lost.length > 0 && prev.size > 0) {
            lost.slice(0, 5).forEach(h => NS.pushLog('unfollower', `👋 ${h}`));
        }
        const merged = new Set([...NS.state.knownFollowers, ...handles]);
        NS.state.knownFollowers = Array.from(merged).slice(-2000);
        NS.forceSaveSettings();
    };
})();