# Smart Locker Demo Android App

Android demo app for locker 1.

## Features

- No login.
- Displays locker 1 status from the backend:
  - door
  - lock state
  - temperature
  - package state
  - vibration score
  - FSR pressure
  - RSSI
  - alert severity
- Registers a Firebase Cloud Messaging token with:

```http
POST /mobile/register-token
```

- Shows theft detection notifications for locker 1 only.
- Sends a demo backend MQTT command:

```http
POST /locker/1/command
```

with:

```json
{
  "action": "beep",
  "requested_by": "android-demo"
}
```

- Sends a placeholder BLE payload to ESP32 if connected:

```json
{
  "type": "demo_request",
  "locker_id": 1,
  "action": "placeholder"
}
```

## Open In Android Studio

Open this folder:

```text
android/SmartLockerDemo
```

The project does not include a Gradle wrapper. Use Android Studio's Gradle installation or add a wrapper from Android Studio.

## Backend URL

The app defaults to:

```text
http://10.0.2.2:3000
```

Use this for Android Emulator talking to backend on the host machine.

For a real Android phone on the same Wi-Fi, change the URL in the app to your laptop LAN IP, for example:

```text
http://192.168.1.20:3000
```

The Android manifest enables cleartext HTTP for local demo.

## Firebase Setup

1. Create a Firebase Android app with package:

```text
com.smartlocker.demo
```

2. Download `google-services.json`.
3. Put it at:

```text
android/SmartLockerDemo/app/google-services.json
```

4. Keep `google-services.json.example` as reference only.

The Google Services Gradle plugin is enabled. The app needs a real `google-services.json` before building with Firebase Messaging.

## ESP32 BLE Contract

The Android app scans for BLE devices whose name contains:

```text
ESP32
Locker
```

The app writes to Nordic UART style UUIDs:

```text
Service UUID:        6e400001-b5a3-f393-e0a9-e50e24dcca9e
Write characteristic: 6e400002-b5a3-f393-e0a9-e50e24dcca9e
```

Make the ESP32 firmware expose those UUIDs before using the BLE request button.

## Backend Demo Notification Scope

Backend push notifications are limited to locker 1 by:

```text
MOBILE_DEMO_LOCKER_ID=1
```

This keeps the Android demo focused on one physical locker.
