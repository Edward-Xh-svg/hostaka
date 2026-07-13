const express = require('express');
const path    = require('path');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { q, initDB } = require('./database');

const app = express();
app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const JWT_SECRET = process.env.JWT_SECRET || 'hostaka-secret-change-in-production';
const JWT_EXPIRES = '30d';

// ==================== JWT Auth ====================
function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role, avatar: user.avatar||'' },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

function verifyToken(req) {
  const token = (req.headers['authorization'] || '').replace('Bearer ', '').trim();
  if (!token) return null;
  try { return jwt.verify(token, JWT_SECRET); }
  catch(e) { return null; }
}

function requireAuth(req, res, next) {
  const user = verifyToken(req);
  if (!user) return res.status(401).json({ error: 'غير مصرح — سجّل دخولك' });
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  const user = verifyToken(req);
  if (!user) return res.status(401).json({ error: 'غير مصرح' });
  if (user.role !== 'admin') return res.status(403).json({ error: 'تحتاج صلاحية admin' });
  req.user = user;
  next();
}

// ==================== Auth ====================
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'البريد وكلمة المرور مطلوبان' });
    const user = await q.getUserByEmail(email.trim().toLowerCase());
    if (!user || !bcrypt.compareSync(password, user.password))
      return res.status(401).json({ error: 'البريد أو كلمة المرور غير صحيحة' });
    const token = signToken(user);
    res.json({ success:true, token, username:user.username, role:user.role, avatar:user.avatar||'', id:user.id });
  } catch(e) { console.error(e); res.status(500).json({ error: 'خطأ في الخادم' }); }
});

app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password } = req.body || {};
    if (!username || !email || !password) return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
    if (password.length < 6) return res.status(400).json({ error: 'كلمة المرور 6 أحرف على الأقل' });
    const hash = bcrypt.hashSync(password, 10);
    const result = await q.createUser(username.trim(), email.trim().toLowerCase(), hash);
    const user = { id: Number(result.lastInsertRowid), username: username.trim(), role:'user', avatar:'' };
    const token = signToken(user);
    res.json({ success:true, token, username:user.username, role:user.role, avatar:'', id:user.id });
  } catch(e) {
    if (e.message?.includes('UNIQUE')) return res.status(400).json({ error: 'البريد أو اسم المستخدم مستخدم مسبقاً' });
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// /api/auth/me - سريع من JWT بدون DB (للتحقق الفوري)
app.get('/api/auth/me', (req, res) => {
  const user = verifyToken(req);
  if (!user) return res.status(401).json({ error: 'غير مصرح' });
  res.json({ id:user.id, username:user.username, role:user.role, avatar:user.avatar||'' });
});

// /api/me - يجلب أحدث البيانات من DB
app.get('/api/me', requireAuth, async (req, res) => {
  try {
    const user = await q.getUserById(req.user.id);
    res.json(user || req.user);
  } catch(e) { res.json(req.user); }
});

app.post('/api/logout', (req, res) => {
  // JWT stateless — لا نحتاج حذف شيء من الخادم
  res.json({ success: true });
});

// ==================== Profile ====================
app.get('/api/profile/:username', async (req, res) => {
  try {
    const user = await q.getPublicProfile(req.params.username);
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    res.json(user);
  } catch(e) { res.status(500).json({ error: 'خطأ في الخادم' }); }
});

app.put('/api/profile', requireAuth, async (req, res) => {
  try {
    const { display_name, bio, game_id, avatar, cover } = req.body || {};
    await q.updateProfile(display_name||'', bio||'', game_id||'', avatar||'', cover||'', req.user.id);
    res.json({ success:true });
  } catch(e) { res.status(500).json({ error: 'خطأ في الخادم' }); }
});

// ==================== Users ====================
app.get('/api/users', async (req, res) => {
  try { res.json(await q.listPublicUsers()); }
  catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

app.get('/api/users/search', requireAuth, async (req, res) => {
  try { res.json(await q.searchUsers(req.query.q || '')); }
  catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

// ==================== Upload (imgbb) ====================
app.post('/api/upload', requireAuth, async (req, res) => {
  try {
    const { image } = req.body || {};
    if (!image) return res.status(400).json({ error: 'لا توجد صورة' });
    const apiKey = process.env.IMGBB_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'IMGBB_API_KEY غير مُعدّ' });
    const base64 = image.includes(',') ? image.split(',')[1] : image;
    const form = new URLSearchParams();
    form.append('key', apiKey);
    form.append('image', base64);
    const r = await fetch('https://api.imgbb.com/1/upload', { method:'POST', body:form });
    const data = await r.json();
    if (!data.success) return res.status(500).json({ error: 'فشل الرفع على imgbb' });
    res.json({ url: data.data.url });
  } catch(e) { res.status(500).json({ error: 'خطأ: '+e.message }); }
});

// ==================== Admin: Users ====================
app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try { res.json(await q.listUsers()); } catch(e) { res.status(500).json({ error:'خطأ' }); }
});
app.put('/api/admin/users/:id/role', requireAdmin, async (req, res) => {
  try {
    const { role } = req.body||{};
    if (!['user','admin'].includes(role)) return res.status(400).json({ error:'role غير صحيح' });
    await q.updateUserRole(role, req.params.id);
    res.json({ success:true });
  } catch(e) { res.status(500).json({ error:'خطأ' }); }
});
app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
  try { await q.deleteUser(req.params.id); res.json({ success:true }); }
  catch(e) { res.status(500).json({ error:'خطأ' }); }
});

// ==================== Records ====================
app.get('/api/records', async (req, res) => {
  try {
    const records = await q.listRecords();
    if (!records.length) return res.json([]);

    const u = verifyToken(req);

    // جلب كل الـ reactions والـ comments دفعة واحدة بدل N+1 queries
    const [allReactions, allComments, userReactions] = await Promise.all([
      q.getAllReactions(),
      q.getAllComments(),
      u ? q.getUserAllReactions(u.id) : Promise.resolve([]),
    ]);

    // تجميع البيانات في memory بدل استدعاء DB لكل منشور
    const reactionsMap = {};
    allReactions.forEach(r => {
      if (!reactionsMap[r.record_id]) reactionsMap[r.record_id] = [];
      reactionsMap[r.record_id].push({ emoji: r.emoji, count: r.count });
    });

    const commentsMap = {};
    allComments.forEach(c => {
      if (!commentsMap[c.record_id]) commentsMap[c.record_id] = [];
      commentsMap[c.record_id].push(c);
    });

    const userReactionMap = {};
    userReactions.forEach(r => { userReactionMap[r.record_id] = r.emoji; });

    const enriched = records.map(r => ({
      ...r,
      reactions:    reactionsMap[r.id]    || [],
      comments:     commentsMap[r.id]     || [],
      userReaction: userReactionMap[r.id] || null,
    }));

    res.json(enriched);
  } catch(e) { console.error(e); res.status(500).json({ error:'خطأ' }); }
});

app.post('/api/records', requireAuth, async (req, res) => {
  try {
    const { content, image } = req.body||{};
    if (!content?.trim()) return res.status(400).json({ error:'المحتوى مطلوب' });
    const user = await q.getUserById(req.user.id);
    if (!user) return res.status(404).json({ error:'المستخدم غير موجود' });
    const publisher   = user.display_name || user.username;
    const user_role   = user.role === 'admin' ? 'Admin' : 'Member';
    const user_avatar = user.avatar || '';
    const r = await q.createRecord(user.id, publisher, user_role, user_avatar, content.trim(), image||'');
    res.json({ success:true, id:Number(r.lastInsertRowid) });
  } catch(e) { res.status(500).json({ error:'خطأ: '+e.message }); }
});

app.delete('/api/records/:id', requireAuth, async (req, res) => {
  try {
    const record = await q.getRecord(req.params.id);
    if (!record) return res.status(404).json({ error:'غير موجود' });
    if (req.user.role !== 'admin' && record.user_id != req.user.id)
      return res.status(403).json({ error:'غير مسموح' });
    await q.deleteRecord(req.params.id);
    res.json({ success:true });
  } catch(e) { res.status(500).json({ error:'خطأ' }); }
});

// Reactions
app.post('/api/records/:id/react', requireAuth, async (req, res) => {
  try {
    const { emoji } = req.body||{};
    const existing = await q.getUserReaction(req.params.id, req.user.id);
    if (existing && existing.emoji === emoji) {
      await q.removeReaction(req.params.id, req.user.id);
    } else {
      await q.addReaction(req.params.id, req.user.id, emoji||'like');
    }
    const reactions = await q.getReactions(req.params.id);
    const userReaction = await q.getUserReaction(req.params.id, req.user.id);
    res.json({ success:true, reactions, userReaction: userReaction?.emoji||null });
  } catch(e) { res.status(500).json({ error:'خطأ' }); }
});

// Comments
app.get('/api/records/:id/comments', async (req, res) => {
  try { res.json(await q.getComments(req.params.id)); }
  catch(e) { res.status(500).json({ error:'خطأ' }); }
});

app.post('/api/records/:id/comments', requireAuth, async (req, res) => {
  try {
    const { content } = req.body||{};
    if (!content?.trim()) return res.status(400).json({ error:'التعليق فارغ' });
    const user = await q.getUserById(req.user.id);
    const user_role = user.role === 'admin' ? 'Admin' : 'Member';
    await q.addComment(req.params.id, user.id, user.username, user.display_name||'', user.avatar||'', user_role, content.trim());
    const comments = await q.getComments(req.params.id);
    res.json({ success:true, comments });
  } catch(e) { res.status(500).json({ error:'خطأ' }); }
});

app.delete('/api/comments/:id', requireAuth, async (req, res) => {
  try {
    await q.deleteComment(req.params.id, req.user.id, req.user.role);
    res.json({ success:true });
  } catch(e) { res.status(500).json({ error:'خطأ' }); }
});

// ==================== Verify Requests ====================
// طلب توثيق
app.post('/api/verify/request', requireAuth, async (req, res) => {
  try {
    const user = await q.getUserById(req.user.id);
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    if (user.verified) return res.status(400).json({ error: 'حسابك موثق مسبقاً' });
    const existing = await q.getUserVerifyStatus(req.user.id);
    if (existing?.status === 'pending') return res.status(400).json({ error: 'طلبك قيد المراجعة بالفعل' });
    await q.requestVerify(req.user.id, user.username);
    res.json({ success: true, message: 'تم إرسال طلب التوثيق' });
  } catch(e) { res.status(500).json({ error: 'خطأ: ' + e.message }); }
});

// حالة طلب التوثيق
app.get('/api/verify/status', requireAuth, async (req, res) => {
  try {
    const user = await q.getUserById(req.user.id);
    const req_ = await q.getUserVerifyStatus(req.user.id);
    res.json({ verified: !!user?.verified, status: req_?.status || null });
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

// قائمة طلبات التوثيق (admin)
app.get('/api/admin/verify', requireAdmin, async (req, res) => {
  try { res.json(await q.getVerifyRequests()); }
  catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

// موافقة أو رفض
app.put('/api/admin/verify/:userId', requireAdmin, async (req, res) => {
  try {
    const { action } = req.body || {};
    if (!['approve','reject'].includes(action))
      return res.status(400).json({ error: 'action غير صحيح' });
    await q.updateVerify(req.params.userId, action === 'approve' ? 'approved' : 'rejected');
    if (action === 'approve') await q.setVerified(req.params.userId, 1);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

// ==================== Groups ====================
app.get('/api/groups', requireAuth, async (req, res) => {
  try { res.json(await q.getUserGroups(req.user.id)); }
  catch(e) { res.status(500).json({ error:'خطأ' }); }
});

app.post('/api/groups', requireAuth, async (req, res) => {
  try {
    const { name, description, avatar, theme, members } = req.body||{};
    if (!name?.trim()) return res.status(400).json({ error:'اسم المجموعة مطلوب' });
    const r = await q.createGroup(name.trim(), description||'', avatar||'', theme||'default', req.user.id);
    const gid = Number(r.lastInsertRowid);
    await q.addGroupMember(gid, req.user.id, 'admin');
    if (Array.isArray(members)) {
      for (const uid of members) {
        if (uid !== req.user.id) await q.addGroupMember(gid, uid, 'member');
      }
    }
    res.json({ success:true, id:gid });
  } catch(e) { res.status(500).json({ error:'خطأ' }); }
});

app.get('/api/groups/:id', requireAuth, async (req, res) => {
  try {
    const member = await q.isMember(req.params.id, req.user.id);
    if (!member) return res.status(403).json({ error:'لست عضواً في هذه المجموعة' });
    const [group, members] = await Promise.all([q.getGroup(req.params.id), q.getGroupMembers(req.params.id)]);
    res.json({ ...group, members });
  } catch(e) { res.status(500).json({ error:'خطأ' }); }
});

app.put('/api/groups/:id', requireAuth, async (req, res) => {
  try {
    const m = await q.isMember(req.params.id, req.user.id);
    if (!m || m.role === 'member') return res.status(403).json({ error:'غير مسموح' });
    const { name, description, avatar, theme } = req.body||{};
    await q.updateGroup(req.params.id, name||'', description||'', avatar||'', theme||'default');
    res.json({ success:true });
  } catch(e) { res.status(500).json({ error:'خطأ' }); }
});

app.delete('/api/groups/:id', requireAuth, async (req, res) => {
  try {
    const m = await q.isMember(req.params.id, req.user.id);
    if (!m || m.role !== 'admin') return res.status(403).json({ error:'فقط admin المجموعة يمكنه الحذف' });
    await q.deleteGroup(req.params.id);
    res.json({ success:true });
  } catch(e) { res.status(500).json({ error:'خطأ' }); }
});

app.post('/api/groups/:id/members', requireAuth, async (req, res) => {
  try
