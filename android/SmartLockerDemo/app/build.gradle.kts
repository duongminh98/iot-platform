plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("com.google.gms.google-services")
}

fun readRootEnv(): Map<String, String> {
    val envFile = rootProject.layout.projectDirectory.file("../../.env").asFile
    if (!envFile.exists()) return emptyMap()
    return envFile.readLines()
        .map { it.trim() }
        .filter { it.isNotEmpty() && !it.startsWith("#") && it.contains("=") }
        .associate {
            val key = it.substringBefore("=").trim()
            val value = it.substringAfter("=").trim()
            key to value
        }
}

fun buildConfigString(value: String): String {
    return "\"${value.replace("\\", "\\\\").replace("\"", "\\\"")}\""
}

val rootEnv = readRootEnv()

android {
    namespace = "com.smartlocker.demo"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.smartlocker.demo"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"

        buildConfigField("String", "MQTT_URL", buildConfigString(rootEnv["MQTT_URL"].orEmpty()))
        buildConfigField("String", "MQTT_USERNAME", buildConfigString(rootEnv["MQTT_USERNAME"].orEmpty()))
        buildConfigField("String", "MQTT_PASSWORD", buildConfigString(rootEnv["MQTT_PASSWORD"].orEmpty()))
    }

    buildFeatures {
        buildConfig = true
        compose = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_21
        targetCompatibility = JavaVersion.VERSION_21
    }
}

kotlin {
    jvmToolchain(21)
}

dependencies {
    implementation(platform("androidx.compose:compose-bom:2024.12.01"))
    implementation(platform("com.google.firebase:firebase-bom:33.7.0"))

    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("com.google.firebase:firebase-messaging")
    implementation("org.eclipse.paho:org.eclipse.paho.client.mqttv3:1.2.5")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.9.0")

    debugImplementation("androidx.compose.ui:ui-tooling")
}
