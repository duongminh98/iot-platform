package com.smartlocker.demo

import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.withContext
import org.eclipse.paho.client.mqttv3.IMqttDeliveryToken
import org.eclipse.paho.client.mqttv3.MqttCallbackExtended
import org.eclipse.paho.client.mqttv3.MqttClient
import org.eclipse.paho.client.mqttv3.MqttConnectOptions
import org.eclipse.paho.client.mqttv3.MqttMessage
import org.eclipse.paho.client.mqttv3.persist.MemoryPersistence
import org.json.JSONObject
import java.util.UUID

sealed interface MqttEvent {
    data object Connected : MqttEvent
    data object Disconnected : MqttEvent
    data class Telemetry(val state: LockerState, val theftDetected: Boolean) : MqttEvent
    data class Error(val message: String) : MqttEvent
}

class MqttLockerClient {
    private var client: MqttClient? = null
    private val vibrationWindow = mutableListOf<Pair<Long, Double>>()

    fun connect(
        mqttUrl: String,
        username: String,
        password: String,
        lockerId: Int = 1
    ): Flow<MqttEvent> = callbackFlow {
        val clientId = "smart-locker-android-${UUID.randomUUID()}"
        val brokerUri = normalizeBrokerUri(mqttUrl)
        val mqttClient = MqttClient(brokerUri, clientId, MemoryPersistence())
        client = mqttClient

        mqttClient.setCallback(object : MqttCallbackExtended {
            override fun connectComplete(reconnect: Boolean, serverURI: String?) {
                trySend(MqttEvent.Connected)
                runCatching { mqttClient.subscribe("locker/$lockerId/data", 1) }
                    .onFailure { trySend(MqttEvent.Error(it.message ?: "Subscribe failed.")) }
            }

            override fun connectionLost(cause: Throwable?) {
                trySend(MqttEvent.Disconnected)
            }

            override fun messageArrived(topic: String, message: MqttMessage) {
                runCatching {
                    val json = JSONObject(message.toString())
                    val state = json.toLockerState(lockerId)
                    MqttEvent.Telemetry(state, json.isTheftDetection())
                }.onSuccess {
                    trySend(it)
                }.onFailure {
                    trySend(MqttEvent.Error(it.message ?: "Invalid MQTT payload."))
                }
            }

            override fun deliveryComplete(token: IMqttDeliveryToken?) = Unit
        })

        val options = MqttConnectOptions().apply {
            isAutomaticReconnect = true
            isCleanSession = true
            if (username.isNotBlank()) userName = username.trim()
            if (password.isNotBlank()) this.password = password.toCharArray()
        }

        runCatching { mqttClient.connect(options) }
            .onFailure { trySend(MqttEvent.Error(it.message ?: "MQTT connect failed.")) }

        awaitClose {
            runCatching {
                mqttClient.disconnectForcibly(500, 500)
                mqttClient.close()
            }
            if (client === mqttClient) {
                client = null
            }
        }
    }.flowOn(Dispatchers.IO)

    suspend fun publishDemoRequest(lockerId: Int = 1): Boolean = withContext(Dispatchers.IO) {
        val mqttClient = client ?: return@withContext false
        if (!mqttClient.isConnected) return@withContext false

        val payload = JSONObject()
            .put("command_id", "android_${System.currentTimeMillis()}")
            .put("action", "placeholder")
            .put("requested_by", "android-demo")
            .toString()

        mqttClient.publish("locker/$lockerId/command", MqttMessage(payload.toByteArray()).apply {
            qos = 1
            isRetained = false
        })
        true
    }

    fun close() {
        runCatching {
            client?.disconnectForcibly(500, 500)
            client?.close()
        }
        client = null
    }

    private fun normalizeBrokerUri(value: String): String {
        val trimmed = value.trim()
        return when {
            trimmed.startsWith("mqtts://", ignoreCase = true) -> "ssl://${trimmed.removePrefix("mqtts://")}"
            trimmed.startsWith("mqtt://", ignoreCase = true) -> "tcp://${trimmed.removePrefix("mqtt://")}"
            else -> trimmed
        }
    }

    private fun JSONObject.toLockerState(lockerId: Int): LockerState {
        return LockerState(
            lockerId = lockerId,
            temperature = nullableDouble("temperature"),
            door = nullableInt("door"),
            hasPackage = nullableInt("has_package"),
            vibrationCount = nullableDouble("vibration_count"),
            vibrationScore = nullableDouble("vibration_score"),
            fsrPercent = nullableDouble("fsr_percent"),
            lockState = nullableString("lock_state"),
            rssi = nullableDouble("rssi"),
            alertSeverity = nullableString("alert_severity"),
            latestCommandStatus = nullableString("latest_command_status"),
            lastWarning = nullableString("last_warning") ?: nullableString("event_type"),
            timestamp = nullableString("timestamp")
        )
    }

    private fun JSONObject.isTheftDetection(): Boolean {
        val lockState = nullableString("lock_state")
        val door = nullableInt("door")
        val vibrationCount = nullableDouble("vibration_count") ?: 0.0
        val totalVibrations = updateVibrationWindow(vibrationCount)
        val vibrationScore = nullableDouble("vibration_score")
            ?: (totalVibrations / 150.0 * 100.0).coerceAtMost(100.0)
        val eventType = nullableString("event_type").orEmpty()
        val severity = nullableString("alert_severity").orEmpty()

        return severity == "critical" ||
            eventType.contains("theft", ignoreCase = true) ||
            eventType.contains("tamper", ignoreCase = true) ||
            eventType.contains("forced", ignoreCase = true) ||
            (lockState == "locked" && door == 1) ||
            totalVibrations > 150.0
    }

    private fun updateVibrationWindow(count: Double): Double {
        val now = System.currentTimeMillis()
        if (count > 0) {
            vibrationWindow += now to count
        }

        vibrationWindow.removeAll { (timestamp, _) -> now - timestamp > 15_000 }
        return vibrationWindow.sumOf { (_, value) -> value }
    }

    private fun JSONObject.nullableDouble(name: String): Double? {
        return if (!has(name) || isNull(name)) null else optDouble(name)
    }

    private fun JSONObject.nullableInt(name: String): Int? {
        return if (!has(name) || isNull(name)) null else optInt(name)
    }

    private fun JSONObject.nullableString(name: String): String? {
        return if (!has(name) || isNull(name)) null else optString(name)
    }
}
