package com.smartlocker.demo

import android.Manifest
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.core.app.ActivityCompat
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

class MainActivity : ComponentActivity() {
    private lateinit var bleClient: BleEsp32Client
    private lateinit var mqttClient: MqttLockerClient

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requestDemoPermissions()
        bleClient = BleEsp32Client(this)
        mqttClient = MqttLockerClient()

        setContent {
            SmartLockerTheme {
                SmartLockerScreen(
                    bleClient = bleClient,
                    mqttClient = mqttClient
                )
            }
        }
    }

    private fun requestDemoPermissions() {
        val permissions = mutableListOf<String>()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            permissions += Manifest.permission.POST_NOTIFICATIONS
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            permissions += Manifest.permission.BLUETOOTH_SCAN
            permissions += Manifest.permission.BLUETOOTH_CONNECT
        } else {
            permissions += Manifest.permission.ACCESS_FINE_LOCATION
        }

        ActivityCompat.requestPermissions(this, permissions.toTypedArray(), 100)
    }
}

@Composable
private fun SmartLockerTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            background = Color(0xFF0B1220),
            surface = Color(0xFF111827),
            primary = Color(0xFF20C7BD),
            secondary = Color(0xFFF59E0B),
            error = Color(0xFFFF6B6B)
        ),
        content = content
    )
}

@Composable
private fun SmartLockerScreen(
    bleClient: BleEsp32Client,
    mqttClient: MqttLockerClient
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val notificationHelper = remember { NotificationHelper(context) }
    var mqttJob by remember { mutableStateOf<Job?>(null) }

    var mqttUrl by rememberSaveable { mutableStateOf(BuildConfig.MQTT_URL.ifBlank { "mqtts://your-hivemq-host:8883" }) }
    var mqttUsername by rememberSaveable { mutableStateOf(BuildConfig.MQTT_USERNAME) }
    var mqttPassword by rememberSaveable { mutableStateOf(BuildConfig.MQTT_PASSWORD) }
    var locker by remember { mutableStateOf<LockerState?>(null) }
    var status by remember { mutableStateOf("Connect to HiveMQ to receive locker 1 telemetry.") }
    var fcmStatus by remember { mutableStateOf("Subscribing to FCM topic locker_1_theft...") }
    var bleStatus by remember { mutableStateOf("BLE disconnected.") }
    var lastTheftNotificationAt by remember { mutableStateOf(0L) }

    fun connectMqtt() {
        mqttJob?.cancel()
        mqttJob = scope.launch {
            status = "Connecting to HiveMQ..."
            runCatching {
                mqttClient.connect(mqttUrl, mqttUsername, mqttPassword, 1).collect { event ->
                    when (event) {
                        MqttEvent.Connected -> status = "Connected. Subscribed to locker/1/data."
                        MqttEvent.Disconnected -> status = "MQTT disconnected. Reconnecting if possible..."
                        is MqttEvent.Error -> status = "MQTT error: ${event.message}"
                        is MqttEvent.Telemetry -> {
                            locker = event.state
                            status = "Telemetry received from HiveMQ."
                            if (event.theftDetected) {
                                val now = System.currentTimeMillis()
                                if (now - lastTheftNotificationAt > 10_000) {
                                    lastTheftNotificationAt = now
                                    notificationHelper.showTheftNotification(event.state)
                                }
                            }
                        }
                    }
                }
            }.onFailure {
                if (it !is CancellationException) {
                    status = "MQTT error: ${it.message}"
                }
            }
        }
    }

    LaunchedEffect(Unit) {
        notificationHelper.ensureTheftChannel()

        runCatching {
            FirebaseMessaging.getInstance().subscribeToTopic("locker_1_theft").await()
        }.onSuccess {
            fcmStatus = "FCM topic ready: locker_1_theft."
        }.onFailure {
            fcmStatus = "FCM topic failed: ${it.message}"
        }

        if (BuildConfig.MQTT_URL.isNotBlank()) {
            connectMqtt()
        }
    }

    DisposableEffect(Unit) {
        onDispose {
            mqttJob?.cancel()
            mqttClient.close()
            bleClient.close()
        }
    }

    Surface(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Text(
                text = "Smart Locker HiveMQ Demo",
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold
            )
            Text(
                text = "Locker 1 only. The app subscribes directly to HiveMQ and shows a local notification for theft detection telemetry.",
                color = Color(0xFFB8C5D6)
            )

            CardBlock {
                OutlinedTextField(
                    value = mqttUrl,
                    onValueChange = { mqttUrl = it },
                    label = { Text("HiveMQ URL") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(modifier = Modifier.height(10.dp))
                OutlinedTextField(
                    value = mqttUsername,
                    onValueChange = { mqttUsername = it },
                    label = { Text("MQTT username") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(modifier = Modifier.height(10.dp))
                OutlinedTextField(
                    value = mqttPassword,
                    onValueChange = { mqttPassword = it },
                    label = { Text("MQTT password") },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(modifier = Modifier.height(10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Button(onClick = { connectMqtt() }) {
                        Text("Connect HiveMQ")
                    }
                    Button(
                        onClick = {
                            scope.launch {
                                bleStatus = "Scanning for ESP32 BLE..."
                                runCatching { bleClient.connectToEsp32() }
                                    .onSuccess { name -> bleStatus = "Connected to $name" }
                                    .onFailure { bleStatus = "BLE connect failed: ${it.message}" }
                            }
                        }
                    ) {
                        Text("Connect ESP32")
                    }
                }
            }

            CardBlock {
                Text("Locker 1 status", fontWeight = FontWeight.Bold)
                Spacer(modifier = Modifier.height(8.dp))
                StatusGrid(locker)
            }

            CardBlock {
                Text("Demo request", fontWeight = FontWeight.Bold)
                Text(
                    text = "This publishes a placeholder command to locker/1/command on HiveMQ and writes the same kind of placeholder request to ESP32 over BLE if connected.",
                    color = Color(0xFFB8C5D6)
                )
                Spacer(modifier = Modifier.height(10.dp))
                Button(
                    onClick = {
                        scope.launch {
                            val mqttSent = runCatching { mqttClient.publishDemoRequest(1) }.getOrDefault(false)
                            val bleSent = runCatching { bleClient.sendDemoRequest(1) }.getOrDefault(false)
                            status = "HiveMQ publish: ${if (mqttSent) "sent" else "not connected"} | BLE: ${if (bleSent) "sent" else "not connected"}"
                        }
                    },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Send demo request")
                }
            }

            CardBlock {
                Text("Runtime state", fontWeight = FontWeight.Bold)
                Spacer(modifier = Modifier.height(8.dp))
                Text(status, color = Color(0xFFDDE7F3))
                Spacer(modifier = Modifier.height(6.dp))
                Text(fcmStatus, color = Color(0xFFDDE7F3))
                Spacer(modifier = Modifier.height(6.dp))
                Text(bleStatus, color = Color(0xFFDDE7F3))
            }
        }
    }
}

@Composable
private fun CardBlock(content: @Composable () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFF111827))
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            content()
        }
    }
}

@Composable
private fun StatusGrid(locker: LockerState?) {
    if (locker == null) {
        Text("No MQTT telemetry received yet.", color = Color(0xFFB8C5D6))
        return
    }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(modifier = Modifier.fillMaxWidth()) {
            Metric("Door", if (locker.door == 1) "Open" else "Closed", Modifier.weight(1f))
            Spacer(modifier = Modifier.width(10.dp))
            Metric("Lock", locker.lockState ?: "unknown", Modifier.weight(1f))
        }
        Row(modifier = Modifier.fillMaxWidth()) {
            Metric("Temp", locker.temperature?.let { "${it}C" } ?: "N/A", Modifier.weight(1f))
            Spacer(modifier = Modifier.width(10.dp))
            Metric("Package", when (locker.hasPackage) {
                1 -> "Present"
                0 -> "Empty"
                else -> "Unknown"
            }, Modifier.weight(1f))
        }
        Row(modifier = Modifier.fillMaxWidth()) {
            val vibrationValue = locker.vibrationScore?.let { "${it.toInt()}%" }
                ?: locker.vibrationCount?.let { "${it.toInt()} count" }
                ?: "N/A"
            Metric("Vibration", vibrationValue, Modifier.weight(1f))
            Spacer(modifier = Modifier.width(10.dp))
            Metric("FSR", locker.fsrPercent?.let { "${it.toInt()}%" } ?: "N/A", Modifier.weight(1f))
        }
        Row(modifier = Modifier.fillMaxWidth()) {
            Metric("RSSI", locker.rssi?.let { "${it.toInt()} dBm" } ?: "N/A", Modifier.weight(1f))
            Spacer(modifier = Modifier.width(10.dp))
            Metric("Severity", locker.alertSeverity ?: "from telemetry", Modifier.weight(1f))
        }
        Text(
            text = locker.lastWarning ?: "Waiting for warning/event text.",
            color = Color(0xFFB8C5D6)
        )
    }
}

@Composable
private fun Metric(label: String, value: String, modifier: Modifier = Modifier) {
    Column(modifier = modifier) {
        Text(label, color = Color(0xFF93A4B8), style = MaterialTheme.typography.labelMedium)
        Text(value, fontWeight = FontWeight.SemiBold)
    }
}
