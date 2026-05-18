const mongoose = require("mongoose");

const commandSchema = new mongoose.Schema(
  {
    locker_id: {
      type: Number,
      required: true,
      index: true
    },
    action: {
      type: String,
      enum: ["unlock", "lock", "beep", "calibrate_fsr"],
      required: true
    },
    status: {
      type: String,
      enum: ["pending", "sent", "accepted", "rejected", "timeout"],
      default: "pending",
      index: true
    },
    duration_ms: {
      type: Number,
      default: null
    },
    requested_by: {
      type: String,
      default: "demo"
    },
    mqtt_topic: {
      type: String,
      required: true
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    ack_payload: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    sent_at: {
      type: Date,
      default: null
    },
    acknowledged_at: {
      type: Date,
      default: null
    },
    created_at: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  {
    versionKey: false
  }
);

commandSchema.index({ locker_id: 1, created_at: -1 });

module.exports = mongoose.model("Command", commandSchema);
