package com.smartlocker.demo

import android.Manifest
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.core.app.ActivityCompat
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
import androidx.compose.ui.unit.dp
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

class MainActivity : ComponentActivity() {
    private lateinit var bleClient: BleEsp32Client

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requestDemoPermissions()
        bleClient = BleEsp32Client(this)

        setContent {
            SmartLockerTheme {
                SmartLockerScreen(bleClient = bleClient)
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

        if (permissions.isNotEmpty()) {
            ActivityCompat.requestPermissions(this, permissions.toTypedArray(), 100)
        }
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
private fun SmartLockerScreen(bleClient: BleEsp32Client) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var apiBaseUrl by rememberSaveable { mutableStateOf("http://10.0.2.2:3000") }
    var locker by remember { mutableStateOf<LockerState?>(null) }
    var alerts by remember { mutableStateOf<List<LockerAlert>>(emptyList()) }
    var status by remember { mutableStateOf("Ready. Configure backend URL, then refresh locker 1.") }
    var fcmStatus by remember { mutableStateOf("FCM token not registered yet.") }
    var bleStatus by remember { mutableStateOf("BLE disconnected.") }

    fun refresh() {
        scope.launch {
            status = "Loading locker 1..."
            runCatching {
                val api = SmartLockerApi(apiBaseUrl)
                locker = api.getLocker(1)
                alerts = api.getAlerts(1)
            }.onSuccess {
                status = "Locker 1 refreshed."
            }.onFailure {
                status = "Refresh failed: ${it.message}"
            }
        }
    }

    LaunchedEffect(apiBaseUrl) {
        runCatching {
            FirebaseApp.initializeApp(context)
            val token = FirebaseMessaging.getInstance().token.await()
            SmartLockerApi(apiBaseUrl).registerToken(token)
            fcmStatus = "FCM registered for locker 1 demo: ${token.take(18)}..."
        }.onFailure {
            fcmStatus = "FCM not configured or not reachable: ${it.message}"
        }
        refresh()
    }

    DisposableEffect(Unit) {
        onDispose { bleClient.close() }
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
                text = "Smart Locker Demo",
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold
            )
            Text(
                text = "Locker 1 only. No login. Theft detection notifications are handled through Firebase Cloud Messaging.",
                color = Color(0xFFB8C5D6)
            )

            CardBlock {
                OutlinedTextField(
                    value = apiBaseUrl,
                    onValueChange = { apiBaseUrl = it },
                    label = { Text("Backend URL") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(modifier = Modifier.height(10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Button(onClick = { refresh() }) {
                        Text("Refresh locker 1")
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
                Text("Theft detection alerts", fontWeight = FontWeight.Bold)
                Spacer(modifier = Modifier.height(8.dp))
                if (alerts.isEmpty()) {
                    Text("No recent alerts for locker 1.", color = Color(0xFFB8C5D6))
                } else {
                    alerts.forEach { alert ->
                        Text("${alert.severity.uppercase()} - ${alert.type}", fontWeight = FontWeight.SemiBold)
                        Text(alert.message, color = Color(0xFFB8C5D6))
                        Spacer(modifier = Modifier.height(8.dp))
                    }
                }
            }

            CardBlock {
                Text("Demo request", fontWeight = FontWeight.Bold)
                Text(
                    text = "This sends a placeholder MQTT command through the backend and writes a placeholder JSON request to ESP32 over BLE if connected.",
                    color = Color(0xFFB8C5D6)
                )
                Spacer(modifier = Modifier.height(10.dp))
                Button(
                    onClick = {
                        scope.launch {
                            status = "Sending demo request..."
                            val mqttResult = runCatching { SmartLockerApi(apiBaseUrl).sendDemoMqttRequest(1) }
                            val bleSent = runCatching { bleClient.sendDemoRequest(1) }.getOrDefault(false)
                            status = buildString {
                                append(
                                    mqttResult.fold(
                                        onSuccess = { "MQTT command ${it.action}/${it.status}" },
                                        onFailure = { "MQTT failed: ${it.message}" }
                                    )
                                )
                                append(" | ")
                                append(if (bleSent) "BLE placeholder sent" else "BLE not sent")
                            }
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
        Text("No locker data loaded.", color = Color(0xFFB8C5D6))
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
                1 -> "Has package"
                0 -> "Empty"
                else -> "Unknown"
            }, Modifier.weight(1f))
        }
        Row(modifier = Modifier.fillMaxWidth()) {
            Metric("Vibration", locker.vibrationScore?.let { "${it.toInt()}%" } ?: "N/A", Modifier.weight(1f))
            Spacer(modifier = Modifier.width(10.dp))
            Metric("FSR", locker.fsrPercent?.let { "${it.toInt()}%" } ?: "N/A", Modifier.weight(1f))
        }
        Row(modifier = Modifier.fillMaxWidth()) {
            Metric("RSSI", locker.rssi?.let { "${it.toInt()} dBm" } ?: "N/A", Modifier.weight(1f))
            Spacer(modifier = Modifier.width(10.dp))
            Metric("Severity", locker.alertSeverity ?: "normal", Modifier.weight(1f))
        }
        Text(
            text = locker.lastWarning ?: "No warning logged.",
            color = if (locker.alertSeverity == "critical") Color(0xFFFFB4B4) else Color(0xFFB8C5D6)
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
