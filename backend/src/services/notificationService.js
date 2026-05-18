const MobileDevice = require("../models/MobileDevice");

async function sendFcmMessage(config, token, alert) {
  if (!config.fcmProjectId || !config.fcmAccessToken) {
    console.log(
      `[FCM skipped] ${alert.severity} ${alert.type} for locker ${alert.locker_id}; no FCM credentials configured.`
    );
    return;
  }

  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${config.fcmProjectId}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.fcmAccessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: {
          token,
          notification: {
            title: `Locker ${alert.locker_id} ${alert.severity} alert`,
            body: alert.message
          },
          data: {
            locker_id: String(alert.locker_id),
            alert_type: alert.type,
            severity: alert.severity
          }
        }
      })
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`FCM request failed with ${response.status}: ${body}`);
  }
}

async function notifyCriticalAlert(config, alert) {
  if (alert.severity !== "critical") {
    return;
  }

  const devices = await MobileDevice.find({ enabled: true }).lean();
  await Promise.all(
    devices.map(async (device) => {
      try {
        await sendFcmMessage(config, device.token, alert);
      } catch (error) {
        console.error(`Failed to notify mobile token ${device.token}:`, error.message);
      }
    })
  );
}

module.exports = {
  notifyCriticalAlert
};
