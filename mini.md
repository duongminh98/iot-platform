Dưới đây là file Markdown được cấu trúc chuẩn chỉnh, mô tả chi tiết yêu cầu mở rộng hệ thống (thêm cảm biến nhiệt độ). Bạn có thể copy toàn bộ nội dung này để đưa thẳng cho AI Agent xử lý.

---

# Yêu Cầu Cập Nhật Firmware (ESP32) và Logic Backend

## 1. Tổng quan cấu hình phần cứng mới

* **Cảm biến rung (FSR):** Giữ nguyên cấu hình hiện tại (Hardcode trạng thái là `1`: Có đồ).
* **Cảm biến nhiệt độ:** * Cổng kết nối (GPIO): **23**
* Tần suất đọc và in ra Serial Output: **10 giây / lần**



---

## 2. Logic gửi dữ liệu lên HiveMQ (MQTT Broker)

Để tiết kiệm băng thông và tối ưu hệ thống, luồng gửi dữ liệu (Publish) của cảm biến nhiệt độ sẽ hoạt động như sau:

* **Topic MQTT mới:** Không được trùng với topic của cảm biến rung (Ví dụ đề xuất: `iot/sensor/temperature`).
* **Điều kiện gửi (Publish Condition):** * Hệ thống sẽ liên tục lưu giá trị nhiệt độ của lần gửi thành công gần nhất (`last_sent_temp`).
* Mỗi 10 giây, sau khi đọc giá trị nhiệt độ mới:
* **Nếu** `nhiệt độ mới` $\neq$ `last_sent_temp` $\rightarrow$ Tiến hành gửi payload lên HiveMQ và cập nhật lại `last_sent_temp`.
* **Nếu** `nhiệt độ mới` $=$ `last_sent_temp` $\rightarrow$ Chỉ in ra Serial Output để theo dõi, **không** gửi lên HiveMQ.





### Cấu trúc Payload đề xuất cho Nhiệt độ:

```json
{
  "temperature": 28.5,
  "timestamp": 1716112800 
}

```

---

## 3. Yêu cầu xử lý phía Backend (Consumer)

* **Lấy dữ liệu:** Backend subscribe vào topic nhiệt độ mới này.
* **Logic xử lý:** Mỗi khi nhận được payload mới (chắc chắn là đã có sự thay đổi nhiệt độ do logic ở phần firmware), backend sẽ lấy ngay giá trị `temperature` mới nhất này để chạy các logic tính toán/xử lý ngầm.
* **Hiển thị:** Cập nhật và hiển thị giá trị mới nhất này lên giao diện cho người dùng theo thời gian thực (Real-time).

---

## 4. Nhiệm vụ của AI Agent

1. **Cập nhật Code ESP32 (Arduino IDE / ESP-IDF):**
* Khai báo thêm chân GPIO 23 cho cảm biến nhiệt độ (DHT11), analog.
* Tạo biến lưu trữ trạng thái nhiệt độ cũ.
* Thiết lập bộ hẹn giờ (Timer/Blink without delay) chu kỳ 10 giây để đọc cảm biến.
* Viết logic so sánh và gửi dữ liệu lên Topic MQTT mới.
* Giữ nguyên phần hardcode của cảm biến rung là `1`.


2. **Cập nhật Code Backend:**
* Viết thêm hàm handler subscribe vào topic nhiệt độ mới.
* Cập nhật luồng lưu trữ/truyền dữ liệu lên giao diện người dùng.