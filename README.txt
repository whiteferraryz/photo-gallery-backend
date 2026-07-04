# Photo Gallery Web App

Website chia sẻ ảnh trực tuyến — Đồ án cuối kỳ

## Mô tả
Ứng dụng web cho phép người dùng upload, quản lý và chia sẻ ảnh theo album,
với hệ thống phân quyền thành viên trong từng album.

## Tính năng
- Đăng ký / Đăng nhập (JWT Authentication)
- Tạo, đổi tên, xoá album (public/private)
- Upload ảnh lên album (lưu trên AWS S3)
- Xem ảnh qua CDN (AWS CloudFront)
- Tải ảnh bằng Pre-signed URL (có thời hạn)
- Chuyển ảnh giữa các album
- Mời thành viên vào album với phân quyền:
  - **Owner**: toàn quyền
  - **Editor**: xem, upload
  - **Viewer**: xem, tải
  - **Read-only**: chỉ xem

## Kiến trúc hệ thống
- User → CloudFront (CDN) → S3 (lưu ảnh)
- User → Render (Backend API) → PostgreSQL (metadata)
→ S3 (upload ảnh)

## Tech Stack
| Layer | Công nghệ |
|---|---|
| Frontend | HTML, CSS, JavaScript (Vanilla) |
| Backend | Node.js, Express.js |
| Database | PostgreSQL (Render) |
| Storage | AWS S3 |
| CDN | AWS CloudFront |
| Hosting | Render |
| Auth | JWT (jsonwebtoken + bcryptjs) |

## Cài đặt local

### Yêu cầu
- Node.js >= 18
- Tài khoản AWS (S3 + CloudFront)
- PostgreSQL (hoặc dùng Render free tier)

### Các bước chạy

1. Clone repo:
```bash
git clone https://github.com/whiteferraryz/photo-gallery-backend.git
cd photo-gallery-backend
```

2. Cài dependencies:
```bash
npm install
```

3. Tạo file `.env`:
```env
AWS_REGION=ap-southeast-2
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
S3_BUCKET=your_bucket
CLOUDFRONT_DOMAIN=your_distribution.cloudfront.net
DATABASE_URL=postgresql://...
JWT_SECRET=your_secret_key
PORT=3000
```

4. Chạy server:
```bash
node server.js
```

5. Mở browser: `http://localhost:3000`

## Biến môi trường
| Biến | Mô tả |
|---|---|
| `AWS_REGION` | Region của S3 bucket |
| `AWS_ACCESS_KEY_ID` | IAM Access Key |
| `AWS_SECRET_ACCESS_KEY` | IAM Secret Key |
| `S3_BUCKET` | Tên S3 bucket |
| `CLOUDFRONT_DOMAIN` | Domain CloudFront |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret key để ký JWT |

## Tác giả
Nguyễn Vĩnh Thắng — Đồ án cuối kỳ 2026