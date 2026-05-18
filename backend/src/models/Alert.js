const mongoose = require("mongoose");

const alertSchema = new mongoose.Schema(
  {
    locker_id: {
      type: Number,
      required: true,
      index: true
    },
    type: {
      type: String,
      required: true,
      index: true
    },
    severity: {
      type: String,
      enum: ["info", "warning", "critical"],
      required: true,
      index: true
    },
    message: {
      type: String,
      required: true
    },
    acknowledged: {
      type: Boolean,
      default: false,
      index: true
    },
    acknowledged_at: {
      type: Date,
      default: null
    },
    acknowledged_by: {
      type: String,
      default: null
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
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

alertSchema.index({ locker_id: 1, type: 1, timestamp: -1 });

module.exports = mongoose.model("Alert", alertSchema);
