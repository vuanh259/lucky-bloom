> **Deploy miễn phí: GitHub Pages + Supabase.** Đọc [SUPABASE-DEPLOY.md](SUPABASE-DEPLOY.md), điền `.env` (đã tạo sẵn), chạy migration và deploy theo hướng dẫn. Bản Node.js/SQLite dưới đây vẫn dùng để chạy local. Dữ liệu local không tự chuyển lên Supabase.

# 🌸 Lucky Bloom

Web vòng quay may mắn bằng tiếng Việt, giao diện pastel cute, chạy bằng **Node.js 22 + SQLite**, không cần cài thư viện ngoài.

## Chức năng

- Chỉ điền tên và giới tính để vào chơi, không cần đăng ký/đăng nhập. Ô tên nhắc rõ: phải là tên người tổ chức nhận ra, nếu không kết quả không được tính.
- Chọn **Nam**: vẫn lưu hồ sơ, chuyển đến `/bai-anh-em` có dòng **“bai anh em”**. Máy chủ chặn quyền quay/chọn quà.
- Chọn **Nữ**: vào vòng quay, **3 lượt mỗi phiên người chơi trên trình duyệt**. Tải lại trang hoặc mở lại cùng trình duyệt vẫn giữ số lượt; cookie nhận diện tồn tại tối đa 365 ngày.
- Kết quả được sinh ngẫu nhiên và lưu ở máy chủ trước khi chạy hiệu ứng. Gửi đồng thời nhiều yêu cầu vẫn chỉ có tối đa 3 lượt.
- Sau đủ 3 lượt, chọn **1 món từ chính 3 kết quả đó**, xác nhận bằng popup; có thể đổi trong 3 kết quả.
- `/admin`: mật khẩu quản trị riêng; xem tên, mã người chơi, giới tính, từng lượt, món chốt và thời gian; tìm kiếm và xuất CSV cho Excel.
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

Chạy local không cần thư viện runtime. Khi kiểm thử hoặc triển khai, chạy `npm ci` để cài dev dependencies. Dừng bằng Ctrl+C. Dữ liệu mặc định nằm trong `data/lucky-bloom.sqlite` (không được Git theo dõi).

## Đổi danh sách quà

Sửa `gifts.json` rồi khởi động lại. Có thể cấu hình 2–12 ô; mỗi ô có `id` duy nhất, `name`, `emoji`, `color` dạng `#rrggbb`. Mỗi ô có xác suất bằng nhau, các lượt có thể trùng quà. Danh sách hiện tại là **quà mẫu**, cần đổi theo quà thật của bạn trước sự kiện. Kết quả cũ giữ bản chụp món quà lúc quay.

## Triển khai

Đây là ứng dụng có máy chủ, **không chạy đầy đủ bằng GitHub Pages**. Dùng VPS hoặc dịch vụ chạy Node/Docker có ổ lưu bền vững.

```sh
docker build -t lucky-bloom .
docker run -d --name lucky-bloom -p 3000:3000 --env-file .env -e HOST=0.0.0.0 -e DATABASE_PATH=/app/data/lucky-bloom.sqlite -v lucky-bloom-data:/app/data lucky-bloom
```

Đặt HTTPS reverse proxy phía trước và `COOKIE_SECURE=true` khi truy cập qua HTTPS. Giữ `false` khi chạy HTTP tại máy. Trên dịch vụ hosting, đặt `HOST=0.0.0.0`, `PORT` theo dịch vụ, `ADMIN_PASSWORD` qua secret manager và `DATABASE_PATH` trỏ vào ổ đĩa bền vững. Chạy một instance Node cho cơ sở dữ liệu này; không dùng filesystem tạm của serverless.

Sao lưu SQLite bằng công cụ backup SQLite, hoặc dừng app trước khi copy thư mục `data/` (kể cả file WAL/SHM nếu có). Quản trị dùng mật khẩu riêng; phiên người chơi dùng token ngẫu nhiên lưu hash phía máy chủ, cookie HttpOnly/SameSite, kiểm tra origin và giới hạn tốc độ đăng nhập. Không có mật khẩu quản trị mặc định. Dữ liệu người chơi không được đưa lên repo.

## Kiểm thử

```sh
npm run check
npm test
```

Kiểm thử bao gồm giới hạn 3 lượt khi gọi đồng thời, chọn quà thuộc tài khoản, đổi quà trước khi gửi thông tin và khóa quà sau khi hoàn tất, phân quyền nam/nữ và quản trị, CSRF, vào lại bằng cookie và giữ dữ liệu khi restart. GitHub Actions chạy các kiểm tra này trên push/PR.

## Giới hạn và vận hành

- Giới hạn là **3 lượt cho mỗi phiên trình duyệt**, không phải mỗi con người. Xóa cookie, dùng ẩn danh hoặc thiết bị khác có thể tạo lượt chơi mới. Không cho khôi phục lượt chỉ bằng tên để tránh người khác xem/chốt quà thay. Người tổ chức đối chiếu tên trong trang quản trị; tên không nhận ra sẽ không tính. Muốn giới hạn chặt hơn cần mã mời riêng.
- Người chơi tự khai giới tính. Không có luồng sửa giới tính để tránh tự mở lại quyền quay.
- Quà mẫu không có số lượng tồn kho; chưa có cơ chế phát quà tự động, gửi email hoặc cơ chế khôi phục phiên đã mất cookie. Người tổ chức xem lựa chọn để trao quà.
- Tên, giới tính, lịch sử quay và lựa chọn là dữ liệu cá nhân của sự kiện. Chỉ chia sẻ mật khẩu quản trị với người được phép; không chia sẻ tệp SQLite.
- Danh sách quản trị hiện tải toàn bộ hồ sơ, phù hợp sự kiện nhỏ. Sự kiện lớn nên bổ sung phân trang và giới hạn tốc độ ở reverse proxy.

## Cấu trúc

```text
server.mjs          HTTP server, phiên người chơi, SQLite, luật chơi, quản trị
gifts.json          Danh sách quà cấu hình được
public/             Giao diện người chơi và quản trị
test/app.test.mjs    Kiểm thử API tích hợp
.github/workflows/  CI
Dockerfile          Triển khai có ổ đĩa bền vững
```

## Tương thích dữ liệu cũ

Hồ sơ, lượt quay và quà đã chốt từ bản trước được giữ nguyên. Cookie phiên còn hạn vẫn dùng tiếp được. Các cột đăng nhập cũ được giữ trong SQLite để không làm mất dữ liệu, nhưng các API đăng ký/đăng nhập của người chơi đã gỡ bỏ. Quản trị vẫn yêu cầu mật khẩu riêng.

## Nhận quà hoặc nhận giá trị tương đương

Sau khi chốt một món, người chơi chọn nhận quà (số điện thoại Việt Nam và địa chỉ) hoặc giá trị tương đương. Người tổ chức đặt số tiền cho từng món ngay trong /admin; món chưa cấu hình chỉ nhận quà. Người chơi nhận tiền nhập ngân hàng + số tài khoản + tên chủ tài khoản, hoặc tải ảnh QR PNG/JPEG/WebP tối đa 1 MB. Ứng dụng lưu ảnh, không tự đọc/xác minh mã QR và không tự chuyển tiền.

Thông tin nhận được lưu một lần, gắn với món đã chốt; số tiền được kiểm tra trên máy chủ và giữ nguyên khi thay đổi cấu hình sau này. Lựa chọn cũ vẫn có thể bổ sung thông tin nhận. Quản trị xem thông tin nhận, mở ảnh QR và xuất CSV. Ảnh nằm trong SQLite, chỉ người gửi hoặc quản trị được xem, không nằm trong public/ và không đưa lên GitHub. Sao lưu như cơ sở dữ liệu hiện tại.

## Giá trị mẫu và bảng xếp hạng

Giá trị mặc định: Gấu bông 50.000đ, Trà sữa 10.000đ, Bó hoa 30.000đ, Bánh ngọt 20.000đ, Son xinh 40.000đ, Quà bí mật 50.000đ. Chúng là cấu hình mẫu được nạp một lần; chỉnh hoặc tắt trong quản trị vẫn được giữ sau restart.

Bảng xếp hạng công khai thống kê theo loại giải: giá trị quy đổi hiện tại, số người đã chốt, lọc theo loại giải và đồng hạng khi cùng giá trị. Không công khai tên hay chi tiết người chơi; tên và lựa chọn cụ thể vẫn chỉ xem trong quản trị. Địa chỉ, điện thoại, ngân hàng và QR không có trong API bảng xếp hạng.

## Phân trang và xem lại dịp 20/10

Trang / nhập tên, giới tính và xem cơ cấu giải; /wheel dành cho vòng quay; /prizes có danh mục giải phân trang (4 món/trang). Không hiển thị số người đã trúng hay giá trị quy đổi ở trang vào. Số lượng cơ cấu sửa trong /admin là số công bố dự kiến, không phải hệ thống tồn kho hay hạn mức phát quà tự động.

Chốt quà mở hộp thoại cách nhận; gửi xong mở lời chúc 20/10, có nút xem lại. Nhập lại tên và giới tính sẽ tìm hồ sơ cũ (bỏ khoảng trắng dư, không phân biệt hoa/thường, vẫn phân biệt dấu). Nếu có nhiều hồ sơ trùng tên, ưu tiên hồ sơ đã chốt gần nhất. Cùng cookie gốc được tiếp tục và xem đủ dữ liệu; trình duyệt khác chỉ xem lại kết quả/cách nhận tổng quát/lời chúc, không xem địa chỉ, SĐT, ngân hàng, QR hoặc sửa dữ liệu. Tên không phải bằng chứng sở hữu; cần liên hệ người tổ chức nếu mất cookie và chưa hoàn tất.

## Đổi món quà

Trên trình duyệt sở hữu phiên chơi, có thể chọn lại một trong 3 kết quả, bấm Xác nhận đổi quà rồi xác nhận ở popup. Chỉ được đổi khi chưa gửi thành công thông tin nhận. Sau khi lưu địa chỉ/SĐT, ngân hàng hoặc QR, máy chủ khóa món quà; yêu cầu đổi trực tiếp qua API cũng bị chặn, thông tin nhận được giữ nguyên. Xác nhận lại đúng kết quả cũ giữ nguyên thông tin. Không được thêm lượt quay hay chọn kết quả của người khác. Phiên xem lại chỉ bằng tên/giới tính vẫn không có quyền đổi.
