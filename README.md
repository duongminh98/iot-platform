# Smart Locker IoT Platform

A smart-locker IoT prototype built with Node.js, MQTT, MongoDB, Socket.IO, a web command center, and an ESP32-oriented telemetry contract.

The current repository supports both local demo work and the next step toward real hardware integration:

- local Aedes MQTT broker for development
- optional cloud MQTT configuration
- durable telemetry, alerts, and commands in MongoDB
- realtime web dashboard
- simulator
- ESP32 firmware starter
- Docker setup

## Current capabilities

- Receive telemetry on `locker/{lockerId}/data`
- Persist history and latest locker state
- Detect operational and security alerts
- Deduplicate repeated alerts
- Publish commands on `locker/{lockerId}/command`
- Receive acknowledgements on `locker/{lockerId}/ack`
- Push live updates to the dashboard with Socket.IO
- Register mobile notification tokens for future Android integration

## Project structure

```text
iot-platform/
  backend/
    src/
      models/
        Alert.js
        Command.js
        LockerReading.js
        LockerState.js
        MobileDevice.js
      routes/
      services/
  frontend/
    index.html
    app.js
    styles.css
  simulator/
    index.js
  esp32_firmware/
    esp32_firmware.ino
  scripts/
    contract-smoke.js
  docs/
    IOT_EXECUTION_ROADMAP.md
  docker-compose.yml
  Dockerfile
  IOT_plan.md
```

## Dashboard features

The web UI is now a lightweight **Security Command Center**:

- fleet overview cards
- locker cards with lock, door, vibration, FSR, RSSI, and severity
- selected-locker detail
- remote control panel:
  - unlock
  - lock
  - beep
  - calibrate FSR
- device health panel
- temperature + FSR telemetry chart
- occupancy forecast panel for the next 1–5 hours
- security timeline with:
  - severity filter
  - open / acknowledged filter
  - acknowledge action
- recent history table

## Telemetry contract

Topic:

```text
locker/{lockerId}/data
```

Example payload:

```json
{
  "door": 0,
  "has_package": 0,
  "temperature": null,
  "vibration": 0,
  "vibration_count": 0,
  "vibration_score": 0,
  "fsr_raw": 1800,
  "fsr_percent": 44,
  "fsr_delta": 0,
  "lock_state": "locked",
  "battery_percent": null,
  "rssi": -60,
  "uptime_ms": 123456,
  "event_type": null
}
```

## Alert logic

The backend currently detects:

- `temperature_high`
- `temperature_spike`
- `package_stale`
- `door_open_too_long`
- `tamper_vibration`
- `forced_entry`
- `object_removed`
- `weak_signal`

## REST API

### Read

- `GET /lockers`
- `GET /locker/:id`
- `GET /history/:id`
- `GET /alerts`
- `GET /forecast/:id`
- `GET /forecast/evaluation`
- `GET /commands/:id`
- `GET /health`

`GET /alerts` supports:

- `locker_id`
- `acknowledged=true|false`
- `severity=info|warning|critical`
- `limit`

### Write

- `POST /locker/:id/command`
- `POST /alerts/:id/acknowledge`
- `POST /mobile/register-token`
- `DELETE /mobile/register-token`

## Run locally

### Prerequisites

- Node.js 18+
- MongoDB

### Install

```bash
npm install
```

### Start

Use three terminals:

```bash
# Terminal 1
mongod --dbpath ./mongo-data

# Terminal 2
npm run start:backend

# Terminal 3
npm run start:simulator
```

Open:

```text
http://127.0.0.1:3000
```

## Useful scripts

```bash
npm run start:backend
npm run start:simulator
npm run test:contract
```

The contract smoke test verifies telemetry ingestion, alert creation, command publishing, acknowledgement flow, and API behavior.

## Docker

The repository includes:

- `Dockerfile`
- `docker-compose.yml`

for containerized local setup.

## ESP32 direction

The repository already includes starter firmware at:

```text
esp32_firmware/esp32_firmware.ino
```

The hardware plan targets:

- MC-38 door sensor
- SW420 vibration sensor
- FSR 406
- K01 lock through driver circuit

See:

- `IOT_plan.md`
- `docs/IOT_EXECUTION_ROADMAP.md`

for the fuller implementation roadmap.

## Occupancy forecast baseline

The dashboard now includes a mock-trained baseline that predicts whether a locker is likely to contain a package after 1, 2, 3, 4, and 5 hours.

Runtime features are built from live telemetry and MongoDB history:

- current occupancy-state duration
- rolling package-state transitions over 12h and 24h
- occupancy lag features at 1h, 2h, and 3h
- latest sensed temperature
- current day of week
- current hour of day

For now, the model is intentionally trained on synthetic data so the product flow can be demonstrated before real field data exists. It returns both the binary prediction and `probability_has_package`; replace the mock training dataset with collected device history before treating the score as operationally reliable.

The synthetic dataset is split 80/20 into train and held-out test sets. The evaluation endpoint reports per-horizon accuracy, precision, recall, F1, ROC-AUC, Brier score, and confusion matrix so the same flow can later be reused with real telemetry-derived labels.

## Current status

Completed in the repository today:

- telemetry contract
- alert backend
- command backend
- live dashboard baseline
- simulator support
- contract smoke testing

Still natural next steps:

- finish ESP32 firmware
- Android app and Firebase notifications
- deployment hardening
- authentication / roles
- richer incident ownership and reporting
