const express = require('express');
const path    = require('path');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { q, initDB } = require('./db');  // ✅ تم التصحيح: استيراد من db.js وليس database.js

const app = express();
app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const JWT_SECRET  = process.env.JWT_SECRET  || 'hostaka-secret-2026';
const JWT_EXPIRES = '30d';

function signToken(user) {
  return jwt.sign({ id:user.id, username:user.username, role:user.role, avatar:user.avatar||'' }, JWT_SECRET, { expiresIn:JWT_EXPIRES });
}
function verifyToken(req) {
  const token = (req.headers['authorization']||'').replace('Bearer ','').trim();
  if (!token) return null;
  try { return jwt.verify(token, JWT_SECRET); } catch(e) { return null; }
}
function requireAuth(req,res,next) {
  const u=verifyToken(req); if(!u) return res.status(401).json({error:'غير مصرح'});
  req.user=u; next();
}
function requireAdmin(req,res,next) {
  const u=verifyToken(req); if(!u) return res.status(401).json({error:'غير مصرح'});
  if(u.role!=='admin') return res.status(403).json({error:'تحتاج صلاحية admin'});
  req.user=u; next();
}

// Auth
app.post('/api/login', async(req,res)=>{
  try{
    const{email,password}=req.body||{};
    if(!email||!password) return res.status(400).json({error:'البريد وكلمة المرور مطلوبان'});
    const user=await q.getUserByEmail(email.trim().toLowerCase());
    if(!user||!bcrypt.compareSync(password,user.password)) return res.status(401).json({error:'البريد أو كلمة المرور غير صحيحة'});
    res.json({success:true,token:signToken(user),username:user.username,role:user.role,avatar:user.avatar||'',id:user.id});
  }catch(e){res.status(500).json({error:'خطأ في الخادم'});}
});

app.post('/api/register', async(req,res)=>{
  try{
    const{username,email,password}=req.body||{};
    if(!username||!email||!password) return res.status(400).json({error:'جميع الحقول مطلوبة'});
    if(password.length<6) return res.status(400).json({error:'كلمة المرور 6 أحرف على الأقل'});
    const hash=bcrypt.hashSync(password,10);
    const result=await q.createUser(username.trim(),email.trim().toLowerCase(),hash);
    const user={id:Number(result.lastInsertRowid),username:username.trim(),role:'user',avatar:''};
    res.json({success:true,token:signToken(user),username:user.username,role:user.role,avatar:'',id:user.id});
  }catch(e){
    if(e.message?.includes('UNIQUE')) return res.status(400).json({error:'البريد أو اسم المستخدم مستخدم مسبقاً'});
    res.status(500).json({error:'خطأ في الخادم'});
  }
});

app.get('/api/auth/me',(req,res)=>{
  const u=verifyToken(req); if(!u) return res.status(401).json({error:'غير مصرح'});
  res.json({id:u.id,username:u.username,role:u.role,avatar:u.avatar||''});
});

app.get('/api/me', requireAuth, async (req, res) => {
  try {
    const user = await q.getUserById(req.user.id);
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    const followersCount = await q.countFollowers(user.id);
    const followingCount = await q.countFollowing(user.id);
    res.json({ ...user, followers_count: followersCount, following_count: followingCount });
  } catch(e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

app.post('/api/logout',(_,res)=>res.json({success:true}));

// Profile
app.get('/api/profile/:username', async (req, res) => {
  try {
    const token = (req.headers['authorization'] || '').replace('Bearer ', '').trim();
    let viewerId = null;
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        viewerId = decoded.id;
      } catch (e) { }
    }
    const user = await q.getPublicProfile(req.params.username, viewerId);
    if (!user) return res.status(404).json({ error: 'غير موجود' });
    res.json(user);
  } catch(e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});
app.put('/api/profile', requireAuth, async (req, res) => {
  try {
    const { display_name, bio, game_id, avatar, cover } = req.body || {};
    await q.updateProfile(display_name || '', bio || '', game_id || '', avatar || '', cover || '', req.user.id);
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// Users
app.get('/api/users', async (req, res) => {
  try {
    res.json(await q.listPublicUsers());
  } catch(e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});
app.get('/api/users/search', requireAuth, async (req, res) => {
  try {
    res.json(await q.searchUsers(req.query.q || ''));
  } catch(e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});
app.get('/api/user/:username/posts', async (req, res) => {
  try {
    const u = await q.getPublicProfile(req.params.username);
    if (!u) return res.status(404).json({ error: 'غير موجود' });
    res.json(await q.getUserPosts(u.id));
  } catch(e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// Upload
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
    const r = await fetch('https://api.imgbb.com/1/upload', { method: 'POST', body: form });
    const data = await r.json();
    if (!data.success) return res.status(500).json({ error: 'فشل الرفع' });
    res.json({ url: data.data.url });
  } catch(e) {
    res.status(500).json({ error: 'خطأ: ' + e.message });
  }
});

// Posts
app.get('/api/records', async (req, res) => {
  try {
    const records = await q.listRecords();
    if (!records.length) return res.json([]);
    const u = verifyToken(req);
    const [allR, allC, urList] = await Promise.all([
      q.getAllReactions(),
      q.getAllComments(),
      u ? q.getUserAllReactions(u.id) : Promise.resolve([])
    ]);
    const rMap = {}, cMap = {}, urMap = {};
    allR.forEach(r => {
      if (!rMap[r.record_id]) rMap[r.record_id] = [];
      rMap[r.record_id].push({ emoji: r.emoji, count: r.count });
    });
    allC.forEach(c => {
      if (!cMap[c.record_id]) cMap[c.record_id] = [];
      cMap[c.record_id].push(c);
    });
    urList.forEach(r => { urMap[r.record_id] = r.emoji; });
    res.json(records.map(r => ({
      ...r,
      reactions: rMap[r.id] || [],
      comments: cMap[r.id] || [],
      userReaction: urMap[r.id] || null
    })));
  } catch(e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

app.post('/api/records', requireAuth, async (req, res) => {
  try {
    const { content, image } = req.body || {};
    if (!content?.trim() && !image) return res.status(400).json({ error: 'المحتوى مطلوب' });
    const user = await q.getUserById(req.user.id);
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    const result = await q.createRecord(
      user.id,
      user.display_name || user.username,
      user.role === 'admin' ? 'Admin' : 'Member',
      user.avatar || '',
      content?.trim() || '',
      image || ''
    );
    res.json({ success: true, id: Number(result.lastInsertRowid) });
  } catch(e) {
    res.status(500).json({ error: 'خطأ: ' + e.message });
  }
});

app.delete('/api/records/:id', requireAuth, async (req, res) => {
  try {
    const rec = await q.getRecord(req.params.id);
    if (!rec) return res.status(404).json({ error: 'غير موجود' });
    if (req.user.role !== 'admin' && rec.user_id != req.user.id) {
      return res.status(403).json({ error: 'غير مسموح' });
    }
    await q.deleteRecord(req.params.id);
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

app.post('/api/records/:id/react', requireAuth, async (req, res) => {
  try {
    const { emoji } = req.body || {};
    const ex = await q.getUserReaction(req.params.id, req.user.id);
    if (ex && ex.emoji === emoji) {
      await q.removeReaction(req.params.id, req.user.id);
    } else {
      await q.addReaction(req.params.id, req.user.id, emoji || 'like');
    }
    const reactions = await q.getReactions(req.params.id);
    const userReaction = (await q.getUserReaction(req.params.id, req.user.id))?.emoji || null;
    res.json({ success: true, reactions, userReaction });
  } catch(e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

app.get('/api/records/:id/comments', async (req, res) => {
  try {
    res.json(await q.getComments(req.params.id));
  } catch(e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

app.post('/api/records/:id/comments', requireAuth, async (req, res) => {
  try {
    const { content } = req.body || {};
    if (!content?.trim()) return res.status(400).json({ error: 'فارغ' });
    const user = await q.getUserById(req.user.id);
    await q.addComment(
      req.params.id,
      user.id,
      user.username,
      user.display_name || '',
      user.avatar || '',
      user.role === 'admin' ? 'Admin' : 'Member',
      content.trim()
    );
    const comments = await q.getComments(req.params.id);
    res.json({ success: true, comments });
  } catch(e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

app.delete('/api/comments/:id', requireAuth, async (req, res) => {
  try {
    await q.deleteComment(req.params.id, req.user.id, req.user.role);
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// Verify
app.post('/api/verify/request', requireAuth, async (req, res) => {
  try {
    const user = await q.getUserById(req.user.id);
    if (user?.verified) return res.status(400).json({ error: 'حسابك موثق مسبقاً' });
    const ex = await q.getUserVerifyStatus(req.user.id);
    if (ex?.status === 'pending') return res.status(400).json({ error: 'طلبك قيد المراجعة' });
    await q.requestVerify(req.user.id, user.username);
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});
app.get('/api/verify/status', requireAuth, async (req, res) => {
  try {
    const u = await q.getUserById(req.user.id);
    const r = await q.getUserVerifyStatus(req.user.id);
    res.json({ verified: !!u?.verified, status: r?.status || null });
  } catch(e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});
app.get('/api/admin/verify', requireAdmin, async (req, res) => {
  try {
    res.json(await q.getVerifyRequests());
  } catch(e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});
app.put('/api/admin/verify/:userId', requireAdmin, async (req, res) => {
  try {
    const { action } = req.body || {};
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'action غير صحيح' });
    }
    await q.updateVerify(req.params.userId, action === 'approve' ? 'approved' : 'rejected');
    if (action === 'approve') await q.setVerified(req.params.userId, 1);
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// ============================================================
// FOLLOW SYSTEM
// ============================================================
app.post('/api/follow/:username', requireAuth, async (req, res) => {
  try {
    const followed = await q.getPublicProfile(req.params.username);
    if (!followed) return res.status(404).json({ error: 'المستخدم غير موجود' });
    if (followed.id === req.user.id) {
      return res.status(400).json({ error: 'لا يمكنك متابعة نفسك' });
    }
    await q.followUser(req.user.id, followed.id);
    res.json({ success: true, following: true });
  } catch(e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

app.delete('/api/follow/:username', requireAuth, async (req, res) => {
  try {
    const followed = await q.getPublicProfile(req.params.username);
    if (!followed) return res.status(404).json({ error: 'المستخدم غير موجود' });
    await q.unfollowUser(req.user.id, followed.id);
    res.json({ success: true, following: false });
  } catch(e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

app.get('/api/follow/status/:username', async (req, res) => {
  try {
    const token = (req.headers['authorization'] || '').replace('Bearer ', '').trim();
    let viewerId = null;
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        viewerId = decoded.id;
      } catch (e) { }
    }
    const user = await q.getPublicProfile(req.params.username, viewerId);
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    res.json({
      following: user.is_following || false,
      followers_count: user.followers_count || 0,
      following_count: user.following_count || 0
    });
  } catch(e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

app.get('/api/followers/:username', async (req, res) => {
  try {
    const user = await q.getPublicProfile(req.params.username);
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    const followers = await q.getFollowers(user.id);
    res.json(followers);
  } catch(e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

app.get('/api/following/:username', async (req, res) => {
  try {
    const user = await q.getPublicProfile(req.params.username);
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    const following = await q.getFollowing(user.id);
    res.json(following);
  } catch(e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// ============================================================
// Messages
// ============================================================
app.get('/api/messages/unread', requireAuth, async (req, res) => {
  try {
    res.json(await q.unreadCount(req.user.id));
  } catch(e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});
app.get('/api/messages/conversations', requireAuth, async (req, res) => {
  try {
    res.json(await q.getConversations(req.user.id));
  } catch(e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});
app.get('/api/messages/:username', requireAuth, async (req, res) => {
  try {
    const other = await q.getPublicProfile(req.params.username);
    if (!other) return res.status(404).json({ error: 'غير موجود' });
    await q.markRead(other.id, req.user.id);
    res.json(await q.getMessages(req.user.id, other.id));
  } catch(e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});
app.post('/api/messages/:username', requireAuth, async (req, res) => {
  try {
    const { content, image } = req.body || {};
    if (!content?.trim() && !image) return res.status(400).json({ error: 'فارغة' });
    const other = await q.getPublicProfile(req.params.username);
    if (!other) return res.status(404).json({ error: 'غير موجود' });
    const me = await q.getUserById(req.user.id);
    await q.sendMessage(
      me.id,
      other.id,
      me.display_name || me.username,
      other.display_name || other.username,
      content?.trim() || '',
      image || ''
    );
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});
app.post('/api/messages/react/:id', requireAuth, async (req, res) => {
  try {
    const { emoji } = req.body || {};
    const ex = await q.getUserMsgReaction(req.params.id, req.user.id);
    if (ex && ex.emoji === emoji) {
      await q.removeMsgReaction(req.params.id, req.user.id);
    } else {
      await q.addMsgReaction(req.params.id, req.user.id, emoji || 'heart');
    }
    const reactions = await q.getMsgReactions(req.params.id);
    const userReaction = (await q.getUserMsgReaction(req.params.id, req.user.id))?.emoji || null;
    res.json({ success: true, reactions, userReaction });
  } catch(e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// ============================================================
// Groups
// ============================================================
app.get('/api/groups', requireAuth, async (req, res) => {
  try {
    res.json(await q.getUserGroups(req.user.id));
  } catch(e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});
app.post('/api/groups', requireAuth, async (req, res) => {
  try {
    const { name, description, avatar, theme, background, members } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ error: 'الاسم مطلوب' });
    const result = await q.createGroup(
      name.trim(),
      description || '',
      avatar || '',
      theme || 'default',
      background || 'default',
      req.user.id
    );
    const gid = Number(result.lastInsertRowid);
    await q.addGroupMember(gid, req.user.id, 'admin');
    if (Array.isArray(members)) {
      for (const uid of members) {
        if (uid != req.user.id) await q.addGroupMember(gid, uid, 'member');
      }
    }
    res.json({ success: true, id: gid });
  } catch(e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});
app.get('/api/groups/:id', requireAuth, async (req, res) => {
  try {
    const m = await q.isMember(req.params.id, req.user.id);
    if (!m) return res.status(403).json({ error: 'لست عضواً' });
    const [group, members] = await Promise.all([
      q.getGroup(req.params.id),
      q.getGroupMembers(req.params.id)
    ]);
    res.json({ ...group, members });
  } catch(e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});
app.put('/api/groups/:id', requireAuth, async (req, res) => {
  try {
    const m = await q.isMember(req.params.id, req.user.id);
    if (!m || m.role === 'member') return res.status(403).json({ error: 'غير مسموح' });
    const { name, description, avatar, theme, background } = req.body || {};
    await q.updateGroup(
      req.params.id,
      name || '',
      description || '',
      avatar || '',
      theme || 'default',
      background || 'default'
    );
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});
app.delete('/api/groups/:id', requireAuth, async (req, res) => {
  try {
    const m = await q.isMember(req.params.id, req.user.id);
    if (!m || m.role !== 'admin') return res.status(403).json({ error: 'فقط admin' });
    await q.deleteGroup(req.params.id);
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});
app.post('/api/groups/:id/members', requireAuth, async (req, res) => {
  try {
    const m = await q.isMember(req.params.id, req.user.id);
    if (!m || m.role === 'member') return res.status(403).json({ error: 'غير مسموح' });
    const { user_id, role } = req.body || {};
    await q.addGroupMember(req.params.id, user_id, role || 'member');
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});
app.delete('/api/groups/:id/members/:uid', requireAuth, async (req, res) => {
  try {
    const m = await q.isMember(req.params.id, req.user.id);
    const isSelf = parseInt(req.params.uid) === req.user.id;
    if (!isSelf && (!m || m.role === 'member')) {
      return res.status(403).json({ error: 'غير مسموح' });
    }
    await q.removeGroupMember(req.params.id, req.params.uid);
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});
app.put('/api/groups/:id/members/:uid/role', requireAuth, async (req, res) => {
  try {
    const m = await q.isMember(req.params.id, req.user.id);
    if (!m || m.role !== 'admin') return res.status(403).json({ error: 'فقط admin' });
    await q.updateMemberRole(req.params.id, req.params.uid, req.body?.role || 'member');
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});
app.put('/api/groups/:id/members/:uid/nickname', requireAuth, async (req, res) => {
  try {
    await q.updateMemberNick(req.params.id, req.params.uid, req.body?.nickname || '');
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});
app.get('/api/groups/:id/messages', requireAuth, async (req, res) => {
  try {
    const m = await q.isMember(req.params.id, req.user.id);
    if (!m) return res.status(403).json({ error: 'لست عضواً' });
    res.json(await q.getGroupMessages(req.params.id));
  } catch(e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});
app.post('/api/groups/:id/messages', requireAuth, async (req, res) => {
  try {
    const m = await q.isMember(req.params.id, req.user.id);
    if (!m) return res.status(403).json({ error: 'لست عضواً' });
    const { content, image } = req.body || {};
    if (!content?.trim() && !image) return res.status(400).json({ error: 'فارغة' });
    const user = await q.getUserById(req.user.id);
    await q.sendGroupMessage(
      req.params.id,
      user.id,
      user.display_name || user.username,
      user.avatar || '',
      content?.trim() || '',
      image || ''
    );
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});
app.post('/api/groups/:gid/messages/:mid/react', requireAuth, async (req, res) => {
  try {
    const { emoji } = req.body || {};
    const ex = await q.getUserGroupMsgReaction(req.params.mid, req.user.id);
    if (ex && ex.emoji === emoji) {
      await q.removeGroupMsgReaction(req.params.mid, req.user.id);
    } else {
      await q.addGroupMsgReaction(req.params.mid, req.user.id, emoji || 'heart');
    }
    const reactions = await q.getGroupMsgReactions(req.params.mid);
    const userReaction = (await q.getUserGroupMsgReaction(req.params.mid, req.user.id))?.emoji || null;
    res.json({ success: true, reactions, userReaction });
  } catch(e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// ============================================================
// Admin
// ============================================================
app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    res.json(await q.listUsers());
  } catch(e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});
app.put('/api/admin/users/:id/role', requireAdmin, async (req, res) => {
  try {
    const { role } = req.body || {};
    if (!['user', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'role غير صحيح' });
    }
    await q.updateUserRole(role, req.params.id);
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});
app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
  try {
    await q.deleteUser(req.params.id);
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// ============================================================
// Pages
// ============================================================
app.get('/admin',   (_, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/profile', (_, res) => res.sendFile(path.join(__dirname, 'public', 'profile.html')));
app.get('/chat',    (_, res) => res.sendFile(path.join(__dirname, 'public', 'chat.html')));
app.get('/group',   (_, res) => res.sendFile(path.join(__dirname, 'public', 'group.html')));
app.get('*',        (_, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ============================================================
// Start
// ============================================================
const PORT = process.env.PORT || 3000;
initDB()
  .then(() => app.listen(PORT, () => console.log(`Hostaka running on port ${PORT}`)))
  .catch(err => { console.error('DB init failed:', err); process.exit(1); });

module.exports = app;