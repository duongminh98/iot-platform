const path = require("path");
const mqtt = require("mqtt");

require("dotenv").config({
  path: path.resolve(__dirname, "../.env")
});

const brokerUrl = process.env.SIMULATOR_BROKER_URL || process.env.MQTT_URL || "mqtts://dd793875ef39402c8a2f8dc020346b51.s1.eu.hivemq.cloud:8883";
const intervalMs = Number(process.env.SIMULATOR_INTERVAL_MS || 5000);
const lockerIds = (process.env.SIMULATOR_LOCKER_IDS || "1,2,3")
  .split(",")
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isFinite(value));

const mqttOptions = {};
if (process.env.MQTT_USERNAME) {
  mqttOptions.username = process.env.MQTT_USERNAME;
}
if (process.env.MQTT_PASSWORD) {
  mqttOptions.password = process.env.MQTT_PASSWORD;
}

const client = mqtt.connect(brokerUrl, mqttOptions);
const stateByLocker = new Map();

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function nextLockerState(lockerId) {
  const current =
    stateByLocker.get(lockerId) || {
      temperature: randomInt(24, 32),
      door: 0,
      has_package: 0,
      vibration_score: 0,
      fsr_percent: randomInt(35, 65),
      lock_state: "locked",
      rssi: randomInt(-67, -45),
      uptime_ms: 0
    };

  const vibrationBurst = Math.random() < 0.12;
  const door = Math.random() < 0.12 ? 1 - current.door : current.door;
  const hasPackage = Math.random() < 0.16 ? 1 - current.has_package : current.has_package;
  const fsrPercent = clamp(current.fsr_percent + randomInt(-8, 8), 0, 100);

  const next = {
    temperature: clamp(current.temperature + randomInt(-2, 3), 20, 40),
    door,
    has_package: hasPackage,
    vibration: vibrationBurst ? 1 : 0,
    vibration_count: vibrationBurst ? randomInt(6, 14) : randomInt(0, 2),
    vibration_score: vibrationBurst ? randomInt(72, 95) : randomInt(0, 25),
    fsr_raw: Math.round((fsrPercent / 100) * 4095),
    fsr_percent: fsrPercent,
    fsr_delta: fsrPercent - current.fsr_percent,
    lock_state: current.lock_state,
    battery_percent: null,
    rssi: clamp(current.rssi + randomInt(-3, 3), -92, -38),
    uptime_ms: current.uptime_ms + intervalMs,
    event_type: vibrationBurst ? "vibration_burst" : null
  };

  if (next.has_package === 1 && Math.random() < 0.2) {
    next.door = 1;
  }

  stateByLocker.set(lockerId, next);
  return next;
}

function publishLocker(lockerId) {
  const payload = nextLockerState(lockerId);
  const topic = `locker/${lockerId}/data`;

  client.publish(topic, JSON.stringify(payload), { qos: 0 }, (error) => {
    if (error) {
      console.error(`Failed to publish ${topic}:`, error.message);
      return;
    }

    console.log(`[SIM] ${topic} ${JSON.stringify(payload)}`);
  });
}

function handleCommand(topic, messageBuffer) {
  const match = /^locker\/(\d+)\/command$/.exec(topic);
  if (!match) {
    return;
  }

  const lockerId = Number(match[1]);
  let payload;
  try {
    payload = JSON.parse(messageBuffer.toString("utf8"));
  } catch (error) {
    console.error(`Invalid command JSON on ${topic}:`, error.message);
    return;
  }

  const current = stateByLocker.get(lockerId) || nextLockerState(lockerId);
  if (payload.action === "unlock") {
    current.lock_state = "unlocked";
  } else if (payload.action === "lock") {
    current.lock_state = "locked";
  }
  stateByLocker.set(lockerId, current);

  const ackTopic = `locker/${lockerId}/ack`;
  const ack = {
    command_id: payload.command_id,
    action: payload.action,
    status: "accepted",
    lock_state: current.lock_state,
    timestamp: new Date().toISOString()
  };

  client.publish(ackTopic, JSON.stringify(ack), { qos: 1 }, (error) => {
    if (error) {
      console.error(`Failed to publish ${ackTopic}:`, error.message);
      return;
    }
    console.log(`[SIM-ACK] ${ackTopic} ${JSON.stringify(ack)}`);
  });
}

client.on("connect", () => {
  console.log(`Simulator connected to ${brokerUrl}`);
  client.subscribe("locker/+/command", (error) => {
    if (error) {
      console.error("Failed to subscribe to command topics:", error.message);
    }
  });

  lockerIds.forEach((lockerId) => publishLocker(lockerId));
  setInterval(() => {
    lockerIds.forEach((lockerId) => publishLocker(lockerId));
  }, intervalMs);
});

client.on("message", handleCommand);

client.on("error", (error) => {
  console.error("Simulator MQTT error:", error.message);
});
