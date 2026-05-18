const mqtt = require("mqtt");

const API_BASE_URL = process.env.CONTRACT_API_BASE_URL || "http://127.0.0.1:3000";
const MQTT_URL = process.env.CONTRACT_MQTT_URL || process.env.SIMULATOR_BROKER_URL || "mqtt://127.0.0.1:1883";
const LOCKER_ID = Number(process.env.CONTRACT_LOCKER_ID || 9000 + Math.floor(Math.random() * 900));

const mqttOptions = {};
if (process.env.MQTT_USERNAME) {
  mqttOptions.username = process.env.MQTT_USERNAME;
}
if (process.env.MQTT_PASSWORD) {
  mqttOptions.password = process.env.MQTT_PASSWORD;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(path, options) {
  const response = await fetch(`${API_BASE_URL}${path}`, options);
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${path} failed with ${response.status}: ${text}`);
  }
  return body;
}

function connectMqtt() {
  const client = mqtt.connect(MQTT_URL, mqttOptions);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out connecting to ${MQTT_URL}`)), 8000);
    client.once("connect", () => {
      clearTimeout(timeout);
      resolve(client);
    });
    client.once("error", reject);
  });
}

function publish(client, topic, payload) {
  return new Promise((resolve, reject) => {
    client.publish(topic, JSON.stringify(payload), { qos: 1 }, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function waitFor(path, predicate, label, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  let latest;
  while (Date.now() < deadline) {
    latest = await fetchJson(path);
    if (predicate(latest)) {
      return latest;
    }
    await sleep(300);
  }
  throw new Error(`Timed out waiting for ${label}. Latest response: ${JSON.stringify(latest)}`);
}

async function waitForMqttMessage(client, topic, trigger) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for MQTT ${topic}`)), 10000);

    function onMessage(receivedTopic, buffer) {
      if (receivedTopic !== topic) {
        return;
      }
      clearTimeout(timeout);
      client.off("message", onMessage);
      resolve(JSON.parse(buffer.toString("utf8")));
    }

    client.on("message", onMessage);
    client.subscribe(topic, { qos: 1 }, async (error) => {
      if (error) {
        clearTimeout(timeout);
        client.off("message", onMessage);
        reject(error);
        return;
      }

      try {
        await trigger();
      } catch (triggerError) {
        clearTimeout(timeout);
        client.off("message", onMessage);
        reject(triggerError);
      }
    });
  });
}

async function main() {
  console.log(`[contract] API ${API_BASE_URL}`);
  console.log(`[contract] MQTT ${MQTT_URL}`);
  console.log(`[contract] locker ${LOCKER_ID}`);

  await fetchJson("/health");
  const client = await connectMqtt();

  await publish(client, `locker/${LOCKER_ID}/data`, {
    temperature: "bad",
    has_package: 1
  });
  await sleep(500);

  await publish(client, `locker/${LOCKER_ID}/data`, {
    door: 1,
    has_package: 1,
    temperature: null,
    vibration: 1,
    vibration_count: 9,
    vibration_score: 88,
    fsr_raw: 1500,
    fsr_percent: 35,
    fsr_delta: -40,
    lock_state: "locked",
    battery_percent: null,
    rssi: -84,
    uptime_ms: 123456,
    event_type: "contract_tamper"
  });

  const locker = await waitFor(
    `/locker/${LOCKER_ID}`,
    (body) => body.vibration_score === 88 && body.fsr_delta === -40,
    "expanded locker state"
  );

  assert(locker.temperature === null, "temperature should allow null.");
  assert(locker.lock_state === "locked", "lock_state should be stored.");
  assert(locker.alerts.includes("tamper_vibration"), "tamper_vibration should be active.");
  assert(locker.alerts.includes("forced_entry"), "forced_entry should be active.");

  const history = await fetchJson(`/history/${LOCKER_ID}?limit=3`);
  assert(history.some((entry) => entry.event_type === "contract_tamper"), "history should include event_type.");

  const alerts = await waitFor(
    `/alerts?locker_id=${LOCKER_ID}&limit=10`,
    (body) => body.some((alert) => alert.type === "tamper_vibration" && alert.severity === "critical"),
    "critical alert record"
  );
  assert(alerts.some((alert) => alert.type === "forced_entry"), "forced_entry alert record should exist.");

  const commandTopic = `locker/${LOCKER_ID}/command`;
  const commandPayload = await waitForMqttMessage(client, commandTopic, async () => {
    const command = await fetchJson(`/locker/${LOCKER_ID}/command`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": "contract-test"
      },
      body: JSON.stringify({
        action: "unlock",
        duration_ms: 3000
      })
    });
    assert(command.status === "sent", "command should be marked sent.");
  });

  assert(commandPayload.action === "unlock", "MQTT command action should be unlock.");
  assert(commandPayload.command_id, "MQTT command should include command_id.");

  await publish(client, `locker/${LOCKER_ID}/ack`, {
    command_id: commandPayload.command_id,
    action: "unlock",
    status: "accepted",
    lock_state: "unlocked",
    timestamp: new Date().toISOString()
  });

  const command = await waitFor(
    `/commands/${commandPayload.command_id}`,
    (body) => body.status === "accepted",
    "command acknowledgement"
  );
  assert(command.ack_payload.lock_state === "unlocked", "ack payload should be stored.");

  const updatedLocker = await fetchJson(`/locker/${LOCKER_ID}`);
  assert(updatedLocker.latest_command_status === "accepted", "locker should show latest command status.");
  assert(updatedLocker.lock_state === "unlocked", "locker lock_state should follow ack.");

  client.end(true);
  console.log("[contract] OK");
}

main().catch((error) => {
  console.error("[contract] FAILED", error);
  process.exit(1);
});
