```python
# Tạo file markdown chứa nội dung yêu cầu và mã nguồn để người dùng tải về nếu cần.
# Tuy nhiên, hệ thống yêu cầu trả về nội dung text trước, ta cứ chuẩn bị mã hoặc ghi file nếu cần cấu trúc hóa.
# Ở đây ta sẽ viết một script tạo file md hoàn chỉnh và xuất ra cho người dùng.

content = """# Yêu Cầu Phát Triển Cấu Hợp Phần Cứng Mới: ESP32 Báo Động (Anti-Theft Buzzer)

Tài liệu này mô tả logic hoạt động và mã nguồn `.ino` cho một thiết bị ESP32 độc lập thứ hai. Thiết bị này đóng vai trò là còi báo động, lắng nghe tín hiệu từ MQTT Broker và kích hoạt còi hú khi phát hiện có hành vi trộm cắp (`theft detection`).

---

## 1. Cấu Hình Phần Cứng & Kết Nối
* **Thiết bị:** ESP32 (Board riêng biệt với ESP32 thu thập cảm biến).
* **Thiết bị đầu ra:** Còi / Buzzer (Active hoặc Passive).
* **Cổng kết nối (GPIO):** Chân **GPIO 25** (Có thể cấu hình lại trong code nếu cần).
* **MQTT Broker:** HiveMQ (Sử dụng chung hạ tầng với hệ thống cảm biến).
* **Topic lắng nghe (Subscribe):** `iot/system/security` (Hoặc topic do hệ thống chính quy định).

---

## 2. Kịch Bản Logic Hoạt Động (Workflow)
1.  **Trạng thái bình thường:** ESP32 kết nối Wi-Fi và MQTT Broker, liên tục lắng nghe (Subscribe) trên topic bảo mật.
2.  **Kích hoạt báo động:** Khi hệ thống chính phát hiện bất thường (từ cảm biến rung, nhiệt độ hoặc FSR) và gửi payload báo động (ví dụ: `{"status": "theft"}`) lên MQTT.
3.  **Xử lý ngắt kết nối tạm thời:** Ngay sau khi nhận được tín hiệu `theft`:
    * **Ngắt kết nối MQTT ngay lập tức** (`client.disconnect()`) để tránh việc xử lý lặp đi lặp lại hoặc nhận dồn dập các payload trùng lặp khi đang hú còi.
    * Bật còi hú liên tục trong đúng **10 giây**.
4.  **Khôi phục trạng thái:** Sau khi hết 10 giây hú còi, tắt còi hoàn toàn, tiến hành kết nối lại với MQTT Broker và tiếp tục vào trạng thái chờ (Listen).

---

## 3. Mã Nguồn ESP32 (`theft_buzzer.ino`)

Dưới đây là toàn bộ mã nguồn được thiết kế tối ưu, sử dụng cơ chế xử lý không nghẽn bằng `millis()` hoặc điều khiển ngắt kết nối theo đúng yêu cầu:


```

```text
File generated successfully

```cpp
#include <WiFi.h>
#include <PubSubClient.h>

// --- CẤU HÌNH WIFI & MQTT ---
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";
const char* mqtt_server = "broker.hivemq.com"; // Thay bằng host HiveMQ của bạn
const int mqtt_port = 1883;
const char* mqtt_topic = "iot/system/security";

// --- CẤU HÌNH PHẦN CỨNG ---
const int BUZZER_PIN = 25; 

WiFiClient espClient;
PubSubClient client(espClient);

// --- CÁC BIẾN TRẠNG THÁI ---
bool isAlarmActive = false;
unsigned long alarmStartTime = 0;
const unsigned long ALARM_DURATION = 10000; // 10 giây (10000 ms)

void setup_wifi() {
  delay(10);
  Serial.println();
  Serial.print("Connecting to ");
  Serial.println(ssid);

  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("");
  Serial.println("WiFi connected");
  Serial.print("IP address: ");
  Serial.println(WiFi.localIP());
}

void callback(char* topic, byte* payload, unsigned int length) {
  Serial.print("Message arrived [");
  Serial.print(topic);
  Serial.print("] ");
  
  String message = "";
  for (int i = 0; i < length; i++) {
    message += (char)payload[i];
  }
  Serial.println(message);

  // Kiểm tra nếu payload chứa tín hiệu cảnh báo trộm
  // Có thể tùy biến cấu trúc check JSON nếu hệ thống bắn chuỗi phức tạp hơn
  if (message.indexOf("theft") >= 0) {
    Serial.println("⚠️ THEFT DETECTED! Disconnecting MQTT and starting alarm...");
    
    // 1. Tạm thời ngắt kết nối MQTT để tránh nhận trùng tin nhắn liên tục
    client.disconnect(); 
    
    // 2. Kích hoạt trạng thái còi hú
    isAlarmActive = true;
    alarmStartTime = millis();
    digitalWrite(BUZZER_PIN, HIGH); // Bật còi
  }
}

void reconnect() {
  // Chỉ reconnect khi còi KHÔNG ĐANG HÚ
  while (!client.connected() && !isAlarmActive) {
    Serial.print("Attempting MQTT connection...");
    String clientId = "ESP32_Buzzer_Client_";
    clientId += String(random(0, 0xffff), HEX);
    
    if (client.connect(clientId.c_str())) {
      Serial.println("connected");
      client.subscribe(mqtt_topic);
      Serial.print("Subscribed to topic: ");
      Serial.println(mqtt_topic);
    } else {
      Serial.print("failed, rc=");
      Serial.print(client.state());
      Serial.println(" try again in 5 seconds");
      delay(5000);
    }
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW); // Đảm bảo ban đầu còi tắt

  setup_wifi();
  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(callback);
}

void loop() {
  // Nếu hệ thống đang trong trạng thái hú còi báo động
  if (isAlarmActive) {
    // Kiểm tra xem đã đủ 10 giây chưa
    if (millis() - alarmStartTime >= ALARM_DURATION) {
      Serial.println("✅ Alarm duration finished. Turning off buzzer and reconnecting to MQTT...");
      digitalWrite(BUZZER_PIN, LOW); // Tắt còi
      isAlarmActive = false;         // Giải phóng trạng thái báo động
      // Vòng lặp loop tiếp theo sẽ tự động gọi reconnect() bên dưới
    }
  } else {
    // Trạng thái bình thường: Duy trì kết nối MQTT và lắng nghe dữ liệu
    if (!client.connected()) {
      reconnect();
    }
    client.loop();
  }
}

```

---

## 4. Nhiệm vụ của AI Agent

1. **Triển khai File:** Tạo và cấu trúc mã nguồn trên thành file `theft_buzzer.ino`.
2. **Tùy biến Thư viện (Nếu cần):** Nếu còi sử dụng là Passive Buzzer cần đổi `digitalWrite` thành hàm `tone()` để tạo giai điệu tiếng hú, mặc định hiện tại đang cấu hình cho Active Buzzer (Bật/Tắt điện áp).
3. **Tích hợp:** Đảm bảo Backend hoặc ESP32 tổng (thiết bị cảm biến số 1) publish đúng chuỗi text có chữ `"theft"` vào topic `iot/system/security` khi có sự cố.
"""

with open("theft_alarm_request.md", "w", encoding="utf-8") as f:
f.write(content)
print("File generated successfully")

```
Sau đây là nội dung tài liệu yêu cầu tích hợp thiết bị ESP32 báo động mới, được viết dưới dạng Markdown (`.md`) chuẩn chỉnh để bạn gửi thẳng cho AI Agent của mình xử lý. 

Tôi cũng đã tạo sẵn một file để bạn tải xuống trực tiếp nếu cần: [file-tag: code-generated-file-0-1779158157834281967]

---

# Yêu Cầu Phát Triển Cấu Hợp Phần Cứng Mới: ESP32 Báo Động (Anti-Theft Buzzer)

Tài liệu này mô tả logic hoạt động và mã nguồn `.ino` cho một thiết bị ESP32 độc lập thứ hai. Thiết bị này đóng vai trò là còi báo động, lắng nghe tín hiệu từ MQTT Broker và kích hoạt còi hú khi phát hiện có hành vi trộm cắp (`theft detection`).

---

## 1. Cấu Hình Phần Cứng & Kết Nối
* **Thiết bị:** ESP32 (Board riêng biệt với ESP32 thu thập cảm biến).
* **Thiết bị đầu ra:** Còi / Buzzer (Active hoặc Passive).
* **Cổng kết nối (GPIO):** Chân **GPIO 25** (Có thể cấu hình lại trong code nếu cần).
* **MQTT Broker:** HiveMQ (Sử dụng chung hạ tầng với hệ thống cảm biến).
* **Topic lắng nghe (Subscribe):** `iot/system/security` *(Hoặc tên topic do hệ thống chính quy định)*.

---

## 2. Kịch Bản Logic Hoạt Động (Workflow)
1.  **Trạng thái bình thường:** ESP32 kết nối Wi-Fi và MQTT Broker, liên tục lắng nghe (Subscribe) trên topic bảo mật.
2.  **Kích hoạt báo động:** Khi hệ thống chính phát hiện bất thường (từ cảm biến rung, nhiệt độ hoặc FSR) và bắn tín hiệu báo động (ví dụ payload có chuỗi: `"theft"`) lên MQTT.
3.  **Xử lý ngắt kết nối tạm thời:** Ngay sau khi nhận được tín hiệu `theft`:
    * **Ngắt kết nối MQTT ngay lập tức** (`client.disconnect()`) để tránh việc xử lý lặp đi lặp lại hoặc nhận dồn dập các payload trùng lặp khi đang hú còi.
    * Bật còi hú liên tục trong đúng **10 giây**.
4.  **Khôi phục trạng thái:** Sau khi hết 10 giây hú còi, tắt còi hoàn toàn, tiến hành kết nối lại với MQTT Broker và quay lại trạng thái chờ (Listen) như bình thường.

---

## 3. Mã Nguồn ESP32 (`theft_buzzer.ino`)

Dưới đây là toàn bộ mã nguồn được thiết kế tối ưu, sử dụng cơ chế hẹn giờ bằng `millis()` không gây nghẽn hệ thống và kiểm soát ngắt kết nối theo đúng yêu cầu:

```cpp
#include <WiFi.h>
#include <PubSubClient.h>

// --- CẤU HÌNH WIFI & MQTT ---
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";
const char* mqtt_server = "broker.hivemq.com"; // Thay bằng host HiveMQ của bạn
const int mqtt_port = 1883;
const char* mqtt_topic = "iot/system/security";

// --- CẤU HÌNH PHẦN CỨNG ---
const int BUZZER_PIN = 25; 

WiFiClient espClient;
PubSubClient client(espClient);

// --- CÁC BIẾN TRẠNG THÁI ---
bool isAlarmActive = false;
unsigned long alarmStartTime = 0;
const unsigned long ALARM_DURATION = 10000; // 10 giây (10000 ms)

void setup_wifi() {
  delay(10);
  Serial.println();
  Serial.print("Connecting to ");
  Serial.println(ssid);

  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("");
  Serial.println("WiFi connected");
  Serial.print("IP address: ");
  Serial.println(WiFi.localIP());
}

void callback(char* topic, byte* payload, unsigned int length) {
  Serial.print("Message arrived [");
  Serial.print(topic);
  Serial.print("] ");
  
  String message = "";
  for (int i = 0; i < length; i++) {
    message += (char)payload[i];
  }
  Serial.println(message);

  // Kiểm tra nếu payload chứa tín hiệu cảnh báo trộm
  if (message.indexOf("theft") >= 0) {
    Serial.println("⚠️ THEFT DETECTED! Disconnecting MQTT and starting alarm...");
    
    // 1. Tạm thời ngắt kết nối MQTT để tránh nhận trùng tin nhắn liên tục
    client.disconnect(); 
    
    // 2. Kích hoạt trạng thái còi hú
    isAlarmActive = true;
    alarmStartTime = millis();
    digitalWrite(BUZZER_PIN, HIGH); // Bật còi
  }
}

void reconnect() {
  // Chỉ thực hiện reconnect khi còi KHÔNG ĐANG HÚ
  while (!client.connected() && !isAlarmActive) {
    Serial.print("Attempting MQTT connection...");
    String clientId = "ESP32_Buzzer_Client_";
    clientId += String(random(0, 0xffff), HEX);
    
    if (client.connect(clientId.c_str())) {
      Serial.println("connected");
      client.subscribe(mqtt_topic);
      Serial.print("Subscribed to topic: ");
      Serial.println(mqtt_topic);
    } else {
      Serial.print("failed, rc=");
      Serial.print(client.state());
      Serial.println(" try again in 5 seconds");
      delay(5000);
    }
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW); // Đảm bảo ban đầu còi tắt

  setup_wifi();
  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(callback);
}

void loop() {
  // Trường hợp hệ thống đang trong trạng thái hú còi báo động
  if (isAlarmActive) {
    // Kiểm tra xem đã đủ 10 giây chưa
    if (millis() - alarmStartTime >= ALARM_DURATION) {
      Serial.println("✅ Alarm duration finished. Turning off buzzer and reconnecting to MQTT...");
      digitalWrite(BUZZER_PIN, LOW); // Tắt còi
      isAlarmActive = false;         // Giải phóng trạng thái báo động
      // Vòng lặp loop tiếp theo sẽ tự động rơi vào nhánh else bên dưới để kết nối lại MQTT
    }
  } else {
    // Trạng thái bình thường: Duy trì kết nối MQTT và lắng nghe dữ liệu
    if (!client.connected()) {
      reconnect();
    }
    client.loop();
  }
}

```

---

## 4. Nhiệm vụ của AI Agent

1. **Triển khai File:** Đóng gói đoạn mã nguồn trên thành cấu trúc dự án Arduino hoàn chỉnh (file `theft_buzzer.ino`).
2. **Tùy biến phần cứng còi:** Nếu người dùng sử dụng loại *Passive Buzzer* (Còi thụ động cần tần số), hãy chuyển đổi lệnh `digitalWrite()` thành hàm `tone(BUZZER_PIN, tần_số)` để tạo tiếng hú. Mặc định hiện tại code đang viết cho loại *Active Buzzer* (Cấp nguồn là tự kêu).
3. **Tích hợp hệ thống tổng:** Đảm bảo hệ thống trung tâm (hoặc Backend) khi phát hiện sự cố sẽ bắn chính xác chuỗi text hoặc JSON có chứa từ khóa `"theft"` vào đúng topic `iot/system/security`.