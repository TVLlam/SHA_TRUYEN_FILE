# 🔐 Hệ thống chia sẻ file an toàn & Kiểm tra tính toàn vẹn (SHA-256)

<p>Dự án xây dựng một hệ thống web toàn diện, cho phép người dùng <strong>tải lên, chia sẻ và tải xuống file</strong> một cách an toàn, kèm theo tính năng <strong>kiểm tra tính toàn vẹn dữ liệu</strong> sử dụng thuật toán <strong>SHA-256</strong>. Hệ thống đảm bảo rằng file không bị thay đổi hoặc hỏng hóc trong suốt quá trình truyền tải và lưu trữ.</p>

<h2> Mục tiêu chính</h2>
<ul>
  <li>Cung cấp một nền tảng an toàn để người dùng <strong>đăng ký, đăng nhập và quản lý phiên</strong> truy cập.</li>
  <li>Cho phép người dùng <strong>tải lên file</strong> và lưu trữ trên máy chủ.</li>
  <li>Triển khai chức năng <strong>chia sẻ file giữa các người dùng</strong> đã đăng ký.</li>
  <li>Đảm bảo <strong>tính toàn vẹn của file</strong> bằng cách sử dụng thuật toán <strong>SHA-256</strong>: mã băm được tính toán và lưu trữ khi upload, sau đó được so sánh lại khi download để xác nhận không có sự thay đổi.</li>
  <li>Phát triển giao diện Web <strong>chuyên nghiệp, thân thiện và trực quan</strong>, bao gồm một trang đăng nhập/đăng ký riêng biệt và giao diện ứng dụng chính với các hiệu ứng mượt mà.</li>
  <li>Sử dụng <strong>Socket.IO</strong> để cung cấp thông báo real-time về các sự kiện như tải lên file mới hoặc file được chia sẻ.</li>
</ul>

<h2>📁 Cấu trúc dự án</h2>
<ul>
  <li><code>server.py</code>: Backend Python sử dụng Flask, xử lý các logic chính (xác thực, quản lý file, chia sẻ, tính SHA-256), tương tác với cơ sở dữ liệu (SQLAlchemy) và Socket.IO.</li>
  <li><code>requirements.txt</code>: Danh sách các thư viện Python cần thiết cho backend.</li>
  <li><code>site.db</code>: Cơ sở dữ liệu SQLite (tự động tạo khi chạy server lần đầu) để lưu trữ thông tin người dùng và metadata của file.</li>
  <li><code>uploads/</code>: Thư mục để lưu trữ các file đã được người dùng tải lên.</li>
  <li><code>client/</code>: Thư mục chứa toàn bộ mã nguồn Frontend Web.
    <ul>
      <li><code>index.html</code>: Giao diện chính của ứng dụng sau khi người dùng đăng nhập.</li>
      <li><code>login.html</code>: Giao diện riêng biệt cho trang đăng ký và đăng nhập.</li>
      <li><code>script.js</code>: Logic JavaScript cho giao diện ứng dụng chính.</li>
      <li><code>login.js</code>: Logic JavaScript xử lý đăng ký và đăng nhập.</li>
      <li><code>style.css</code>: Tệp CSS dùng chung cho toàn bộ giao diện (trang đăng nhập và trang ứng dụng chính).</li>
    </ul>
  </li>
</ul>

<h2>🖼️ Giao diện người dùng</h2>
<p>Dự án được thiết kế với giao diện hiện đại, tối giản và thân thiện, đảm bảo trải nghiệm người dùng mượt mà qua từng thao tác.</p>

### Trang Đăng nhập / Đăng ký
<img src="Screenshot 2025-06-04 155648.png" alt="Login Interface" width="600">
<br>
*Giao diện đăng nhập và đăng ký chuyên nghiệp, với khả năng chuyển đổi giữa hai form.*

### Trang ứng dụng chính
<img src="Screenshot 2025-06-04 155711.png" alt="Main App Interface" width="800">
<br>
<img src="Screenshot 2025-06-04 160020.png" alt="Main App Interface" width="800">
<br>
*Giao diện chính của ứng dụng, hiển thị các phần quản lý file, chia sẻ và tải xuống.*

### Tính năng tải lên và chia sẻ

*Khu vực tải file lên và tùy chọn chia sẻ file đã tải lên với người dùng khác trong hệ thống.*

### Kiểm tra tính toàn vẹn khi tải xuống

*Quá trình tải xuống file kèm theo kiểm tra mã băm SHA-256 để xác minh tính nguyên vẹn của dữ liệu.*

<h2>🚀 Hướng dẫn chạy ứng dụng</h2>

<p>Để cài đặt và chạy ứng dụng trên máy cục bộ, bạn cần đảm bảo đã cài đặt Python 3.7+ và pip.</p>

<pre>
# 1. Clone repository
git clone https://github.com/TVLlam/SHA_TRUYEN_FILE.git

# 2. Cài đặt các thư viện Python
pip install -r requirements.txt

# 3. Tạo thư mục 'uploads' (nếu chưa tồn tại)
mkdir uploads

# 4. Chạy server Flask
python server.py
</pre>

<p>Sau khi server khởi động thành công, mở trình duyệt và truy cập:</p>
<pre>
http://localhost:5000/login_page
</pre>

<h2>🔧 Cách sử dụng</h2>
<ol>
  <li><strong>Đăng ký tài khoản mới:</strong> Truy cập <code>http://localhost:5000/login_page</code>, nhấp vào liên kết "Register here" và điền thông tin để tạo tài khoản.</li>
  <li><strong>Đăng nhập:</strong> Sau khi đăng ký hoặc nếu đã có tài khoản, sử dụng tên người dùng và mật khẩu để đăng nhập.</li>
  <li><strong>Tải lên file:</strong> Trên giao diện chính, trong phần "Upload File", chọn tệp từ máy tính của bạn và nhấn "Upload". Tệp sẽ xuất hiện trong "My Uploaded Files".</li>
  <li><strong>Chia sẻ file:</strong> Trong phần "Share File", chọn tệp bạn muốn chia sẻ (từ danh sách các tệp đã upload của bạn) và chọn người dùng bạn muốn chia sẻ cùng. Nhấn "Share File". Người nhận sẽ nhận được thông báo real-time.</li>
  <li><strong>Tải xuống & Kiểm tra tính toàn vẹn:</strong>
    <ul>
      <li>Các tệp của bạn hoặc tệp được chia sẻ với bạn sẽ xuất hiện trong dropdown "Select a file to download".</li>
      <li>Chọn tệp và nhấn "Download". Hệ thống sẽ tự động tải file và thực hiện kiểm tra SHA-256 phía client để xác nhận tính toàn vẹn của tệp đã tải về.</li>
    </ul>
  </li>
</ol>

