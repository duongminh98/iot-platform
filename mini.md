Dưới đây là file Markdown đã được cập nhật toàn diện, bổ sung thêm cảm biến điện trở lực FSR 400 vào hệ thống, phân tách rõ ràng các topic và bổ sung logic cập nhật cơ sở dữ liệu MongoDB phục vụ cho mô hình Machine Learning.

Bạn có thể copy nội dung này để gửi cho AI Agent.

---

# Yêu Cầu Cập Nhật Firmware (ESP32), Backend và Cơ Sở Dữ Liệu (MongoDB)

## 1. Cấu Hình Phần Cứng Hệ Thống (Mới nhất)

* **Cảm biến rung (Cũ):** Giữ nguyên cấu hình hiện tại (Hardcode trạng thái là `1`: Có đồ).
* **Cảm biến nhiệt độ (Cũ):** Cổng GPIO **23**, đọc và in ra Serial 10s/lần, chỉ gửi MQTT khi có thay đổi nhiệt độ.
* **Cảm biến điện trở lực (FSR 400 - Mới):** * Cổng kết nối (GPIO): **21**
* Tần suất đọc và in ra Serial Output: **1 giây / lần**



---

## 2. Logic Gửi Dữ Liệu Lên HiveMQ (MQTT Broker)

Để tránh xung đột dữ liệu, mỗi cảm biến sẽ quản lý một Topic độc lập:

1. **Topic Cảm biến rung:** (Giữ nguyên topic cũ)
2. **Topic Cảm biến nhiệt độ:** `iot/sensor/temperature` (Chỉ up khi thay đổi, chu kỳ kiểm tra 10s).
3. **Topic Cảm biến lực FSR 400 (Mới):** `iot/sensor/fsr_force`

### Điều kiện gửi (Publish Condition) cho FSR 400:

* Hệ thống sẽ liên tục lưu trạng thái/ngưỡng lực của lần gửi thành công gần nhất (`last_sent_threshold`).
* Mỗi 1 giây, hệ thống đọc giá trị từ chân GPIO 21.
* **Nếu** giá trị lực vừa đọc được có sự **thay đổi về ngưỡng** (hoặc vượt qua một delta/bậc giá trị xác định trước) so với `last_sent_threshold`:
* Tiến hành gửi payload mới lên topic `iot/sensor/fsr_force`.
* Cập nhật lại biến `last_sent_threshold`.


* **Nếu không có sự thay đổi ngưỡng:** Chỉ in giá trị ra Serial Output để theo dõi, **không** gửi lên MQTT nhằm tiết kiệm băng thông.

### Cấu trúc Payload đề xuất cho FSR 400:

```json
{
  "force_value": 512, // Giá trị ADC hoặc lực quy đổi
  "threshold_status": "changed",
  "timestamp": 1716112800
}

```

---

## 3. Yêu Cầu Xử Lý Phía Backend & Cơ Sở Dữ Liệu (MongoDB)

Backend (Consumer) cần thực hiện các nhiệm vụ sau khi nhận được dữ liệu từ cảm biến FSR 400:

1. **Subscribe Topic mới:** Lắng nghe dữ liệu từ topic `iot/sensor/fsr_force`.
2. **Cập nhật MongoDB (Dành cho Machine Learning):**
* Khi nhận được payload mới từ FSR 400, backend phải lập tức tiến hành ghi/cập nhật dữ liệu vào các collection liên quan trong MongoDB.
* **Mục tiêu:** Cập nhật các trường dữ liệu đầu vào (Features) hoặc trạng thái nhãn mà mô hình Học máy (Machine Learning Model) đang sử dụng để training hoặc inference (dự đoán) theo thời gian thực.


3. **Đồng bộ dữ liệu:** Đảm bảo dữ liệu lực mới này được liên kết chính xác với định danh của thiết bị và đồng bộ với các chỉ số nhiệt độ/trạng thái rung hiện tại trong DB.

---

## 4. Nhiệm Vụ Của AI Agent

1. **Cập nhật Code ESP32:**
* Cấu hình chân GPIO 21 đọc tín hiệu Analog/Digital từ FSR 400.
* Thiết lập bộ hẹn giờ 1 giây (sử dụng `millis()`) để đọc và in ra Serial.
* Viết hàm so sánh logic ngưỡng (Threshold) để quyết định publish dữ liệu lên MQTT topic riêng biệt.
* Đảm bảo không làm ảnh hưởng đến luồng chạy 10s của cảm biến nhiệt độ (GPIO 23) và phần hardcode của cảm biến rung.


2. **Cập nhật Code Backend & Database:**
* Viết hàm subscribe topic `iot/sensor/fsr_force`.
* Viết script/query Mongoose (hoặc MongoDB Driver tương đương) để update chính xác các document/collection phục vụ cho pipeline Machine Learning của hệ thống.