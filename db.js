// db.js - قاعدة البيانات والدوال الأساسية
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

let db = null;

// تهيئة قاعدة البيانات
async function initDB() {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(path.join(__dirname, 'data.db'), async (err) => {
      if (err) {
        reject(err);
      } else {
        // إنشاء الجداول إذا لم تكن موجودة
        const tables = [
          `CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            display_name TEXT,
            bio TEXT,
            avatar TEXT,
            cover TEXT,
            game_id TEXT,
            role TEXT DEFAULT 'user',
            verified INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )`,
          
          `CREATE TABLE IF NOT EXISTS records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            display_name TEXT,
            member_type TEXT,
            avatar TEXT,
            content TEXT,
            image TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
          )`,
          
          `CREATE TABLE IF NOT EXISTS reactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            record_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            emoji TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(record_id) REFERENCES records(id),
            FOREIGN KEY(user_id) REFERENCES users(id),
            UNIQUE(record_id, user_id)
          )`,
          
          `CREATE TABLE IF NOT EXISTS comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            record_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            username TEXT,
            display_name TEXT,
            avatar TEXT,
            member_type TEXT,
            content TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(record_id) REFERENCES records(id),
            FOREIGN KEY(user_id) REFERENCES users(id)
          )`,

          `CREATE TABLE IF NOT EXISTS follows (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            follower_id INTEGER NOT NULL,
            following_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(follower_id) REFERENCES users(id),
            FOREIGN KEY(following_id) REFERENCES users(id),
            UNIQUE(follower_id, following_id)
          )`,

          `CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sender_id INTEGER NOT NULL,
            receiver_id INTEGER NOT NULL,
            sender_name TEXT,
            receiver_name TEXT,
            content TEXT,
            image TEXT,
            is_read INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(sender_id) REFERENCES users(id),
            FOREIGN KEY(receiver_id) REFERENCES users(id)
          )`,

          `CREATE TABLE IF NOT EXISTS message_reactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            emoji TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(message_id) REFERENCES messages(id),
            FOREIGN KEY(user_id) REFERENCES users(id),
            UNIQUE(message_id, user_id)
          )`,

          `CREATE TABLE IF NOT EXISTS groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            avatar TEXT,
            theme TEXT DEFAULT 'default',
            background TEXT DEFAULT 'default',
            creator_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(creator_id) REFERENCES users(id)
          )`,

          `CREATE TABLE IF NOT EXISTS group_members (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            role TEXT DEFAULT 'member',
            nickname TEXT,
            joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(group_id) REFERENCES groups(id),
            FOREIGN KEY(user_id) REFERENCES users(id),
            UNIQUE(group_id, user_id)
          )`,

          `CREATE TABLE IF NOT EXISTS group_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            username TEXT,
            avatar TEXT,
            content TEXT,
            image TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(group_id) REFERENCES groups(id),
            FOREIGN KEY(user_id) REFERENCES users(id)
          )`,

          `CREATE TABLE IF NOT EXISTS group_message_reactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            emoji TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(message_id) REFERENCES group_messages(id),
            FOREIGN KEY(user_id) REFERENCES users(id),
            UNIQUE(message_id, user_id)
          )`,

          `CREATE TABLE IF NOT EXISTS verify_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            username TEXT,
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
          )`
        ];

        let completed = 0;
        const total = tables.length;

        tables.forEach(sql => {
          db.run(sql, (err) => {
            if (err) reject(err);
            completed++;
            if (completed === total) resolve();
          });
        });
      }
    });
  });
}

// Helper function لتحويل callback-based إلى Promise
function runAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastInsertRowid: this.lastID });
    });
  });
}

function allAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

function getAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

// دوال المستخدمين
const q = {
  // Users
  getUserByEmail: (email) => getAsync('SELECT * FROM users WHERE email = ?', [email]),
  getUserById: (id) => getAsync('SELECT * FROM users WHERE id = ?', [id]),
  createUser: (username, email, hash) => runAsync(
    'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
    [username, email, hash]
  ),
  listPublicUsers: () => allAsync('SELECT id, username, display_name, avatar, bio FROM users'),
  listUsers: () => allAsync('SELECT * FROM users'),
  updateProfile: (displayName, bio, gameId, avatar, cover, userId) => runAsync(
    'UPDATE users SET display_name = ?, bio = ?, game_id = ?, avatar = ?, cover = ? WHERE id = ?',
    [displayName, bio, gameId, avatar, cover, userId]
  ),
  updateUserRole: (role, userId) => runAsync('UPDATE users SET role = ? WHERE id = ?', [role, userId]),
  deleteUser: (userId) => runAsync('DELETE FROM users WHERE id = ?', [userId]),
  searchUsers: (q) => allAsync(
    'SELECT id, username, display_name, avatar FROM users WHERE username LIKE ? OR display_name LIKE ? LIMIT 20',
    [`%${q}%`, `%${q}%`]
  ),

  // Profile with viewer context
  getPublicProfile: async (username, viewerId = null) => {
    const user = await getAsync('SELECT * FROM users WHERE username = ?', [username]);
    if (!user) return null;
    
    if (viewerId) {
      const isFollowing = await getAsync(
        'SELECT * FROM follows WHERE follower_id = ? AND following_id = ?',
        [viewerId, user.id]
      );
      user.is_following = !!isFollowing;
    }
    
    user.followers_count = (await getAsync('SELECT COUNT(*) as count FROM follows WHERE following_id = ?', [user.id]))?.count || 0;
    user.following_count = (await getAsync('SELECT COUNT(*) as count FROM follows WHERE follower_id = ?', [user.id]))?.count || 0;
    
    return user;
  },

  // Posts/Records
  listRecords: () => allAsync(
    'SELECT r.*, u.username, u.display_name FROM records r JOIN users u ON r.user_id = u.id ORDER BY r.created_at DESC'
  ),
  createRecord: (userId, displayName, memberType, avatar, content, image) => runAsync(
    'INSERT INTO records (user_id, display_name, member_type, avatar, content, image) VALUES (?, ?, ?, ?, ?, ?)',
    [userId, displayName, memberType, avatar, content, image]
  ),
  getRecord: (id) => getAsync('SELECT * FROM records WHERE id = ?', [id]),
  deleteRecord: (id) => runAsync('DELETE FROM records WHERE id = ?', [id]),
  getUserPosts: (userId) => allAsync('SELECT * FROM records WHERE user_id = ? ORDER BY created_at DESC', [userId]),

  // Reactions on Records
  getAllReactions: async () => {
    return allAsync(`
      SELECT record_id, emoji, COUNT(*) as count FROM reactions GROUP BY record_id, emoji
    `);
  },
  getReactions: (recordId) => allAsync(
    'SELECT emoji, COUNT(*) as count FROM reactions WHERE record_id = ? GROUP BY emoji',
    [recordId]
  ),
  getUserReaction: (recordId, userId) => getAsync(
    'SELECT emoji FROM reactions WHERE record_id = ? AND user_id = ?',
    [recordId, userId]
  ),
  getUserAllReactions: (userId) => allAsync(
    'SELECT record_id, emoji FROM reactions WHERE user_id = ?',
    [userId]
  ),
  addReaction: (recordId, userId, emoji) => runAsync(
    'INSERT OR REPLACE INTO reactions (record_id, user_id, emoji) VALUES (?, ?, ?)',
    [recordId, userId, emoji]
  ),
  removeReaction: (recordId, userId) => runAsync(
    'DELETE FROM reactions WHERE record_id = ? AND user_id = ?',
    [recordId, userId]
  ),

  // Comments
  getAllComments: () => allAsync(
    'SELECT * FROM comments ORDER BY created_at DESC'
  ),
  getComments: (recordId) => allAsync(
    'SELECT * FROM comments WHERE record_id = ? ORDER BY created_at ASC',
    [recordId]
  ),
  addComment: (recordId, userId, username, displayName, avatar, memberType, content) => runAsync(
    'INSERT INTO comments (record_id, user_id, username, display_name, avatar, member_type, content) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [recordId, userId, username, displayName, avatar, memberType, content]
  ),
  deleteComment: (commentId, userId, role) => runAsync(
    'DELETE FROM comments WHERE id = ? AND (user_id = ? OR ? = ?)',
    [commentId, userId, role, 'admin']
  ),

  // Follow System
  followUser: (followerId, followingId) => runAsync(
    'INSERT OR IGNORE INTO follows (follower_id, following_id) VALUES (?, ?)',
    [followerId, followingId]
  ),
  unfollowUser: (followerId, followingId) => runAsync(
    'DELETE FROM follows WHERE follower_id = ? AND following_id = ?',
    [followerId, followingId]
  ),
  getFollowers: (userId) => allAsync(
    'SELECT u.id, u.username, u.display_name, u.avatar FROM follows f JOIN users u ON f.follower_id = u.id WHERE f.following_id = ?',
    [userId]
  ),
  getFollowing: (userId) => allAsync(
    'SELECT u.id, u.username, u.display_name, u.avatar FROM follows f JOIN users u ON f.following_id = u.id WHERE f.follower_id = ?',
    [userId]
  ),
  countFollowers: (userId) => getAsync(
    'SELECT COUNT(*) as count FROM follows WHERE following_id = ?',
    [userId]
  ).then(r => r?.count || 0),
  countFollowing: (userId) => getAsync(
    'SELECT COUNT(*) as count FROM follows WHERE follower_id = ?',
    [userId]
  ).then(r => r?.count || 0),

  // Messages
  unreadCount: (userId) => getAsync(
    'SELECT COUNT(*) as count FROM messages WHERE receiver_id = ? AND is_read = 0',
    [userId]
  ).then(r => ({ unread: r?.count || 0 })),
  getConversations: (userId) => allAsync(`
    SELECT DISTINCT 
      CASE WHEN sender_id = ? THEN receiver_id ELSE sender_id END as other_user_id,
      (SELECT display_name FROM users WHERE id = CASE WHEN sender_id = ? THEN receiver_id ELSE sender_id END) as name,
      (SELECT avatar FROM users WHERE id = CASE WHEN sender_id = ? THEN receiver_id ELSE sender_id END) as avatar,
      MAX(created_at) as last_message_at
    FROM messages 
    WHERE sender_id = ? OR receiver_id = ?
    GROUP BY other_user_id
    ORDER BY last_message_at DESC
  `, [userId, userId, userId, userId, userId]),
  getMessages: (userId, otherId) => allAsync(
    'SELECT * FROM messages WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?) ORDER BY created_at ASC',
    [userId, otherId, otherId, userId]
  ),
  sendMessage: (senderId, receiverId, senderName, receiverName, content, image) => runAsync(
    'INSERT INTO messages (sender_id, receiver_id, sender_name, receiver_name, content, image) VALUES (?, ?, ?, ?, ?, ?)',
    [senderId, receiverId, senderName, receiverName, content, image]
  ),
  markRead: (otherId, userId) => runAsync(
    'UPDATE messages SET is_read = 1 WHERE sender_id = ? AND receiver_id = ?',
    [otherId, userId]
  ),

  // Message Reactions
  getMsgReactions: (messageId) => allAsync(
    'SELECT emoji, COUNT(*) as count FROM message_reactions WHERE message_id = ? GROUP BY emoji',
    [messageId]
  ),
  getUserMsgReaction: (messageId, userId) => getAsync(
    'SELECT emoji FROM message_reactions WHERE message_id = ? AND user_id = ?',
    [messageId, userId]
  ),
  addMsgReaction: (messageId, userId, emoji) => runAsync(
    'INSERT OR REPLACE INTO message_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)',
    [messageId, userId, emoji]
  ),
  removeMsgReaction: (messageId, userId) => runAsync(
    'DELETE FROM message_reactions WHERE message_id = ? AND user_id = ?',
    [messageId, userId]
  ),

  // Groups
  getUserGroups: (userId) => allAsync(
    'SELECT g.* FROM groups g JOIN group_members gm ON g.id = gm.group_id WHERE gm.user_id = ?',
    [userId]
  ),
  createGroup: (name, description, avatar, theme, background, creatorId) => runAsync(
    'INSERT INTO groups (name, description, avatar, theme, background, creator_id) VALUES (?, ?, ?, ?, ?, ?)',
    [name, description, avatar, theme, background, creatorId]
  ),
  getGroup: (groupId) => getAsync('SELECT * FROM groups WHERE id = ?', [groupId]),
  updateGroup: (groupId, name, description, avatar, theme, background) => runAsync(
    'UPDATE groups SET name = ?, description = ?, avatar = ?, theme = ?, background = ? WHERE id = ?',
    [name, description, avatar, theme, background, groupId]
  ),
  deleteGroup: (groupId) => runAsync('DELETE FROM groups WHERE id = ?', [groupId]),

  // Group Members
  isMember: (groupId, userId) => getAsync(
    'SELECT * FROM group_members WHERE group_id = ? AND user_id = ?',
    [groupId, userId]
  ),
  getGroupMembers: (groupId) => allAsync(
    'SELECT gm.*, u.username, u.display_name, u.avatar FROM group_members gm JOIN users u ON gm.user_id = u.id WHERE gm.group_id = ?',
    [groupId]
  ),
  addGroupMember: (groupId, userId, role) => runAsync(
    'INSERT OR IGNORE INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
    [groupId, userId, role]
  ),
  removeGroupMember: (groupId, userId) => runAsync(
    'DELETE FROM group_members WHERE group_id = ? AND user_id = ?',
    [groupId, userId]
  ),
  updateMemberRole: (groupId, userId, role) => runAsync(
    'UPDATE group_members SET role = ? WHERE group_id = ? AND user_id = ?',
    [role, groupId, userId]
  ),
  updateMemberNick: (groupId, userId, nickname) => runAsync(
    'UPDATE group_members SET nickname = ? WHERE group_id = ? AND user_id = ?',
    [nickname, groupId, userId]
  ),

  // Group Messages
  getGroupMessages: (groupId) => allAsync(
    'SELECT * FROM group_messages WHERE group_id = ? ORDER BY created_at ASC',
    [groupId]
  ),
  sendGroupMessage: (groupId, userId, username, avatar, content, image) => runAsync(
    'INSERT INTO group_messages (group_id, user_id, username, avatar, content, image) VALUES (?, ?, ?, ?, ?, ?)',
    [groupId, userId, username, avatar, content, image]
  ),

  // Group Message Reactions
  getGroupMsgReactions: (messageId) => allAsync(
    'SELECT emoji, COUNT(*) as count FROM group_message_reactions WHERE message_id = ? GROUP BY emoji',
    [messageId]
  ),
  getUserGroupMsgReaction: (messageId, userId) => getAsync(
    'SELECT emoji FROM group_message_reactions WHERE message_id = ? AND user_id = ?',
    [messageId, userId]
  ),
  addGroupMsgReaction: (messageId, userId, emoji) => runAsync(
    'INSERT OR REPLACE INTO group_message_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)',
    [messageId, userId, emoji]
  ),
  removeGroupMsgReaction: (messageId, userId) => runAsync(
    'DELETE FROM group_message_reactions WHERE message_id = ? AND user_id = ?',
    [messageId, userId]
  ),

  // Verify
  requestVerify: (userId, username) => runAsync(
    'INSERT INTO verify_requests (user_id, username, status) VALUES (?, ?, ?)',
    [userId, username, 'pending']
  ),
  getUserVerifyStatus: (userId) => getAsync(
    'SELECT * FROM verify_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
    [userId]
  ),
  getVerifyRequests: () => allAsync(
    'SELECT * FROM verify_requests WHERE status = ? ORDER BY created_at ASC',
    ['pending']
  ),
  updateVerify: (userId, status) => runAsync(
    'UPDATE verify_requests SET status = ? WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
    [status, userId]
  ),
  setVerified: (userId, verified) => runAsync(
    'UPDATE users SET verified = ? WHERE id = ?',
    [verified, userId]
  )
};

module.exports = { q, initDB };
