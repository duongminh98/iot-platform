#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <DHT.h>

// ================= CẤU HÌNH WIFI & MQTT =================

// HiveMQ Cloud thông thường dùng port 8883 (TLS)
const int mqtt_port = 8883;


const char* ssid = "nhaso9";       // Tên Wi-Fi nhà bạn
const char* password = "910082023"; // Mật khẩu Wi-Fi

// HiveMQ Cloud thông thường dùng port 8883 (TLS)
const char* mqtt_server = "dd793875ef39402c8a2f8dc020346b51.s1.eu.hivemq.cloud"; // Copy URL trong HiveMQ của bạn
const char* mqtt_user = "nhom7";                 // Username bạn tạo trong HiveMQ
const char* mqtt_password = "Nhom7nhom7";             // Mật khẩu HiveMQ


// Thông tin định danh của thiết bị
const String lockerId = "1"; // Backend yêu cầu lockerId là một con số (VD: 1, 2, 3)
const String topic_data = "locker/" + lockerId + "/data";
const String topic_cmd = "locker/" + lockerId + "/command";
const String topic_ack = "locker/" + lockerId + "/ack";

// ================= CẤU HÌNH CHÂN (PINS) =================
const int PIN_VIBRATION = 22; // Cảm biến rung SW420
const int PIN_FSR = 34;       // Cảm biến lực FSR 406
const int PIN_DOOR = 26;      // Cảm biến cửa MC-38
const int PIN_LOCK = 25;      // Relay điều khiển khóa K01

#define DHTPIN 23
#define DHTTYPE DHT11
DHT dht(DHTPIN, DHTTYPE);

const String topic_temp = "locker/" + lockerId + "/temperature";
float last_sent_temp = -999.0;
unsigned long lastTempTime = 0;

// ================= BIẾN TOÀN CỤC =================
WiFiClientSecure espClient;
PubSubClient client(espClient);

unsigned long lastMsgTime = 0;
const unsigned long MSG_INTERVAL = 4000; // Gửi dữ liệu mỗi 5 giây

// Biến đếm số lần rung và thời gian
volatile int vibrationCount = 0;
volatile unsigned long lastVibrationTime = 0;
volatile unsigned long vibrationStartTime = 0; // Thời điểm bắt đầu chuỗi rung

// Interrupt handler cho cảm biến rung
void IRAM_ATTR detectVibration() {
  unsigned long currentTime = millis();
  // Debounce đơn giản (50ms) để tránh nhiễu tín hiệu
  if (currentTime - lastVibrationTime > 50) {
    if (vibrationCount == 0) {
      vibrationStartTime = currentTime; // Ghi lại lúc bắt đầu chuỗi rung
    }
    vibrationCount++;
    lastVibrationTime = currentTime;
  }
}

void setup_wifi() {
  delay(10);
  Serial.println();
  Serial.print("Đang kết nối đến ");
  Serial.println(ssid);

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("");
  Serial.println("Đã kết nối WiFi");
  Serial.println("IP address: ");
  Serial.println(WiFi.localIP());
}

void reconnect() {
  // Lặp lại cho đến khi kết nối được
  while (!client.connected()) {
    Serial.print("Đang thử kết nối MQTT (HiveMQ)...");
    
    // Tạo ID ngẫu nhiên cho client
    String clientId = "ESP32Client-" + String(random(0, 1000));
    
    // Kết nối với username và password
    if (client.connect(clientId.c_str(), mqtt_user, mqtt_password)) {
      Serial.println(" Đã kết nối!");
      // Subscribe vào topic điều khiển
      client.subscribe(topic_cmd.c_str());
    } else {
      Serial.print(" Thất bại, rc=");
      Serial.print(client.state());
      Serial.println(" Thử lại sau 5 giây");
      delay(5000);
    }
  }
}

void callback(char* topic, byte* payload, unsigned int length) {
  Serial.print("Message arrived [");
  Serial.print(topic);
  Serial.print("] ");
  
  String message;
  for (int i = 0; i < length; i++) {
    message += (char)payload[i];
  }
  Serial.println(message);

  // Parse JSON từ Backend
  StaticJsonDocument<256> doc;
  DeserializationError error = deserializeJson(doc, message);

  if (!error) {
    String action = doc["action"];
    if (action == "unlock") {
      Serial.println(">> MỞ KHÓA K01");
      digitalWrite(PIN_LOCK, HIGH); // Kích relay mở khóa
      
      // Chờ mở khóa trong thời gian duration_ms hoặc mặc định 3 giây
      int duration = doc["duration_ms"] | 3000;
      delay(duration); 
      
      digitalWrite(PIN_LOCK, LOW);  // Khóa lại
      Serial.println(">> ĐÃ KHÓA K01");
      
      // Gửi Ack về backend xác nhận
      StaticJsonDocument<256> ackDoc;
      ackDoc["command_id"] = doc["command_id"];
      ackDoc["action"] = "unlock";
      ackDoc["status"] = "accepted";
      ackDoc["lock_state"] = "locked"; // Khóa lại ngay sau khi mở
      
      char ackBuffer[256];
      serializeJson(ackDoc, ackBuffer);
      client.publish(topic_ack.c_str(), ackBuffer);
    }
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_LOCK, OUTPUT);
  digitalWrite(PIN_LOCK, LOW);
  pinMode(PIN_DOOR, INPUT_PULLUP);
  pinMode(PIN_VIBRATION, INPUT_PULLUP);
  
  // Attach interrupt cho chân rung
  attachInterrupt(digitalPinToInterrupt(PIN_VIBRATION), detectVibration, FALLING);

  dht.begin();
  setup_wifi();
  
  // Fix chứng chỉ SSL cho ESP32 hoặc bỏ qua kiểm tra chứng chỉ (insecure)
  espClient.setInsecure();
  
  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(callback);
}

void loop() {
  if (!client.connected()) {
    reconnect();
  }
  client.loop();

  unsigned long now = millis();
  
  // Logic nhiệt độ mỗi 10 giây
  if (now - lastTempTime >= 10000) {
    lastTempTime = now;
    float temp = dht.readTemperature();
    if (isnan(temp)) {
      Serial.println("Lỗi: Không thể đọc dữ liệu từ cảm biến DHT11!");
    } else {
      if (temp != last_sent_temp) {
        StaticJsonDocument<256> docTemp;
        docTemp["temperature"] = temp;
        docTemp["timestamp"] = now;
        
        char msgBuffer[256];
        serializeJson(docTemp, msgBuffer);
        
        Serial.print("Publishing Temperature: ");
        Serial.println(msgBuffer);
        client.publish(topic_temp.c_str(), msgBuffer);
        
        last_sent_temp = temp;
      } else {
        Serial.println("Temperature unchanged, not sending.");
      }
    }
  }

  // Mỗi 0.5 giây (500ms) kiểm tra và thực hiện in ra/gửi dữ liệu
  if (now - lastMsgTime >= 500) {
    lastMsgTime = now;

    // Chỉ gửi dữ liệu lên nếu có rung lắc (vibration = 1)
    if (vibrationCount > 0) {
      StaticJsonDocument<512> doc;
      
      // 1. Dùng logic của millis trong arduino để đếm làm timestamp
      doc["timestamp"] = now;
      
      // 2. Dữ liệu rung động
      doc["vibration"] = 1;
      doc["vibration_count"] = vibrationCount;
      
      // 3. Các cảm biến khác hardcode ở phase này
      doc["door"] = 0; 
      doc["has_package"] = 1; 
      // doc["temperature"] = 28.5;  // Đã bỏ hardcode nhiệt độ 
      doc["fsr_raw"] = 2000;
      doc["fsr_percent"] = 50;
      doc["lock_state"] = "locked";
      
      doc["rssi"] = WiFi.RSSI();
      doc["uptime_ms"] = now;

      // Gửi message lên MQTT
      char msgBuffer[512];
      serializeJson(doc, msgBuffer);
      
      Serial.print("Publishing (Vibration Detected): ");
      Serial.println(msgBuffer);
      client.publish(topic_data.c_str(), msgBuffer);

      // Reset bộ đếm rung sau khi đã gửi
      vibrationCount = 0;
    } else {
      Serial.println("No vibration, skipped sending.");
    }
  }
}
