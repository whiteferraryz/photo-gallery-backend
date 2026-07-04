const express = require('express');
const pool = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();

// Lấy danh sách album của mình + album được mời
router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT a.*, u.username as owner_name,
        am.role as my_role
      FROM albums a
      JOIN users u ON a.owner_id = u.id
      JOIN album_members am ON am.album_id = a.id AND am.user_id = $1
      ORDER BY a.created_at DESC
    `, [req.user.id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Tạo album mới
router.post('/', auth, async (req, res) => {
  const { name, is_public } = req.body;
  if (!name) return res.status(400).json({ error: 'Thiếu tên album' });

  try {
    const result = await pool.query(
      'INSERT INTO albums (name, owner_id, is_public) VALUES ($1, $2, $3) RETURNING *',
      [name, req.user.id, is_public || false]
    );
    const album = result.rows[0];

    // Tự động thêm owner vào album_members
    await pool.query(
      'INSERT INTO album_members (album_id, user_id, role) VALUES ($1, $2, $3)',
      [album.id, req.user.id, 'owner']
    );

    res.json(album);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Đổi tên album
router.put('/:id', auth, async (req, res) => {
  const { name, is_public } = req.body;
  try {
    const check = await pool.query(
      'SELECT * FROM album_members WHERE album_id = $1 AND user_id = $2 AND role = $3',
      [req.params.id, req.user.id, 'owner']
    );
    if (check.rows.length === 0) {
      return res.status(403).json({ error: 'Không có quyền' });
    }

    const result = await pool.query(
      'UPDATE albums SET name = $1, is_public = $2 WHERE id = $3 RETURNING *',
      [name, is_public, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Xoá album
router.delete('/:id', auth, async (req, res) => {
  try {
    const check = await pool.query(
      'SELECT * FROM album_members WHERE album_id = $1 AND user_id = $2 AND role = $3',
      [req.params.id, req.user.id, 'owner']
    );
    if (check.rows.length === 0) {
      return res.status(403).json({ error: 'Không có quyền' });
    }

    await pool.query('DELETE FROM albums WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mời thành viên vào album
router.post('/:id/members', auth, async (req, res) => {
  const { username, role } = req.body;
  const validRoles = ['editor', 'viewer', 'readonly'];

  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: 'Role không hợp lệ' });
  }

  try {
    // Kiểm tra quyền owner
    const check = await pool.query(
      'SELECT * FROM album_members WHERE album_id = $1 AND user_id = $2 AND role = $3',
      [req.params.id, req.user.id, 'owner']
    );
    if (check.rows.length === 0) {
      return res.status(403).json({ error: 'Không có quyền' });
    }

    // Tìm user được mời
    const userResult = await pool.query(
      'SELECT id FROM users WHERE username = $1',
      [username]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy user' });
    }

    const invitedUser = userResult.rows[0];

    await pool.query(
      `INSERT INTO album_members (album_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (album_id, user_id) DO UPDATE SET role = $3`,
      [req.params.id, invitedUser.id, role]
    );

    res.json({ success: true, message: `Đã mời ${username} với role ${role}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Xoá thành viên khỏi album
router.delete('/:id/members/:userId', auth, async (req, res) => {
  try {
    const check = await pool.query(
      'SELECT * FROM album_members WHERE album_id = $1 AND user_id = $2 AND role = $3',
      [req.params.id, req.user.id, 'owner']
    );
    if (check.rows.length === 0) {
      return res.status(403).json({ error: 'Không có quyền' });
    }

    await pool.query(
      'DELETE FROM album_members WHERE album_id = $1 AND user_id = $2',
      [req.params.id, req.params.userId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Lấy danh sách thành viên album
router.get('/:id/members', auth, async (req, res) => {
  try {
    const check = await pool.query(
      'SELECT role FROM album_members WHERE album_id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (check.rows.length === 0) {
      return res.status(403).json({ error: 'Không có quyền' });
    }

    const result = await pool.query(`
      SELECT am.user_id, am.role, am.invited_at, u.username
      FROM album_members am
      JOIN users u ON u.id = am.user_id
      WHERE am.album_id = $1
      ORDER BY am.invited_at ASC
    `, [req.params.id]);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;