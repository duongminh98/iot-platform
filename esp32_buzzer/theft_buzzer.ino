#include <WiFi.h>
#include <PubSubClient.h>

// --- CẤU HÌNH WIFI & MQTT ---
const char* ssid = "nhaso9"; // Thay bằng host HiveMQ của bạn
const char* password = "910082023";
// HiveMQ Cloud thông thường dùng port 8883 (TLS) nhưng ở đây code mẫu dùng 1883, tôi sẽ giữ nguyên theo mẫu của user (user có thể sửa lại)
const char* mqtt_server = "dd793875ef39402c8a2f8dc020346b51.s1.eu.hivemq.cloud"; 
const char* mqtt_user = "nhom7";                 
const char* mqtt_password = "Nhom7nhom7";             
const int mqtt_port = 8883;
const char* mqtt_topic = "iot/system/security";

// --- CẤU HÌNH PHẦN CỨNG ---
const int BUZZER_PIN = 25; 

WiFiClientSecure espClient; // Đổi sang WiFiClientSecure cho HiveMQ
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
    digitalWrite(BUZZER_PIN, HIGH); // Bật còi (Sửa thành tone() nếu dùng còi passive)
  }
}

void reconnect() {
  // Chỉ thực hiện reconnect khi còi KHÔNG ĐANG HÚ
  while (!client.connected() && !isAlarmActive) {
    Serial.print("Attempting MQTT connection...");
    String clientId = "ESP32_Buzzer_Client_";
    clientId += String(random(0, 0xffff), HEX);
    
    if (client.connect(clientId.c_str(), mqtt_user, mqtt_password)) {
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
  
  // Set insecure cho HiveMQ TLS
  espClient.setInsecure();

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
