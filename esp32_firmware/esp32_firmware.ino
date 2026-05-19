#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include "esp_wifi.h"

// ================= CẤU HÌNH WIFI & MQTT =================

// HiveMQ Cloud thông thường dùng port 8883 (TLS)
const int mqtt_port = 8883;


const char* ssid = "P302";       // Tên Wi-Fi nhà bạn
const char* password = "302302302"; // Mật khẩu Wi-Fi

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
const int PIN_FSR = 34;       // Cảm biến lực FSR 400 (Dùng chân 34 vì 21 không hỗ trợ đọc Analog ADC trên ESP32)
const int PIN_DOOR = 26;      // Cảm biến cửa MC-38
const int PIN_LOCK = 25;      // Relay điều khiển khóa K01

#define DHTPIN 23
#define DHTTYPE DHT11
DHT dht(DHTPIN, DHTTYPE);

const String topic_temp = "locker/" + lockerId + "/temperature";
const String topic_fsr = "locker/" + lockerId + "/fsr_force";

float last_sent_temp = -999.0;
unsigned long lastTempTime = 0;

int last_sent_fsr = -999;
unsigned long lastFsrTime = 0;

int last_door_state = -1;
String currentLockState = "locked";
bool waitingForDoorCloseAfterUnlock = false;
const int DOOR_CLOSED_STATE = HIGH;

// ================= BIẾN TOÀN CỤC =================
WiFiClientSecure espClient;
PubSubClient client(espClient);

unsigned long lastMsgTime = 0;
const unsigned long MSG_INTERVAL = 4000; // Gửi dữ liệu mỗi 5 giây
const int DEFAULT_UNLOCK_DURATION_MS = 3000;

// Biến đếm số lần rung và thời gian
volatile int vibrationCount = 0;
volatile unsigned long lastVibrationTime = 0;
volatile unsigned long vibrationStartTime = 0; // Thời điểm bắt đầu chuỗi rung

void publishLockState(const char* eventType, int doorState, unsigned long timestamp) {
  StaticJsonDocument<256> doc;
  doc["event"] = eventType;
  doc["door"] = doorState;
  doc["lock_state"] = currentLockState;
  doc["timestamp"] = timestamp;

  char msgBuffer[256];
  serializeJson(doc, msgBuffer);
  Serial.print("Publishing Lock State: ");
  Serial.println(msgBuffer);
  client.publish(topic_data.c_str(), msgBuffer);
}

void unlockK01(unsigned long durationMs, const char* source) {
  unsigned long unlockStart = millis();
  int doorState = last_door_state == -1 ? digitalRead(PIN_DOOR) : last_door_state;

  currentLockState = "unlocked";
  waitingForDoorCloseAfterUnlock = true;
  publishLockState("unlock", doorState, unlockStart);

  Serial.print(">> MỞ KHÓA K01 từ ");
  Serial.println(source);
  digitalWrite(PIN_LOCK, HIGH);
  delay(durationMs);
  digitalWrite(PIN_LOCK, LOW);
  Serial.println(">> ĐÃ KHÓA K01");
}

void handleSerialCommand() {
  while (Serial.available() > 0) {
    char command = (char)Serial.read();

    if (command == '\r' || command == '\n') {
      continue;
    }

    if (command == '1') {
      unlockK01(DEFAULT_UNLOCK_DURATION_MS, "Serial");
    } else {
      Serial.print(">> Lệnh không hợp lệ: ");
      Serial.println(command);
    }
  }
}

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
      int duration = doc["duration_ms"] | DEFAULT_UNLOCK_DURATION_MS;
      unlockK01(duration, "MQTT");

      // Gửi Ack về backend xác nhận
      StaticJsonDocument<256> ackDoc;
      ackDoc["command_id"] = doc["command_id"];
      ackDoc["action"] = "unlock";
      ackDoc["status"] = "accepted";
      ackDoc["lock_state"] = currentLockState;

      char ackBuffer[256];
      serializeJson(ackDoc, ackBuffer);
      client.publish(topic_ack.c_str(), ackBuffer);
    }
  }
}

void setup() {
  Serial.begin(115200);
  Serial.println("Nhập 1 để mở khóa K01");
  pinMode(PIN_LOCK, OUTPUT);
  digitalWrite(PIN_LOCK, LOW);
  pinMode(PIN_DOOR, INPUT_PULLUP);
  pinMode(PIN_VIBRATION, INPUT_PULLUP);
  // Không cần pinMode cho chân Analog (34)
  
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
  handleSerialCommand();

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

  // Logic FSR 400 mỗi 1 giây (1000ms)
  if (now - lastFsrTime >= 1000) {
    lastFsrTime = now;
    int current_fsr = analogRead(PIN_FSR);
    
    // Nếu giá trị thay đổi lớn hơn 100 (tùy chỉnh độ nhạy) thì gửi
    if (abs(current_fsr - last_sent_fsr) > 100) {
      StaticJsonDocument<256> docFsr;
      docFsr["force_value"] = current_fsr;
      docFsr["threshold_status"] = "changed";
      docFsr["timestamp"] = now;
      
      char msgBuffer[256];
      serializeJson(docFsr, msgBuffer);
      
      Serial.print("Publishing FSR: ");
      Serial.println(msgBuffer);
      client.publish(topic_fsr.c_str(), msgBuffer);
      
      last_sent_fsr = current_fsr;
    } else {
      Serial.print("FSR unchanged: ");
      Serial.println(current_fsr);
    }
  }

  // Logic cửa MC-38 kiểm tra liên tục
  int current_door_state = digitalRead(PIN_DOOR);
  if (current_door_state != last_door_state) {
    if (last_door_state != -1) { // Không gửi ngay lúc mới bật nguồn
      bool doorClosedAfterUnlock = waitingForDoorCloseAfterUnlock && last_door_state != DOOR_CLOSED_STATE && current_door_state == DOOR_CLOSED_STATE;
      if (doorClosedAfterUnlock) {
        currentLockState = "locked";
        waitingForDoorCloseAfterUnlock = false;
      }

      StaticJsonDocument<512> docDoor;
      docDoor["timestamp"] = now;
      docDoor["door"] = current_door_state;
      docDoor["vibration"] = 0;
      docDoor["vibration_count"] = 0;
      docDoor["lock_state"] = currentLockState;
      docDoor["rssi"] = WiFi.RSSI();
      docDoor["uptime_ms"] = now;

      char msgBuffer[512];
      serializeJson(docDoor, msgBuffer);
      Serial.print("Publishing Door State changed: ");
      Serial.println(msgBuffer);
      client.publish(topic_data.c_str(), msgBuffer);

      if (doorClosedAfterUnlock) {
        publishLockState("relocked", current_door_state, now);
      }
    }
    last_door_state = current_door_state;
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
      doc["door"] = last_door_state == -1 ? 0 : last_door_state;
      // Bỏ hardcode has_package, fsr_raw, fsr_percent để tránh xung đột với luồng FSR
      doc["lock_state"] = currentLockState;
      
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
