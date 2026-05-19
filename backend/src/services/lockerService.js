const mqtt = require("mqtt");
const Aedes = require("aedes");
const net = require("net");

const Alert = require("../models/Alert");
const Command = require("../models/Command");
const LockerReading = require("../models/LockerReading");
const LockerState = require("../models/LockerState");
const { notifyCriticalAlert } = require("./notificationService");

const vibrationQueues = {};

const VALID_LOCK_STATES = ["locked", "unlocked", "unknown"];
const VALID_ACTIONS = ["unlock", "lock", "beep", "calibrate_fsr"];

function parseDataTopic(topic) {
  const match = /^locker\/(\d+)\/data$/.exec(topic);
  return match ? Number(match[1]) : null;
}

function parseAckTopic(topic) {
  const match = /^locker\/(\d+)\/ack$/.exec(topic);
  return match ? Number(match[1]) : null;
}

function parseTempTopic(topic) {
  const match = /^locker\/(\d+)\/temperature$/.exec(topic);
  return match ? Number(match[1]) : null;
}

function parseFsrTopic(topic) {
  const match = /^locker\/(\d+)\/fsr_force$/.exec(topic);
  return match ? Number(match[1]) : null;
}

function isNumberOrNull(value) {
  return typeof value === "number" || value === null || typeof value === "undefined";
}

function normalizeOptionalNumber(payload, field, options = {}) {
  const value = payload[field];
  if (!isNumberOrNull(value)) {
    throw new Error(`${field} must be a number or null.`);
  }

  if (typeof value !== "number") {
    return null;
  }

  if (typeof options.min === "number" && value < options.min) {
    throw new Error(`${field} must be >= ${options.min}.`);
  }

  if (typeof options.max === "number" && value > options.max) {
    throw new Error(`${field} must be <= ${options.max}.`);
  }

  return value;
}

function normalizeOptionalBit(payload, field) {
  const value = payload[field];
  if (typeof value === "undefined" || value === null) {
    return null;
  }

  if (![0, 1].includes(value)) {
    throw new Error(`${field} must be 0 or 1.`);
  }

  return value;
}

function normalizePayload(payload) {
  if (![0, 1].includes(payload?.door)) {
    throw new Error("door is required and must be 0 or 1.");
  }

  const lockState = payload.lock_state || "unknown";
  if (!VALID_LOCK_STATES.includes(lockState)) {
    throw new Error("lock_state must be locked, unlocked, or unknown.");
  }

  return {
    device_timestamp: normalizeOptionalNumber(payload, "timestamp"),
    temperature: normalizeOptionalNumber(payload, "temperature"),
    door: payload.door,
    has_package: normalizeOptionalBit(payload, "has_package"),
    vibration: normalizeOptionalBit(payload, "vibration"),
    vibration_count: normalizeOptionalNumber(payload, "vibration_count", { min: 0 }),
    vibration_score: normalizeOptionalNumber(payload, "vibration_score", { min: 0, max: 100 }),
    fsr_raw: normalizeOptionalNumber(payload, "fsr_raw", { min: 0 }),
    fsr_percent: normalizeOptionalNumber(payload, "fsr_percent", { min: 0, max: 100 }),
    fsr_delta: normalizeOptionalNumber(payload, "fsr_delta"),
    lock_state: lockState,
    battery_percent: normalizeOptionalNumber(payload, "battery_percent", { min: 0, max: 100 }),
    rssi: normalizeOptionalNumber(payload, "rssi"),
    uptime_ms: normalizeOptionalNumber(payload, "uptime_ms", { min: 0 }),
    event_type: typeof payload.event_type === "string" ? payload.event_type : null
  };
}

function addAlert(alerts, type, severity, message, metadata = {}) {
  alerts.push({ type, severity, message, metadata });
}

function buildVibrationScore(reading, thresholds) {
  if (typeof reading.vibration_score === "number") {
    return reading.vibration_score;
  }

  if (typeof reading.vibration_count !== "number" || thresholds.vibrationCriticalTotal <= 0) {
    return null;
  }

  return Math.min(100, Math.round((reading.vibration_count / thresholds.vibrationCriticalTotal) * 100));
}

function updateVibrationWindow(lockerId, reading, thresholds) {
  const now = reading.timestamp.getTime();
  const windowMs = thresholds.vibrationWindowSeconds * 1000;
  const count = typeof reading.vibration_count === "number" ? reading.vibration_count : 0;

  if (!vibrationQueues[lockerId]) {
    vibrationQueues[lockerId] = [];
  }

  if (count > 0) {
    vibrationQueues[lockerId].push({
      timestamp: now,
      count
    });
  }

  vibrationQueues[lockerId] = vibrationQueues[lockerId].filter((entry) => now - entry.timestamp <= windowMs);

  return vibrationQueues[lockerId].reduce((sum, entry) => sum + entry.count, 0);
}

function buildAlertCandidates(previousState, reading, thresholds) {
  const candidates = [];
  const timestamp = reading.timestamp;
  const isLocked = reading.lock_state === "locked";
  const vibrationScore = buildVibrationScore(reading, thresholds);
  const totalVibrations = updateVibrationWindow(reading.locker_id, reading, thresholds);

  let packageSince = null;
  if (reading.has_package === 1) {
    packageSince =
      previousState?.has_package === 1 && previousState.package_since
        ? previousState.package_since
        : timestamp;
    const packageAgeSeconds = Math.floor((timestamp - packageSince) / 1000);
    if (packageAgeSeconds >= thresholds.packageStaleSeconds) {
      addAlert(
        candidates,
        "package_stale",
        "warning",
        `Locker ${reading.locker_id} package has been waiting for ${packageAgeSeconds}s.`,
        { package_age_seconds: packageAgeSeconds }
      );
    }
  }

  let doorOpenSince = null;
  if (reading.door === 1) {
    doorOpenSince =
      previousState?.door === 1 && previousState.door_open_since
        ? previousState.door_open_since
        : timestamp;
    const doorOpenAgeSeconds = Math.floor((timestamp - doorOpenSince) / 1000);
    if (doorOpenAgeSeconds >= thresholds.doorOpenStaleSeconds) {
      addAlert(
        candidates,
        "door_open_too_long",
        "warning",
        `Locker ${reading.locker_id} door has been open for ${doorOpenAgeSeconds}s.`,
        { door_open_age_seconds: doorOpenAgeSeconds }
      );
    }
  }

  if (typeof reading.temperature === "number" && reading.temperature > 35) {
    addAlert(
      candidates,
      "temperature_high",
      "warning",
      `Locker ${reading.locker_id} temperature is high at ${reading.temperature}C.`
    );
  }

  if (
    previousState &&
    typeof reading.temperature === "number" &&
    typeof previousState.temperature === "number" &&
    Math.abs(reading.temperature - previousState.temperature) >= 8
  ) {
    addAlert(
      candidates,
      "temperature_spike",
      "warning",
      `Locker ${reading.locker_id} temperature changed abruptly from ${previousState.temperature}C to ${reading.temperature}C.`
    );
  }

  if (
    totalVibrations > thresholds.vibrationCriticalTotal
  ) {
    addAlert(
      candidates,
      "theft_alarm",
      "critical",
      `Locker ${reading.locker_id} detected theft vibration total (${totalVibrations}) in ${thresholds.vibrationWindowSeconds}s.`,
      {
        vibration_count: reading.vibration_count,
        vibration_score: vibrationScore,
        vibration_total: totalVibrations,
        vibration_window_seconds: thresholds.vibrationWindowSeconds
      }
    );
  }

  if (isLocked && reading.door === 1) {
    addAlert(
      candidates,
      "forced_entry",
      "critical",
      `Locker ${reading.locker_id} door opened while lock state is locked.`
    );
  }

  const fsrDelta =
    typeof reading.fsr_delta === "number"
      ? reading.fsr_delta
      : previousState &&
          typeof previousState.fsr_percent === "number" &&
          typeof reading.fsr_percent === "number"
        ? reading.fsr_percent - previousState.fsr_percent
        : null;

  if (
    isLocked &&
    typeof fsrDelta === "number" &&
    fsrDelta <= -Math.abs(thresholds.fsrDropCriticalPercent)
  ) {
    addAlert(
      candidates,
      "object_removed",
      "critical",
      `Locker ${reading.locker_id} FSR pressure dropped sharply while locked.`,
      { fsr_delta: fsrDelta }
    );
  }

  if (typeof reading.rssi === "number" && reading.rssi <= thresholds.weakSignalRssi) {
    addAlert(
      candidates,
      "weak_signal",
      "warning",
      `Locker ${reading.locker_id} Wi-Fi signal is weak at ${reading.rssi} dBm.`,
      { rssi: reading.rssi }
    );
  }

  return {
    candidates,
    packageSince,
    doorOpenSince
  };
}

function severityRank(severity) {
  return { normal: 0, info: 1, warning: 2, critical: 3 }[severity] || 0;
}

function summarizeSeverity(candidates) {
  return candidates.reduce(
    (highest, alert) => (severityRank(alert.severity) > severityRank(highest) ? alert.severity : highest),
    "normal"
  );
}

async function createDedupedAlerts(reading, candidates, thresholds, io, config, mqttClient) {
  const createdAlerts = [];
  const dedupAfter = new Date(Date.now() - thresholds.alertDedupSeconds * 1000);

  for (const candidate of candidates) {
    const duplicate = await Alert.findOne({
      locker_id: reading.locker_id,
      type: candidate.type,
      timestamp: { $gte: dedupAfter }
    }).lean();

    if (duplicate) {
      await notifyCriticalAlert(config, {
        locker_id: reading.locker_id,
        type: candidate.type,
        severity: candidate.severity,
        message: candidate.message,
        metadata: candidate.metadata,
        timestamp: reading.timestamp
      });
      continue;
    }

    const alert = await Alert.create({
      locker_id: reading.locker_id,
      type: candidate.type,
      severity: candidate.severity,
      message: candidate.message,
      metadata: candidate.metadata,
      timestamp: reading.timestamp
    });
    createdAlerts.push(alert);

    if (io) {
      io.emit("alert_created", alert);
    }

    if ((alert.type === "theft_alarm" || alert.type === "tamper_detected") && mqttClient) {
      mqttClient.publish("iot/system/security", JSON.stringify({
        status: "theft",
        message: alert.message
      }));
    }

    await notifyCriticalAlert(config, alert);
  }

  return createdAlerts;
}

async function handleLockerData(topic, messageBuffer, thresholds, io, config, mqttClient) {
  const lockerId = parseDataTopic(topic);
  if (lockerId === null) {
    return;
  }

  let payload;
  try {
    payload = JSON.parse(messageBuffer.toString("utf8"));
  } catch (error) {
    console.error(`Invalid JSON on topic ${topic}:`, error.message);
    return;
  }

  let normalized;
  try {
    normalized = normalizePayload(payload);
  } catch (error) {
    console.error(`Rejected payload for topic ${topic}:`, error.message);
    return;
  }

  const timestamp = new Date();
  const reading = {
    locker_id: lockerId,
    ...normalized,
    timestamp
  };
  if (reading.vibration_score === null) {
    reading.vibration_score = buildVibrationScore(reading, thresholds);
  }

  const previousState = await LockerState.findOne({ locker_id: lockerId }).lean();
  await LockerReading.create(reading);

  const alertState = buildAlertCandidates(previousState, reading, thresholds);
  for (const alert of alertState.candidates) {
    console.warn(alert.message);
  }

  await createDedupedAlerts(reading, alertState.candidates, thresholds, io, config, mqttClient);

  const state = {
    ...reading,
    package_since: alertState.packageSince,
    door_open_since: alertState.doorOpenSince,
    alerts: [...new Set(alertState.candidates.map((alert) => alert.type))],
    alert_severity: summarizeSeverity(alertState.candidates),
    last_warning:
      alertState.candidates.length > 0
        ? alertState.candidates.map((alert) => alert.message).join(" | ")
        : null
  };

  // Kế thừa các chỉ số từ state cũ nếu payload rung lắc hiện tại bị khuyết (vì đã chuyển FSR/Nhiệt độ sang luồng riêng)
  if (state.temperature === null && previousState && previousState.temperature !== undefined) {
    state.temperature = previousState.temperature;
  }
  if (state.fsr_raw === null && previousState && previousState.fsr_raw !== undefined) {
    state.fsr_raw = previousState.fsr_raw;
  }
  if (state.fsr_percent === null && previousState && previousState.fsr_percent !== undefined) {
    state.fsr_percent = previousState.fsr_percent;
  }
  if (state.has_package === null && previousState && previousState.has_package !== undefined) {
    state.has_package = previousState.has_package;
  }

  const updatedState = await LockerState.findOneAndUpdate({ locker_id: lockerId }, state, {
    upsert: true,
    new: true,
    setDefaultsOnInsert: true
  });

  if (io) {
    io.emit("telemetry_update", {
      reading,
      state: updatedState
    });
  }
}

async function handleLockerAck(topic, messageBuffer, io) {
  const lockerId = parseAckTopic(topic);
  if (lockerId === null) {
    return;
  }

  let payload;
  try {
    payload = JSON.parse(messageBuffer.toString("utf8"));
  } catch (error) {
    console.error(`Invalid JSON on topic ${topic}:`, error.message);
    return;
  }

  if (!payload.command_id) {
    console.error(`Rejected ack for topic ${topic}: command_id is required.`);
    return;
  }

  const status = payload.status === "rejected" ? "rejected" : "accepted";
  const command = await Command.findByIdAndUpdate(
    payload.command_id,
    {
      status,
      ack_payload: payload,
      acknowledged_at: new Date()
    },
    {
      new: true
    }
  );

  if (!command) {
    console.error(`Ack references unknown command ${payload.command_id}.`);
    return;
  }

  const update = {
    latest_command_status: status
  };
  if (VALID_LOCK_STATES.includes(payload.lock_state)) {
    update.lock_state = payload.lock_state;
  }

  await LockerState.findOneAndUpdate({ locker_id: lockerId }, update, { new: true });

  if (io) {
    io.emit("command_updated", command);
  }
}

async function handleLockerTemp(topic, messageBuffer, io) {
  const lockerId = parseTempTopic(topic);
  if (lockerId === null) return;

  let payload;
  try {
    payload = JSON.parse(messageBuffer.toString("utf8"));
  } catch (error) {
    console.error(`Invalid JSON on topic ${topic}:`, error.message);
    return;
  }

  if (typeof payload.temperature !== "number") return;

  const state = await LockerState.findOneAndUpdate(
    { locker_id: lockerId },
    { temperature: payload.temperature, timestamp: new Date() },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const reading = await LockerReading.create({
    locker_id: lockerId,
    temperature: payload.temperature,
    door: state.door ?? 0,
    has_package: state.has_package ?? 0,
    lock_state: state.lock_state ?? "unknown",
    timestamp: new Date()
  });

  if (io) {
    io.emit("telemetry_update", {
      reading,
      state
    });
  }
}

async function handleLockerFsr(topic, messageBuffer, io) {
  const lockerId = parseFsrTopic(topic);
  if (lockerId === null) return;

  let payload;
  try {
    payload = JSON.parse(messageBuffer.toString("utf8"));
  } catch (error) {
    console.error(`Invalid JSON on topic ${topic}:`, error.message);
    return;
  }

  if (typeof payload.force_value !== "number") return;

  // Xử lý ML: Quy đổi giá trị ADC (0-4095) thành % lực nén (ADC càng nhỏ lực càng mạnh)
  // Theo yêu cầu: FSR < 4000 là có đồ (1), ngược lại là không (0)
  const fsr_percent = Math.max(0, 100 - Math.round((payload.force_value / 4095) * 100));
  const has_package = payload.force_value < 4000 ? 1 : 0;

  const state = await LockerState.findOneAndUpdate(
    { locker_id: lockerId },
    { 
      fsr_raw: payload.force_value,
      fsr_percent: fsr_percent,
      has_package: has_package,
      timestamp: new Date() 
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const reading = await LockerReading.create({
    locker_id: lockerId,
    fsr_raw: payload.force_value,
    fsr_percent: fsr_percent,
    has_package: has_package,
    temperature: state.temperature ?? null,
    door: state.door ?? 0,
    lock_state: state.lock_state ?? "unknown",
    timestamp: new Date()
  });

  if (io) {
    io.emit("telemetry_update", {
      reading,
      state
    });
  }
}

function startBroker(port) {
  const broker = Aedes();
  const server = net.createServer(broker.handle);

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, () => {
      console.log(`MQTT broker listening on port ${port}`);
      resolve({ broker, server });
    });
  });
}

function getMqttUrl(config) {
  return config.mqttUrl || `mqtt://127.0.0.1:${config.mqttPort}`;
}

function buildMqttOptions(config) {
  const options = {};
  if (config.mqttUsername) {
    options.username = config.mqttUsername;
  }
  if (config.mqttPassword) {
    options.password = config.mqttPassword;
  }
  if (config.mqttTls) {
    options.protocol = "mqtts";
  }
  return options;
}

async function startMqttInfrastructure(config, io) {
  if (!config.mqttUrl) {
    await startBroker(config.mqttPort);
  } else {
    console.log(`Using external MQTT broker ${config.mqttUrl}`);
  }

  const client = mqtt.connect(getMqttUrl(config), buildMqttOptions(config));
  const thresholds = {
    packageStaleSeconds: config.packageStaleSeconds,
    doorOpenStaleSeconds: config.doorOpenStaleSeconds,
    fsrDropCriticalPercent: config.fsrDropCriticalPercent,
    weakSignalRssi: config.weakSignalRssi,
    vibrationCriticalTotal: config.vibrationCriticalTotal,
    vibrationWindowSeconds: config.vibrationWindowSeconds,
    alertDedupSeconds: config.alertDedupSeconds
  };

  client.on("connect", () => {
    console.log("Backend MQTT client connected.");
    client.subscribe(["locker/+/data", "locker/+/ack", "locker/+/temperature", "locker/+/fsr_force"], (error) => {
      if (error) {
        console.error("Failed to subscribe to locker topics:", error.message);
      }
    });
  });

  client.on("message", async (topic, message) => {
    try {
      if (parseDataTopic(topic) !== null) {
        await handleLockerData(topic, message, thresholds, io, config, client);
      } else if (parseAckTopic(topic) !== null) {
        await handleLockerAck(topic, message, io);
      } else if (parseTempTopic(topic) !== null) {
        await handleLockerTemp(topic, message, io);
      } else if (parseFsrTopic(topic) !== null) {
        await handleLockerFsr(topic, message, io);
      }
    } catch (error) {
      console.error(`Failed to process topic ${topic}:`, error.message);
    }
  });

  client.on("error", (error) => {
    console.error("MQTT client error:", error.message);
  });

  return client;
}

async function publishCommand(client, config, lockerId, input) {
  if (!VALID_ACTIONS.includes(input.action)) {
    const error = new Error(`action must be one of: ${VALID_ACTIONS.join(", ")}.`);
    error.statusCode = 400;
    throw error;
  }

  const topic = `locker/${lockerId}/command`;
  const command = await Command.create({
    locker_id: lockerId,
    action: input.action,
    duration_ms: typeof input.duration_ms === "number" ? input.duration_ms : null,
    requested_by: input.requested_by || "demo",
    mqtt_topic: topic
  });

  const payload = {
    command_id: String(command._id),
    action: command.action,
    requested_by: command.requested_by
  };

  if (typeof command.duration_ms === "number") {
    payload.duration_ms = command.duration_ms;
  }

  command.payload = payload;

  await new Promise((resolve, reject) => {
    client.publish(topic, JSON.stringify(payload), { qos: 1 }, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  command.status = "sent";
  command.sent_at = new Date();
  await command.save();

  setTimeout(async () => {
    try {
      await Command.updateOne(
        { _id: command._id, status: { $in: ["pending", "sent"] } },
        { status: "timeout" }
      );
    } catch (error) {
      console.error(`Failed to timeout command ${command._id}:`, error.message);
    }
  }, config.commandTimeoutSeconds * 1000);

  return command;
}

function clearVibrationQueue(lockerId) {
  if (vibrationQueues[lockerId]) {
    vibrationQueues[lockerId] = [];
  }
}

module.exports = {
  publishCommand,
  startMqttInfrastructure,
  clearVibrationQueue
};
