Dưới đây là file tài liệu cấu trúc theo dạng **PRD (Product Requirement Document)** viết bằng Markdown. Bản thiết kế này đã được tối ưu hóa cấu trúc dữ liệu và logic thuật toán để AI Agent của bạn có thể hiểu và tự động lập trình (code sinh ra chính xác cho cả ESP32, Backend, và Frontend).

```markdown
# Tài liệu Yêu cầu Hệ thống: Giám sát Cảm biến Rung lắc & Cảnh báo Chống trộm

Hệ thống bao gồm thiết bị phần cứng (ESP32 + Cảm biến rung), MQTT Broker (HiveMQ), Backend xử lý logic cảnh báo, và Frontend Dashboard hiển thị trạng thái theo thời gian thực.

---

## 1. Kiến trúc Hệ thống & Luồng Dữ liệu (Workflow)

1. **Khối Thiết bị:** ESP32 đọc dữ liệu từ cảm biến rung lắc. Nếu phát hiện rung lắc (`vibration == 1`), đóng gói JSON và publish lên HiveMQ.
2. **Khối Broker:** HiveMQ nhận dữ liệu ở topic chỉ định và điều phối tới Backend.
3. **Khối Backend:** 
   - Đăng ký nhận dữ liệu (Subscribe) từ HiveMQ.
   - Lưu trữ lịch sử và chuyển tiếp dữ liệu thô lên Dashboard qua WebSocket.
   - Chạy thuật toán kiểm tra 10 dữ liệu gần nhất để kích hoạt trạng thái "Báo động có trộm".
4. **Khối Frontend:** Hiển thị biểu đồ/trạng thái rung lắc thời gian thực và bắn pop-up/đổi màu giao diện sang đỏ khi nhận tín hiệu báo động trộm.

---

## 2. Định dạng Dữ liệu (Payload Format)

Dữ liệu truyền tải giữa các thành phần qua giao thức MQTT sử dụng định dạng JSON.

### Topic: `device/vibration/data`
```json
{
  "device_id": "ESP32_ZONE_01",
  "vibration": 1,
  "timestamp": "2026-05-19T07:15:30Z" 
}

```

---

## 3. Yêu cầu Kỹ thuật Chi tiết từng Thành phần

### 3.1. Firmware ESP32

* **Kết nối:** Kết nối Wifi và kết nối đến HiveMQ Cloud/Local Broker sử dụng thư viện `PubSubClient`.
* **Logic đọc cảm biến:**
* Sử dụng ngắt (Interrupt) hoặc cơ chế Polling để đọc chân GPIO nối với cảm biến rung.
* **Debounce:** Xử lý chống nhiễu tín hiệu (Debounce) tối thiểu 200ms để tránh việc gửi trùng lặp quá nhiều tin nhắn trong 1 mili-giây do nhiễu cơ học.
* Chỉ gửi dữ liệu lên Topic `device/vibration/data` khi `vibration = 1` và cứ mỗi 0.5 giây esp32 lại thu thập data một lần.



### 3.2. Cấu hình HiveMQ

* Khởi tạo một MQTT Broker công khai hoặc bảo mật bằng User/Password.
* Đảm bảo giữ kết nối Keep-Alive ổn định với ESP32 và Backend.

### 3.3. Backend Xử lý (Node.js/Python FastAPI/Go...)

* **Kết nối:** Sử dụng MQTT Client kết nối đến HiveMQ và subscribe topic `device/vibration/data`.
* **Lưu trữ đệm (In-memory buffer):** Duy trì một mảng/hàng đợi (Queue) chứa **10 timestamp gần nhất** nhận được từ thiết bị.
* **Thuật toán kiểm tra trộm (Core Logic):**
* Mỗi khi nhận được 1 payload mới có `vibration == 1`, đẩy `timestamp` của nó vào Queue.
* Nếu số lượng phần tử trong Queue đạt đủ 10:
* Tính toán độ chênh lệch thời gian giữa phần tử mới nhất ($t_{10}$) và phần tử cũ nhất trong queue ($t_1$).
* **Công thức:** `Δt = timestamp[9] - timestamp[0]`
* **Điều kiện kích hoạt trộm:** Nếu `Δt <= 10 giây`, lập tức kích hoạt trạng thái `theft_alarm = true`.


* Nếu điều kiện thỏa mãn, Backend gửi một payload cảnh báo riêng biệt qua WebSocket/MQTT tới Frontend.



### 3.4. Frontend Dashboard (React/Vue/HTML5)

* **Hiển thị thông thường:**
* Đèn tín hiệu hiển thị trạng thái Rung/Không rung (Đổi màu xanh/vàng khi có tín hiệu `vibration == 1`).
* Danh sách hiển thị lịch sử thời gian các lần rung gần nhất.


* **Hiển thị trạng thái Báo động (`theft_alarm == true`):**
* Chuyển toàn bộ nền hoặc widget cảnh báo sang màu đỏ nhấp nháy.
* Hiển thị thông báo Pop-up cảnh báo: **"CẢNH BÁO: PHÁT HIỆN XÂM NHẬP / TRỘM!"**.
* Có nút "Tắt báo động" (Reset Alarm) để xóa trạng thái báo động và làm sạch (clear) hàng đợi timestamp ở Backend.



---

## 4. Kịch bản Kiểm thử (Test Cases cho AI Agent)

| STT | Hành động đầu vào | Trạng thái Backend mong đợi | Hiển thị Dashboard mong đợi |
| --- | --- | --- | --- |
| 1 | Cảm biến rung 1 lần duy nhất | Nhận dữ liệu, thêm vào queue (size = 1) | Đèn trạng thái nháy vàng rồi tắt. Không báo động. |
| 2 | Cảm biến rung 10 lần, mỗi lần cách nhau 2 giây (Tổng 18 giây) | Queue đủ 10 phần tử, `Δt = 18s > 10s`. Không kích hoạt trộm. | Hiển thị 10 log rung lắc. Không có pop-up đỏ. |
| 3 | Cảm biến bị lắc liên tục, gửi 10 tín hiệu liên tiếp trong vòng 5 giây | Queue đủ 10 phần tử, `Δt = 5s <= 10s`. Kích hoạt trạng thái trộm. | Dashboard chuyển sang màu đỏ nhấp nháy, hiển thị pop-up cảnh báo trộm. |

```

```