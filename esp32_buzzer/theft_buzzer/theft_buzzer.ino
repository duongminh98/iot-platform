#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// Wi-Fi
const char* ssid = "P302";
const char* password = "302302302";

// HiveMQ Cloud
const char* mqtt_server = "dd793875ef39402c8a2f8dc020346b51.s1.eu.hivemq.cloud";
const int mqtt_port = 8883;
const char* mqtt_user = "nhom7";
const char* mqtt_password = "Nhom7nhom7";

// This ESP32 is a dedicated alarm device for locker 1.
const int DEMO_LOCKER_ID = 1;
const char* SECURITY_TOPIC = "iot/system/security";

// Hardware
const int BUZZER_PIN = 25;
const unsigned long DEFAULT_ALARM_DURATION_MS = 10000;

WiFiClientSecure espClient;
PubSubClient client(espClient);

bool alarmActive = false;
unsigned long alarmStartMs = 0;
unsigned long alarmDurationMs = DEFAULT_ALARM_DURATION_MS;

void startAlarm(unsigned long durationMs) {
  if (alarmActive) {
    return;
  }

  alarmDurationMs = durationMs > 0 ? durationMs : DEFAULT_ALARM_DURATION_MS;
  alarmStartMs = millis();
  alarmActive = true;

  // Stop receiving MQTT packets while the alarm is locked for 10 seconds.
  if (client.connected()) {
    client.disconnect();
  }

  digitalWrite(BUZZER_PIN, HIGH);
  Serial.println("THEFT ALARM LOCKED: buzzer ON, MQTT disabled.");
}

void stopAlarmIfExpired() {
  if (!alarmActive) {
    return;
  }

  if (millis() - alarmStartMs < alarmDurationMs) {
    return;
  }

  digitalWrite(BUZZER_PIN, LOW);
  alarmActive = false;
  Serial.println("THEFT ALARM FINISHED: buzzer OFF, MQTT can reconnect.");
}

void setupWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  Serial.print("Connecting Wi-Fi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();
  Serial.print("Wi-Fi connected. IP: ");
  Serial.println(WiFi.localIP());
}

void onMqttMessage(char* topic, byte* payload, unsigned int length) {
  if (alarmActive) {
    return;
  }

  if (String(topic) != SECURITY_TOPIC) {
    return;
  }

  StaticJsonDocument<256> doc;
  DeserializationError error = deserializeJson(doc, payload, length);
  if (error) {
    Serial.print("Ignored invalid security payload: ");
    Serial.println(error.c_str());
    return;
  }

  const char* status = doc["status"] | "";
  const char* alertType = doc["alert_type"] | "";
  const int lockerId = doc["locker_id"] | -1;
  const bool fcmRequested = doc["fcm_requested"] | false;
  const unsigned long alarmMs = doc["alarm_ms"] | DEFAULT_ALARM_DURATION_MS;

  const bool shouldAlarm =
    strcmp(status, "theft") == 0 &&
    (strcmp(alertType, "theft_alarm") == 0 || strcmp(alertType, "forced_entry") == 0) &&
    lockerId == DEMO_LOCKER_ID &&
    fcmRequested;

  if (!shouldAlarm) {
    Serial.println("Ignored security payload that does not match locker 1 theft/forced-entry alarm with fcm_requested=true.");
    return;
  }

  Serial.print("Locker 1 alarm confirmed by backend: ");
  Serial.println(alertType);
  startAlarm(alarmMs);
}

void reconnectMqtt() {
  while (!client.connected() && !alarmActive) {
    String clientId = "ESP32_Buzzer_Locker1_";
    clientId += String(random(0, 0xffff), HEX);

    Serial.print("Connecting MQTT...");
    if (client.connect(clientId.c_str(), mqtt_user, mqtt_password)) {
      Serial.println("connected");
      client.subscribe(SECURITY_TOPIC, 1);
      Serial.print("Subscribed: ");
      Serial.println(SECURITY_TOPIC);
    } else {
      Serial.print("failed rc=");
      Serial.print(client.state());
      Serial.println("; retry in 5s");
      delay(5000);
    }
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);

  setupWifi();

  espClient.setInsecure();
  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(onMqttMessage);
}

void loop() {
  if (alarmActive) {
    stopAlarmIfExpired();
    return;
  }

  if (!client.connected()) {
    reconnectMqtt();
  }

  client.loop();
}
