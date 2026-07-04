photo-gallery-backend/
├── server.js
├── db.js                 ← kết nối PostgreSQL
├── middleware/
│   └── auth.js            ← verify JWT
├── routes/
│   ├── auth.js             ← đăng ký/đăng nhập
│   ├── albums.js           ← CRUD album
│   └── photos.js           ← upload/xoá/chuyển ảnh
├── .env
└── db.sql