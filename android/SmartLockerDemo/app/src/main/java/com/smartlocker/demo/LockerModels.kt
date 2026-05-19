package com.smartlocker.demo

data class LockerState(
    val lockerId: Int,
    val temperature: Double?,
    val door: Int?,
    val hasPackage: Int?,
    val vibrationScore: Double?,
    val fsrPercent: Double?,
    val lockState: String?,
    val rssi: Double?,
    val alertSeverity: String?,
    val latestCommandStatus: String?,
    val lastWarning: String?,
    val timestamp: String?
)

data class LockerAlert(
    val id: String,
    val type: String,
    val severity: String,
    val message: String,
    val timestamp: String
)

data class DemoCommandResult(
    val id: String,
    val status: String,
    val action: String
)
