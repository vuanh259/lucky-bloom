# GitHub Pages + Supabase

Repo công khai: https://github.com/vuanh259/lucky-bloom
Web: https://vuanh259.github.io/lucky-bloom/
Project Supabase: vqxykgotvroefjqhkdni

## Cấu hình

File .env chỉ lưu trên máy, không commit. Điền ADMIN_PASSWORD tối thiểu 12 ký tự. SUPABASE_URL và SUPABASE_PROJECT_REF đã điền theo project. Không đưa service-role key lên frontend.

1. Trong Supabase SQL Editor, chạy supabase/migrations/202610160001_lucky_bloom.sql một lần cho database mới. Migration tạo bảng riêng, RLS và bucket kk riêng tư cho ảnh QR. Tên, kết quả và thông tin nhận quà nằm trong Postgres, không phải file trong bucket.
2. Chạy npx supabase login rồi npm run deploy:supabase. Script đặt mật khẩu quản trị, origin và deploy Edge Function qua API, không cần Docker.
3. GitHub Settings → Pages → Source: GitHub Actions. Push main sẽ kiểm tra, build và deploy bằng .github/workflows/pages.yml.

Chỉ dist-pages được xuất bản, gồm HTML/CSS/JS và URL Supabase công khai. .env, dữ liệu SQLite và mật khẩu không nằm trong bản build.

## Kiểm tra

npm run check
npm test
npm run build:pages

Người dùng nhập tên và giới tính, không đăng ký. Nhập lại cùng tên chỉ xem được kết quả; thông tin nhận quà riêng tư cần phiên sở hữu hoặc quyền quản trị. Sau khi gửi phương thức nhận quà sẽ khóa đổi quà ở máy chủ. Trang quản trị: /lucky-bloom/admin.html.

## Danh sách quà 18/10

Database mới cần chạy cả hai migration theo thứ tự tên file. Database đã chạy bản đầu chỉ áp dụng 202610180001_gift_catalog.sql một lần. Migration giữ nguyên hồ sơ, kết quả và thông tin nhận quà; các món ngừng quay được giữ trong database để xem lại.

Trọng số loại giải lấy từ cơ cấu: 2 : 3 : 10 : 20 : 60. Chọn loại giải trước, rồi chọn đều các món trong loại đó. Số lượng đang dùng làm trọng số, không phải tồn kho tự giảm. Mỗi loại có một màu riêng. Giải đặc biệt không thể bật quy đổi ở quản trị.

