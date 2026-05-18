const mongoose = require("mongoose");

const lockerReadingSchema = new mongoose.Schema(
  {
    locker_id: {
      type: Number,
      required: true,
      index: true
    },
    temperature: {
      type: Number,
      default: null
    },
    door: {
      type: Number,
      required: true,
      enum: [0, 1]
    },
    has_package: {
      type: Number,
      enum: [0, 1],
      default: null
    },
    vibration: {
      type: Number,
      enum: [0, 1],
      default: null
    },
    vibration_count: {
      type: Number,
      default: null
    },
    vibration_score: {
      type: Number,
      default: null
    },
    fsr_raw: {
      type: Number,
      default: null
    },
    fsr_percent: {
      type: Number,
      default: null
    },
    fsr_delta: {
      type: Number,
      default: null
    },
    lock_state: {
      type: String,
      enum: ["locked", "unlocked", "unknown"],
      default: "unknown"
    },
    battery_percent: {
      type: Number,
      default: null
    },
    rssi: {
      type: Number,
      default: null
    },
    uptime_ms: {
      type: Number,
      default: null
    },
    event_type: {
      type: String,
      default: null
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  {
    versionKey: false
  }
);

lockerReadingSchema.index({ locker_id: 1, timestamp: -1 });

module.exports = mongoose.model("LockerReading", lockerReadingSchema);
