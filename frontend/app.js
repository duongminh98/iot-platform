const overviewStats = document.getElementById("overviewStats");
const lockerGrid = document.getElementById("lockerGrid");
const historySelect = document.getElementById("historySelect");
const historyTableBody = document.getElementById("historyTableBody");
const refreshButton = document.getElementById("refreshButton");
const selectedLockerTitle = document.getElementById("selectedLockerTitle");
const selectedLockerMeta = document.getElementById("selectedLockerMeta");
const selectedLockerAlerts = document.getElementById("selectedLockerAlerts");
const selectedLockerStats = document.getElementById("selectedLockerStats");
const chartArea = document.getElementById("chartArea");
const lastUpdatedLabel = document.getElementById("lastUpdatedLabel");

const state = {
  lockers: [],
  selectedLockerId: null
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
              <dt>Vibration</dt>
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
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
    return;
  }

  selectedLockerTitle.textContent = `Locker ${locker.locker_id}`;
  selectedLockerMeta.textContent =
    `Latest sample received at ${formatTime(locker.timestamp)}. Current operational state and recent history are shown here.`;

  const alerts = Array.isArray(locker.alerts) && locker.alerts.length > 0 ? locker.alerts : ["normal"];
  selectedLockerAlerts.innerHTML = alerts
    .map((alert) => `<span class="alert-pill">${alert}</span>`)
    .join("");

  selectedLockerStats.innerHTML = [
    { label: "Temperature", value: formatTemperature(locker.temperature) },
    { label: "Lock state", value: formatLock(locker.lock_state) },
    { label: "Door state", value: formatDoor(locker.door) },
    { label: "Package status", value: formatPackage(locker.has_package) },
    { label: "Vibration score", value: formatPercent(locker.vibration_score) },
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
}

let chartInstance = null;

function renderTelemetry(history, locker) {
  if (!locker || history.length === 0) {
    chartArea.innerHTML = '<div class="empty-state">No historical telemetry available for this locker yet.</div>';
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
    return;
  }

  const samples = [...history].reverse();
  const labels = samples.map((entry) => formatTimeShort(entry.timestamp));
  const temperatureData = samples.map((entry) => entry.temperature);
  const fsrData = samples.map((entry) => entry.fsr_percent);
  const numericValues = [...temperatureData, ...fsrData].filter((value) => typeof value === "number");

  if (!chartArea.querySelector("canvas")) {
    chartArea.innerHTML = `
      <div class="chart-head">
        <div>
          <p class="section-label">Telemetry Curve</p>
          <h3>Temperature and FSR trend</h3>
        </div>
      </div>
      <div class="chart-scroll" style="position: relative; height: 320px; width: 100%;">
        <canvas id="telemetryChart"></canvas>
      </div>
      <div class="timeline-strip" id="timelineStrip"></div>
    `;
  }

  const timelineStrip = document.getElementById("timelineStrip");
  if (timelineStrip) {
    timelineStrip.innerHTML = samples.map((entry) => {
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

  const ctx = document.getElementById("telemetryChart").getContext("2d");

  if (chartInstance) {
    chartInstance.data.labels = labels;
    chartInstance.data.datasets[0].data = temperatureData;
    chartInstance.data.datasets[1].data = fsrData;
    chartInstance.data.datasets[0].pointRadius = samples.map((s) => s.temperature > 35 ? 6 : 3);
    chartInstance.data.datasets[0].pointBackgroundColor = samples.map((s) => s.temperature > 35 ? "#ef4444" : "#3b82f6");
    chartInstance.data.datasets[1].pointRadius = samples.map((s) => s.vibration_score >= 70 ? 6 : 3);
    chartInstance.data.datasets[1].pointBackgroundColor = samples.map((s) => s.vibration_score >= 70 ? "#ef4444" : "#20c7bd");
    chartInstance.update();
  } else {
    chartInstance = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [{
          label: "Temperature (C)",
          data: temperatureData,
          borderColor: "#3b82f6",
          backgroundColor: "rgba(59, 130, 246, 0.1)",
          fill: true,
          tension: 0.4,
          pointRadius: samples.map((s) => s.temperature > 35 ? 6 : 3),
          pointBackgroundColor: samples.map((s) => s.temperature > 35 ? "#ef4444" : "#3b82f6")
        }, {
          label: "FSR pressure (%)",
          data: fsrData,
          borderColor: "#20c7bd",
          backgroundColor: "rgba(32, 199, 189, 0.08)",
          fill: false,
          tension: 0.35,
          pointRadius: samples.map((s) => s.vibration_score >= 70 ? 6 : 3),
          pointBackgroundColor: samples.map((s) => s.vibration_score >= 70 ? "#ef4444" : "#20c7bd")
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          tooltip: {
            mode: "index",
            intersect: false
          }
        },
        scales: {
          y: {
            suggestedMin: numericValues.length ? Math.min(...numericValues) - 5 : 0,
            suggestedMax: numericValues.length ? Math.max(...numericValues) + 5 : 100
          }
        },
        animation: {
          duration: 400
        }
      }
    });
  }
}

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return response.json();
}

async function loadHistory(lockerId) {
  const history = await fetchJson(`/history/${lockerId}?limit=24`);
  renderHistory(history);
  renderTelemetry(
    history,
    state.lockers.find((locker) => locker.locker_id === lockerId)
  );
  return history;
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
      await loadHistory(state.selectedLockerId);
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
    await loadHistory(state.selectedLockerId);
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
    await loadHistory(state.selectedLockerId);
  } catch (error) {
    historyTableBody.innerHTML = `<tr><td colspan="7">${error.message}</td></tr>`;
  }
});

refreshButton.addEventListener("click", () => {
  refreshDashboard();
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
    await loadHistory(state.selectedLockerId);
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
