# 🌸 Lucky Bloom

Web vòng quay may mắn bằng tiếng Việt, giao diện pastel cute, chạy bằng **Node.js 22 + SQLite**, không cần cài thư viện ngoài.

## Chức năng

- Đăng ký bằng tên hiển thị, giới tính, tên đăng nhập và mật khẩu; đăng nhập lại để tiếp tục.
- Chọn **Nam**: vẫn lưu hồ sơ, chuyển đến `/bai-anh-em` có dòng **“bai anh em”**. Máy chủ chặn quyền quay/chọn quà.
- Chọn **Nữ**: vào vòng quay, **3 lượt mỗi tài khoản**. Tải lại trang, đăng xuất hoặc đổi thiết bị không khôi phục lượt.
- Kết quả được sinh ngẫu nhiên và lưu ở máy chủ trước khi chạy hiệu ứng. Gửi đồng thời nhiều yêu cầu vẫn chỉ có tối đa 3 lượt.
- Sau đủ 3 lượt, chọn **1 món từ chính 3 kết quả đó**, xác nhận rồi lưu cố định.
- `/admin`: mật khẩu quản trị riêng; xem tên, tài khoản, giới tính, từng lượt, món chốt và thời gian; tìm kiếm và xuất CSV cho Excel.
- Lưu tập trung bằng SQLite; hồ sơ và lượt quay tồn tại sau khi khởi động lại máy chủ.
- Giao diện responsive, hỗ trợ giảm chuyển động theo thiết lập thiết bị; không dùng tài nguyên bên thứ ba.

## Chạy trên máy

Yêu cầu Node.js **22.13+** (đã kiểm thử với 22.20). SQLite tích hợp có thể hiện cảnh báo experimental trên Node 22.

```powershell
Copy-Item .env.example .env
```

Mở `.env`, đặt `ADMIN_PASSWORD` thành mật khẩu riêng **tối thiểu 12 ký tự**. Không đưa `.env` lên GitHub. Nếu chưa cấu hình, trang quản trị tự khóa.

```sh
npm start
```

- Người chơi: http://127.0.0.1:3000
- Quản trị: http://127.0.0.1:3000/admin

Không cần `npm install`. Dừng bằng Ctrl+C. Dữ liệu mặc định nằm trong `data/lucky-bloom.sqlite` (không được Git theo dõi).

## Đổi danh sách quà

Sửa `gifts.json` rồi khởi động lại. Có thể cấu hình 2–12 ô; mỗi ô có `id` duy nhất, `name`, `emoji`, `color` dạng `#rrggbb`. Mỗi ô có xác suất bằng nhau, các lượt có thể trùng quà. Danh sách hiện tại là **quà mẫu**, cần đổi theo quà thật của bạn trước sự kiện. Kết quả cũ giữ bản chụp món quà lúc quay.

## Triển khai

Đây là ứng dụng có máy chủ, **không chạy đầy đủ bằng GitHub Pages**. Dùng VPS hoặc dịch vụ chạy Node/Docker có ổ lưu bền vững.

```sh
docker build -t lucky-bloom .
docker run -d --name lucky-bloom -p 3000:3000 --env-file .env -e HOST=0.0.0.0 -e DATABASE_PATH=/app/data/lucky-bloom.sqlite -v lucky-bloom-data:/app/data lucky-bloom
```

Đặt HTTPS reverse proxy phía trước và `COOKIE_SECURE=true` khi truy cập qua HTTPS. Giữ `false` khi chạy HTTP tại máy. Trên dịch vụ hosting, đặt `HOST=0.0.0.0`, `PORT` theo dịch vụ, `ADMIN_PASSWORD` qua secret manager và `DATABASE_PATH` trỏ vào ổ đĩa bền vững. Chạy một instance Node cho cơ sở dữ liệu này; không dùng filesystem tạm của serverless.

Sao lưu SQLite bằng công cụ backup SQLite, hoặc dừng app trước khi copy thư mục `data/` (kể cả file WAL/SHM nếu có). Mật khẩu được băm bằng scrypt, session dùng token ngẫu nhiên lưu hash phía máy chủ, cookie HttpOnly/SameSite, kiểm tra origin và giới hạn tốc độ đăng nhập. Không có mật khẩu quản trị mặc định. Dữ liệu người chơi không được đưa lên repo.

## Kiểm thử

```sh
npm run check
npm test
```

Kiểm thử bao gồm giới hạn 3 lượt khi gọi đồng thời, chọn quà thuộc tài khoản, không được đổi quà đã chốt, phân quyền nam/nữ và quản trị, CSRF, đăng nhập lại và giữ dữ liệu khi restart. GitHub Actions chạy các kiểm tra này trên push/PR.

## Giới hạn và vận hành

- Giới hạn là **3 lượt cho mỗi tài khoản**, không phải mỗi con người. Một người tạo nhiều tài khoản vẫn có thêm lượt; muốn chống điều này cần danh sách khách mời, mã mời hoặc xác minh danh tính riêng.
- Người chơi tự khai giới tính. Không có luồng sửa giới tính để tránh tự mở lại quyền quay.
- Quà mẫu không có số lượng tồn kho; chưa có cơ chế phát quà tự động, gửi email hoặc khôi phục mật khẩu. Người tổ chức xem lựa chọn để trao quà.
- Tên, giới tính, lịch sử quay và lựa chọn là dữ liệu cá nhân của sự kiện. Chỉ chia sẻ mật khẩu quản trị với người được phép; không chia sẻ tệp SQLite.
- Danh sách quản trị hiện tải toàn bộ hồ sơ, phù hợp sự kiện nhỏ. Sự kiện lớn nên bổ sung phân trang và giới hạn tốc độ ở reverse proxy.

## Cấu trúc

```text
server.mjs          HTTP server, tài khoản, SQLite, luật chơi, quản trị
gifts.json          Danh sách quà cấu hình được
public/             Giao diện người chơi và quản trị
test/app.test.mjs    Kiểm thử API tích hợp
.github/workflows/  CI
Dockerfile          Triển khai có ổ đĩa bền vững
```
