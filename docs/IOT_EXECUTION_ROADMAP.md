# Smart Locker IoT Execution Roadmap

This roadmap turns `IOT_plan.md` into an implementation checklist for the current repository.

## Current Baseline

- Backend: Node.js, Express, MongoDB/Mongoose, Socket.IO.
- MQTT local mode: embedded Aedes broker on `MQTT_PORT`.
- MQTT cloud target: HiveMQ Cloud through `MQTT_URL`, `MQTT_USERNAME`, `MQTT_PASSWORD`.
- Web dashboard: static HTML/CSS/JS served by Express.
- Hardware target: ESP32, MC-38, SW420, FSR 406, K01 lock through driver circuit.
- Mobile target: Android Jetpack Compose with Firebase Cloud Messaging.
- Deployment target: Railway backend, MongoDB Atlas, HiveMQ Cloud, Firebase.

## Phase 0: Roadmap And Contract Test

### Sprint 0.1 Checklist

- [x] Create this execution roadmap.
- [x] Add backend contract smoke test at `scripts/contract-smoke.js`.
- [x] Add `npm run test:contract`.
- [x] Document local and cloud environment variables.

### Acceptance Criteria

- Backend starts with local MongoDB and local Aedes.
- `npm run test:contract` can publish MQTT telemetry, call REST APIs, create alerts, send a command, publish an ack, and verify command status.

## Phase 1: Hardware Telemetry Backend

### Sprint 1.1 Checklist

- [x] Extend `LockerReading` and `LockerState` with hardware fields:
  - `vibration`, `vibration_count`, `vibration_score`
  - `fsr_raw`, `fsr_percent`, `fsr_delta`
  - `lock_state`, `battery_percent`, `rssi`, `uptime_ms`, `event_type`
- [x] Allow `temperature` to be `null`.
- [x] Make `has_package` optional.
- [x] Validate `door` as required `0` or `1`.
- [x] Validate optional numeric ranges for vibration, FSR, battery, RSSI, and uptime.

### Sprint 1.2 Checklist

- [x] Update simulator payload to match ESP32 telemetry.
- [x] Keep local Aedes mode for lab testing.
- [x] Add HiveMQ-ready MQTT client config.
- [x] Add alert rules:
  - `tamper_vibration`
  - `forced_entry`
  - `object_removed`
  - `weak_signal`
- [x] Preserve existing alert rules:
  - `door_open_too_long`
  - `package_stale`
  - `temperature_high`
  - `temperature_spike`

### Acceptance Criteria

- Door, vibration, FSR, lock, RSSI, and uptime fields are stored in history and latest state.
- `temperature: null` does not break API or dashboard rendering.
- Invalid telemetry is rejected without crashing the backend.

## Phase 2: Dashboard And Incident Timeline

### Sprint 2.1 Checklist

- [x] Show lock state, vibration score, FSR percent, RSSI, and severity on locker cards.
- [x] Show expanded fields in selected locker detail.
- [x] Show expanded fields in history.
- [x] Emit Socket.IO `alert_created` and `command_updated` events.

### Sprint 2.2 Checklist

- [x] Add durable `Alert` collection.
- [x] Add `GET /alerts`.
- [x] Add `POST /alerts/:id/acknowledge`.
- [x] Add de-duplication by locker, alert type, and time window.

### Acceptance Criteria

- Alert history remains after dashboard refresh.
- A repeated vibration burst within `ALERT_DEDUP_SECONDS` does not spam duplicate alert records.

## Phase 3: K01 Command Backend

### Sprint 3.1 Checklist

- [x] Add durable `Command` collection.
- [x] Add `POST /locker/:id/command`.
- [x] Publish command to `locker/{id}/command`.
- [x] Subscribe to `locker/+/ack`.
- [x] Add `GET /commands/:id` for command polling/testing.

### Sprint 3.2 Checklist

- [x] Support `unlock`, `lock`, `beep`, and `calibrate_fsr`.
- [x] Track `pending`, `sent`, `accepted`, `rejected`, and `timeout`.
- [x] Store request user, MQTT payload, ack payload, timestamps, and topic.
- [x] Update latest locker state when ack includes `lock_state`.

### Acceptance Criteria

- REST command creates an MQTT command message.
- ESP32 or simulator ack updates command status.
- Latest locker state shows `latest_command_status`.

## Phase 4: ESP32 Local Firmware

### Sprint 4.1 Checklist

- [ ] Create Arduino firmware project for ESP32.
- [ ] Configure Wi-Fi, MQTT host, locker ID, and credentials.
- [ ] Read MC-38 on GPIO 26 with `INPUT_PULLUP`.
- [ ] Read SW420 on GPIO 27 and count pulses in a rolling 2-second window.
- [ ] Read FSR 406 divider output on GPIO 34.
- [ ] Publish `locker/{lockerId}/data` every 1-5 seconds.
- [ ] Publish immediate telemetry for severe vibration or forced entry.

### Sprint 4.2 Checklist

- [ ] Subscribe to `locker/{lockerId}/command`.
- [ ] Drive K01 through relay/MOSFET on GPIO 25.
- [ ] Never drive K01 directly from ESP32 GPIO.
- [ ] Publish `locker/{lockerId}/ack` for every command.
- [ ] Reconnect Wi-Fi and MQTT automatically.

### ESP32 Telemetry Contract

Topic:

```text
locker/{lockerId}/data
```

Payload:

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

### Wiring Notes

| Component | ESP32 Pin | Rule |
| --- | --- | --- |
| MC-38 | GPIO 26 | One wire to GPIO, one to GND, use `INPUT_PULLUP`. |
| SW420 | GPIO 27 | Use pulse counting; do not alert on one tiny pulse. |
| FSR 406 | GPIO 34 | Use voltage divider, start with 10 kOhm fixed resistor. |
| K01 driver | GPIO 25 | Drive relay/MOSFET input only, not the lock directly. |
| Status LED | GPIO 2 | Optional debug. |
| Buzzer | GPIO 33 | Optional alarm/beep command. |

## Phase 5: Android Jetpack Compose And Firebase

### Sprint 5.1 Checklist

- [ ] Create Android app with Kotlin and Jetpack Compose.
- [ ] Configure Firebase project and Android app package.
- [ ] Add screens:
  - locker list
  - locker detail
  - alert history
  - control
  - settings
- [ ] Fetch `GET /lockers`, `GET /locker/:id`, `GET /history/:id`, and `GET /alerts`.
- [ ] Use polling or Socket.IO client for live state while app is open.

### Sprint 5.2 Checklist

- [x] Backend token register endpoint: `POST /mobile/register-token`.
- [x] Backend token disable endpoint: `DELETE /mobile/register-token`.
- [x] Backend FCM send hook for critical alerts.
- [ ] Android requests FCM token and registers it with backend.
- [ ] Notification tap opens locker detail.
- [ ] Unlock command requires confirmation in the app.

### Acceptance Criteria

- App shows the same latest locker state as the web dashboard.
- App receives push notifications for `tamper_vibration`, `forced_entry`, and `object_removed`.

## Phase 6: HiveMQ, Railway, MongoDB Atlas

### Sprint 6.1 Checklist

- [x] Backend supports external MQTT via env.
- [x] Backend skips local Aedes when `MQTT_URL` is set.
- [ ] Create HiveMQ Cloud cluster.
- [ ] Create MQTT credentials for backend and ESP32.
- [ ] Create MongoDB Atlas database.
- [ ] Deploy backend to Railway.

### Sprint 6.2 Checklist

- [ ] Set Railway env values.
- [ ] Configure ESP32 to connect to HiveMQ Cloud.
- [ ] Configure Android app API base URL to Railway HTTPS URL.
- [ ] Configure Firebase access token/project env for Railway.
- [ ] Run smoke test against cloud endpoints.

### Railway Environment

```text
PORT=3000
MONGODB_URI=mongodb+srv://...
MQTT_URL=mqtts://<cluster>.s1.eu.hivemq.cloud:8883
MQTT_USERNAME=<hivemq-user>
MQTT_PASSWORD=<hivemq-password>
MQTT_TLS=true
PACKAGE_STALE_SECONDS=30
DOOR_OPEN_STALE_SECONDS=20
VIBRATION_CRITICAL_SCORE=70
FSR_DROP_CRITICAL_PERCENT=30
WEAK_SIGNAL_RSSI=-80
ALERT_DEDUP_SECONDS=60
COMMAND_TIMEOUT_SECONDS=10
FCM_PROJECT_ID=<firebase-project-id>
FCM_ACCESS_TOKEN=<short-lived-or-rotated-access-token>
```

### Cloud Acceptance Criteria

- ESP32 publishes telemetry to HiveMQ Cloud.
- Railway backend receives telemetry and stores it in MongoDB Atlas.
- Android phone on mobile data receives Firebase push for critical alerts.
- Dashboard works from Railway public URL.

## API Contract

### REST

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Backend and config health. |
| GET | `/lockers` | Latest state for all lockers. |
| GET | `/locker/:id` | Latest state for one locker. |
| GET | `/history/:id` | Recent telemetry for one locker. |
| GET | `/alerts` | Alert history, supports `locker_id`, `limit`, `acknowledged=false`. |
| POST | `/alerts/:id/acknowledge` | Mark alert acknowledged. |
| POST | `/locker/:id/command` | Publish command to ESP32. |
| GET | `/commands/:id` | Read command status. |
| POST | `/mobile/register-token` | Register Android FCM token. |
| DELETE | `/mobile/register-token` | Disable Android FCM token. |

### MQTT

| Direction | Topic | Purpose |
| --- | --- | --- |
| ESP32 to backend | `locker/{id}/data` | Telemetry. |
| Backend to ESP32 | `locker/{id}/command` | Lock, unlock, beep, calibrate. |
| ESP32 to backend | `locker/{id}/ack` | Command acknowledgement. |

## Local Test Procedure

1. Start MongoDB.
2. Start backend:

```powershell
npm.cmd run start:backend
```

3. In another terminal, run:

```powershell
npm.cmd run test:contract
```

4. Optional simulator:

```powershell
npm.cmd run start:simulator
```

5. Open dashboard:

```text
http://127.0.0.1:3000
```

## Hardware Acceptance Checklist

- [ ] Door closed reads `door: 0`.
- [ ] Door open reads `door: 1`.
- [ ] Locker locked state is published as `lock_state: "locked"`.
- [ ] Door open while locked creates `forced_entry`.
- [ ] Strong shaking while locked creates `tamper_vibration`.
- [ ] FSR drop while locked creates `object_removed`.
- [ ] Weak Wi-Fi signal creates `weak_signal`.
- [ ] `unlock` command activates K01 for the configured pulse duration.
- [ ] ESP32 publishes ack after every command.
- [ ] K01 activation does not reset ESP32.
