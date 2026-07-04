-- Bảng người dùng
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Bảng album
CREATE TABLE albums (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_public BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Bảng ảnh
CREATE TABLE photos (
  id SERIAL PRIMARY KEY,
  album_id INTEGER NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  uploader_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  s3_key VARCHAR(500) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  size INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Bảng phân quyền thành viên trong album
CREATE TABLE album_members (
  id SERIAL PRIMARY KEY,
  album_id INTEGER NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('owner', 'editor', 'viewer', 'readonly')),
  invited_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(album_id, user_id)
);

-- Index để query nhanh hơn
CREATE INDEX idx_photos_album ON photos(album_id);
CREATE INDEX idx_album_members_user ON album_members(user_id);
CREATE INDEX idx_album_members_album ON album_members(album_id);

DELETE FROM users WHERE email = 'nguyenvinhthang1414@gmail.com';