const mongoose = require("mongoose");

const mobileDeviceSchema = new mongoose.Schema(
  {
    token: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    platform: {
      type: String,
      enum: ["android", "ios", "unknown"],
      default: "android"
    },
    user_id: {
      type: String,
      default: "demo"
    },
    enabled: {
      type: Boolean,
      default: true,
      index: true
    },
    last_seen_at: {
      type: Date,
      default: Date.now
    }
  },
  {
    versionKey: false
  }
);

module.exports = mongoose.model("MobileDevice", mobileDeviceSchema);
