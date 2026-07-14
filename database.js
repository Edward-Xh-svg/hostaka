const { createClient } = require('@libsql/client');
const bcrypt = require('bcryptjs');

if (!global._tursoClient) {
  global._tursoClient = createClient({
    url:       process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
}
const db = global._tursoClient;

function rows(r)  { return r.rows.map(row => Object.fromEntries(Object.entries(row))); }
function first(r) { const row = r.rows[0]; return row ? Object.fromEntries(Object.entries(row)) : null; }

async function initDB() {
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS users (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      username     TEXT NOT NULL UNIQUE,
      email        TEXT NOT NULL UNIQUE,
      password     TEXT NOT NULL,
      role         TEXT NOT NULL DEFAULT 'user',
      avatar       TEXT DEFAULT '',
      bio          TEXT DEFAULT '',
      game_id      TEXT DEFAULT '',
      display_name TEXT DEFAULT '',
      cover        TEXT DEFAULT '',
      verified     INTEGER DEFAULT 0,
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS records (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER REFERENCES users(id),
      publisher   TEXT NOT NULL,
      user_role   TEXT NOT NULL DEFAULT 'Member',
      user_avatar TEXT DEFAULT '',
      content     TEXT NOT NULL,
      image       TEXT DEFAULT '',
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS record_reactions (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      record_id INTEGER NOT NULL REFERENCES records(id) ON DELETE CASCADE,
      user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      emoji     TEXT NOT NULL DEFAULT 'like',
      UNIQUE(record_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS record_comments (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      record_id    INTEGER NOT NULL REFERENCES records(id) ON DELETE CASCADE,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      username     TEXT NOT NULL,
      display_name TEXT DEFAULT '',
      avatar       TEXT DEFAULT '',
      user_role    TEXT DEFAULT 'Member',
      content      TEXT NOT NULL,
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS messages (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      from_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      to_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      from_name  TEXT NOT NULL,
      to_name    TEXT NOT NULL,
      content    TEXT NOT NULL,
      image      TEXT DEFAULT '',
      read       INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS message_reactions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      emoji      TEXT NOT NULL DEFAULT 'heart',
      UNIQUE(message_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS groups (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      description TEXT DEFAULT '',
      avatar      TEXT DEFAULT '',
      theme       TEXT DEFAULT 'default',
      created_by  INTEGER NOT NULL REFERENCES users(id),
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS group_members (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id  INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      nickname  TEXT DEFAULT '',
      role      TEXT NOT NULL DEFAULT 'member',
      joined_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(group_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS group_messages (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id    INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      from_name   TEXT NOT NULL,
      from_avatar TEXT DEFAULT '',
      content     TEXT NOT NULL,
      image       TEXT DEFAULT '',
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS group_message_reactions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id INTEGER NOT NULL REFERENCES group_messages(id) ON DELETE CASCADE,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      emoji      TEXT NOT NULL DEFAULT 'heart',
      UNIQUE(message_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS verify_requests (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      username   TEXT NOT NULL,
      status     TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id)
    );
  `);

  // Migrations — إضافة أعمدة مفقودة
  const migrations = [
    "ALTER TABLE users ADD COLUMN avatar       TEXT DEFAULT ''",
    "ALTER TABLE users ADD COLUMN bio          TEXT DEFAULT ''",
    "ALTER TABLE users ADD COLUMN game_id      TEXT DEFAULT ''",
    "ALTER TABLE users ADD COLUMN display_name TEXT DEFAULT ''",
    "ALTER TABLE users ADD COLUMN cover        TEXT DEFAULT ''",
    "ALTER TABLE users ADD COLUMN verified     INTEGER DEFAULT 0",
    "ALTER TABLE records ADD COLUMN user_id     INTEGER",
    "ALTER TABLE records ADD COLUMN user_role   TEXT DEFAULT 'Member'",
    "ALTER TABLE records ADD COLUMN user_avatar TEXT DEFAULT ''",
    "ALTER TABLE records ADD COLUMN image       TEXT DEFAULT ''",
    "ALTER TABLE record_comments ADD COLUMN display_name TEXT DEFAULT ''",
    "ALTER TABLE record_comments ADD COLUMN avatar       TEXT DEFAULT ''",
    "ALTER TABLE record_comments ADD COLUMN user_role    TEXT DEFAULT 'Member'",
    "ALTER TABLE messages ADD COLUMN image TEXT DEFAULT ''",
    "CREATE TABLE IF NOT EXISTS verify_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, username TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(user_id))",
    "CREATE TABLE IF NOT EXISTS message_reactions (id INTEGER PRIMARY KEY AUTOINCREMENT, message_id INTEGER NOT NULL, user_id INTEGER NOT NULL, emoji TEXT NOT NULL DEFAULT 'heart', UNIQUE(message_id, user_id))",
  ];
  for (const sql of migrations) {
    try { await db.execute(sql); } catch(e) { /* column/table already exists */ }
  }

  // Admin — Hostaka
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@hostaka.io';
  const ADMIN_PASS  = process.env.ADMIN_PASS  || 'hostaka-admin-2026';
  const adminRes = await db.execute({ sql:"SELECT id FROM users WHERE role='admin' LIMIT 1", args:[] });
  const hash = bcrypt.hashSync(ADMIN_PASS, 10);
  if (adminRes.rows.length === 0) {
    await db.execute({ sql:"INSERT OR IGNORE INTO users (username,email,password,role,display_name) VALUES (?,?,?,?,?)", args:['admin', ADMIN_EMAIL, hash, 'admin', 'Admin'] });
  } else {
    await db.execute({ sql:"UPDATE users SET email=?,password=? WHERE role='admin'", args:[ADMIN_EMAIL, hash] });
  }
  console.log('✅ Hostaka DB ready');
}

const q = {
  // Users
  getUserByEmail:   (email)    => db.execute({ sql:'SELECT * FROM users WHERE email=?', args:[email] }).then(first),
  getUserById:      (id)       => db.execute({ sql:'SELECT id,username,email,role,avatar,bio,game_id,display_name,cover,verified,created_at FROM users WHERE id=?', args:[id] }).then(first),
  getPublicProfile: (username) => db.execute({ sql:'SELECT id,username,display_name,avatar,bio,game_id,role,verified,cover,created_at FROM users WHERE username=?', args:[username] }).then(first),
  createUser:       (username,email,password) => db.execute({ sql:'INSERT INTO users (username,email,password) VALUES (?,?,?)', args:[username,email,password] }),
  updateProfile:    (display_name,bio,game_id,avatar,cover,id) => db.execute({ sql:'UPDATE users SET display_name=?,bio=?,game_id=?,avatar=?,cover=? WHERE id=?', args:[display_name,bio,game_id,avatar,cover,id] }),
  listUsers:        () => db.execute('SELECT id,username,email,role,avatar,display_name,verified,created_at FROM users ORDER BY created_at DESC').then(rows),
  listPublicUsers:  () => db.execute('SELECT id,username,display_name,avatar,role,verified FROM users ORDER BY username ASC').then(rows),
  deleteUser:       (id) => db.execute({ sql:"DELETE FROM users WHERE id=? AND role!='admin'", args:[id] }),
  updateUserRole:   (role,id) => db.execute({ sql:'UPDATE users SET role=? WHERE id=?', args:[role,id] }),
  searchUsers:      (q) => db.execute({ sql:"SELECT id,username,display_name,avatar,role,verified FROM users WHERE username LIKE ? OR display_name LIKE ? LIMIT 15", args:['%'+q+'%','%'+q+'%'] }).then(rows),

  // Records
  listRecords: () => db.execute(`
    SELECT r.*,
           COALESCE(u.avatar, r.user_avatar, '') as user_avatar,
           COALESCE(u.display_name, u.username, r.publisher, '') as publisher_name,
           COALESCE(u.verified, 0) as publisher_verified
    FROM records r
    LEFT JOIN users u ON (u.id = r.user_id) OR (r.user_id IS NULL AND u.username = r.publisher)
    ORDER BY r.created_at DESC
  `).then(rows),
  createRecord: async (user_id,publisher,user_role,user_avatar,content,image) => {
    try {
      return await db.execute({ sql:'INSERT INTO records (user_id,publisher,user_role,user_avatar,content,image) VALUES (?,?,?,?,?,?)', args:[user_id,publisher,user_role,user_avatar,content,image] });
    } catch(e) {
      return await db.execute({ sql:'INSERT INTO records (publisher,content,image) VALUES (?,?,?)', args:[publisher,content,image] });
    }
  },
  deleteRecord: (id) => db.execute({ sql:'DELETE FROM records WHERE id=?', args:[id] }),
  getRecord:    (id) => db.execute({ sql:'SELECT * FROM records WHERE id=?', args:[id] }).then(first),
  getUserPosts: (uid) => db.execute({ sql:'SELECT * FROM records WHERE user_id=? ORDER BY created_at DESC', args:[uid] }).then(rows),

  // Reactions
  getAllReactions:      () => db.execute('SELECT record_id,emoji,COUNT(*) as count FROM record_reactions GROUP BY record_id,emoji').then(rows),
  getReactions:        (rid) => db.execute({ sql:'SELECT emoji,COUNT(*) as count FROM record_reactions WHERE record_id=? GROUP BY emoji', args:[rid] }).then(rows),
  getUserAllReactions: (uid) => db.execute({ sql:'SELECT record_id,emoji FROM record_reactions WHERE user_id=?', args:[uid] }).then(rows),
  getUserReaction:     (rid,uid) => db.execute({ sql:'SELECT emoji FROM record_reactions WHERE record_id=? AND user_id=?', args:[rid,uid] }).then(first),
  addReaction:         (rid,uid,emoji) => db.execute({ sql:'INSERT OR REPLACE INTO record_reactions (record_id,user_id,emoji) VALUES (?,?,?)', args:[rid,uid,emoji] }),
  removeReaction:      (rid,uid) => db.execute({ sql:'DELETE FROM record_reactions WHERE record_id=? AND user_id=?', args:[rid,uid] }),

  // Comments
  getAllComments: () => db.execute(`
    SELECT rc.*, COALESCE(u.avatar,rc.avatar,'') as avatar, COALESCE(u.display_name,rc.display_name,'') as display_name
    FROM record_comments rc LEFT JOIN users u ON u.id=rc.user_id
    ORDER BY rc.record_id ASC, rc.created_at ASC
  `).then(rows),
  getComments: (rid) => db.execute({ sql:'SELECT * FROM record_comments WHERE record_id=? ORDER BY created_at ASC', args:[rid] }).then(rows),
  addComment: async (rid,uid,username,display_name,avatar,user_role,content) => {
    try {
      return await db.execute({ sql:'INSERT INTO record_comments (record_id,user_id,username,display_name,avatar,user_role,content) VALUES (?,?,?,?,?,?,?)', args:[rid,uid,username,display_name,avatar,user_role,content] });
    } catch(e) {
      return await db.execute({ sql:'INSERT INTO record_comments (record_id,user_id,username,content) VALUES (?,?,?,?)', args:[rid,uid,username,content] });
    }
  },
  deleteComment: (id,uid,role) => role==='admin'
    ? db.execute({ sql:'DELETE FROM record_comments WHERE id=?', args:[id] })
    : db.execute({ sql:'DELETE FROM record_comments WHERE id=? AND user_id=?', args:[id,uid] }),

  // Messages
  getConversations: (uid) => db.execute({ sql:`
    SELECT m.*,u1.avatar as from_avatar,u2.avatar as to_avatar
    FROM messages m JOIN users u1 ON u1.id=m.from_id JOIN users u2 ON u2.id=m.to_id
    WHERE m.id IN (SELECT MAX(id) FROM messages WHERE from_id=? OR to_id=? GROUP BY CASE WHEN from_id=? THEN to_id ELSE from_id END)
    ORDER BY m.created_at DESC`, args:[uid,uid,uid] }).then(rows),
  getMessages:  (uid,oid) => db.execute({ sql:'SELECT m.*,u.avatar as from_avatar FROM messages m JOIN users u ON u.id=m.from_id WHERE (from_id=? AND to_id=?) OR (from_id=? AND to_id=?) ORDER BY created_at ASC', args:[uid,oid,oid,uid] }).then(rows),
  sendMessage:  (fid,tid,fn,tn,content,image) => db.execute({ sql:'INSERT INTO messages (from_id,to_id,from_name,to_name,content,image) VALUES (?,?,?,?,?,?)', args:[fid,tid,fn,tn,content,image||''] }),
  markRead:     (fid,tid) => db.execute({ sql:'UPDATE messages SET read=1 WHERE from_id=? AND to_id=?', args:[fid,tid] }),
  unreadCount:  (uid) => db.execute({ sql:'SELECT COUNT(*) as count FROM messages WHERE to_id=? AND read=0', args:[uid] }).then(first),

  // Message Reactions
  getMsgReactions:    (mid) => db.execute({ sql:'SELECT emoji,COUNT(*) as count FROM message_reactions WHERE message_id=? GROUP BY emoji', args:[mid] }).then(rows),
  getUserMsgReaction: (mid,uid) => db.execute({ sql:'SELECT emoji FROM message_reactions WHERE message_id=? AND user_id=?', args:[mid,uid] }).then(first),
  addMsgReaction:     (mid,uid,emoji) => db.execute({ sql:'INSERT OR REPLACE INTO message_reactions (message_id,user_id,emoji) VALUES (?,?,?)', args:[mid,uid,emoji] }),
  removeMsgReaction:  (mid,uid) => db.execute({ sql:'DELETE FROM message_reactions WHERE message_id=? AND user_id=?', args:[mid,uid] }),

  // Groups
  createGroup:       (name,desc,avatar,theme,by) => db.execute({ sql:'INSERT INTO groups (name,description,avatar,theme,created_by) VALUES (?,?,?,?,?)', args:[name,desc,avatar,theme,by] }),
  getGroup:          (id) => db.execute({ sql:'SELECT * FROM groups WHERE id=?', args:[id] }).then(first),
  updateGroup:       (id,name,desc,avatar,theme) => db.execute({ sql:'UPDATE groups SET name=?,description=?,avatar=?,theme=? WHERE id=?', args:[name,desc,avatar,theme,id] }),
  deleteGroup:       (id) => db.execute({ sql:'DELETE FROM groups WHERE id=?', args:[id] }),
  getUserGroups:     (uid) => db.execute({ sql:'SELECT g.*,gm.role as my_role,gm.nickname FROM groups g JOIN group_members gm ON gm.group_id=g.id WHERE gm.user_id=? ORDER BY g.created_at DESC', args:[uid] }).then(rows),
  getGroupMembers:   (gid) => db.execute({ sql:'SELECT gm.*,u.username,u.display_name,u.avatar,u.verified FROM group_members gm JOIN users u ON u.id=gm.user_id WHERE gm.group_id=? ORDER BY gm.role DESC,gm.joined_at ASC', args:[gid] }).then(rows),
  addGroupMember:    (gid,uid,role) => db.execute({ sql:'INSERT OR IGNORE INTO group_members (group_id,user_id,role) VALUES (?,?,?)', args:[gid,uid,role||'member'] }),
  removeGroupMember: (gid,uid) => db.execute({ sql:'DELETE FROM group_members WHERE group_id=? AND user_id=?', args:[gid,uid] }),
  updateMemberRole:  (gid,uid,role) => db.execute({ sql:'UPDATE group_members SET role=? WHERE group_id=? AND user_id=?', args:[role,gid,uid] }),
  updateMemberNick:  (gid,uid,nick) => db.execute({ sql:'UPDATE group_members SET nickname=? WHERE group_id=? AND user_id=?', args:[nick,gid,uid] }),
  isMember:          (gid,uid) => db.execute({ sql:'SELECT role FROM group_members WHERE group_id=? AND user_id=?', args:[gid,uid] }).then(first),

  // Group Messages
  getGroupMessages:       (gid) => db.execute({ sql:'SELECT * FROM group_messages WHERE group_id=? ORDER BY created_at ASC', args:[gid] }).then(rows),
  sendGroupMessage:       (gid,uid,fn,fa,content,image) => db.execute({ sql:'INSERT INTO group_messages (group_id,user_id,from_name,from_avatar,content,image) VALUES (?,?,?,?,?,?)', args:[gid,uid,fn,fa,content,image||''] }),
  getGroupMsgReactions:   (mid) => db.execute({ sql:'SELECT emoji,COUNT(*) as count FROM group_message_reactions WHERE message_id=? GROUP BY emoji', args:[mid] }).then(rows),
  getUserGroupMsgReaction:(mid,uid) => db.execute({ sql:'SELECT emoji FROM group_message_reactions WHERE message_id=? AND user_id=?', args:[mid,uid] }).then(first),
  addGroupMsgReaction:    (mid,uid,emoji) => db.execute({ sql:'INSERT OR REPLACE INTO group_message_reactions (message_id,user_id,emoji) VALUES (?,?,?)', args:[mid,uid,emoji] }),
  removeGroupMsgReaction: (mid,uid) => db.execute({ sql:'DELETE FROM group_message_reactions WHERE message_id=? AND user_id=?', args:[mid,uid] }),

  // Verify
  requestVerify:       (uid,username) => db.execute({ sql:"INSERT OR REPLACE INTO verify_requests (user_id,username,status) VALUES (?,?,'pending')", args:[uid,username] }),
  getVerifyRequests:   () => db.execute("SELECT vr.*,u.avatar,u.display_name FROM verify_requests vr JOIN users u ON u.id=vr.user_id WHERE vr.status='pending' ORDER BY vr.created_at DESC").then(rows),
  updateVerify:        (uid,status) => db.execute({ sql:'UPDATE verify_requests SET status=? WHERE user_id=?', args:[status,uid] }),
  setVerified:         (uid,val) => db.execute({ sql:'UPDATE users SET verified=? WHERE id=?', args:[val,uid] }),
  getUserVerifyStatus: (uid) => db.execute({ sql:'SELECT status FROM verify_requests WHERE user_id=?', args:[uid] }).then(first),
};

module.exports = { db, q, initDB };
