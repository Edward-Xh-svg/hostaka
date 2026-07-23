const express = require('express');
const path    = require('path');
const fs      = require('fs');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { q, initDB } = require('./database');

// ===== استيراد node-fetch و crypto =====
const fetch  = require('node-fetch');
const crypto = require('crypto');

const app = express();
app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
// انتظار جاهزية قاعدة البيانات قبل معالجة أي طلب
// (ضروري على Vercel/serverless: التصدير module.exports = app يجعل
// كل طلب يُعالج مباشرة دون انتظار initDB()/app.listen، فقد تصل
// طلبات فور بدء التشغيل قبل اكتمال إنشاء/تعديل الجداول)
// ============================================================
const dbReadyPromise = initDB().catch(err => {
  console.error('❌ DB init failed:', err);
  throw err;
});
app.use((req, res, next) => {
  dbReadyPromise
    .then(() => next())
    .catch(() => res.status(503).json({ error: 'الخادم لا يزال يهيّئ قاعدة البيانات، الرجاء المحاولة بعد قليل' }));
});

// ============================================================
//  Open Graph — حقن ميتاداتا ديناميكية داخل صفحات HTML
// ============================================================
const SITE_NAME    = 'Hostaka';
const DEFAULT_DESC = 'هوستاكا — منصة تواصل اجتماعي عربية للمنشورات والدردشة والمجتمعات.';
const DEFAULT_IMG  = '/hostaka.png';

function ogEscape(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function ogTruncate(str, len = 160) {
  const clean = String(str || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  return clean.length > len ? clean.slice(0, len - 1).trim() + '…' : clean;
}

// يحول رابطًا نسبيًا (أو رابطًا كاملًا بالفعل) إلى رابط مطلق
function absUrl(req, p) {
  if (!p) return '';
  if (/^https?:\/\//i.test(p)) return p;
  const origin = `${req.protocol}://${req.get('host')}`;
  return origin + (p.startsWith('/') ? p : '/' + p);
}

// يحقن وسوم Open Graph / Twitter Card داخل ملف HTML قبل إرساله
function injectOG(html, meta) {
  const title = ogEscape(meta.title || SITE_NAME);
  const desc  = ogEscape(meta.description || DEFAULT_DESC);
  const image = ogEscape(meta.image || '');
  const url   = ogEscape(meta.url || '');
  const type  = meta.type || 'website';

  let tags = `
  <meta property="og:type" content="${type}">
  <meta property="og:site_name" content="${SITE_NAME}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${desc}">
  ${image ? `<meta property="og:image" content="${image}">` : ''}
  ${url ? `<meta property="og:url" content="${url}">` : ''}
  <meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${desc}">
  ${image ? `<meta name="twitter:image" content="${image}">` : ''}
`;
  if (meta.video) {
    tags += `  <meta property="og:video" content="${ogEscape(meta.video)}">\n  <meta property="og:video:type" content="video/mp4">\n`;
  }

  // إزالة أي وسوم OG/Twitter موجودة مسبقًا لتفادي التكرار عند إعادة التوليد
  html = html.replace(/\s*<meta[^>]+(?:property=["']og:|name=["']twitter:)[^>]*>\n?/gi, '');

  if (/<title>[\s\S]*?<\/title>/.test(html)) {
    return html.replace(/<title>[\s\S]*?<\/title>/, `<title>${title}</title>${tags}`);
  }
  // في حال عدم وجود وسم title (احتياط)
  return html.replace('</head>', `<title>${title}</title>${tags}</head>`);
}

// يقرأ ملف HTML ثابت من public، يحقن ميتاداتا ديناميكية، ثم يرسله
function sendOG(req, res, fileName, meta) {
  try {
    const filePath = path.join(__dirname, 'public', fileName);
    const html = fs.readFileSync(filePath, 'utf8');
    res.set('Content-Type', 'text/html; charset=utf-8').send(injectOG(html, meta || {}));
  } catch (e) {
    res.sendFile(path.join(__dirname, 'public', fileName));
  }
}

function baseMeta(req, title) {
  return {
    title: `${title} | ${SITE_NAME}`,
    description: DEFAULT_DESC,
    image: absUrl(req, DEFAULT_IMG),
    url: absUrl(req, req.originalUrl)
  };
}

const JWT_SECRET  = process.env.JWT_SECRET  || 'hostaka-secret-2026';
const JWT_EXPIRES = '30d';

// ===== شخصية Shizi AI (مبنية على Gemini) =====
const SHIZI_SYSTEM_PROMPT = `أنتِ "شيزي" (Shizi AI)، المساعدة الذكية الرسمية لمنصة Hostaka.
Hostaka هي منصة تواصل اجتماعي ناشئة (وليست منصة استضافة/hosting رغم تشابه الاسم). طورك مجموعة من المبرمجين المستقلين
شخصيتك: احترافية، واضحة، ومتعاونة. تتحدثين بأسلوب راقٍ ومباشر، وتستخدمين اللغة العربية بشكل أساسي (إلا إذا كتب المستخدم بلغة أخرى، فحينها تجاوبين بنفس لغته).
يمكنك استخدام الايموجي في ردودك بشكل طبيعي.
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

// عناوين ووصف كل نوع طلب تعديل حساب (تُستخدم في نص البريد)
const ACCOUNT_CHANGE_LABELS = {
  username: { title: 'تغيير اسم المستخدم', desc: 'وصلنا طلب لتغيير اسم المستخدم الخاص بحسابك في Hostaka. استخدم الكود التالي لتأكيد العملية:' },
  email:    { title: 'تغيير البريد الإلكتروني', desc: 'وصلنا طلب لربط هذا البريد الإلكتروني بحسابك في Hostaka. استخدم الكود التالي لتأكيد العملية:' },
  password:  { title: 'تغيير كلمة المرور', desc: 'وصلنا طلب لتغيير كلمة المرور الخاصة بحسابك في Hostaka. استخدم الكود التالي لتأكيد العملية:' },
  delete:    { title: 'حذف الحساب', desc: 'وصلنا طلب لحذف حسابك نهائياً من Hostaka. هذا الإجراء لا يمكن التراجع عنه. استخدم الكود التالي لتأكيد الحذف:' },
};

async function sendAccountChangeEmail(email, username, code, purpose) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY غير مُعدّ على الخادم');
  const from = process.env.RESEND_FROM_EMAIL || 'Hostaka <onboarding@resend.dev>';
  const label = ACCOUNT_CHANGE_LABELS[purpose] || { title: 'تأكيد تعديل الحساب', desc: 'استخدم الكود التالي لتأكيد العملية:' };

  const html = `
  <div style="font-family:'Cairo',Tahoma,sans-serif;background:#f7f7f8;padding:32px 0;direction:rtl">
    <div style="max-width:420px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px;border:1px solid #eee">
      <h2 style="margin:0 0 8px;color:#111;font-size:20px;">مرحباً ${username || ''} 🔐</h2>
      <p style="margin:0 0 20px;color:#555;font-size:14px;line-height:1.7">${label.desc}</p>
      <div style="text-align:center;margin:20px 0;">
        <span style="display:inline-block;background:#f5f5f5;border-radius:12px;padding:14px 28px;font-size:30px;font-weight:800;letter-spacing:8px;color:#111;">${code}</span>
      </div>
      <p style="margin:0;color:#888;font-size:13px;">
        هذا الكود صالح لمدة ${CODE_TTL_MINUTES} دقائق. إذا لم تطلب هذا الإجراء، تجاهل هذه الرسالة ولن يتغير شيء في حسابك.
      </p>
    </div>
  </div>`;

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [email], subject: `كود ${label.title} في Hostaka: ${code}`, html }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.error('❌ Resend error:', data);
    throw new Error(data?.message || 'تعذر إرسال بريد التأكيد');
  }
  return data;
}

function maskEmail(email) {
  const s = String(email || '');
  const at = s.indexOf('@');
  if (at <= 1) return s;
  const name = s.slice(0, at);
  const visible = name.slice(0, Math.min(2, name.length));
  return visible + '*'.repeat(Math.max(name.length - 2, 1)) + s.slice(at);
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
    q.touchLastSeen(dbUser.id); // تحديث آخر ظهور بدون انتظار (fire-and-forget)
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

app.get('/api/users/:username/status', async (req, res) => {
  try {
    const u = await q.getUserStatus(req.params.username);
    if (!u) return res.status(404).json({ error: 'غير موجود' });
    const lastSeenMs = new Date(u.last_seen.replace(' ', 'T') + 'Z').getTime();
    const online = (Date.now() - lastSeenMs) < 2 * 60 * 1000; // أونلاين إذا كان نشطاً خلال آخر دقيقتين
    res.json({ online, last_seen: u.last_seen });
  } catch(e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

app.get('/api/users/status/batch', async (req, res) => {
  try {
    const usernames = (req.query.usernames || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 100);
    if (!usernames.length) return res.json({});
    const result = {};
    for (const uname of usernames) {
      const u = await q.getUserStatus(uname);
      if (u) {
        const lastSeenMs = new Date(u.last_seen.replace(' ', 'T') + 'Z').getTime();
        result[uname] = { online: (Date.now() - lastSeenMs) < 2 * 60 * 1000, last_seen: u.last_seen };
      }
    }
    res.json(result);
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
    const viewer = verifyToken(req);
    const posts = await q.getUserPosts(u.id, viewer ? viewer.id : null);
    if (!posts.length) return res.json([]);
    const [allR, allC, urList] = await Promise.all([
      q.getAllReactions(),
      q.getAllComments(),
      viewer ? q.getUserAllReactions(viewer.id) : Promise.resolve([])
    ]);
    const rMap = {}, cMap = {}, urMap = {};
    allR.forEach(r => { (rMap[r.record_id] ||= []).push({ emoji: r.emoji, count: r.count }); });
    allC.forEach(c => { (cMap[c.record_id] ||= []).push(c); });
    urList.forEach(r => { urMap[r.record_id] = r.emoji; });
    res.json(posts.map(p => ({
      ...p,
      publisher_name: u.display_name || u.username,
      user_avatar: u.avatar || '',
      publisher_verified: u.verified || 0,
      reactions: rMap[p.id] || [],
      comments: cMap[p.id] || [],
      userReaction: urMap[p.id] || null
    })));
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
// ============================================================
//  معاينة الروابط (Link Preview) — لعرض بطاقة Open Graph بدل رابط ميت
// ============================================================
const linkPreviewCache = new Map(); // href -> { data, ts }
const LINK_PREVIEW_TTL = 60 * 60 * 1000; // ساعة واحدة
const LINK_PREVIEW_MAX = 500;            // أقصى عدد عناصر بالكاش

function isPrivateOrLocalHost(hostname) {
  const h = String(hostname || '').toLowerCase();
  if (!h || h === 'localhost' || h === '0.0.0.0' || h === '::1') return true;
  if (/^127\./.test(h)) return true;
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true; // link-local / cloud metadata
  return false;
}

function metaTagPick(html, prop) {
  const re1 = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']*)["']`, 'i');
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${prop}["']`, 'i');
  const m = html.match(re1) || html.match(re2);
  return m ? m[1].trim() : '';
}

function decodeHtmlEntities(s) {
  return String(s || '')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

app.get('/api/link-preview', async (req, res) => {
  try {
    const raw = String(req.query.url || '').trim();
    if (!raw) return res.status(400).json({ error: 'رابط مطلوب' });

    let u;
    try { u = new URL(raw); } catch { return res.status(400).json({ error: 'رابط غير صالح' }); }
    if (!/^https?:$/.test(u.protocol)) return res.status(400).json({ error: 'رابط غير مدعوم' });
    if (isPrivateOrLocalHost(u.hostname)) return res.status(400).json({ error: 'رابط غير مسموح' });

    const cached = linkPreviewCache.get(u.href);
    if (cached && (Date.now() - cached.ts) < LINK_PREVIEW_TTL) return res.json(cached.data);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    let data;
    try {
      const r = await fetch(u.href, {
        signal: controller.signal,
        redirect: 'follow',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HostakaLinkPreview/1.0)' }
      });
      const finalUrl = r.url && !isPrivateOrLocalHost(new URL(r.url).hostname) ? r.url : u.href;
      const ct = r.headers.get('content-type') || '';
      if (!ct.includes('text/html')) {
        data = { title: u.hostname, description: '', image: '', site: u.hostname, url: finalUrl };
      } else {
        let html = await r.text();
        if (html.length > 400000) html = html.slice(0, 400000);
        const title = decodeHtmlEntities(
          metaTagPick(html, 'og:title') || (html.match(/<title>([^<]*)<\/title>/i) || [])[1] || u.hostname
        );
        const description = decodeHtmlEntities(
          metaTagPick(html, 'og:description') || metaTagPick(html, 'description')
        );
        let image = metaTagPick(html, 'og:image');
        if (image && !/^https?:\/\//i.test(image)) {
          try { image = new URL(image, finalUrl).href; } catch { image = ''; }
        }
        const site = decodeHtmlEntities(metaTagPick(html, 'og:site_name')) || u.hostname;
        data = {
          title: title.slice(0, 200),
          description: description.slice(0, 300),
          image: image || '',
          site,
          url: finalUrl
        };
      }
    } catch (e) {
      data = { title: u.hostname, description: '', image: '', site: u.hostname, url: u.href, error: true };
    } finally {
      clearTimeout(timeout);
    }

    if (linkPreviewCache.size >= LINK_PREVIEW_MAX) {
      linkPreviewCache.delete(linkPreviewCache.keys().next().value);
    }
    linkPreviewCache.set(u.href, { data, ts: Date.now() });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'تعذر جلب معاينة الرابط' });
  }
});

app.get('/api/records', async (req, res) => {
  try {
    const u = verifyToken(req);
    const records = await q.listRecords(u ? u.id : 0);
    if (!records.length) return res.json([]);
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
    const { content, image, video, video_width, video_height, page_id, privacy, scheduled_at } = req.body || {};
    if (!content?.trim() && !image && !video) {
      return res.status(400).json({ error: 'المحتوى أو الملف مطلوب' });
    }
    const user = await q.getUserById(req.user.id);
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });

    // خصوصية المنشور: عام (public) / خاص (private) / مسودة (draft) + جدولة نشر لاحقاً
    const allowedPrivacy = ['public', 'private', 'draft'];
    const finalPrivacy = allowedPrivacy.includes(privacy) ? privacy : 'public';
    let finalScheduledAt = null;
    if (scheduled_at) {
      const d = new Date(scheduled_at);
      if (isNaN(d.getTime())) return res.status(400).json({ error: 'موعد النشر غير صحيح' });
      finalScheduledAt = d.toISOString().replace('T',' ').slice(0,19);
    }

    // النشر باسم صفحة/قناة تابعة لحسابي (اختياري)
    let publisher = user.display_name || user.username;
    let publisherAvatar = user.avatar || '';
    let publisherRole = user.role === 'admin' ? 'Admin' : 'Member';
    let pageId = null;
    if (page_id) {
      const page = await q.getPageById(page_id);
      if (!page || Number(page.owner_id) !== Number(user.id)) {
        return res.status(403).json({ error: 'لا تملك صلاحية النشر باسم هذه الصفحة' });
      }
      publisher = page.name;
      publisherAvatar = page.avatar || '';
      publisherRole = 'Page';
      pageId = page.id;
    }

    // تصنيف الفيديو: ريلز (عمودي) إذا كان الارتفاع أكبر من العرض بوضوح
    const w = Number(video_width) || 0;
    const h = Number(video_height) || 0;
    const isReel = !!(video && w > 0 && h > 0 && h > w);

    const result = await q.createRecord(
      user.id,
      publisher,
      publisherRole,
      publisherAvatar,
      content?.trim() || '',
      image || '',
      video || '',
      isReel,
      w,
      h,
      pageId,
      finalPrivacy,
      finalScheduledAt
    );
    const recordId = Number(result.lastInsertRowid);
    if (!pageId && finalPrivacy === 'public' && !finalScheduledAt) notifyMentions(content, user, recordId, null, '/?p=' + recordId);
    res.json({ success: true, id: recordId, is_reel: isReel });
  } catch(e) {
    console.error('Create record error:', e);
    res.status(500).json({ error: 'خطأ: ' + e.message });
  }
});

// ============================================================
// Pages (صفحات/قنوات تابعة لحساب)
// ============================================================
function slugifyPageUsername(s) {
  return String(s || '').trim().toLowerCase()
    .replace(/[^a-z0-9_\u0621-\u064A\u0660-\u0669 ]/g, '')
    .replace(/\s+/g, '_').slice(0, 40);
}

app.get('/api/pages/mine', requireAuth, async (req, res) => {
  try {
    const pages = await q.getPagesByOwner(req.user.id);
    res.json(pages);
  } catch(e) { res.status(500).json({ error: 'خطأ في الخادم' }); }
});

app.post('/api/pages', requireAuth, async (req, res) => {
  try {
    const { name, username, avatar, bio, category } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ error: 'اسم الصفحة مطلوب' });
    let handle = slugifyPageUsername(username || name);
    if (!handle) return res.status(400).json({ error: 'معرّف الصفحة غير صالح' });
    const existing = await q.getPageByUsername(handle);
    if (existing) return res.status(409).json({ error: 'هذا المعرّف مستخدم لصفحة أخرى، جرّب معرّفاً آخر' });
    const result = await q.createPage(req.user.id, handle, name.trim(), avatar || '', (bio || '').trim(), (category || '').trim());
    res.json({ success: true, id: Number(result.lastInsertRowid), username: handle });
  } catch(e) {
    console.error('Create page error:', e);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

app.get('/api/pages/:username', async (req, res) => {
  try {
    const page = await q.getPageByUsername(req.params.username);
    if (!page) return res.status(404).json({ error: 'الصفحة غير موجودة' });
    const [posts, followerCount] = await Promise.all([
      q.getPagePosts(page.id),
      q.getPageFollowerCount(page.id)
    ]);
    const u = verifyToken(req);
    let isFollowing = false;
    if (u) isFollowing = !!(await q.isFollowingPage(page.id, u.id));
    res.json({ ...page, posts, followerCount, isFollowing, isOwner: !!(u && Number(u.id) === Number(page.owner_id)) });
  } catch(e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

app.put('/api/pages/:id', requireAuth, async (req, res) => {
  try {
    const page = await q.getPageById(req.params.id);
    if (!page) return res.status(404).json({ error: 'غير موجود' });
    if (Number(page.owner_id) !== Number(req.user.id)) return res.status(403).json({ error: 'غير مسموح' });
    const { name, avatar, cover, bio, category } = req.body || {};
    await q.updatePage(req.params.id, name?.trim() || page.name, avatar !== undefined ? avatar : page.avatar, cover !== undefined ? cover : page.cover, bio !== undefined ? bio.trim() : page.bio, category !== undefined ? category.trim() : page.category);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: 'خطأ في الخادم' }); }
});

app.delete('/api/pages/:id', requireAuth, async (req, res) => {
  try {
    const page = await q.getPageById(req.params.id);
    if (!page) return res.status(404).json({ error: 'غير موجود' });
    const me = await q.getUserById(req.user.id);
    if (Number(page.owner_id) !== Number(req.user.id) && me?.role !== 'admin') {
      return res.status(403).json({ error: 'غير مسموح' });
    }
    await q.deletePage(req.params.id);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: 'خطأ في الخادم' }); }
});

app.post('/api/pages/:id/follow', requireAuth, async (req, res) => {
  try {
    const page = await q.getPageById(req.params.id);
    if (!page) return res.status(404).json({ error: 'غير موجود' });
    await q.followPage(page.id, req.user.id);
    res.json({ success: true, followerCount: await q.getPageFollowerCount(page.id) });
  } catch(e) { res.status(500).json({ error: 'خطأ في الخادم' }); }
});

app.post('/api/pages/:id/unfollow', requireAuth, async (req, res) => {
  try {
    const page = await q.getPageById(req.params.id);
    if (!page) return res.status(404).json({ error: 'غير موجود' });
    await q.unfollowPage(page.id, req.user.id);
    res.json({ success: true, followerCount: await q.getPageFollowerCount(page.id) });
  } catch(e) { res.status(500).json({ error: 'خطأ في الخادم' }); }
});

// ============================================================
// Reels (فيديوهات عمودية - تُعرض بطريقة تيك توك / شورتس)
// ============================================================
app.get('/api/reels', async (req, res) => {
  try {
    const u = verifyToken(req);
    const records = await q.listReels(u ? u.id : 0);
    if (!records.length) return res.json([]);
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
    console.error('List reels error:', e);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// ============================================================
// Stories (القصص - تختفي تلقائياً بعد 24 ساعة)
// ============================================================
app.get('/api/stories', async (req, res) => {
  try {
    await q.deleteExpiredStories();
    const u = verifyToken(req);
    const rowsList = await q.listActiveStories(u ? u.id : 0);
    // تجميع القصص حسب المستخدم للعرض كحلقات (مثل الستوري)
    const groups = {};
    const order = [];
    rowsList.forEach(r => {
      if (!groups[r.user_id]) {
        groups[r.user_id] = {
          user_id: r.user_id,
          username: r.username,
          display_name: r.display_name || r.username,
          avatar: r.avatar || '',
          verified: !!r.verified,
          allViewed: true,
          stories: []
        };
        order.push(r.user_id);
      }
      groups[r.user_id].stories.push({
        id: r.id, media: r.media, media_type: r.media_type,
        caption: r.caption, created_at: r.created_at, expires_at: r.expires_at,
        viewed: !!r.viewed
      });
      if (!r.viewed) groups[r.user_id].allViewed = false;
    });
    res.json(order.map(id => groups[id]));
  } catch(e) {
    console.error('List stories error:', e);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

app.post('/api/stories', requireAuth, async (req, res) => {
  try {
    const { media, media_type, caption } = req.body || {};
    if (!media) return res.status(400).json({ error: 'الوسائط مطلوبة' });
    const user = await q.getUserById(req.user.id);
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    const result = await q.createStory(user.id, media, media_type === 'video' ? 'video' : 'image', (caption || '').trim());
    res.json({ success: true, id: Number(result.lastInsertRowid) });
  } catch(e) {
    console.error('Create story error:', e);
    res.status(500).json({ error: 'خطأ: ' + e.message });
  }
});

app.post('/api/stories/:id/view', requireAuth, async (req, res) => {
  try {
    const story = await q.getStory(req.params.id);
    if (!story) return res.status(404).json({ error: 'غير موجود' });
    await q.markStoryViewed(story.id, req.user.id);
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

app.delete('/api/stories/:id', requireAuth, async (req, res) => {
  try {
    const story = await q.getStory(req.params.id);
    if (!story) return res.status(404).json({ error: 'غير موجود' });
    const user = await q.getUserById(req.user.id);
    if (Number(story.user_id) !== Number(req.user.id) && user?.role !== 'admin') {
      return res.status(403).json({ error: 'غير مصرح' });
    }
    await q.deleteStory(story.id);
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

app.put('/api/records/:id', requireAuth, async (req, res) => {
  try {
    const rec = await q.getRecord(req.params.id);
    if (!rec) return res.status(404).json({ error: 'غير موجود' });
    if (req.user.role !== 'admin' && rec.user_id != req.user.id) {
      return res.status(403).json({ error: 'غير مسموح' });
    }
    const { content, image, privacy, scheduled_at } = req.body || {};
    if (!content?.trim() && !image && !rec.video) {
      return res.status(400).json({ error: 'المحتوى مطلوب' });
    }
    await q.updateRecord(req.params.id, content?.trim() || '', image !== undefined ? image : rec.image);
    if (privacy !== undefined || scheduled_at !== undefined) {
      const allowedPrivacy = ['public', 'private', 'draft'];
      const finalPrivacy = allowedPrivacy.includes(privacy) ? privacy : (rec.privacy || 'public');
      let finalScheduledAt = rec.scheduled_at || null;
      if (scheduled_at !== undefined) {
        if (!scheduled_at) finalScheduledAt = null;
        else {
          const d = new Date(scheduled_at);
          if (isNaN(d.getTime())) return res.status(400).json({ error: 'موعد النشر غير صحيح' });
          finalScheduledAt = d.toISOString().replace('T',' ').slice(0,19);
        }
      }
      await q.updateRecordPrivacy(req.params.id, finalPrivacy, finalScheduledAt);
    }
    res.json({ success: true });
  } catch(e) {
    console.error('Update record error:', e);
    res.status(500).json({ error: 'خطأ في الخادم' });
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
    const { content, parent_id } = req.body || {};
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
      content.trim(),
      parent_id ? Number(parent_id) : null
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
// صفحة إدارة الحساب /manager — تعديل اليوزر نيم/البريد/كلمة المرور
// (تتطلب تأكيد كود عبر البريد الإلكتروني) + تاريخ الميلاد + حذف الحساب
// ============================================================
const ACCOUNT_CHANGE_PURPOSES = ['username', 'email', 'password', 'delete'];

// الخطوة 1: طلب تعديل — يرسل كود تأكيد للبريد المناسب
app.post('/api/account/change/request', requireAuth, async (req, res) => {
  try {
    const { purpose, newUsername, newEmail, currentPassword, newPassword } = req.body || {};
    if (!ACCOUNT_CHANGE_PURPOSES.includes(purpose)) return res.status(400).json({ error:'نوع الطلب غير صحيح' });

    const fullUser = await q.getUserByUsername(req.user.username);
    if (!fullUser) return res.status(404).json({ error:'المستخدم غير موجود' });

    let payload = {}, targetEmail = fullUser.email;

    if (purpose === 'username') {
      const uname = String(newUsername || '').trim();
      if (uname.length < 3 || uname.length > 32) return res.status(400).json({ error:'اسم المستخدم يجب أن يكون بين 3 و32 حرفاً' });
      if (!/^[A-Za-z0-9_\u0600-\u06FF]+$/.test(uname)) return res.status(400).json({ error:'اسم المستخدم يحتوي على رموز غير مسموحة' });
      if (uname.toLowerCase() === String(fullUser.username).toLowerCase()) return res.status(400).json({ error:'هذا هو اسمك الحالي بالفعل' });
      const exists = await q.getUserByUsername(uname);
      if (exists) return res.status(400).json({ error:'اسم المستخدم مستخدم مسبقاً' });
      payload = { newUsername: uname };
      targetEmail = fullUser.email; // تأكيد عبر البريد الحالي للحساب

    } else if (purpose === 'email') {
      const mail = String(newEmail || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return res.status(400).json({ error:'البريد الإلكتروني غير صحيح' });
      if (mail === String(fullUser.email).toLowerCase()) return res.status(400).json({ error:'هذا هو بريدك الحالي بالفعل' });
      const exists = await q.getUserByEmail(mail);
      if (exists) return res.status(400).json({ error:'البريد الإلكتروني مستخدم مسبقاً' });
      payload = { newEmail: mail };
      targetEmail = mail; // تأكيد عبر البريد الجديد للتحقق من ملكيته

    } else if (purpose === 'password') {
      if (!currentPassword || !newPassword) return res.status(400).json({ error:'جميع الحقول مطلوبة' });
      if (!bcrypt.compareSync(currentPassword, fullUser.password)) return res.status(401).json({ error:'كلمة المرور الحالية غير صحيحة' });
      if (String(newPassword).length < 6) return res.status(400).json({ error:'كلمة المرور الجديدة 6 أحرف على الأقل' });
      payload = { newPasswordHash: bcrypt.hashSync(newPassword, 10) };
      targetEmail = fullUser.email;

    } else if (purpose === 'delete') {
      if (fullUser.role === 'admin') return res.status(403).json({ error:'لا يمكن حذف حساب المدير' });
      if (!currentPassword) return res.status(400).json({ error:'كلمة المرور مطلوبة لتأكيد حذف الحساب' });
      if (!bcrypt.compareSync(currentPassword, fullUser.password)) return res.status(401).json({ error:'كلمة المرور غير صحيحة' });
      payload = {};
      targetEmail = fullUser.email;
    }

    const existing = await q.getAccountChange(req.user.id, purpose);
    if (existing) {
      const secsSinceLastSend = (Date.now() - parseSqliteUTC(existing.last_sent_at).getTime()) / 1000;
      if (secsSinceLastSend < RESEND_COOLDOWN_S) {
        return res.status(429).json({ error:`الرجاء الانتظار ${Math.ceil(RESEND_COOLDOWN_S - secsSinceLastSend)} ثانية قبل طلب كود جديد` });
      }
    }

    const code = generateCode();
    const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES*60000).toISOString().replace('T',' ').slice(0,19);
    await sendAccountChangeEmail(targetEmail, fullUser.display_name || fullUser.username, code, purpose);
    await q.upsertAccountChange(req.user.id, purpose, JSON.stringify(payload), targetEmail, code, expiresAt);

    res.json({ success:true, message:'تم إرسال كود التأكيد إلى البريد الإلكتروني', maskedEmail: maskEmail(targetEmail) });
  } catch(e) {
    console.error('❌ account/change/request error:', e);
    res.status(500).json({ error: e.message || 'تعذر إرسال كود التأكيد' });
  }
});

// إعادة إرسال كود التأكيد لطلب تعديل قائم
app.post('/api/account/change/resend', requireAuth, async (req, res) => {
  try {
    const { purpose } = req.body || {};
    if (!ACCOUNT_CHANGE_PURPOSES.includes(purpose)) return res.status(400).json({ error:'نوع الطلب غير صحيح' });

    const rec = await q.getAccountChange(req.user.id, purpose);
    if (!rec) return res.status(404).json({ error:'لا يوجد طلب تعديل سابق، ابدأ من جديد' });

    const secsSinceLastSend = (Date.now() - parseSqliteUTC(rec.last_sent_at).getTime()) / 1000;
    if (secsSinceLastSend < RESEND_COOLDOWN_S) {
      return res.status(429).json({ error:`الرجاء الانتظار ${Math.ceil(RESEND_COOLDOWN_S - secsSinceLastSend)} ثانية قبل طلب كود جديد` });
    }

    const fullUser = await q.getUserByUsername(req.user.username);
    const code = generateCode();
    const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES*60000).toISOString().replace('T',' ').slice(0,19);
    await sendAccountChangeEmail(rec.target_email, fullUser?.display_name || fullUser?.username, code, purpose);
    await q.bumpAccountChangeCode(req.user.id, purpose, code, expiresAt);

    res.json({ success:true, message:'تم إرسال كود جديد إلى بريدك الإلكتروني' });
  } catch(e) {
    console.error('❌ account/change/resend error:', e);
    res.status(500).json({ error: e.message || 'تعذر إعادة إرسال الكود' });
  }
});

// إلغاء طلب تعديل قائم
app.delete('/api/account/change/:purpose', requireAuth, async (req, res) => {
  try {
    await q.deleteAccountChange(req.user.id, req.params.purpose);
    res.json({ success:true });
  } catch(e) {
    res.status(500).json({ error:'خطأ في الخادم' });
  }
});

// الخطوة 2: تأكيد الكود وتنفيذ التعديل فعلياً
app.post('/api/account/change/verify', requireAuth, async (req, res) => {
  try {
    const { purpose, code } = req.body || {};
    if (!ACCOUNT_CHANGE_PURPOSES.includes(purpose)) return res.status(400).json({ error:'نوع الطلب غير صحيح' });
    const inputCode = String(code || '').trim();
    if (!inputCode) return res.status(400).json({ error:'كود التأكيد مطلوب' });

    const rec = await q.getAccountChange(req.user.id, purpose);
    if (!rec) return res.status(404).json({ error:'لا يوجد طلب تعديل، ابدأ من جديد' });

    if (parseSqliteUTC(rec.expires_at).getTime() < Date.now()) {
      await q.deleteAccountChange(req.user.id, purpose);
      return res.status(410).json({ error:'انتهت صلاحية الكود، الرجاء طلب كود جديد', expired:true });
    }
    if (rec.attempts >= MAX_CODE_ATTEMPTS) {
      await q.deleteAccountChange(req.user.id, purpose);
      return res.status(429).json({ error:'تم تجاوز عدد المحاولات المسموحة، الرجاء البدء من جديد', expired:true });
    }
    if (rec.code !== inputCode) {
      await q.incrementAccountChangeAttempts(req.user.id, purpose);
      return res.status(400).json({ error:'كود التأكيد غير صحيح' });
    }

    let payload = {};
    try { payload = JSON.parse(rec.payload || '{}'); } catch(e) { payload = {}; }

    if (purpose === 'username') {
      try { await q.updateUsername(req.user.id, payload.newUsername); }
      catch(e) {
        if (e.message?.includes('UNIQUE')) return res.status(400).json({ error:'اسم المستخدم أصبح مستخدماً، حاول باسم آخر' });
        throw e;
      }
    } else if (purpose === 'email') {
      try { await q.updateEmail(req.user.id, payload.newEmail); }
      catch(e) {
        if (e.message?.includes('UNIQUE')) return res.status(400).json({ error:'البريد الإلكتروني أصبح مستخدماً' });
        throw e;
      }
    } else if (purpose === 'password') {
      await q.updateUserPassword(req.user.id, payload.newPasswordHash);
    } else if (purpose === 'delete') {
      await q.deleteAccountChange(req.user.id, purpose);
      await q.deleteUser(req.user.id);
      return res.json({ success:true, deleted:true });
    }

    await q.deleteAccountChange(req.user.id, purpose);

    const updatedUser = await q.getUserById(req.user.id);
    res.json({
      success:true,
      token: signToken(updatedUser),
      id: updatedUser.id,
      username: updatedUser.username,
      email: updatedUser.email,
      role: updatedUser.role,
      avatar: updatedUser.avatar || ''
    });
  } catch(e) {
    console.error('❌ account/change/verify error:', e);
    res.status(500).json({ error: e.message || 'تعذر تأكيد التعديل' });
  }
});

// تعديل تاريخ الميلاد (لا يتطلب تأكيد بريد لأنه ليس حقلاً حساساً أمنياً)
app.put('/api/account/birthdate', requireAuth, async (req, res) => {
  try {
    const { birth_date } = req.body || {};
    const val = String(birth_date || '').trim();
    if (val) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) return res.status(400).json({ error:'صيغة التاريخ غير صحيحة' });
      const d = new Date(val + 'T00:00:00Z');
      if (isNaN(d.getTime())) return res.status(400).json({ error:'تاريخ غير صحيح' });
      const ageYears = (Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
      if (ageYears < 13) return res.status(400).json({ error:'يجب أن يكون عمرك 13 سنة على الأقل لاستخدام المنصة' });
      if (ageYears > 120) return res.status(400).json({ error:'تاريخ الميلاد غير صحيح' });
    }
    await q.updateBirthDate(req.user.id, val);
    res.json({ success:true });
  } catch(e) {
    res.status(500).json({ error:'خطأ في الخادم' });
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
    const { content, image, reply_to } = req.body || {};
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
      image || '',
      reply_to ? Number(reply_to) : null
    );
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});
app.put('/api/messages/:id', requireAuth, async (req, res) => {
  try {
    const msg = await q.getMessage(req.params.id);
    if (!msg) return res.status(404).json({ error: 'غير موجود' });
    if (msg.from_id != req.user.id) return res.status(403).json({ error: 'غير مسموح' });
    const { content } = req.body || {};
    if (!content?.trim()) return res.status(400).json({ error: 'الرسالة فارغة' });
    await q.updateMessage(req.params.id, content.trim());
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

app.delete('/api/messages/:id', requireAuth, async (req, res) => {
  try {
    const msg = await q.getMessage(req.params.id);
    if (!msg) return res.status(404).json({ error: 'غير موجود' });
    const me = await q.getUserById(req.user.id);
    if (msg.from_id != req.user.id && me?.role !== 'admin') {
      return res.status(403).json({ error: 'غير مسموح' });
    }
    await q.deleteMessage(req.params.id);
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
    const { content, image, reply_to } = req.body || {};
    if (!content?.trim() && !image) return res.status(400).json({ error: 'فارغة' });
    const user = await q.getUserById(req.user.id);
    await q.sendGroupMessage(
      req.params.id,
      user.id,
      user.display_name || user.username,
      user.avatar || '',
      content?.trim() || '',
      image || '',
      reply_to ? Number(reply_to) : null
    );
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});
app.put('/api/groups/:id/messages/:mid', requireAuth, async (req, res) => {
  try {
    const msg = await q.getGroupMessage(req.params.mid);
    if (!msg || Number(msg.group_id) !== Number(req.params.id)) return res.status(404).json({ error: 'غير موجود' });
    if (msg.user_id != req.user.id) return res.status(403).json({ error: 'غير مسموح' });
    const { content } = req.body || {};
    if (!content?.trim()) return res.status(400).json({ error: 'الرسالة فارغة' });
    await q.updateGroupMessage(req.params.mid, content.trim());
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

app.delete('/api/groups/:id/messages/:mid', requireAuth, async (req, res) => {
  try {
    const msg = await q.getGroupMessage(req.params.mid);
    if (!msg || Number(msg.group_id) !== Number(req.params.id)) return res.status(404).json({ error: 'غير موجود' });
    const m = await q.isMember(req.params.id, req.user.id);
    const me = await q.getUserById(req.user.id);
    const isOwnerOfMsg = msg.user_id == req.user.id;
    const isGroupPriv = m && m.role !== 'member';
    const isSiteAdmin = me?.role === 'admin';
    if (!isOwnerOfMsg && !isGroupPriv && !isSiteAdmin) {
      return res.status(403).json({ error: 'غير مسموح' });
    }
    await q.deleteGroupMessage(req.params.mid);
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
app.get('/login',   (req, res) => sendOG(req, res, 'login.html', baseMeta(req, 'تسجيل الدخول')));
app.get('/admin',   (req, res) => sendOG(req, res, 'admin.html', baseMeta(req, 'لوحة التحكم')));
app.get('/chat',    (req, res) => sendOG(req, res, 'chat.html', baseMeta(req, 'الدردشة')));
app.get('/group',   (req, res) => sendOG(req, res, 'group.html', baseMeta(req, 'المجموعة')));
app.get('/shiziai', (req, res) => sendOG(req, res, 'shiziai.html', baseMeta(req, 'شيزي الذكاء الاصطناعي')));
app.get('/support', (req, res) => sendOG(req, res, 'support.html', baseMeta(req, 'الدعم الفني')));
app.get('/manager', (req, res) => sendOG(req, res, 'manager.html', baseMeta(req, 'إدارة الحساب')));

app.get('/profile', async (req, res) => {
  const meta = baseMeta(req, 'الملف الشخصي');
  const uname = (req.query.u || '').trim();
  if (uname) {
    try {
      const user = await q.getUserByUsername(uname);
      if (user && !user.suspended) {
        meta.title = `${user.display_name || user.username} (@${user.username}) | ${SITE_NAME}`;
        meta.description = ogTruncate(user.bio) || DEFAULT_DESC;
        meta.image = absUrl(req, user.avatar || DEFAULT_IMG);
        meta.type = 'profile';
      }
    } catch (e) { /* نستمر بالميتاداتا الافتراضية عند أي خطأ */ }
  }
  sendOG(req, res, 'profile.html', meta);
});

app.get('/page', async (req, res) => {
  const meta = baseMeta(req, 'صفحة');
  const uname = (req.query.u || '').trim();
  if (uname) {
    try {
      const page = await q.getPageByUsername(uname);
      if (page) {
        meta.title = `${page.name} | ${SITE_NAME}`;
        meta.description = ogTruncate(page.bio) || DEFAULT_DESC;
        meta.image = absUrl(req, page.avatar || DEFAULT_IMG);
      }
    } catch (e) { /* نستمر بالميتاداتا الافتراضية عند أي خطأ */ }
  }
  sendOG(req, res, 'page.html', meta);
});

app.get('/short', async (req, res) => {
  const meta = baseMeta(req, 'ريلز');
  meta.type = 'video.other';
  const id = (req.query.id || '').trim();
  if (id) {
    try {
      const rec = await q.getRecordById(id);
      if (rec) {
        const who = rec.publisher_name || rec.publisher;
        meta.title = `${who} على ${SITE_NAME}`;
        meta.description = ogTruncate(rec.content) || DEFAULT_DESC;
        if (rec.image) meta.image = absUrl(req, rec.image);
        if (rec.video) meta.video = absUrl(req, rec.video);
      }
    } catch (e) { /* نستمر بالميتاداتا الافتراضية عند أي خطأ */ }
  }
  sendOG(req, res, 'short.html', meta);
});

app.get('*', async (req, res) => {
  const meta = baseMeta(req, SITE_NAME);
  meta.title = SITE_NAME;
  const pid = (req.query.p || '').trim();
  if (pid) {
    try {
      const rec = await q.getRecordById(pid);
      if (rec) {
        const who = rec.publisher_name || rec.publisher;
        meta.title = `منشور ${who} | ${SITE_NAME}`;
        meta.description = ogTruncate(rec.content) || DEFAULT_DESC;
        if (rec.image) meta.image = absUrl(req, rec.image);
        meta.type = 'article';
      }
    } catch (e) { /* نستمر بالميتاداتا الافتراضية عند أي خطأ */ }
  }
  sendOG(req, res, 'index.html', meta);
});

// ============================================================
// Start
// ============================================================
const PORT = process.env.PORT || 3000;
dbReadyPromise
  .then(() => app.listen(PORT, () => console.log(`Hostaka running on port ${PORT}`)))
  .catch(err => { console.error('DB init failed:', err); process.exit(1); });

module.exports = app;
