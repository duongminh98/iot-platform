const fs = require("fs");
const admin = require("firebase-admin");

const MobileDevice = require("../models/MobileDevice");

let firebaseApp = null;
const lastNotificationAtByKey = new Map();

function loadServiceAccount(config) {
  if (config.firebaseServiceAccountBase64) {
    const json = Buffer.from(config.firebaseServiceAccountBase64, "base64").toString("utf8");
    return JSON.parse(json);
  }

  if (config.firebaseServiceAccountPath) {
    return JSON.parse(fs.readFileSync(config.firebaseServiceAccountPath, "utf8"));
  }

  return null;
}

function getFirebaseApp(config) {
  if (firebaseApp) {
    return firebaseApp;
  }

  const serviceAccount = loadServiceAccount(config);
  if (!serviceAccount) {
    return null;
  }

  firebaseApp = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id || config.fcmProjectId
  });
  return firebaseApp;
}

function buildMessagePayload(alert) {
  return {
    notification: {
      title: `Locker ${alert.locker_id} theft detection`,
      body: alert.message
    },
    data: {
      locker_id: String(alert.locker_id),
      alert_type: alert.type,
      severity: alert.severity,
      body: alert.message
    },
    android: {
      priority: "high",
      notification: {
        channelId: "locker_1_theft_detection",
        priority: "high",
        sound: "default"
      }
    }
  };
}

async function sendTopicNotification(config, alert) {
  const app = getFirebaseApp(config);
  if (!app) {
    console.log("[FCM skipped] Firebase service account is not configured.");
    return;
  }

  const messageId = await admin.messaging(app).send({
    ...buildMessagePayload(alert),
    topic: config.fcmDemoTopic || "locker_1_theft"
  });
  console.log(`[FCM sent] topic=${config.fcmDemoTopic || "locker_1_theft"} alert=${alert.type} messageId=${messageId}`);
}

async function sendTokenNotifications(config, alert) {
  const app = getFirebaseApp(config);
  if (!app) {
    return;
  }

  const devices = await MobileDevice.find({ enabled: true }).lean();
  await Promise.all(
    devices.map(async (device) => {
      try {
        await admin.messaging(app).send({
          ...buildMessagePayload(alert),
          token: device.token
        });
      } catch (error) {
        console.error(`Failed to notify mobile token ${device.token}:`, error.message);
      }
    })
  );
}

async function notifyCriticalAlert(config, alert) {
  if (alert.severity !== "critical") {
    return;
  }

  if (alert.type !== "theft_alarm") {
    return;
  }

  if (config.mobileDemoLockerId && alert.locker_id !== config.mobileDemoLockerId) {
    return;
  }

  const throttleSeconds = Number(config.fcmThrottleSeconds || 20);
  const throttleKey = `${alert.locker_id}:${alert.type}`;
  const now = Date.now();
  const lastSentAt = lastNotificationAtByKey.get(throttleKey) || 0;
  if (throttleSeconds > 0 && now - lastSentAt < throttleSeconds * 1000) {
    console.log(
      `[FCM skipped] ${alert.type} for locker ${alert.locker_id}; throttled for ${throttleSeconds}s.`
    );
    return;
  }

  try {
    await sendTopicNotification(config, alert);
    await sendTokenNotifications(config, alert);
    lastNotificationAtByKey.set(throttleKey, now);
  } catch (error) {
    console.error("Failed to send FCM notification:", error.message);
  }
}

module.exports = {
  notifyCriticalAlert
};
