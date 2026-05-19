# Smart Locker Demo Android App

Android demo app for locker 1 using HiveMQ for realtime telemetry and Firebase Cloud Messaging for push notifications when the app is not open.

## Runtime Flow

```text
ESP32 -> HiveMQ locker/1/data -> Backend theft detection -> Firebase FCM topic -> Android notification
Android app -> HiveMQ locker/1/data for foreground realtime view
Android app -> HiveMQ locker/1/command for placeholder demo request
Android app -> BLE placeholder payload to ESP32 if connected
```

## Firebase

The app subscribes to this FCM topic on first launch:

```text
locker_1_theft
```

The backend sends critical locker 1 alerts to the same topic. This allows Android to receive push notifications even when the app is not open.

Required local file:

```text
android/SmartLockerDemo/app/google-services.json
```

The package name in Firebase must be:

```text
com.smartlocker.demo
```

## Backend Firebase Admin

The backend reads Firebase Admin credentials from:

```text
FIREBASE_SERVICE_ACCOUNT_BASE64
```

Optional config:

```text
FCM_DEMO_TOPIC=locker_1_theft
MOBILE_DEMO_LOCKER_ID=1
```

## HiveMQ

The Android app reads these values from the repository root `.env` at build time:

```text
MQTT_URL
MQTT_USERNAME
MQTT_PASSWORD
```

It subscribes to:

```text
locker/1/data
```

It publishes placeholder commands to:

```text
locker/1/command
```

## ESP32 BLE Contract

The app scans for BLE devices whose name contains:

```text
ESP32
Locker
```

The app writes to Nordic UART style UUIDs:

```text
Service UUID:          6e400001-b5a3-f393-e0a9-e50e24dcca9e
Write characteristic:  6e400002-b5a3-f393-e0a9-e50e24dcca9e
```

## Build Notes

- Use JDK 21 for Gradle.
- If `.env` changes, rebuild the Android app so `BuildConfig` is regenerated.
- `google-services.json` and local build files are ignored by Git.
