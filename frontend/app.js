const overviewStats = document.getElementById("overviewStats");
const lockerGrid = document.getElementById("lockerGrid");
const historySelect = document.getElementById("historySelect");
const historyTableBody = document.getElementById("historyTableBody");
const refreshButton = document.getElementById("refreshButton");
const selectedLockerTitle = document.getElementById("selectedLockerTitle");
const selectedLockerMeta = document.getElementById("selectedLockerMeta");
const selectedLockerAlerts = document.getElementById("selectedLockerAlerts");
const selectedLockerStats = document.getElementById("selectedLockerStats");
const deviceHealthStats = document.getElementById("deviceHealthStats");
const chartArea = document.getElementById("chartArea");
const securityTimeline = document.getElementById("securityTimeline");
const incidentSummary = document.getElementById("incidentSummary");
const lastUpdatedLabel = document.getElementById("lastUpdatedLabel");
const commandStatus = document.getElementById("commandStatus");
const severityFilter = document.getElementById("severityFilter");
const ackFilter = document.getElementById("ackFilter");
const forecastGrid = document.getElementById("forecastGrid");
const forecastSummary = document.getElementById("forecastSummary");
const forecastFeatures = document.getElementById("forecastFeatures");
const forecastModelLabel = document.getElementById("forecastModelLabel");

const state = {
  lockers: [],
  alerts: [],
  selectedLockerId: null,
  theftAlertUntil: 0
};

function formatDoor(value) {
  return value === 1 ? "Open" : "Closed";
}

function formatPackage(value) {
  if (value === null || typeof value === "undefined") {
    return "Unknown";
  }
  return value === 1 ? "Present" : "Empty";
}

function formatTemperature(value) {
  return typeof value === "number" ? `${value}C` : "N/A";
}

function formatLock(value) {
  if (value === "locked") return "Locked";
  if (value === "unlocked") return "Unlocked";
  return "Unknown";
}

function formatPercent(value) {
  return typeof value === "number" ? `${value}%` : "N/A";
}

function formatSignal(value) {
  return typeof value === "number" ? `${value} dBm` : "N/A";
}

function formatSeverity(value) {
  if (value === "critical") return "Critical";
  if (value === "warning") return "Warning";
  if (value === "info") return "Info";
  return "Normal";
}

function formatTime(value) {
  return new Date(value).toLocaleString();
}

function formatTimeShort(value) {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function computeOverview(lockers) {
  const total = lockers.length;
  const alerting = lockers.filter((locker) => Array.isArray(locker.alerts) && locker.alerts.length > 0)
    .length;
  const temperatureSamples = lockers.filter((locker) => typeof locker.temperature === "number");
  const averageTemp = temperatureSamples.length
    ? (temperatureSamples.reduce((sum, locker) => sum + locker.temperature, 0) / temperatureSamples.length).toFixed(1)
    : null;
  const packagesWaiting = lockers.filter((locker) => locker.has_package === 1).length;
  const criticalSecurity = lockers.filter((locker) => locker.alert_severity === "critical").length;

  return [
    {
      label: "Connected lockers",
      value: String(total),
      detail: total ? "Receiving latest telemetry samples" : "No telemetry yet"
    },
    {
      label: "Alerting units",
      value: String(alerting),
      detail: alerting ? "Requires operational review" : "No active incidents"
    },
    {
      label: "Average temperature",
      value: averageTemp ? `${averageTemp}C` : "N/A",
      detail: "Across latest locker states"
    },
    {
      label: "Critical security",
      value: String(criticalSecurity),
      detail: packagesWaiting
        ? `${packagesWaiting} lockers currently holding deliveries`
        : "No critical tamper incidents"
    }
  ];
}

function renderOverview(lockers) {
  const cards = computeOverview(lockers);
  overviewStats.innerHTML = cards
    .map(
      (card) => `
        <article class="overview-card">
          <p>${card.label}</p>
          <strong>${card.value}</strong>
          <span>${card.detail}</span>
        </article>
      `
    )
    .join("");
}

function renderEmptyState(message) {
  lockerGrid.innerHTML = `<div class="empty-state">${message}</div>`;
  chartArea.innerHTML = '<div class="empty-state">Historical chart will appear after data arrives.</div>';
  selectedLockerTitle.textContent = "Locker focus";
  selectedLockerMeta.textContent = message;
  selectedLockerAlerts.innerHTML = "";
  selectedLockerStats.innerHTML = "";
}

function renderLockers(lockers) {
  if (lockers.length === 0) {
    renderEmptyState("No locker data yet. Start the simulator to publish MQTT messages.");
    return;
  }

  lockerGrid.innerHTML = lockers
    .map((locker) => {
      const hasAlerts = Array.isArray(locker.alerts) && locker.alerts.length > 0;
      const isActive = locker.locker_id === state.selectedLockerId;
      const severity = locker.alert_severity || (hasAlerts ? "warning" : "normal");

      return `
        <button
          type="button"
          class="locker-card ${hasAlerts ? "alert" : ""} ${severity === "critical" ? "critical" : ""} ${isActive ? "active" : ""}"
          data-locker-id="${locker.locker_id}"
        >
          <div class="locker-head">
            <div>
              <h3>Locker ${locker.locker_id}</h3>
              <span class="metric-badge">${formatTime(locker.timestamp)}</span>
            </div>
            <span class="status-badge ${hasAlerts ? "alert" : ""} ${severity === "critical" ? "critical" : ""}">
              ${formatSeverity(severity)}
            </span>
          </div>
          <dl>
            <div>
              <dt>Temperature</dt>
              <dd>${formatTemperature(locker.temperature)}</dd>
            </div>
            <div>
              <dt>Door</dt>
              <dd>${formatDoor(locker.door)}</dd>
            </div>
            <div>
              <dt>Package</dt>
              <dd>${formatPackage(locker.has_package)}</dd>
            </div>
            <div>
              <dt>Lock</dt>
              <dd>${formatLock(locker.lock_state)}</dd>
            </div>
            <div>
              <dt>Rung bất thường</dt>
              <dd>${formatPercent(locker.vibration_score)}</dd>
            </div>
            <div>
              <dt>FSR</dt>
              <dd>${formatPercent(locker.fsr_percent)}</dd>
            </div>
            <div>
              <dt>RSSI</dt>
              <dd>${formatSignal(locker.rssi)}</dd>
            </div>
            <div>
              <dt>Alerts</dt>
              <dd>${hasAlerts ? locker.alerts.length : 0}</dd>
            </div>
          </dl>
        </button>
      `;
    })
    .join("");
}

function renderHistory(history) {
  if (history.length === 0) {
    historyTableBody.innerHTML =
      '<tr><td colspan="7">No history available for this locker yet.</td></tr>';
    return;
  }

  historyTableBody.innerHTML = history
    .map(
      (entry) => `
        <tr>
          <td>${formatTime(entry.timestamp)}</td>
          <td>${formatTemperature(entry.temperature)}</td>
          <td>${formatDoor(entry.door)}</td>
          <td>${formatPackage(entry.has_package)}</td>
          <td>${formatLock(entry.lock_state)}</td>
          <td>${formatPercent(entry.vibration_score)}</td>
          <td>${formatPercent(entry.fsr_percent)}</td>
        </tr>
      `
    )
    .join("");
}

function renderSelectedLocker(locker) {
  if (!locker) {
    selectedLockerTitle.textContent = "Locker focus";
    selectedLockerMeta.textContent = "Select a locker to inspect its latest status and telemetry history.";
    selectedLockerAlerts.innerHTML = "";
    selectedLockerStats.innerHTML = "";
    chartArea.innerHTML = '<div class="empty-state">Historical chart will appear after data arrives.</div>';
    return;
  }

  selectedLockerTitle.textContent = `Locker ${locker.locker_id}`;
  selectedLockerMeta.textContent =
    `Latest sample received at ${formatTime(locker.timestamp)}. Current operational state and recent history are shown here.`;

  if (locker.locker_id === 1) {
    const isTheft = state.lastVibCount > 150;
    // Lấy số đếm tạm thời từ state để hiển thị ngay (nếu có)
    const countText = typeof state.lastVibCount === "number" ? ` (${state.lastVibCount})` : "";
    const text = isTheft ? `Theft detected${countText}` : `Bình thường 1${countText}`;
    const bg = isTheft ? "#ef4444" : "#10b981";
    selectedLockerAlerts.innerHTML = `<span class="alert-pill" style="background: ${bg}; color: white; font-weight: bold; border: none;">${text}</span>`;
  } else {
    const alerts = Array.isArray(locker.alerts) && locker.alerts.length > 0 ? locker.alerts : ["normal"];
    selectedLockerAlerts.innerHTML = alerts
      .map((alert) => `<span class="alert-pill">${alert}</span>`)
      .join("");
  }
  selectedLockerStats.innerHTML = [
    { label: "Temperature", value: formatTemperature(locker.temperature) },
    { label: "Lock state", value: formatLock(locker.lock_state) },
    { label: "Door state", value: formatDoor(locker.door) },
    { label: "Package status", value: formatPackage(locker.has_package) },
    { label: "ĐIểm độ rung (%)", value: formatPercent(locker.vibration_score) },
    { label: "FSR pressure", value: formatPercent(locker.fsr_percent) },
    { label: "Signal strength", value: formatSignal(locker.rssi) },
    { label: "Security severity", value: formatSeverity(locker.alert_severity) },
    { label: "Last command", value: locker.latest_command_status || "No command yet" },
    { label: "Last warning", value: locker.last_warning || "No warning logged" }
  ]
    .map(
      (item) => `
        <div class="focus-stat">
          <span>${item.label}</span>
          <strong>${item.value}</strong>
        </div>
      `
    )
    .join("");

  commandStatus.textContent = locker.latest_command_status || "idle";
  deviceHealthStats.innerHTML = [
    { label: "Signal", value: formatSignal(locker.rssi) },
    { label: "Battery", value: formatPercent(locker.battery_percent) },
    { label: "Uptime", value: typeof locker.uptime_ms === "number" ? `${Math.floor(locker.uptime_ms / 1000)}s` : "N/A" },
    { label: "Last seen", value: formatTimeShort(locker.timestamp) }
  ].map((item) => `
    <div>
      <span>${item.label}</span>
      <strong>${item.value}</strong>
    </div>
  `).join("");
}

function renderForecast(forecast) {
  if (!forecast) {
    forecastSummary.innerHTML = '<div class="empty-state">Forecast is not available yet.</div>';
    forecastGrid.innerHTML = "";
    forecastFeatures.innerHTML = "";
    return;
  }

  forecastModelLabel.textContent = forecast.model_type === "mock-trained-logistic-regression"
    ? "Mock-trained baseline"
    : forecast.model_type;

  const firstEmptyForecast = forecast.forecasts.find((item) => item.empty === 1);
  forecastSummary.innerHTML = firstEmptyForecast
    ? `<strong>Likely free in ${firstEmptyForecast.hours_ahead}h</strong><span>First horizon predicted empty</span>`
    : "<strong>Likely occupied for 5h</strong><span>All forecast horizons predict package present</span>";

  forecastGrid.innerHTML = forecast.forecasts.map((item) => `
    <article class="forecast-card ${item.has_package === 1 ? "occupied" : "empty"}">
      <span>+${item.hours_ahead}h</span>
      <strong>${item.has_package === 1 ? "Có đồ" : "Trống"}</strong>
      <em>${Math.round(item.probability_has_package * 100)}% có đồ</em>
    </article>
  `).join("");

  const features = forecast.features;
  forecastFeatures.innerHTML = [
    ["State duration", `${features.state_duration_minutes} phút`],
    ["Activity 12h", features.rolling_activity_12h],
    ["Activity 24h", features.rolling_activity_24h],
    ["Lag 1h / 2h / 3h", `${features.lag_1h} / ${features.lag_2h} / ${features.lag_3h}`],
    ["Temperature", `${features.temperature_c}C`],
    ["Day / hour", `${features.day_of_week} / ${features.hour_of_day}:00`]
  ].map(([label, value]) => `
    <div>
      <span>${label}</span>
      <strong>${value}</strong>
    </div>
  `).join("");
}

function renderTelemetry(history, locker) {
  if (!locker || history.length === 0) {
    chartArea.innerHTML = '<div class="empty-state">No historical telemetry available for this locker yet.</div>';
    return;
  }

  const samples = [...history].reverse();
  const labels = samples.map((entry) => formatTimeShort(entry.timestamp));
  const temperatures = samples.map((entry) => typeof entry.temperature === "number" ? entry.temperature : 0);
  const fsr = samples.map((entry) => typeof entry.fsr_percent === "number" ? entry.fsr_percent : 0);
  const width = 720;
  const height = 260;
  const padding = 28;
  const tempMin = Math.min(...temperatures) - 2;
  const tempMax = Math.max(...temperatures) + 2;
  const x = (index) => padding + (index / Math.max(samples.length - 1, 1)) * (width - padding * 2);
  const tempY = (value) => height - padding - ((value - tempMin) / Math.max(tempMax - tempMin, 1)) * (height - padding * 2);
  const fsrY = (value) => height - padding - (value / 100) * (height - padding * 2);

  chartArea.innerHTML = `
    <div class="chart-head">
      <div>
        <p class="section-label">Telemetry Curve</p>
        <h3>Temperature and FSR trend</h3>
      </div>
      <div class="chart-legend">
        <span><i class="legend-dot temp"></i>Temperature</span>
        <span><i class="legend-dot package"></i>FSR</span>
        <span><i class="legend-dot door"></i>Vibration</span>
      </div>
    </div>
    <div class="chart-scroll">
      <svg viewBox="0 0 ${width} ${height}" class="trend-chart" aria-label="Telemetry trend chart">
        <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" class="chart-grid-line" />
        <polyline points="${temperatures.map((value, index) => `${x(index)},${tempY(value)}`).join(" ")}" class="chart-line temperature" />
        <polyline points="${fsr.map((value, index) => `${x(index)},${fsrY(value)}`).join(" ")}" class="chart-line fsr" />
        ${samples.map((entry, index) => entry.vibration_score >= 70
    ? `<circle cx="${x(index)}" cy="${fsrY(entry.vibration_score)}" r="6" class="chart-point danger" />`
    : ""
  ).join("")}
      </svg>
    </div>
    <div class="axis-row"><span>${labels[0]}</span><span>${labels[labels.length - 1]}</span></div>
    <div class="timeline-strip" id="timelineStrip"></div>
  `;

  document.getElementById("timelineStrip").innerHTML = samples.map((entry) => {
    const classes = ["timeline-chip"];
    if (entry.vibration_score >= 70) classes.push("is-tamper");
    else if (entry.temperature > 35) classes.push("is-hot");
    else if (entry.door === 1) classes.push("is-door");
    else if (entry.has_package === 1) classes.push("is-package");

    return `
      <span class="${classes.join(" ")}">
        ${formatTimeShort(entry.timestamp)} - ${formatTemperature(entry.temperature)} - ${entry.door === 1 ? "Door open" : "Door closed"} - ${formatLock(entry.lock_state)} - FSR ${formatPercent(entry.fsr_percent)}
      </span>
    `;
  }).join("");
}

function renderAlerts(alerts) {
  const openAlerts = alerts.filter((alert) => !alert.acknowledged);
  const criticalOpen = openAlerts.filter((alert) => alert.severity === "critical").length;
  const warningOpen = openAlerts.filter((alert) => alert.severity === "warning").length;
  const acknowledged = alerts.filter((alert) => alert.acknowledged).length;

  incidentSummary.innerHTML = [
    ["Open incidents", openAlerts.length],
    ["Critical open", criticalOpen],
    ["Warnings open", warningOpen],
    ["Acknowledged", acknowledged]
  ].map(([label, value]) => `
    <article>
      <span>${label}</span>
      <strong>${value}</strong>
    </article>
  `).join("");

  securityTimeline.innerHTML = alerts.length ? alerts.map((alert) => `
    <article class="timeline-event ${alert.severity} ${alert.acknowledged ? "is-acknowledged" : ""}">
      <span>${alert.severity}</span>
      <div>
        <strong>${alert.type}</strong>
        <p>${alert.message}</p>
      </div>
      <div class="timeline-meta">
        <time>${formatTime(alert.timestamp)}</time>
        ${alert.acknowledged
      ? '<em>Acknowledged</em>'
      : `<button type="button" data-ack-alert="${alert._id}">Acknowledge</button>`}
      </div>
    </article>
  `).join("") : '<div class="empty-state">No alerts match the current filters.</div>';
}

async function fetchJson(path, options) {
  const response = await fetch(path, options);
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return response.json();
}

async function loadHistory(lockerId) {
  const history = await fetchJson(`/history/${lockerId}?limit=24`);

  if (lockerId === 1) {
    // Chỉ đếm các rung động trong vòng 15 giây qua để tránh kẹt mãi mãi (do ESP chỉ gửi khi có rung)
    const recentHistory = history.filter(h => (Date.now() - new Date(h.timestamp).getTime()) <= 15000);
    const totalVibrations = recentHistory.reduce((sum, h) => sum + (h.vibration_count || 0), 0);
    state.lastVibCount = totalVibrations;

    const isTheft = totalVibrations > 150;

    const text = isTheft ? `Theft detected (${totalVibrations})` : `Bình thường 1 (${totalVibrations})`;
    const bg = isTheft ? "#ef4444" : "#10b981";
    selectedLockerAlerts.innerHTML = `<span class="alert-pill" style="background: ${bg}; color: white; font-weight: bold; border: none;">${text}</span>`;
  }

  renderHistory(history);
  renderTelemetry(
    history,
    state.lockers.find((locker) => locker.locker_id === lockerId)
  );
  return history;
}

async function loadAlerts(lockerId) {
  const params = new URLSearchParams({ locker_id: lockerId, limit: 30 });
  if (!["all", "actionable"].includes(severityFilter.value)) {
    params.set("severity", severityFilter.value);
  }
  if (ackFilter.value !== "all") {
    params.set("acknowledged", ackFilter.value === "acknowledged" ? "true" : "false");
  }

  const alerts = await fetchJson(`/alerts?${params.toString()}`);
  state.alerts = severityFilter.value === "actionable"
    ? alerts.filter((alert) => alert.severity !== "info")
    : alerts;
  renderAlerts(state.alerts);
}

async function loadForecast(lockerId) {
  const forecast = await fetchJson(`/forecast/${lockerId}`);
  renderForecast(forecast);
}

function syncHistorySelect(lockers) {
  const currentValue = historySelect.value;
  historySelect.innerHTML = lockers
    .map((locker) => `<option value="${locker.locker_id}">Locker ${locker.locker_id}</option>`)
    .join("");

  if (currentValue && lockers.some((locker) => String(locker.locker_id) === currentValue)) {
    historySelect.value = currentValue;
  }
}

async function refreshDashboard() {
  try {
    const lockers = await fetchJson("/lockers");
    state.lockers = lockers;

    if (!state.selectedLockerId && lockers.length > 0) {
      state.selectedLockerId = lockers[0].locker_id;
    }

    if (
      state.selectedLockerId &&
      !lockers.some((locker) => locker.locker_id === state.selectedLockerId)
    ) {
      state.selectedLockerId = lockers.length > 0 ? lockers[0].locker_id : null;
    }

    renderOverview(lockers);
    syncHistorySelect(lockers);

    if (state.selectedLockerId) {
      historySelect.value = String(state.selectedLockerId);
    }

    renderLockers(lockers);

    if (lockers.length > 0) {
      const selectedLocker = lockers.find((locker) => locker.locker_id === state.selectedLockerId);
      renderSelectedLocker(selectedLocker);
      await Promise.all([
        loadHistory(state.selectedLockerId),
        loadAlerts(state.selectedLockerId),
        loadForecast(state.selectedLockerId)
      ]);
      lastUpdatedLabel.textContent = `Last sync ${new Date().toLocaleTimeString()}`;
    } else {
      historyTableBody.innerHTML =
        '<tr><td colspan="7">History will appear after the first MQTT messages arrive.</td></tr>';
      lastUpdatedLabel.textContent = "Awaiting first update";
    }
  } catch (error) {
    overviewStats.innerHTML = "";
    renderEmptyState(`Failed to load dashboard data: ${error.message}`);
    historyTableBody.innerHTML =
      '<tr><td colspan="7">Unable to fetch history while the backend is unavailable.</td></tr>';
    lastUpdatedLabel.textContent = "Backend unavailable";
  }
}

lockerGrid.addEventListener("click", async (event) => {
  const card = event.target.closest("[data-locker-id]");
  if (!card) {
    return;
  }

  state.selectedLockerId = Number(card.dataset.lockerId);
  historySelect.value = String(state.selectedLockerId);
  renderLockers(state.lockers);
  renderSelectedLocker(state.lockers.find((locker) => locker.locker_id === state.selectedLockerId));

  try {
    await Promise.all([
      loadHistory(state.selectedLockerId),
      loadAlerts(state.selectedLockerId),
      loadForecast(state.selectedLockerId)
    ]);
  } catch (error) {
    historyTableBody.innerHTML = `<tr><td colspan="7">${error.message}</td></tr>`;
  }
});

historySelect.addEventListener("change", async () => {
  if (!historySelect.value) {
    return;
  }

  state.selectedLockerId = Number(historySelect.value);
  renderLockers(state.lockers);
  renderSelectedLocker(state.lockers.find((locker) => locker.locker_id === state.selectedLockerId));

  try {
    await Promise.all([
      loadHistory(state.selectedLockerId),
      loadAlerts(state.selectedLockerId),
      loadForecast(state.selectedLockerId)
    ]);
  } catch (error) {
    historyTableBody.innerHTML = `<tr><td colspan="7">${error.message}</td></tr>`;
  }
});

refreshButton.addEventListener("click", () => {
  refreshDashboard();
});

document.querySelector(".control-grid").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-command]");
  if (!button || !state.selectedLockerId) return;
  commandStatus.textContent = "pending";
  const action = button.dataset.command;
  await fetchJson(`/locker/${state.selectedLockerId}/command`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action,
      duration_ms: action === "unlock" ? 3000 : undefined
    })
  });
});

severityFilter.addEventListener("change", () => {
  if (state.selectedLockerId) loadAlerts(state.selectedLockerId);
});

ackFilter.addEventListener("change", () => {
  if (state.selectedLockerId) loadAlerts(state.selectedLockerId);
});

securityTimeline.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-ack-alert]");
  if (!button) return;
  button.disabled = true;
  await fetchJson(`/alerts/${button.dataset.ackAlert}/acknowledge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ acknowledged_by: "demo" })
  });
  await loadAlerts(state.selectedLockerId);
});

const socket = io();

socket.on("telemetry_update", async (data) => {
  const lockerState = data.state;

  const index = state.lockers.findIndex((locker) => locker.locker_id === lockerState.locker_id);
  if (index >= 0) {
    state.lockers[index] = lockerState;
  } else {
    state.lockers.push(lockerState);
    syncHistorySelect(state.lockers);
  }

  renderOverview(state.lockers);
  renderLockers(state.lockers);

  if (lockerState.locker_id === state.selectedLockerId) {
    renderSelectedLocker(lockerState);
    await Promise.all([loadHistory(state.selectedLockerId), loadForecast(state.selectedLockerId)]);
  }

  lastUpdatedLabel.textContent = `Live update at ${new Date().toLocaleTimeString()}`;
});

socket.on("alert_created", () => {
  refreshDashboard();
});

socket.on("command_updated", () => {
  refreshDashboard();
});

refreshDashboard();

// Tự động reload dashboard mỗi 4 giây
setInterval(() => {
  refreshDashboard();
}, 4000);
