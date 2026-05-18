# Smart Locker IoT Expansion Plan

## 1. Current Platform Analysis

The current repository is a working local IoT platform for smart lockers.

Current components:

- Backend: Node.js + Express in `backend/src/index.js`.
- MQTT: embedded local broker using `aedes` on port `1883`.
- MQTT client: backend subscribes to `locker/+/data`.
- Database: MongoDB via Mongoose.
- Real-time UI: Socket.IO emits `telemetry_update` to the browser dashboard.
- Frontend: static HTML/CSS/JavaScript served by Express.
- Simulator: publishes fake locker telemetry to MQTT.

Current telemetry model:

```json
{
  "door": 1,
  "temperature": 30,
  "has_package": 1
}
```

Current alert logic:

- High temperature.
- Door open too long.
- Package retained too long.
- Sudden temperature spike.

Gap compared with the new hardware goal:

- No ESP32 firmware yet.
- No fields for vibration, forced entry, lock state, FSR pressure, battery/device health, or tamper severity.
- No control channel for remotely opening/locking K01.
- No mobile app.
- No push notification pipeline.
- No authentication or device provisioning.
- Current MQTT broker is local-only, which is fine for lab testing but not enough if phones must work outside the same network.

Recommended direction:

- Keep the existing backend and dashboard as the core platform.
- Replace the simulator with real ESP32 telemetry gradually.
- Extend the data model instead of rewriting the platform.
- Add mobile support through REST + Socket.IO first, then push notifications through FCM.
- Add cloud deployment only after the local hardware flow is stable.

## 2. Target System Overview

Hardware devices:

- ESP32 as the locker controller.
- SW420 vibration sensor for strong shaking/impact detection.
- MC-38 magnetic reed switch for door open/closed detection.
- K01 electronic lock for physical lock control.
- FSR 406 force-sensitive resistor for pressure/load/contact detection.

Platform services:

- MQTT broker receives telemetry and control acknowledgements.
- Backend processes telemetry, stores history, calculates alerts, and sends real-time events.
- MongoDB stores readings, latest state, alerts, devices, and mobile registrations.
- Web dashboard shows operational status.
- Mobile app receives alerts, shows locker status, and can perform useful operator actions.

Suggested full data flow:

```text
Sensors -> ESP32 -> MQTT telemetry -> Backend -> MongoDB
                                    -> Socket.IO -> Web dashboard
                                    -> Push service -> Mobile phone

Mobile app -> REST API / MQTT command proxy -> Backend -> MQTT command -> ESP32 -> K01 lock
                                                                  -> MQTT ack -> Backend -> Mobile/Web
```

## 3. Hardware Roles

### 3.1 SW420 Vibration Sensor

Purpose:

- Detect strong shaking, drilling, repeated knocking, or forced movement of the cabinet.

Use in the system:

- Do not trigger theft alert on one tiny vibration pulse.
- Count vibration pulses in a short time window.
- Raise `tamper_vibration` only when vibration exceeds a threshold, for example 5 to 10 pulses within 2 seconds.

Recommended telemetry fields:

```json
{
  "vibration": 1,
  "vibration_count": 8,
  "vibration_score": 82
}
```

### 3.2 MC-38 Magnetic Door Sensor

Purpose:

- Detect whether the locker door is open or closed.

Use in the system:

- Door open while lock is supposed to be locked means possible forced entry.
- Door open for too long means operational warning.
- Door open immediately after a valid unlock command is normal.

Recommended telemetry field:

```json
{
  "door": 0
}
```

Suggested convention:

- `door = 0`: closed.
- `door = 1`: open.

### 3.3 K01 Electronic Lock

Purpose:

- Physically lock or unlock the cabinet.

Important electrical note:

- Do not drive K01 directly from an ESP32 GPIO.
- Use a relay module, MOSFET driver circuit, or lock driver board.
- Use a separate suitable power supply for the lock if required.
- Common GND must be shared between ESP32 and the driver circuit.
- Add flyback protection if using an inductive lock/relay without built-in protection.

Use in the system:

- ESP32 receives command: lock or unlock.
- ESP32 activates the lock driver for a defined pulse duration.
- ESP32 publishes command acknowledgement back to the backend.

Recommended command topic:

```text
locker/{lockerId}/command
```

Recommended command payload:

```json
{
  "command_id": "cmd_20260516_001",
  "action": "unlock",
  "duration_ms": 3000,
  "requested_by": "mobile:user_1"
}
```

Recommended acknowledgement topic:

```text
locker/{lockerId}/ack
```

Recommended acknowledgement payload:

```json
{
  "command_id": "cmd_20260516_001",
  "action": "unlock",
  "status": "accepted",
  "lock_state": "unlocked",
  "timestamp": "2026-05-16T16:00:00.000Z"
}
```

### 3.4 FSR 406 Force Sensor

Purpose:

- Detect pressure/load/change on the cabinet, shelf, door, or protected object.

Possible placements:

- Under the cabinet: detect lifting or movement.
- Behind/inside the door: detect forced pressure against the door.
- Under a valuable object: detect object removed or inserted.
- Under shelf/package: detect approximate weight presence.

Use in the system:

- FSR is not a precision scale by default.
- Use it as a relative pressure/change sensor unless calibrated carefully.
- Track baseline and detect sudden force changes.

Recommended telemetry fields:

```json
{
  "fsr_raw": 1840,
  "fsr_percent": 45,
  "fsr_delta": -35
}
```

## 4. Suggested ESP32 Pin Mapping

This is a practical starting point. It can be adjusted based on your exact ESP32 board.

| Component | ESP32 Pin | Mode | Notes |
| --- | --- | --- | --- |
| SW420 DO | GPIO 27 | Digital input | Use interrupt or fast polling. |
| MC-38 | GPIO 26 | Digital input pull-up | One wire to GPIO, one to GND. |
| FSR 406 divider output | GPIO 34 | Analog input | GPIO 34 is input-only and good for ADC. |
| K01 lock driver input | GPIO 25 | Digital output | Drives relay/MOSFET input, not the lock directly. |
| Status LED | GPIO 2 | Digital output | Optional debug indicator. |
| Buzzer | GPIO 33 | Digital output/PWM | Optional local alarm. |

MC-38 wiring:

```text
ESP32 GPIO26 ---- MC-38 ---- GND
GPIO26 configured as INPUT_PULLUP
Closed magnetic contact -> LOW
Open contact -> HIGH
```

FSR voltage divider wiring:

```text
3.3V ---- FSR ---- ADC GPIO34 ---- fixed resistor ---- GND
```

Recommended fixed resistor:

- Start with 10 kOhm.
- Adjust after testing depending on the useful ADC range.

SW420 wiring:

```text
SW420 VCC -> 3.3V or 5V depending on module specification
SW420 GND -> GND
SW420 DO  -> GPIO27
```

K01 wiring through driver:

```text
ESP32 GPIO25 -> relay/MOSFET driver input
External lock power supply -> K01 lock -> relay/MOSFET output path
ESP32 GND connected to driver GND
```

## 5. ESP32 Firmware Plan

Recommended stack:

- Arduino framework first, because it is faster for a student/demo project.
- Libraries:
  - `WiFi.h`
  - `PubSubClient` for MQTT
  - `ArduinoJson` for JSON payloads

Firmware responsibilities:

1. Connect to Wi-Fi.
2. Connect to MQTT broker.
3. Read MC-38 door state.
4. Read SW420 vibration pulses.
5. Read FSR analog value.
6. Calculate basic local state.
7. Publish telemetry every 1 to 5 seconds.
8. Publish immediate tamper telemetry when severe vibration occurs.
9. Subscribe to command topic.
10. Drive K01 lock through relay/MOSFET.
11. Publish command acknowledgements.
12. Reconnect automatically if Wi-Fi or MQTT drops.

Recommended telemetry topic:

```text
locker/{lockerId}/data
```

Recommended expanded telemetry payload:

```json
{
  "door": 0,
  "has_package": 0,
  "temperature": null,
  "vibration": 1,
  "vibration_count": 8,
  "vibration_score": 82,
  "fsr_raw": 1840,
  "fsr_percent": 45,
  "lock_state": "locked",
  "battery_percent": null,
  "rssi": -61,
  "uptime_ms": 123456
}
```

If no temperature sensor exists, either:

- Remove `temperature` from the required backend payload, or
- Send `null` and update backend validation to allow it, or
- Add a cheap DHT22/DS18B20/BME280 temperature sensor later.

Recommended local anti-theft logic on ESP32:

- Maintain a rolling 2-second vibration pulse counter.
- If vibration count exceeds threshold, set `vibration_score` high.
- If door opens while `lock_state = locked`, publish emergency telemetry immediately.
- If FSR drops sharply while locked, publish suspicious movement/object removal event.
- Keep local buzzer optional, because false positives are likely during tuning.

Example local event classification:

```text
Normal:
- door closed
- lock locked
- low vibration
- stable FSR

Warning:
- short vibration burst
- small FSR change
- door open too long after unlock

Critical:
- strong vibration while locked
- door open while locked
- large FSR drop while locked
- repeated vibration + door state change
```

## 6. Backend Changes

### 6.1 Extend MongoDB Models

Update `LockerReading` with new optional fields:

- `vibration`
- `vibration_count`
- `vibration_score`
- `fsr_raw`
- `fsr_percent`
- `fsr_delta`
- `lock_state`
- `battery_percent`
- `rssi`
- `uptime_ms`
- `event_type`

Update `LockerState` with latest values:

- Latest sensor values.
- Latest lock state.
- Latest command status.
- Latest tamper state.
- Alert array.
- Last warning.

Add new collections later if needed:

- `Device`: registered ESP32 devices, secrets, firmware version.
- `Command`: requested lock/unlock actions and delivery status.
- `Alert`: durable alert records for mobile notification history.
- `MobileDevice`: user phone push token and notification settings.

### 6.2 Update Payload Validation

Current backend requires:

- `temperature` as number.
- `door` as 0/1.
- `has_package` as 0/1.

New validation should allow hardware-specific data:

- `door`: required, 0/1.
- `has_package`: optional, 0/1.
- `temperature`: optional number or null.
- `vibration`: optional 0/1.
- `vibration_count`: optional number.
- `vibration_score`: optional number from 0 to 100.
- `fsr_raw`: optional number.
- `fsr_percent`: optional number from 0 to 100.
- `lock_state`: optional enum: `locked`, `unlocked`, `unknown`.
- `rssi`: optional number.
- `uptime_ms`: optional number.

### 6.3 Add New Alert Rules

Suggested alert rules:

- `tamper_vibration`: `vibration_score >= 70` while locker is locked.
- `forced_entry`: `door = 1` while `lock_state = locked`.
- `door_open_too_long`: keep current logic.
- `object_removed`: FSR drops sharply while locked.
- `object_added`: FSR rises sharply after door opened.
- `device_offline`: no telemetry for more than a configured timeout.
- `weak_signal`: RSSI below threshold.
- `sensor_fault`: impossible or missing values for too long.

Severity levels:

```text
info -> normal operational event
warning -> needs attention but not urgent
critical -> likely theft/tamper/security event
```

### 6.4 Add Command API

Add REST endpoint:

```http
POST /locker/:id/command
```

Request body:

```json
{
  "action": "unlock",
  "duration_ms": 3000
}
```

Backend behavior:

1. Validate user permission.
2. Create a `Command` record with `pending` status.
3. Publish MQTT message to `locker/{id}/command`.
4. Wait for ESP32 acknowledgement or mark timeout.
5. Return command status to mobile/web.

Supported actions:

- `unlock`
- `lock`
- `beep`
- `calibrate_fsr`
- `set_alarm_mode`

### 6.5 Add Mobile Notification Pipeline

Recommended push service:

- Firebase Cloud Messaging (FCM), because it works for Android and iOS through common mobile frameworks.

Backend responsibilities:

1. Accept mobile push token registration.
2. Store token in MongoDB.
3. When a critical alert is created, send FCM push notification.
4. De-duplicate notifications to avoid spam.
5. Support quiet hours and alert preferences later.

Suggested endpoints:

```http
POST /mobile/register-token
DELETE /mobile/register-token
GET /alerts
POST /alerts/:id/acknowledge
```

Suggested notification content:

```json
{
  "title": "Locker 1 tamper alert",
  "body": "Strong vibration detected while the locker is locked.",
  "data": {
    "locker_id": "1",
    "alert_type": "tamper_vibration",
    "severity": "critical"
  }
}
```

## 7. Frontend Dashboard Changes

Current web dashboard should be kept and expanded.

Add dashboard fields:

- Vibration score.
- FSR pressure percentage.
- Lock state.
- Signal strength.
- Last command status.
- Security severity badge.

Add panels:

- Security timeline.
- Lock command panel.
- Sensor calibration panel.
- Device health panel.

Update chart:

- Keep temperature if a temperature sensor exists.
- Add FSR trend line.
- Add vibration event markers.
- Add door/lock state timeline.

## 8. Mobile App Plan

Recommended mobile stack:

- React Native with Expo for fastest development.
- Use REST API for initial data loading.
- Use Socket.IO client for live updates while the app is open.
- Use FCM/Expo Notifications for push alerts while the app is closed.

Main screens:

1. Login / device pairing screen.
2. Locker list screen.
3. Locker detail screen.
4. Alert history screen.
5. Control screen.
6. Settings screen.

### 8.1 Locker List Screen

Shows:

- Locker ID/name.
- Current lock state.
- Door state.
- Security status.
- Last update time.
- Critical alert badge.

Data source:

```http
GET /lockers
```

### 8.2 Locker Detail Screen

Shows:

- Door open/closed.
- Lock locked/unlocked.
- Vibration score.
- FSR pressure trend.
- Recent alerts.
- Device signal and online/offline status.

Data sources:

```http
GET /locker/:id
GET /history/:id
```

Live updates:

```text
Socket.IO event: telemetry_update
```

### 8.3 Alert Screen

Shows:

- Critical tamper events.
- Door open too long events.
- Object removed events.
- Device offline events.
- Acknowledge button.

Useful actions:

- Acknowledge alert.
- Call owner/security.
- Open camera app or CCTV link if available.
- Trigger buzzer if hardware supports it.

### 8.4 Control Screen

Possible actions:

- Unlock for 3 seconds.
- Lock now.
- Trigger buzzer.
- Calibrate FSR baseline.
- Enable/disable guard mode.

Important safety rule:

- Unlock command should require authentication and confirmation.
- Remote unlock should be logged with user ID, timestamp, and phone/device ID.

## 9. Ideas That Make the Phone Truly Useful

### Idea 1: Guard Mode Toggle

The phone can switch the locker between modes:

- `normal`: fewer alerts, suitable when someone is using the locker.
- `guard`: aggressive tamper detection when the locker should not be touched.
- `maintenance`: suppress non-critical alerts during installation/testing.

Why useful:

- The same vibration event can mean different things depending on context.
- Phone gives the user direct control over alert sensitivity.

### Idea 2: Proximity-Based Auto Guard

Use the phone location or Bluetooth proximity to infer whether the owner is nearby.

Behavior:

- Owner nearby: reduce notification severity or allow quick unlock.
- Owner far away: increase sensitivity and send critical alerts immediately.

Why useful:

- Phone adds context that the locker hardware cannot know.

### Idea 3: Two-Step Remote Unlock

The phone can approve unlock requests securely.

Flow:

1. Someone requests access at the locker.
2. Owner receives phone notification.
3. Owner approves in app.
4. Backend sends unlock command to ESP32.
5. App shows acknowledgement and door activity.

Why useful:

- Phone becomes an access control device, not just a monitor.

### Idea 4: Incident Evidence Timeline

When theft is suspected, the phone shows a compact incident timeline:

```text
15:02:10 strong vibration
15:02:14 FSR dropped by 42%
15:02:16 door opened while locked
15:02:17 critical alert sent
```

Why useful:

- The user can understand what happened quickly without opening the web dashboard.

### Idea 5: Local Siren Control

The phone can trigger or silence a buzzer connected to ESP32.

Why useful:

- User can react to theft immediately.
- False alarms can be silenced remotely.

### Idea 6: Sensor Calibration From Phone

The phone app can run setup flows:

- Calibrate FSR baseline when the locker is empty.
- Calibrate FSR baseline when a protected object is present.
- Test vibration threshold.
- Test door sensor polarity.
- Test lock pulse duration.

Why useful:

- Hardware setup becomes easier and more demonstrable.

### Idea 7: QR-Based Locker Pairing

Each ESP32 locker has a QR code containing locker ID and pairing token.

Flow:

1. User scans QR code in the phone app.
2. App calls backend to pair the locker to the user.
3. Backend allows that user to monitor/control the locker.

Why useful:

- Makes the system feel like a real IoT product.

### Idea 8: Escalation Contacts

If a critical tamper alert is not acknowledged within a configured time, the app/backend can notify another phone number or user.

Why useful:

- Makes phone participation operationally meaningful.

### Idea 9: Phone as Temporary Gateway

If cloud MQTT is not available, the phone can be used as a local setup tool:

- Configure ESP32 Wi-Fi credentials.
- Configure locker ID.
- Configure MQTT broker address.
- View local diagnostic data.

Why useful:

- Simplifies installation and field testing.

## 10. Cloud Deployment Plan

### Phase 1: Local Lab System

Use current architecture:

```text
ESP32 -> local MQTT broker in Node backend -> local MongoDB -> local web/mobile on same network
```

Good for:

- Hardware testing.
- Demo day.
- Debugging wiring and firmware.

Limitations:

- Phone only works on same Wi-Fi unless backend is exposed.
- Push notifications are not fully useful without public backend access.

### Phase 2: Public Backend

Deploy backend and MongoDB to cloud:

- Backend: Render, Railway, Fly.io, VPS, or similar.
- MongoDB: MongoDB Atlas.
- MQTT broker: EMQX Cloud, HiveMQ Cloud, Mosquitto on VPS, or keep Aedes only for simple demos.
- HTTPS domain required for production-like mobile API.

Recommended architecture:

```text
ESP32 -> cloud MQTT broker -> backend subscriber -> MongoDB Atlas
Mobile -> HTTPS REST/Socket.IO -> backend
Backend -> FCM -> Mobile push notification
```

### Phase 3: Secure Production-Like System

Add:

- JWT authentication.
- Device credentials.
- MQTT username/password or certificates.
- Per-locker authorization.
- Rate limiting.
- Audit logs for unlock commands.
- Alert de-duplication.
- Offline detection job.

## 11. Installation Plan

### 11.1 Local Platform Setup

Prerequisites:

- Node.js 18 or newer.
- MongoDB installed locally or MongoDB Atlas URI.
- ESP32 Arduino toolchain.
- Mobile development environment if building the app.

Install Node dependencies:

```powershell
cd D:\IoT\iot-platform
npm.cmd install
```

Create `.env` from `.env.example`:

```powershell
Copy-Item .env.example .env
```

Start MongoDB locally:

```powershell
New-Item -ItemType Directory -Force .\mongo-data
mongod --dbpath .\mongo-data
```

Start backend:

```powershell
npm.cmd run start:backend
```

Start simulator while hardware is not ready:

```powershell
npm.cmd run start:simulator
```

Open dashboard:

```text
http://127.0.0.1:3000
```

### 11.2 ESP32 Setup

Install Arduino libraries:

- PubSubClient.
- ArduinoJson.

Configure firmware constants:

```cpp
const char* WIFI_SSID = "your_wifi";
const char* WIFI_PASSWORD = "your_password";
const char* MQTT_HOST = "backend_ip_address";
const int MQTT_PORT = 1883;
const int LOCKER_ID = 1;
```

Important:

- If backend runs on a laptop, use the laptop LAN IP, not `127.0.0.1`.
- Example: `192.168.1.20`.
- ESP32 and backend must be on the same network for local testing.

### 11.3 Mobile Setup

Recommended initial app setup:

```powershell
npx create-expo-app smart-locker-mobile
cd smart-locker-mobile
npm install socket.io-client
```

For notifications:

```powershell
npx expo install expo-notifications expo-device
```

Mobile app environment:

```text
API_BASE_URL=http://<backend-lan-ip>:3000
SOCKET_URL=http://<backend-lan-ip>:3000
```

## 12. Development Roadmap

### Milestone 1: Hardware Telemetry Works Locally

Tasks:

- Wire MC-38, SW420, FSR, and K01 driver to ESP32.
- Write ESP32 firmware to publish expanded telemetry.
- Keep simulator for comparison.
- Update backend payload validation.
- Update MongoDB models.
- Show raw sensor values in dashboard.

Acceptance criteria:

- Opening the door updates dashboard within 1 second to 5 seconds.
- Strong vibration creates a visible alert.
- FSR value changes when pressure changes.
- Lock command can trigger K01 safely through driver.

### Milestone 2: Security Alerts

Tasks:

- Add alert severity.
- Add `forced_entry`, `tamper_vibration`, and `object_removed` rules.
- Store alert records.
- Add alert timeline to dashboard.
- Add de-duplication so repeated vibration does not spam alerts.

Acceptance criteria:

- Shaking the locked locker creates one critical incident, not dozens of duplicate alerts.
- Door open while locked is marked critical.
- Alert history remains available after page refresh.

### Milestone 3: Mobile Read-Only App

Tasks:

- Build Expo app.
- Fetch locker list from `/lockers`.
- Fetch details from `/locker/:id` and `/history/:id`.
- Subscribe to Socket.IO updates.
- Show alert list and locker detail.

Acceptance criteria:

- Phone shows the same latest state as web dashboard.
- Phone updates live while app is open.
- Phone displays vibration/door/FSR/lock status clearly.

### Milestone 4: Push Notifications

Tasks:

- Add mobile token registration endpoint.
- Configure FCM or Expo push service.
- Send push notification for critical alerts.
- Add notification tap behavior to open locker detail screen.

Acceptance criteria:

- Phone receives tamper alert when app is closed.
- Notification opens the correct locker detail.
- Duplicate alerts are controlled.

### Milestone 5: Mobile Control

Tasks:

- Add backend command endpoint.
- Add MQTT command publishing.
- Add ESP32 command subscription and acknowledgement.
- Add mobile unlock/lock/beep/calibrate buttons.
- Add command audit log.

Acceptance criteria:

- Phone can unlock the locker through backend and ESP32.
- Backend records who sent the command.
- ESP32 returns acknowledgement.
- App shows command success/failure.

### Milestone 6: Cloud Demo

Tasks:

- Move MongoDB to Atlas.
- Deploy backend publicly with HTTPS.
- Use cloud MQTT broker or expose MQTT securely.
- Configure ESP32 to connect to cloud broker.
- Configure mobile app to use public backend URL.

Acceptance criteria:

- Phone receives alerts over mobile data.
- ESP32 sends telemetry without local laptop dependency.
- Dashboard works from a public URL.

## 13. Suggested Topic and API Contract

### MQTT Telemetry

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
  "rssi": -60,
  "uptime_ms": 123456
}
```

### MQTT Command

Topic:

```text
locker/{lockerId}/command
```

Payload:

```json
{
  "command_id": "cmd_001",
  "action": "unlock",
  "duration_ms": 3000
}
```

### MQTT Acknowledgement

Topic:

```text
locker/{lockerId}/ack
```

Payload:

```json
{
  "command_id": "cmd_001",
  "status": "accepted",
  "lock_state": "unlocked"
}
```

### REST APIs

Existing:

```http
GET /lockers
GET /locker/:id
GET /history/:id
GET /health
```

New:

```http
POST /locker/:id/command
GET /alerts
POST /alerts/:id/acknowledge
POST /mobile/register-token
DELETE /mobile/register-token
POST /locker/:id/calibrate-fsr
```

### Socket.IO Events

Existing:

```text
telemetry_update
```

New suggested events:

```text
alert_created
command_updated
device_offline
```

## 14. Security Considerations

Minimum security for demo:

- Keep backend and MQTT on private Wi-Fi.
- Do not expose MQTT publicly without authentication.
- Do not allow unlock command without a simple app PIN or login.
- Log every unlock command.

Better security:

- JWT login for mobile app.
- MQTT username/password per ESP32.
- Device secret during provisioning.
- HTTPS for all mobile/backend traffic.
- Rate limit unlock attempts.
- Require confirmation for remote unlock.
- Separate owner and viewer roles.

## 15. Testing Plan

### Hardware Tests

- Door closed/open changes MC-38 state correctly.
- SW420 detects strong vibration but ignores tiny noise after tuning.
- FSR raw value changes consistently with pressure.
- K01 lock activates through driver without resetting ESP32.
- ESP32 remains stable when lock is triggered.

### Firmware Tests

- Wi-Fi reconnect after router restart.
- MQTT reconnect after backend restart.
- Telemetry publishes at expected interval.
- Critical events publish immediately.
- Command acknowledgement is sent for every command.

### Backend Tests

- Reject invalid payloads.
- Store expanded telemetry fields.
- Generate correct alert severity.
- Avoid duplicate alert spam.
- Mark device offline when telemetry stops.
- Publish command to correct MQTT topic.

### Mobile Tests

- App loads locker list.
- App receives live updates.
- Push notification arrives when app is closed.
- Notification opens correct screen.
- Unlock command requires confirmation.
- Command failure is visible to user.

## 16. Recommended Implementation Order

1. Extend backend models and payload validation.
2. Update simulator to publish SW420/FSR/lock-like fields.
3. Update dashboard to display the new fields.
4. Build ESP32 firmware for telemetry only.
5. Tune sensor thresholds using real hardware.
6. Add backend alert records and critical alert logic.
7. Build read-only mobile app.
8. Add push notifications.
9. Add K01 command/control path.
10. Add authentication and command audit logs.
11. Move to cloud only after local demo is stable.

## 17. Key Risks and Mitigations

Risk: SW420 false positives.

Mitigation:

- Use pulse count and time window, not single pulse.
- Add guard mode sensitivity settings.
- Combine vibration with door/FSR/lock state before critical alert.

Risk: K01 draws too much current and resets ESP32.

Mitigation:

- Use separate lock power supply.
- Use relay/MOSFET driver.
- Share GND correctly.
- Add flyback protection.

Risk: FSR values drift.

Mitigation:

- Use calibration baseline.
- Detect relative changes, not exact weight.
- Recalibrate from phone app.

Risk: Phone notifications spam users.

Mitigation:

- Add alert de-duplication window.
- Add severity levels.
- Add acknowledge/snooze behavior.

Risk: Remote unlock is unsafe.

Mitigation:

- Require login/PIN.
- Log every command.
- Use short unlock pulse.
- Require confirmation.
- Disable remote unlock in guard mode if desired.

## 18. Final Recommended Demo Scenario

A strong final demo can show this sequence:

1. Dashboard and phone both show Locker 1 as locked and healthy.
2. User shakes the locker strongly.
3. ESP32 publishes high vibration score.
4. Backend creates `tamper_vibration` critical alert.
5. Web dashboard updates live.
6. Phone receives push notification.
7. User opens app and sees incident timeline.
8. User triggers buzzer from phone.
9. User unlocks locker from phone after confirmation.
10. ESP32 activates K01, sends acknowledgement, and both web/mobile update lock state.

This makes the phone useful because it is not only a display. It becomes the alert receiver, access controller, calibration tool, incident viewer, and remote response device.
