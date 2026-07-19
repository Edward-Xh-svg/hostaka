const express = require('express');
const path    = require('path');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { q, initDB } = require('./database');

// ===== استيراد node-fetch و crypto =====
const fetch  = require('node-fetch');
const crypto = require('crypto');

const app = express();
app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const JWT_SECRET  = process.env.JWT_SECRET  || 'hostaka-secret-2026';
const JWT_EXPIRES = '30d';

// ===== شخصية Shizi AI (مبنية على Gemini) =====
const SHIZI_SYSTEM_PROMPT = `أنتِ "شيزي" (Shizi AI)، المساعدة الذكية الرسمية لمنصة Hostaka.
Hostaka هي منصة تواصل اجتماعي ناشئة (وليست منصة استضافة/hosting رغم تشابه الاسم). المديرة والمطوّرة الرئيسية للمنصة هي مريم الغافوري، المعروفة أيضاً بلقب "ميشا".
شخصيتك: احترافية، واضحة، ومتعاونة. تتحدثين بأسلوب راقٍ ومباشر، وتستخدمين اللغة العربية بشكل أساسي (إلا إذا كتب المستخدم بلغة أخرى، فحينها تجاوبين بنفس لغته).
لا تستخدمي أي رموز تعبيرية (إيموجي) في ردودك مطلقاً.
مهمتك مساعدة مستخدمي Hostaka في أي استفسار: عن المنصة، أو الدردشة العامة، أو الأسئلة العلمية والتقنية، أو كتابة نصوص، أو حل المشاكل.
كوني دقيقة ومختصرة قدر الإمكان، وواضحة في إجاباتك، ولا تختلقي معلومات لا تعرفينها.
لا تفصحي عن الجهة التقنية المبنية عليها إلا إذا سُئلتِ صراحة عن ذلك.`;

const SHIZI_DAILY_LIMIT = 50;

// دالة مساعدة للانتظار (تستخدم عند إعادة المحاولة للـ API)
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ============================================================
// تأكيد البريد الإلكتروني عبر Resend — لمنع الحسابات الوهمية
// ============================================================
const CODE_TTL_MINUTES   = 10;   // صلاحية الكود بالدقائق
const RESEND_COOLDOWN_S  = 45;   // مدة الانتظار قبل إعادة إرسال الكود (ثواني)
const MAX_CODE_ATTEMPTS  = 5;    // أقصى عدد محاولات لإدخال الكود

function generateCode() {
  return String(crypto.randomInt(100000, 999999)); // كود من 6 أرقام
}

// يحوّل نص تاريخ SQLite (UTC, "YYYY-MM-DD HH:MM:SS") إلى Date صحيح
function parseSqliteUTC(str) {
  return new Date(String(str).replace(' ', 'T') + 'Z');
}

async function sendVerificationEmail(email, username, code) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY غير مُعدّ على الخادم');
  const from = process.env.RESEND_FROM_EMAIL || 'Hostaka <onboarding@resend.dev>';

  const html = `
  <div style="font-family:'Cairo',Tahoma,sans-serif;background:#f7f7f8;padding:32px 0;direction:rtl">
    <div style="max-width:420px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px;border:1px solid #eee">
      <h2 style="margin:0 0 8px;color:#111;font-size:20px;">أهلاً ${username} 👋</h2>
      <p style="margin:0 0 20px;color:#555;font-size:14px;line-height:1.7">
        شكراً لتسجيلك في <b>Hostaka</b>. لإكمال إنشاء حسابك، استخدم كود التأكيد التالي:
      </p>
      <div style="text-align:center;margin:20px 0;">
        <span style="display:inline-block;background:#f5f5f5;border-radius:12px;padding:14px 28px;font-size:30px;font-weight:800;letter-spacing:8px;color:#111;">${code}</span>
      </div>
      <p style="margin:0;color:#888;font-size:13px;">
        هذا الكود صالح لمدة ${CODE_TTL_MINUTES} دقائق. إذا لم تطلب إنشاء حساب، يمكنك تجاهل هذه الرسالة.
      </p>
    </div>
  </div>`;

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [email], subject: `كود تأكيد حسابك في Hostaka: ${code}`, html }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.error('❌ Resend error:', data);
    throw new Error(data?.message || 'تعذر إرسال بريد التأكيد');
  }
  return data;
}

async function sendPasswordResetEmail(email, username, code) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY غير مُعدّ على الخادم');
  const from = process.env.RESEND_FROM_EMAIL || 'Hostaka <onboarding@resend.dev>';

  const html = `
  <div style="font-family:'Cairo',Tahoma,sans-serif;background:#f7f7f8;padding:32px 0;direction:rtl">
    <div style="max-width:420px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px;border:1px solid #eee">
      <h2 style="margin:0 0 8px;color:#111;font-size:20px;">مرحباً ${username || ''} 🔒</h2>
      <p style="margin:0 0 20px;color:#555;font-size:14px;line-height:1.7">
        وصلنا طلب لإعادة تعيين كلمة المرور لحسابك في <b>Hostaka</b>. استخدم الكود التالي لإتمام العملية:
      </p>
      <div style="text-align:center;margin:20px 0;">
        <span style="display:inline-block;background:#f5f5f5;border-radius:12px;padding:14px 28px;font-size:30px;font-weight:800;letter-spacing:8px;color:#111;">${code}</span>
      </div>
      <p style="margin:0;color:#888;font-size:13px;">
        هذا الكود صالح لمدة ${CODE_TTL_MINUTES} دقائق. إذا لم تطلب إعادة تعيين كلمة المرور، تجاهل هذه الرسالة ولن يتغير شيء في حسابك.
      </p>
    </div>
  </div>`;

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [email], subject: `كود إعادة تعيين كلمة المرور في Hostaka: ${code}`, html }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.error('❌ Resend error:', data);
    throw new Error(data?.message || 'تعذر إرسال بريد إعادة التعيين');
  }
  return data;
}

function signToken(user) {
  return jwt.sign({ id:user.id, username:user.username, role:user.role, avatar:user.avatar||'' }, JWT_SECRET, { expiresIn:JWT_EXPIRES });
}
function verifyToken(req) {
  const token = (req.headers['authorization']||'').replace('Bearer ','').trim();
  if (!token) return null;
  try { return jwt.verify(token, JWT_SECRET); } catch(e) { return null; }
}
async function requireAuth(req,res,next) {
  const u=verifyToken(req); if(!u) return res.status(401).json({error:'غير مصرح'});
  try {
    const dbUser = await q.getUserById(u.id);
    if (!dbUser) return res.status(401).json({error:'غير مصرح'});
    if (dbUser.suspended) return res.status(403).json({ error:'تم تعليق حسابك' + (dbUser.suspend_reason ? ': ' + dbUser.suspend_reason : ''), suspended:true, reason: dbUser.suspend_reason||'' });
    req.user=u; next();
  } catch(e) { res.status(500).json({error:'خطأ في الخادم'}); }
}
function requireAdmin(req,res,next) {
  const u=verifyToken(req); if(!u) return res.status(401).json({error:'غير مصرح'});
  if(u.role!=='admin') return res.status(403).json({error:'تحتاج صلاحية admin'});
  req.user=u; next();
}

// ============================================================
// نظام الإشعارات — الإشارة (@) والتنبيهات
// ============================================================
// يستخرج أسماء المستخدمين المذكورين بـ @ من نص/HTML المنشور أو التعليق
function extractMentions(html) {
  if (!html) return [];
  const text = String(html).replace(/<[^>]*>/g, ' '); // إزالة وسوم HTML أولاً
  const matches = text.match(/@([A-Za-z0-9_\u0600-\u06FF]{2,32})/g) || [];
  return [...new Set(matches.map(m => m.slice(1)))];
}

// ينشئ إشعارات لكل مستخدم تم ذكره في النص (باستثناء الناشر نفسه)
async function notifyMentions(content, actorUser, recordId, commentId, link) {
  try {
    const usernames = extractMentions(content);
    const notified = new Set();
    for (const uname of usernames) {
      if (uname.toLowerCase() === String(actorUser.username||'').toLowerCase()) continue;
      const uid = await q.getUserIdByUsername(uname);
      if (!uid || notified.has(uid)) continue;
      notified.add(uid);
      await q.createNotification(
        uid,
        commentId ? 'mention_comment' : 'mention_post',
        actorUser.id,
        actorUser.display_name || actorUser.username,
        actorUser.avatar || '',
        recordId || null,
        commentId || null,
        '',
        link || ''
      );
    }
    return notified;
  } catch(e) {
    console.error('notifyMentions error:', e);
    return new Set();
  }
}

// Auth
app.post('/api/login', async(req,res)=>{
  try{
    const{email,password}=req.body||{};
    if(!email||!password) return res.status(400).json({error:'البريد وكلمة المرور مطلوبان'});
    const user=await q.getUserByEmail(email.trim().toLowerCase());
    if(!user||!bcrypt.compareSync(password,user.password)) return res.status(401).json({error:'البريد أو كلمة المرور غير صريحة'});
    if(user.suspended) return res.status(403).json({ error:'تم تعليق حسابك' + (user.suspend_reason ? ': ' + user.suspend_reason : ''), suspended:true, reason:user.suspend_reason||'' });
    res.json({success:true,token:signToken(user),username:user.username,role:user.role,avatar:user.avatar||'',id:user.id});
  }catch(e){res.status(500).json({error:'خطأ في الخادم'});}
});

// هذا المسار القديم أصبح معطلاً، التسجيل الآن يتم عبر تأكيد البريد (انظر /api/auth/register/*)
app.post('/api/register', (req,res)=>{
  res.status(410).json({ error:'الرجاء استخدام صفحة التسجيل الجديدة على /login لإنشاء حساب' });
});

// ============================================================
// التسجيل مع تأكيد البريد عبر كود (Resend) — /login الصفحة الجديدة
// ============================================================

// الخطوة 1: استلام البيانات وإرسال كود التأكيد للبريد
app.post('/api/auth/register/start', async (req, res) => {
  try {
    const { username, email, password } = req.body || {};
    const uname = String(username||'').trim();
    const mail  = String(email||'').trim().toLowerCase();
    if (!uname || !mail || !password) return res.status(400).json({ error:'جميع الحقول مطلوبة' });
    if (uname.length < 3 || uname.length > 32) return res.status(400).json({ error:'اسم المستخدم يجب أن يكون بين 3 و32 حرفاً' });
    if (!/^[A-Za-z0-9_\u0600-\u06FF]+$/.test(uname)) return res.status(400).json({ error:'اسم المستخدم يحتوي على رموز غير مسموحة' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return res.status(400).json({ error:'البريد الإلكتروني غير صحيح' });
    if (password.length < 6) return res.status(400).json({ error:'كلمة المرور 6 أحرف على الأقل' });

    const existingEmail = await q.getUserByEmail(mail);
    if (existingEmail) return res.status(400).json({ error:'البريد الإلكتروني مستخدم مسبقاً' });
    const existingUser = await q.getUserByUsername(uname);
    if (existingUser) return res.status(400).json({ error:'اسم المستخدم مستخدم مسبقاً' });

    const pending = await q.getPendingRegistrationByEmail(mail);
    if (pending) {
      const secsSinceLastSend = (Date.now() - parseSqliteUTC(pending.last_sent_at).getTime()) / 1000;
      if (secsSinceLastSend < RESEND_COOLDOWN_S) {
        return res.status(429).json({ error:`الرجاء الانتظار ${Math.ceil(RESEND_COOLDOWN_S - secsSinceLastSend)} ثانية قبل طلب كود جديد` });
      }
    }

    const code = generateCode();
    const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES*60000).toISOString().replace('T',' ').slice(0,19);
    const hash = bcrypt.hashSync(password, 10);

    await sendVerificationEmail(mail, uname, code);
    await q.upsertPendingRegistration(mail, uname, hash, code, expiresAt);

    res.json({ success:true, email: mail, message:'تم إرسال كود التأكيد إلى بريدك الإلكتروني' });
  } catch(e) {
    console.error('❌ register/start error:', e);
    res.status(500).json({ error: e.message || 'تعذر إرسال كود التأكيد' });
  }
});

// الخطوة 2: إعادة إرسال الكود (مع مهلة بين كل طلب وآخر)
app.post('/api/auth/register/resend', async (req, res) => {
  try {
    const mail = String(req.body?.email||'').trim().toLowerCase();
    if (!mail) return res.status(400).json({ error:'البريد الإلكتروني مطلوب' });
    const pending = await q.getPendingRegistrationByEmail(mail);
    if (!pending) return res.status(404).json({ error:'لا يوجد طلب تسجيل بهذا البريد، ابدأ من جديد' });

    const secsSinceLastSend = (Date.now() - parseSqliteUTC(pending.last_sent_at).getTime()) / 1000;
    if (secsSinceLastSend < RESEND_COOLDOWN_S) {
      return res.status(429).json({ error:`الرجاء الانتظار ${Math.ceil(RESEND_COOLDOWN_S - secsSinceLastSend)} ثانية قبل طلب كود جديد` });
    }

    const code = generateCode();
    const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES*60000).toISOString().replace('T',' ').slice(0,19);
    await sendVerificationEmail(mail, pending.username, code);
    await q.bumpPendingRegistrationCode(mail, code, expiresAt);

    res.json({ success:true, message:'تم إرسال كود جديد إلى بريدك الإلكتروني' });
  } catch(e) {
    console.error('❌ register/resend error:', e);
    res.status(500).json({ error: e.message || 'تعذر إعادة إرسال الكود' });
  }
});

// الخطوة 3: تأكيد الكود وإنشاء الحساب فعلياً
app.post('/api/auth/register/verify', async (req, res) => {
  try {
    const mail = String(req.body?.email||'').trim().toLowerCase();
    const code = String(req.body?.code||'').trim();
    if (!mail || !code) return res.status(400).json({ error:'البريد والكود مطلوبان' });

    const pending = await q.getPendingRegistrationByEmail(mail);
    if (!pending) return res.status(404).json({ error:'لا يوجد طلب تسجيل بهذا البريد، ابدأ من جديد' });

    if (parseSqliteUTC(pending.expires_at).getTime() < Date.now()) {
      await q.deletePendingRegistration(mail);
      return res.status(410).json({ error:'انتهت صلاحية الكود، الرجاء طلب كود جديد', expired:true });
    }
    if (pending.attempts >= MAX_CODE_ATTEMPTS) {
      await q.deletePendingRegistration(mail);
      return res.status(429).json({ error:'تم تجاوز عدد المحاولات المسموحة، الرجاء البدء من جديد', expired:true });
    }
    if (pending.code !== code) {
      await q.incrementPendingRegistrationAttempts(mail);
      return res.status(400).json({ error:'كود التأكيد غير صحيح' });
    }

    let result;
    try {
      result = await q.createVerifiedUser(pending.username, mail, pending.password);
    } catch(e) {
      if (e.message?.includes('UNIQUE')) {
        await q.deletePendingRegistration(mail);
        return res.status(400).json({ error:'البريد أو اسم المستخدم أصبح مستخدماً، الرجاء المحاولة باسم آخر' });
      }
      throw e;
    }
    await q.deletePendingRegistration(mail);

    const user = { id: Number(result.lastInsertRowid), username: pending.username, role:'user', avatar:'' };
    res.json({ success:true, token: signToken(user), username:user.username, role:user.role, avatar:'', id:user.id });
  } catch(e) {
    console.error('❌ register/verify error:', e);
    res.status(500).json({ error: e.message || 'تعذر تأكيد الحساب' });
  }
});

// ============================================================
// نسيت كلمة المرور — كود تأكيد عبر البريد ثم تعيين كلمة جديدة
// ============================================================

// الخطوة 1: طلب كود إعادة التعيين
app.post('/api/auth/password/forgot', async (req, res) => {
  try {
    const mail = String(req.body?.email||'').trim().toLowerCase();
    if (!mail) return res.status(400).json({ error:'البريد الإلكتروني مطلوب' });

    const user = await q.getUserByEmail(mail);
    if (!user) return res.status(404).json({ error:'لا يوجد حساب مرتبط بهذا البريد' });

    const existing = await q.getPasswordResetByEmail(mail);
    if (existing) {
      const secsSinceLastSend = (Date.now() - parseSqliteUTC(existing.last_sent_at).getTime()) / 1000;
      if (secsSinceLastSend < RESEND_COOLDOWN_S) {
        return res.status(429).json({ error:`الرجاء الانتظار ${Math.ceil(RESEND_COOLDOWN_S - secsSinceLastSend)} ثانية قبل طلب كود جديد` });
      }
    }

    const code = generateCode();
    const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES*60000).toISOString().replace('T',' ').slice(0,19);
    await sendPasswordResetEmail(mail, user.display_name || user.username, code);
    await q.upsertPasswordReset(mail, code, expiresAt);

    res.json({ success:true, email: mail, message:'تم إرسال كود إعادة التعيين إلى بريدك الإلكتروني' });
  } catch(e) {
    console.error('❌ password/forgot error:', e);
    res.status(500).json({ error: e.message || 'تعذر إرسال كود إعادة التعيين' });
  }
});

// إعادة إرسال كود إعادة التعيين
app.post('/api/auth/password/resend', async (req, res) => {
  try {
    const mail = String(req.body?.email||'').trim().toLowerCase();
    if (!mail) return res.status(400).json({ error:'البريد الإلكتروني مطلوب' });

    const existing = await q.getPasswordResetByEmail(mail);
    if (!existing) return res.status(404).json({ error:'لا يوجد طلب إعادة تعيين بهذا البريد، ابدأ من جديد' });

    const secsSinceLastSend = (Date.now() - parseSqliteUTC(existing.last_sent_at).getTime()) / 1000;
    if (secsSinceLastSend < RESEND_COOLDOWN_S) {
      return res.status(429).json({ error:`الرجاء الانتظار ${Math.ceil(RESEND_COOLDOWN_S - secsSinceLastSend)} ثانية قبل طلب كود جديد` });
    }

    const user = await q.getUserByEmail(mail);
    if (!user) return res.status(404).json({ error:'لا يوجد حساب مرتبط بهذا البريد' });

    const code = generateCode();
    const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES*60000).toISOString().replace('T',' ').slice(0,19);
    await sendPasswordResetEmail(mail, user.display_name || user.username, code);
    await q.upsertPasswordReset(mail, code, expiresAt);

    res.json({ success:true, message:'تم إرسال كود جديد إلى بريدك الإلكتروني' });
  } catch(e) {
    console.error('❌ password/resend error:', e);
    res.status(500).json({ error: e.message || 'تعذر إعادة إرسال الكود' });
  }
});

// الخطوة 2: تأكيد الكود وتعيين كلمة المرور الجديدة
app.post('/api/auth/password/reset', async (req, res) => {
  try {
    const mail = String(req.body?.email||'').trim().toLowerCase();
    const code = String(req.body?.code||'').trim();
    const newPassword = String(req.body?.newPassword||'');
    if (!mail || !code || !newPassword) return res.status(400).json({ error:'جميع الحقول مطلوبة' });
    if (newPassword.length < 6) return res.status(400).json({ error:'كلمة المرور 6 أحرف على الأقل' });

    const reset = await q.getPasswordResetByEmail(mail);
    if (!reset) return res.status(404).json({ error:'لا يوجد طلب إعادة تعيين بهذا البريد، ابدأ من جديد' });

    if (parseSqliteUTC(reset.expires_at).getTime() < Date.now()) {
      await q.deletePasswordReset(mail);
      return res.status(410).json({ error:'انتهت صلاحية الكود، الرجاء طلب كود جديد', expired:true });
    }
    if (reset.attempts >= MAX_CODE_ATTEMPTS) {
      await q.deletePasswordReset(mail);
      return res.status(429).json({ error:'تم تجاوز عدد المحاولات المسموحة، الرجاء البدء من جديد', expired:true });
    }
    if (reset.code !== code) {
      await q.incrementPasswordResetAttempts(mail);
      return res.status(400).json({ error:'كود التأكيد غير صحيح' });
    }

    const user = await q.getUserByEmail(mail);
    if (!user) {
      await q.deletePasswordReset(mail);
      return res.status(404).json({ error:'لا يوجد حساب مرتبط بهذا البريد' });
    }

    const hash = bcrypt.hashSync(newPassword, 10);
    await q.updateUserPasswordByEmail(mail, hash);
    await q.deletePasswordReset(mail);

    res.json({ success:true, token: signToken(user), username:user.username, role:user.role, avatar:user.avatar||'', id:user.id, message:'تم تحديث كلمة المرور بنجاح' });
  } catch(e) {
    console.error('❌ password/reset error:', e);
    res.status(500).json({ error: e.message || 'تعذر إعادة تعيين كلمة المرور' });
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
      } catch (e) { /* تجاهل */ }
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

// ============================================================
// UPLOAD (Images & Videos)
// ============================================================
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

function getCloudinaryConfig() {
  if (process.env.CLOUDINARY_URL) {
    const m = process.env.CLOUDINARY_URL.match(/^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/);
    if (m) {
      return { apiKey: m[1], apiSecret: m[2], cloudName: m[3] };
    }
  }
  return {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  };
}

app.post('/api/upload/video/signature', requireAuth, async (req, res) => {
  try {
    const { cloudName, apiKey, apiSecret } = getCloudinaryConfig();
    if (!cloudName || !apiKey || !apiSecret) {
      console.error('❌ إعدادات Cloudinary ناقصة: حدّد إما CLOUDINARY_URL، أو الثلاثة CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET');
      return res.status(500).json({ error: 'إعدادات Cloudinary غير مكتملة على الخادم' });
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const folder = 'hostaka_videos';
    const paramsToSign = `folder=${folder}&timestamp=${timestamp}`;
    const signature = crypto.createHash('sha1').update(paramsToSign + apiSecret).digest('hex');

    res.json({ cloudName, apiKey, timestamp, folder, signature });
  } catch (e) {
    console.error('❌ Cloudinary signature error:', e);
    res.status(500).json({ error: 'خطأ في الخادم: ' + e.message });
  }
});

// ============================================================
// Posts
// ============================================================
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
    const { content, image, video } = req.body || {};
    if (!content?.trim() && !image && !video) {
      return res.status(400).json({ error: 'المحتوى أو الملف مطلوب' });
    }
    const user = await q.getUserById(req.user.id);
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });

    const result = await q.createRecord(
      user.id,
      user.display_name || user.username,
      user.role === 'admin' ? 'Admin' : 'Member',
      user.avatar || '',
      content?.trim() || '',
      image || '',
      video || ''
    );
    const recordId = Number(result.lastInsertRowid);
    notifyMentions(content, user, recordId, null, '/?p=' + recordId);
    res.json({ success: true, id: recordId });
  } catch(e) {
    console.error('Create record error:', e);
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
    const recordId = Number(req.params.id);
    const result = await q.addComment(
      recordId,
      user.id,
      user.username,
      user.display_name || '',
      user.avatar || '',
      user.role === 'admin' ? 'Admin' : 'Member',
      content.trim()
    );
    const commentId = Number(result.lastInsertRowid);
    const link = '/?p=' + recordId;

    // إشعار صاحب المنشور بتعليق جديد (إن لم يكن هو نفسه المعلّق)
    const rec = await q.getRecord(recordId);
    if (rec && rec.user_id && Number(rec.user_id) !== user.id) {
      q.createNotification(
        rec.user_id, 'comment', user.id,
        user.display_name || user.username, user.avatar || '',
        recordId, commentId, content.trim().slice(0, 140), link
      );
    }
    // إشعار كل من تم ذكره بـ @ داخل التعليق
    notifyMentions(content, user, recordId, commentId, link);

    const comments = await q.getComments(recordId);
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

// ============================================================
// Notifications
// ============================================================
app.get('/api/notifications', requireAuth, async (req, res) => {
  try {
    res.json(await q.getNotifications(req.user.id));
  } catch(e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});
app.get('/api/notifications/unread', requireAuth, async (req, res) => {
  try {
    res.json(await q.getUnreadNotifCount(req.user.id));
  } catch(e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});
app.put('/api/notifications/read-all', requireAuth, async (req, res) => {
  try {
    await q.markAllNotifRead(req.user.id);
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});
app.put('/api/notifications/:id/read', requireAuth, async (req, res) => {
  try {
    await q.markNotifRead(req.params.id, req.user.id);
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});
app.delete('/api/notifications/:id', requireAuth, async (req, res) => {
  try {
    await q.deleteNotification(req.params.id, req.user.id);
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// ============================================================
// Verify
// ============================================================
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
      } catch (e) { /* تجاهل */ }
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
// Blocks
// ============================================================
app.post('/api/block/:username', requireAuth, async (req, res) => {
  try {
    const target = await q.getPublicProfile(req.params.username);
    if (!target) return res.status(404).json({ error: 'المستخدم غير موجود' });
    if (target.id === req.user.id) return res.status(400).json({ error: 'لا يمكنك حظر نفسك' });
    await q.blockUser(req.user.id, target.id);
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});
app.delete('/api/block/:username', requireAuth, async (req, res) => {
  try {
    const target = await q.getPublicProfile(req.params.username);
    if (!target) return res.status(404).json({ error: 'المستخدم غير موجود' });
    await q.unblockUser(req.user.id, target.id);
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});
app.get('/api/block/list', requireAuth, async (req, res) => {
  try {
    res.json(await q.getBlockedUsers(req.user.id));
  } catch(e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});
app.get('/api/block/status/:username', requireAuth, async (req, res) => {
  try {
    const target = await q.getPublicProfile(req.params.username);
    if (!target) return res.status(404).json({ error: 'المستخدم غير موجود' });
    const iBlocked = await q.isBlocked(req.user.id, target.id);
    const blockedMe = await q.isBlocked(target.id, req.user.id);
    res.json({ blocked: iBlocked, blockedMe });
  } catch(e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// ============================================================
// Reports & Support (البلاغات وطلبات الدعم)
// ============================================================
app.post('/api/reports', requireAuth, async (req, res) => {
  try {
    const { type, target_id, target_owner_username, subject, reason } = req.body || {};
    if (!reason?.trim()) return res.status(400).json({ error: 'الرجاء كتابة تفاصيل البلاغ' });
    const me = await q.getUserById(req.user.id);
    let ownerId = null, ownerName = '';
    if (target_owner_username) {
      const owner = await q.getPublicProfile(target_owner_username);
      if (owner) { ownerId = owner.id; ownerName = owner.display_name || owner.username; }
    }
    await q.createReport(
      me.id, me.display_name || me.username,
      type || 'general', target_id || null, ownerId, ownerName,
      subject?.trim() || '', reason.trim()
    );
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});
app.get('/api/reports/mine', requireAuth, async (req, res) => {
  try {
    res.json(await q.getReportsByUser(req.user.id));
  } catch(e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

app.get('/api/admin/reports', requireAdmin, async (req, res) => {
  try {
    res.json(await q.getReportsByStatus(req.query.status));
  } catch(e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});
app.put('/api/admin/reports/:id', requireAdmin, async (req, res) => {
  try {
    const { status, admin_reply } = req.body || {};
    const report = await q.getReportById(req.params.id);
    if (!report) return res.status(404).json({ error: 'البلاغ غير موجود' });
    await q.updateReport(req.params.id, status || report.status, admin_reply ?? report.admin_reply);
    if (admin_reply?.trim() && report.reporter_id) {
      const admin = await q.getUserById(req.user.id);
      await q.createNotification(
        report.reporter_id, 'report_reply', admin.id,
        admin.display_name || admin.username, admin.avatar || '',
        null, null, admin_reply.trim().slice(0, 140), '/support'
      );
    }
    res.json({ success: true });
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
    if (await q.isBlockedEitherWay(req.user.id, other.id)) {
      return res.status(403).json({ error: 'لا يمكن إرسال رسالة، يوجد حظر بينكما' });
    }
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

app.get('/api/messages/reactions', requireAuth, async (req, res) => {
  try {
    const ids = (req.query.ids || '').split(',').map(Number).filter(Boolean);
    if (!ids.length) return res.json({});
    const result = {};
    for (const mid of ids) {
      const reactions = await q.getMsgReactions(mid);
      const userReaction = (await q.getUserMsgReaction(mid, req.user.id))?.emoji || null;
      if (reactions.length || userReaction) {
        result[mid] = { reactions, userReaction };
      }
    }
    res.json(result);
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
app.get('/api/groups/:id/messages/reactions', requireAuth, async (req, res) => {
  try {
    const m = await q.isMember(req.params.id, req.user.id);
    if (!m) return res.status(403).json({ error: 'لست عضواً' });
    const ids = (req.query.ids || '').split(',').map(Number).filter(Boolean);
    if (!ids.length) return res.json({});
    const result = {};
    for (const mid of ids) {
      const reactions = await q.getGroupMsgReactions(mid);
      const userReaction = (await q.getUserGroupMsgReaction(mid, req.user.id))?.emoji || null;
      if (reactions.length || userReaction) {
        result[mid] = { reactions, userReaction };
      }
    }
    res.json(result);
  } catch(e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// ============================================================
// Shizi AI (Gemini)
// ============================================================
app.get('/api/shizi/history', requireAuth, async (req, res) => {
  try {
    res.json(await q.getShiziMessages(req.user.id));
  } catch(e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

app.delete('/api/shizi/history', requireAuth, async (req, res) => {
  try {
    await q.clearShiziMessages(req.user.id);
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// دالة مخصصة لإرسال الطلب لـ Gemini مع آلية إعادة المحاولة عند حدوث الأخطاء المؤقتة (429 و 503)
async function fetchGeminiWithRetry(apiKey, bodyData, retries = 3, delayTime = 5000) {
  for (let i = 0; i < retries; i++) {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(bodyData),
      }
    );

    const data = await r.json();

    if (r.ok) {
      return { ok: true, data };
    }

    // إذا كان الخطأ بسبب تخطي المعدل (429) أو عدم توفر الخدمة مؤقتاً (503)
    if (r.status === 429 || r.status === 503 || data.error?.code === 429 || data.error?.code === 503) {
      console.warn(`⚠️ Gemini API واجه خطأ ${r.status}. محاولة ${i + 1} من أصل ${retries}. جاري الانتظار...`);
      // ننتظر المدة المحددة (مثلاً 5 ثوانٍ) قبل إعادة المحاولة
      await delay(delayTime);
      continue;
    }

    // إذا كان خطأ آخر غير قابل للإصلاح تلقائياً (مثل مفتاح خطأ أو بارامترات خاطئة)
    return { ok: false, data };
  }
  
  return { ok: false, data: { error: { message: 'تم تجاوز الحد الأقصى لمحاولات الاتصال بـ Gemini API بسبب الضغط العالي.' } } };
}

app.post('/api/shizi/chat', requireAuth, async (req, res) => {
  try {
    const { message } = req.body || {};
    if (!message?.trim()) return res.status(400).json({ error: 'الرسالة فارغة' });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('❌ GEMINI_API_KEY غير موجود في البيئة');
      return res.status(500).json({ error: 'GEMINI_API_KEY غير مُعدّ على الخادم' });
    }

    // ===== حد الرسائل اليومي =====
    const usedToday = await q.countShiziUserMessagesLast24h(req.user.id);
    if (usedToday >= SHIZI_DAILY_LIMIT) {
      return res.status(429).json({
        error: `وصلت للحد الأقصى من الرسائل اليومية (${SHIZI_DAILY_LIMIT} رسالة). حاول مرة أخرى بعد مرور 24 ساعة.`,
      });
    }

    await q.addShiziMessage(req.user.id, 'user', message.trim());

    const history = await q.getShiziMessages(req.user.id);
    const recent = history.slice(-20);

    const contents = recent.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const bodyData = {
      system_instruction: { parts: [{ text: SHIZI_SYSTEM_PROMPT }] },
      contents,
      generationConfig: { temperature: 0.7, maxOutputTokens: 1200 },
    };

    // استدعاء الدالة الذكية المحدثة 
    const result = await fetchGeminiWithRetry(apiKey, bodyData, 4, 20000);

    if (!result.ok) {
      console.error('❌ Gemini API error:', result.data);
      return res.status(500).json({ error: result.data.error?.message || 'فشل الاتصال بـ Shizi AI' });
    }

    const reply = result.data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '...';
    await q.addShiziMessage(req.user.id, 'assistant', reply);
    res.json({ success: true, reply, remaining: SHIZI_DAILY_LIMIT - (usedToday + 1) });
  } catch(e) {
    console.error('❌ Shizi chat error:', e);
    res.status(500).json({ error: 'خطأ في الخادم: ' + e.message });
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

app.put('/api/admin/users/:id/suspend', requireAdmin, async (req, res) => {
  try {
    const { reason } = req.body || {};
    await q.suspendUser(req.params.id, reason || '');
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});
app.put('/api/admin/users/:id/unsuspend', requireAdmin, async (req, res) => {
  try {
    await q.unsuspendUser(req.params.id);
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// أداة إرسال إشعارات للأعضاء من لوحة الإدارة
app.post('/api/admin/notifications', requireAdmin, async (req, res) => {
  try {
    const { content, link, target } = req.body || {};
    if (!content?.trim()) return res.status(400).json({ error: 'محتوى الإشعار مطلوب' });
    const admin = await q.getUserById(req.user.id);
    let userIds;
    if (target && target.trim() && target.trim() !== 'all') {
      const uid = await q.getUserIdByUsername(target.trim().replace(/^@/, ''));
      if (!uid) return res.status(404).json({ error: 'المستخدم غير موجود' });
      userIds = [uid];
    } else {
      userIds = await q.listAllUserIds();
    }
    await q.createNotificationsBulk(
      userIds, 'admin', admin.id,
      admin.display_name || admin.username, admin.avatar || '',
      content.trim(), link?.trim() || ''
    );
    res.json({ success: true, count: userIds.length });
  } catch(e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// ============================================================
// Pages
// ============================================================
app.get('/login',   (_, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/admin',   (_, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/profile', (_, res) => res.sendFile(path.join(__dirname, 'public', 'profile.html')));
app.get('/chat',    (_, res) => res.sendFile(path.join(__dirname, 'public', 'chat.html')));
app.get('/group',   (_, res) => res.sendFile(path.join(__dirname, 'public', 'group.html')));
app.get('/shiziai', (_, res) => res.sendFile(path.join(__dirname, 'public', 'shiziai.html')));
app.get('/support', (_, res) => res.sendFile(path.join(__dirname, 'public', 'support.html')));
app.get('*',        (_, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ============================================================
// Start
// ============================================================
const PORT = process.env.PORT || 3000;
initDB()
  .then(() => app.listen(PORT, () => console.log(`Hostaka running on port ${PORT}`)))
  .catch(err => { console.error('DB init failed:', err); process.exit(1); });

module.exports = app;
