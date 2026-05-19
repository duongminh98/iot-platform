const path = require("path");

require("dotenv").config({
  path: path.resolve(__dirname, "../../.env")
});

function readNumber(name, fallback) {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

module.exports = {
  port: readNumber("PORT", 3000),
  mqttPort: readNumber("MQTT_PORT", 1883),
  mqttUrl: process.env.MQTT_URL || null,
  mqttUsername: process.env.MQTT_USERNAME || null,
  mqttPassword: process.env.MQTT_PASSWORD || null,
  mqttTls: process.env.MQTT_TLS === "true",
  mongoUri: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/smart_locker_iot",
  packageStaleSeconds: readNumber("PACKAGE_STALE_SECONDS", 30),
  doorOpenStaleSeconds: readNumber("DOOR_OPEN_STALE_SECONDS", 20),
  vibrationCriticalScore: readNumber("VIBRATION_CRITICAL_SCORE", 70),
  fsrDropCriticalPercent: readNumber("FSR_DROP_CRITICAL_PERCENT", 30),
  weakSignalRssi: readNumber("WEAK_SIGNAL_RSSI", -80),
  alertDedupSeconds: readNumber("ALERT_DEDUP_SECONDS", 60),
  commandTimeoutSeconds: readNumber("COMMAND_TIMEOUT_SECONDS", 10),
  historyLimit: readNumber("HISTORY_LIMIT", 100),
  fcmProjectId: process.env.FCM_PROJECT_ID || null,
  fcmAccessToken: process.env.FCM_ACCESS_TOKEN || null,
  mobileDemoLockerId: readNumber("MOBILE_DEMO_LOCKER_ID", 1),
  frontendDir: path.resolve(__dirname, "../../frontend")
};
