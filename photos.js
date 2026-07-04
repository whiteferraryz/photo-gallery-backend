const express = require('express');
const multer = require('multer');
const multerS3 = require('multer-s3');
const { S3Client, DeleteObjectCommand, CopyObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const pool = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Helper: kiểm tra quyền trong album
async function checkPermission(albumId, userId, requiredRoles) {
  const result = await pool.query(
    'SELECT role FROM album_members WHERE album_id = $1 AND user_id = $2',
    [albumId, userId]
  );
  if (result.rows.length === 0) return null;
  const role = result.rows[0].role;
  return requiredRoles.includes(role) ? role : null;
}

const upload = multer({
  storage: multerS3({
    s3,
    bucket: process.env.S3_BUCKET,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: (req, file, cb) => {
      cb(null, `albums/${req.params.albumId}/${Date.now()}-${file.originalname}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Chỉ chấp nhận file ảnh!'), false);
  },
});

// Lấy danh sách ảnh trong album
router.get('/:albumId', auth, async (req, res) => {
  try {
    const role = await checkPermission(req.params.albumId, req.user.id,
      ['owner', 'editor', 'viewer', 'readonly']);
    if (!role) return res.status(403).json({ error: 'Không có quyền truy cập album' });

    const result = await pool.query(
      `SELECT p.*, u.username as uploader_name
       FROM photos p
       JOIN users u ON p.uploader_id = u.id
       WHERE p.album_id = $1
       ORDER BY p.created_at DESC`,
      [req.params.albumId]
    );

    const photos = result.rows.map(p => ({
      ...p,
      url: `https://${process.env.CLOUDFRONT_DOMAIN}/${p.s3_key}`,
    }));

    res.json(photos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upload ảnh vào album
router.post('/:albumId/upload', auth, (req, res, next) => {
  checkPermission(req.params.albumId, req.user.id, ['owner', 'editor'])
    .then(role => {
      if (!role) return res.status(403).json({ error: 'Không có quyền upload' });
      next();
    })
    .catch(err => res.status(500).json({ error: err.message }));
}, upload.single('photo'), async (req, res) => {
  try {
    const result = await pool.query(
      `INSERT INTO photos (album_id, uploader_id, s3_key, filename, size)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [
        req.params.albumId,
        req.user.id,
        req.file.key,
        req.file.originalname,
        req.file.size,
      ]
    );

    const photo = result.rows[0];
    res.json({
      ...photo,
      url: `https://${process.env.CLOUDFRONT_DOMAIN}/${photo.s3_key}`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Xoá ảnh
router.delete('/:albumId/:photoId', auth, async (req, res) => {
  try {
    const role = await checkPermission(req.params.albumId, req.user.id, ['owner']);
    if (!role) return res.status(403).json({ error: 'Chỉ owner mới được xoá ảnh' });

    const photoResult = await pool.query(
      'SELECT * FROM photos WHERE id = $1 AND album_id = $2',
      [req.params.photoId, req.params.albumId]
    );
    if (photoResult.rows.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy ảnh' });
    }

    const photo = photoResult.rows[0];

    // Xoá khỏi S3
    await s3.send(new DeleteObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: photo.s3_key,
    }));

    // Xoá khỏi DB
    await pool.query('DELETE FROM photos WHERE id = $1', [req.params.photoId]);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Chuyển ảnh sang album khác
router.put('/:albumId/:photoId/move', auth, async (req, res) => {
  const { targetAlbumId } = req.body;
  if (!targetAlbumId) return res.status(400).json({ error: 'Thiếu targetAlbumId' });

  try {
    // Phải là owner album nguồn
    const role = await checkPermission(req.params.albumId, req.user.id, ['owner']);
    if (!role) return res.status(403).json({ error: 'Không có quyền' });

    // Phải là owner/editor album đích
    const targetRole = await checkPermission(targetAlbumId, req.user.id, ['owner', 'editor']);
    if (!targetRole) return res.status(403).json({ error: 'Không có quyền ở album đích' });

    const photoResult = await pool.query(
      'SELECT * FROM photos WHERE id = $1 AND album_id = $2',
      [req.params.photoId, req.params.albumId]
    );
    if (photoResult.rows.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy ảnh' });
    }

    const photo = photoResult.rows[0];
    const newKey = `albums/${targetAlbumId}/${Date.now()}-${photo.filename}`;

    // Copy sang key mới trên S3
    await s3.send(new CopyObjectCommand({
      Bucket: process.env.S3_BUCKET,
      CopySource: `${process.env.S3_BUCKET}/${photo.s3_key}`,
      Key: newKey,
    }));

    // Xoá key cũ trên S3
    await s3.send(new DeleteObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: photo.s3_key,
    }));

    // Cập nhật DB
    const updated = await pool.query(
      'UPDATE photos SET album_id = $1, s3_key = $2 WHERE id = $3 RETURNING *',
      [targetAlbumId, newKey, req.params.photoId]
    );

    res.json({
      ...updated.rows[0],
      url: `https://${process.env.CLOUDFRONT_DOMAIN}/${newKey}`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Tải ảnh — Pre-signed URL (có thời hạn 15 phút)
router.get('/:albumId/:photoId/download', auth, async (req, res) => {
  try {
    const role = await checkPermission(req.params.albumId, req.user.id,
      ['owner', 'editor', 'viewer']);
    if (!role) return res.status(403).json({ error: 'Không có quyền tải ảnh' });

    const photoResult = await pool.query(
      'SELECT * FROM photos WHERE id = $1 AND album_id = $2',
      [req.params.photoId, req.params.albumId]
    );
    if (photoResult.rows.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy ảnh' });
    }

    const photo = photoResult.rows[0];
    const command = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: photo.s3_key,
      ResponseContentDisposition: `attachment; filename="${photo.filename}"`,
    });

    const url = await getSignedUrl(s3, command, { expiresIn: 900 }); // 15 phút
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;