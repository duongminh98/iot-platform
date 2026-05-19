package com.smartlocker.demo

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattService
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import java.util.UUID

class BleEsp32Client(private val context: Context) {
    private val bluetoothManager = context.getSystemService(BluetoothManager::class.java)
    private val adapter = bluetoothManager.adapter
    private var gatt: BluetoothGatt? = null
    private var writeCharacteristic: BluetoothGattCharacteristic? = null

    private val serviceUuid = UUID.fromString("6e400001-b5a3-f393-e0a9-e50e24dcca9e")
    private val writeUuid = UUID.fromString("6e400002-b5a3-f393-e0a9-e50e24dcca9e")

    fun hasRuntimePermissions(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_SCAN) == PackageManager.PERMISSION_GRANTED &&
                ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED
        } else {
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        }
    }

    @SuppressLint("MissingPermission")
    suspend fun connectToEsp32(): String = withContext(Dispatchers.Main) {
        require(hasRuntimePermissions()) { "Bluetooth permissions are not granted." }
        require(adapter?.isEnabled == true) { "Bluetooth is disabled." }

        val scanner = adapter.bluetoothLeScanner ?: error("BLE scanner is not available.")
        val foundDevice = CompletableDeferred<BluetoothDevice>()

        val scanCallback = object : ScanCallback() {
            override fun onScanResult(callbackType: Int, result: ScanResult) {
                val name = result.device.name.orEmpty()
                if (name.contains("ESP32", ignoreCase = true) || name.contains("Locker", ignoreCase = true)) {
                    if (foundDevice.complete(result.device)) {
                        scanner.stopScan(this)
                    }
                }
            }

            override fun onScanFailed(errorCode: Int) {
                foundDevice.completeExceptionally(IllegalStateException("BLE scan failed: $errorCode"))
            }
        }

        scanner.startScan(scanCallback)
        val device = try {
            withTimeout(10000) { foundDevice.await() }
        } finally {
            scanner.stopScan(scanCallback)
        }

        connectGatt(device)
        device.name ?: device.address
    }

    @SuppressLint("MissingPermission")
    private suspend fun connectGatt(device: BluetoothDevice) {
        val connected = CompletableDeferred<Unit>()

        val callback = object : BluetoothGattCallback() {
            override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
                if (status != BluetoothGatt.GATT_SUCCESS) {
                    connected.completeExceptionally(IllegalStateException("GATT connection failed: $status"))
                    return
                }
                if (newState == BluetoothProfile.STATE_CONNECTED) {
                    gatt.discoverServices()
                }
            }

            override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
                if (status != BluetoothGatt.GATT_SUCCESS) {
                    connected.completeExceptionally(IllegalStateException("Service discovery failed: $status"))
                    return
                }

                val service: BluetoothGattService? = gatt.getService(serviceUuid)
                val characteristic = service?.getCharacteristic(writeUuid)
                if (characteristic == null) {
                    connected.completeExceptionally(
                        IllegalStateException("ESP32 BLE service/characteristic UUID not found.")
                    )
                    return
                }

                this@BleEsp32Client.gatt = gatt
                writeCharacteristic = characteristic
                connected.complete(Unit)
            }
        }

        gatt?.close()
        gatt = device.connectGatt(context, false, callback)
        withTimeout(12000) { connected.await() }
    }

    @SuppressLint("MissingPermission")
    fun sendDemoRequest(lockerId: Int = 1): Boolean {
        val currentGatt = gatt ?: return false
        val characteristic = writeCharacteristic ?: return false
        val payload = """{"type":"demo_request","locker_id":$lockerId,"action":"placeholder"}"""
        characteristic.writeType = BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
        characteristic.value = payload.toByteArray(Charsets.UTF_8)
        return currentGatt.writeCharacteristic(characteristic)
    }

    @SuppressLint("MissingPermission")
    fun close() {
        gatt?.close()
        gatt = null
        writeCharacteristic = null
    }
}
