package com.smartlocker.demo

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

class SmartLockerApi(private val baseUrl: String) {
    suspend fun getLocker(lockerId: Int = 1): LockerState = withContext(Dispatchers.IO) {
        val json = request("GET", "/locker/$lockerId")
        parseLocker(JSONObject(json))
    }

    suspend fun getAlerts(lockerId: Int = 1): List<LockerAlert> = withContext(Dispatchers.IO) {
        val json = request("GET", "/alerts?locker_id=$lockerId&limit=5")
        val array = JSONArray(json)
        List(array.length()) { index -> parseAlert(array.getJSONObject(index)) }
    }

    suspend fun registerToken(token: String) = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("token", token)
            .put("platform", "android")
            .put("user_id", "android-demo")
        request("POST", "/mobile/register-token", body.toString())
    }

    suspend fun sendDemoMqttRequest(lockerId: Int = 1): DemoCommandResult = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("action", "beep")
            .put("requested_by", "android-demo")
        val json = request("POST", "/locker/$lockerId/command", body.toString())
        val obj = JSONObject(json)
        DemoCommandResult(
            id = obj.optString("_id"),
            status = obj.optString("status"),
            action = obj.optString("action")
        )
    }

    private fun request(method: String, path: String, body: String? = null): String {
        val normalizedBase = baseUrl.trim().removeSuffix("/")
        val connection = (URL("$normalizedBase$path").openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 6000
            readTimeout = 6000
            setRequestProperty("Accept", "application/json")
            if (body != null) {
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
            }
        }

        if (body != null) {
            OutputStreamWriter(connection.outputStream).use { writer ->
                writer.write(body)
            }
        }

        val status = connection.responseCode
        val stream = if (status in 200..299) connection.inputStream else connection.errorStream
        val text = stream?.bufferedReader()?.use(BufferedReader::readText).orEmpty()
        connection.disconnect()

        if (status !in 200..299) {
            error("HTTP $status: $text")
        }
        return text
    }

    private fun parseLocker(obj: JSONObject): LockerState {
        return LockerState(
            lockerId = obj.optInt("locker_id"),
            temperature = obj.nullableDouble("temperature"),
            door = obj.nullableInt("door"),
            hasPackage = obj.nullableInt("has_package"),
            vibrationScore = obj.nullableDouble("vibration_score"),
            fsrPercent = obj.nullableDouble("fsr_percent"),
            lockState = obj.nullableString("lock_state"),
            rssi = obj.nullableDouble("rssi"),
            alertSeverity = obj.nullableString("alert_severity"),
            latestCommandStatus = obj.nullableString("latest_command_status"),
            lastWarning = obj.nullableString("last_warning"),
            timestamp = obj.nullableString("timestamp")
        )
    }

    private fun parseAlert(obj: JSONObject): LockerAlert {
        return LockerAlert(
            id = obj.optString("_id"),
            type = obj.optString("type"),
            severity = obj.optString("severity"),
            message = obj.optString("message"),
            timestamp = obj.optString("timestamp")
        )
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
