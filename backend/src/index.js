const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const config = require("./config");
const { connectToDatabase } = require("./db");
const { createLockerRouter } = require("./routes/lockers");
const { startMqttInfrastructure } = require("./services/lockerService");

async function main() {
  await connectToDatabase(config.mongoUri);
  console.log("Connected to MongoDB.");

  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: "*" } });

  const mqttClient = await startMqttInfrastructure(config, io);

  app.use(express.json());
  app.use(createLockerRouter(config.historyLimit, mqttClient, config));
  app.use(express.static(config.frontendDir));

  app.get("/health", (_request, response) => {
    response.json({
      status: "ok",
      mqttUrl: config.mqttUrl || `mqtt://127.0.0.1:${config.mqttPort}`,
      mqttPort: config.mqttPort,
      packageStaleSeconds: config.packageStaleSeconds,
      doorOpenStaleSeconds: config.doorOpenStaleSeconds,
      packageDoorOpenCriticalSeconds: config.packageDoorOpenCriticalSeconds,
      vibrationCriticalTotal: config.vibrationCriticalTotal,
      vibrationWindowSeconds: config.vibrationWindowSeconds,
      fsrDropCriticalPercent: config.fsrDropCriticalPercent,
      weakSignalRssi: config.weakSignalRssi,
      alertDedupSeconds: config.alertDedupSeconds,
      commandTimeoutSeconds: config.commandTimeoutSeconds
    });
  });

  app.use((error, _request, response, _next) => {
    console.error(error);
    response.status(error.statusCode || 500).json({ message: error.message || "Internal server error." });
  });

  server.listen(config.port, () => {
    console.log(`HTTP server listening on http://127.0.0.1:${config.port}`);
  });
}

main().catch((error) => {
  console.error("Fatal startup error:", error);
  process.exit(1);
});
