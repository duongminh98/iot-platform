const express = require("express");

const Alert = require("../models/Alert");
const Command = require("../models/Command");
const LockerReading = require("../models/LockerReading");
const LockerState = require("../models/LockerState");
const MobileDevice = require("../models/MobileDevice");
const { publishCommand } = require("../services/lockerService");

function readLockerId(value) {
  const lockerId = Number(value);
  if (!Number.isInteger(lockerId) || lockerId <= 0) {
    const error = new Error("Locker id must be a positive integer.");
    error.statusCode = 400;
    throw error;
  }
  return lockerId;
}

function createLockerRouter(historyLimit, mqttClient, config) {
  const router = express.Router();

  router.get("/lockers", async (_request, response, next) => {
    try {
      const lockers = await LockerState.find().sort({ locker_id: 1 }).lean();
      response.json(lockers);
    } catch (error) {
      next(error);
    }
  });

  router.get("/locker/:id", async (request, response, next) => {
    try {
      const lockerId = readLockerId(request.params.id);
      const locker = await LockerState.findOne({ locker_id: lockerId }).lean();

      if (!locker) {
        return response.status(404).json({ message: "Locker not found." });
      }

      response.json(locker);
    } catch (error) {
      next(error);
    }
  });

  router.get("/history/:id", async (request, response, next) => {
    try {
      const lockerId = readLockerId(request.params.id);
      const limit = Math.min(Number(request.query.limit) || historyLimit, historyLimit);
      const history = await LockerReading.find({ locker_id: lockerId })
        .sort({ timestamp: -1 })
        .limit(limit)
        .lean();

      response.json(history);
    } catch (error) {
      next(error);
    }
  });

  router.get("/alerts", async (request, response, next) => {
    try {
      const query = {};
      if (request.query.locker_id) {
        query.locker_id = readLockerId(request.query.locker_id);
      }
      if (request.query.acknowledged === "false" || request.query.acknowledged === "true") {
        query.acknowledged = request.query.acknowledged === "true";
      }
      if (["info", "warning", "critical"].includes(request.query.severity)) {
        query.severity = request.query.severity;
      }

      const limit = Math.min(Number(request.query.limit) || 50, 200);
      const alerts = await Alert.find(query).sort({ timestamp: -1 }).limit(limit).lean();
      response.json(alerts);
    } catch (error) {
      next(error);
    }
  });

  router.post("/alerts/:id/acknowledge", async (request, response, next) => {
    try {
      const alert = await Alert.findByIdAndUpdate(
        request.params.id,
        {
          acknowledged: true,
          acknowledged_at: new Date(),
          acknowledged_by: request.body?.acknowledged_by || request.get("x-user-id") || "demo"
        },
        { new: true }
      );

      if (!alert) {
        return response.status(404).json({ message: "Alert not found." });
      }

      response.json(alert);
    } catch (error) {
      next(error);
    }
  });

  router.post("/locker/:id/command", async (request, response, next) => {
    try {
      const lockerId = readLockerId(request.params.id);
      const command = await publishCommand(mqttClient, config, lockerId, {
        action: request.body?.action,
        duration_ms: request.body?.duration_ms,
        requested_by: request.body?.requested_by || request.get("x-user-id") || "demo"
      });
      response.status(202).json(command);
    } catch (error) {
      next(error);
    }
  });

  router.get("/commands/:id", async (request, response, next) => {
    try {
      const command = await Command.findById(request.params.id).lean();
      if (!command) {
        return response.status(404).json({ message: "Command not found." });
      }
      response.json(command);
    } catch (error) {
      next(error);
    }
  });

  router.post("/mobile/register-token", async (request, response, next) => {
    try {
      const token = request.body?.token;
      if (typeof token !== "string" || token.trim().length === 0) {
        return response.status(400).json({ message: "token is required." });
      }

      const device = await MobileDevice.findOneAndUpdate(
        { token: token.trim() },
        {
          token: token.trim(),
          platform: request.body?.platform || "android",
          user_id: request.body?.user_id || request.get("x-user-id") || "demo",
          enabled: true,
          last_seen_at: new Date()
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      response.status(201).json(device);
    } catch (error) {
      next(error);
    }
  });

  router.delete("/mobile/register-token", async (request, response, next) => {
    try {
      const token = request.body?.token || request.query.token;
      if (typeof token !== "string" || token.trim().length === 0) {
        return response.status(400).json({ message: "token is required." });
      }

      await MobileDevice.updateOne({ token: token.trim() }, { enabled: false });
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = {
  createLockerRouter
};
