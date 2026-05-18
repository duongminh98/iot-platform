const LockerReading = require("../models/LockerReading");
const LockerState = require("../models/LockerState");

const HORIZONS = [1, 2, 3, 4, 5];
const HISTORY_WINDOW_HOURS = 24;
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

function sigmoid(value) {
  return 1 / (1 + Math.exp(-value));
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function seededRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function encodeFeatures(features) {
  return [
    1,
    clamp(features.state_duration_minutes / (24 * 60), 0, 2),
    clamp(features.rolling_activity_12h / 24, 0, 2),
    clamp(features.rolling_activity_24h / 48, 0, 2),
    features.lag_1h,
    features.lag_2h,
    features.lag_3h,
    clamp((features.temperature_c - 20) / 20, -1, 2),
    Math.sin((2 * Math.PI * features.day_of_week) / 7),
    Math.cos((2 * Math.PI * features.day_of_week) / 7),
    Math.sin((2 * Math.PI * features.hour_of_day) / 24),
    Math.cos((2 * Math.PI * features.hour_of_day) / 24)
  ];
}

function generateMockExample(random) {
  const hour = Math.floor(random() * 24);
  const day = Math.floor(random() * 7);
  const lag1 = random() > 0.48 ? 1 : 0;
  const lag2 = random() > (lag1 ? 0.35 : 0.6) ? 1 : 0;
  const lag3 = random() > (lag2 ? 0.35 : 0.62) ? 1 : 0;
  const rolling12h = Math.floor(random() * 12);
  const rolling24h = rolling12h + Math.floor(random() * 12);
  const stateDuration = Math.floor(random() * 18 * 60);
  const temperature = 24 + random() * 14;

  return {
    state_duration_minutes: stateDuration,
    rolling_activity_12h: rolling12h,
    rolling_activity_24h: rolling24h,
    lag_1h: lag1,
    lag_2h: lag2,
    lag_3h: lag3,
    temperature_c: temperature,
    day_of_week: day,
    hour_of_day: hour
  };
}

function mockFutureProbability(features, horizon) {
  const lagSignal = features.lag_1h * 1.15 + features.lag_2h * 0.8 + features.lag_3h * 0.55;
  const officeHourBoost = features.hour_of_day >= 8 && features.hour_of_day <= 18 ? 0.35 : -0.2;
  const weekdayBoost = features.day_of_week >= 1 && features.day_of_week <= 5 ? 0.18 : -0.12;
  const persistence = Math.min(features.state_duration_minutes / 240, 1.6);
  const activityPenalty = features.rolling_activity_12h * 0.06;
  const heatPenalty = Math.max(features.temperature_c - 34, 0) * 0.03;
  const horizonDecay = horizon * 0.18;
  return sigmoid(-1.05 + lagSignal + officeHourBoost + weekdayBoost + persistence - activityPenalty - heatPenalty - horizonDecay);
}

function trainLogisticRegression(examples, labels) {
  const weights = Array(12).fill(0);
  const learningRate = 0.18;
  const iterations = 550;

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const gradient = Array(weights.length).fill(0);

    examples.forEach((example, index) => {
      const vector = encodeFeatures(example);
      const prediction = sigmoid(vector.reduce((sum, value, featureIndex) => sum + value * weights[featureIndex], 0));
      const error = prediction - labels[index];
      vector.forEach((value, featureIndex) => {
        gradient[featureIndex] += error * value;
      });
    });

    weights.forEach((_, index) => {
      weights[index] -= (learningRate * gradient[index]) / examples.length;
    });
  }

  return weights;
}

function computeRocAuc(probabilities, labels) {
  const positives = labels.filter((label) => label === 1).length;
  const negatives = labels.length - positives;
  if (positives === 0 || negatives === 0) {
    return null;
  }

  const ranked = probabilities
    .map((probability, index) => ({ probability, label: labels[index] }))
    .sort((left, right) => left.probability - right.probability);

  let rankSum = 0;
  ranked.forEach((entry, index) => {
    if (entry.label === 1) {
      rankSum += index + 1;
    }
  });

  return (rankSum - (positives * (positives + 1)) / 2) / (positives * negatives);
}

function evaluateModel(weights, examples, labels) {
  const probabilities = examples.map((example) => {
    const vector = encodeFeatures(example);
    return sigmoid(vector.reduce((sum, value, index) => sum + value * weights[index], 0));
  });
  const predictions = probabilities.map((probability) => (probability >= 0.5 ? 1 : 0));

  const confusion = predictions.reduce(
    (counts, prediction, index) => {
      const label = labels[index];
      if (prediction === 1 && label === 1) counts.true_positive += 1;
      if (prediction === 1 && label === 0) counts.false_positive += 1;
      if (prediction === 0 && label === 1) counts.false_negative += 1;
      if (prediction === 0 && label === 0) counts.true_negative += 1;
      return counts;
    },
    {
      true_positive: 0,
      false_positive: 0,
      false_negative: 0,
      true_negative: 0
    }
  );

  const total = labels.length;
  const precision = confusion.true_positive / Math.max(confusion.true_positive + confusion.false_positive, 1);
  const recall = confusion.true_positive / Math.max(confusion.true_positive + confusion.false_negative, 1);
  const f1 = (2 * precision * recall) / Math.max(precision + recall, Number.EPSILON);
  const brierScore = probabilities.reduce(
    (sum, probability, index) => sum + (probability - labels[index]) ** 2,
    0
  ) / total;

  return {
    sample_count: total,
    accuracy: Number(
      ((confusion.true_positive + confusion.true_negative) / total).toFixed(3)
    ),
    precision: Number(precision.toFixed(3)),
    recall: Number(recall.toFixed(3)),
    f1: Number(f1.toFixed(3)),
    roc_auc: Number(computeRocAuc(probabilities, labels).toFixed(3)),
    brier_score: Number(brierScore.toFixed(3)),
    confusion_matrix: confusion
  };
}

function trainMockModels() {
  const random = seededRandom(20260518);
  const examples = Array.from({ length: 1200 }, () => generateMockExample(random));
  const trainExamples = examples.slice(0, 960);
  const testExamples = examples.slice(960);

  const models = {};
  const evaluation = {};

  HORIZONS.forEach((horizon) => {
    const labels = examples.map((example) => (random() < mockFutureProbability(example, horizon) ? 1 : 0));
    const trainLabels = labels.slice(0, 960);
    const testLabels = labels.slice(960);
    const weights = trainLogisticRegression(trainExamples, trainLabels);
    models[horizon] = weights;
    evaluation[horizon] = evaluateModel(weights, testExamples, testLabels);
  });

  return {
    models,
    evaluation: {
      model_type: "mock-trained-logistic-regression",
      dataset_type: "synthetic",
      train_sample_count: trainExamples.length,
      test_sample_count: testExamples.length,
      split_ratio: "80/20",
      horizons: HORIZONS.map((hours_ahead) => ({
        hours_ahead,
        ...evaluation[hours_ahead]
      }))
    }
  };
}

const mockTrainingRun = trainMockModels();
const mockModels = mockTrainingRun.models;

function predictProbability(features, horizon) {
  const vector = encodeFeatures(features);
  const weights = mockModels[horizon];
  return sigmoid(vector.reduce((sum, value, index) => sum + value * weights[index], 0));
}

function findStateAtOrBefore(historyAscending, targetTime, fallback) {
  let candidate = null;
  historyAscending.forEach((entry) => {
    if (new Date(entry.timestamp).getTime() <= targetTime) {
      candidate = entry;
    }
  });
  return candidate?.has_package ?? fallback;
}

function countTransitions(historyAscending, cutoff) {
  let transitions = 0;
  let previous = null;

  historyAscending.forEach((entry) => {
    const timestamp = new Date(entry.timestamp).getTime();
    if (timestamp < cutoff || entry.has_package === null || typeof entry.has_package === "undefined") {
      return;
    }
    if (previous !== null && previous !== entry.has_package) {
      transitions += 1;
    }
    previous = entry.has_package;
  });

  return transitions;
}

function computeStateDurationMinutes(historyAscending, currentState, now) {
  let stateSince = now;

  for (let index = historyAscending.length - 1; index >= 0; index -= 1) {
    const entry = historyAscending[index];
    if (entry.has_package === null || typeof entry.has_package === "undefined") {
      continue;
    }
    if (entry.has_package !== currentState) {
      break;
    }
    stateSince = new Date(entry.timestamp).getTime();
  }

  return Math.max(0, Math.round((now - stateSince) / MINUTE));
}

async function buildForecast(lockerId) {
  const locker = await LockerState.findOne({ locker_id: lockerId }).lean();
  if (!locker) {
    const error = new Error("Locker not found.");
    error.statusCode = 404;
    throw error;
  }

  const now = Date.now();
  const history = await LockerReading.find({
    locker_id: lockerId,
    timestamp: { $gte: new Date(now - HISTORY_WINDOW_HOURS * HOUR) }
  })
    .sort({ timestamp: 1 })
    .lean();

  const currentState = locker.has_package ?? history.at(-1)?.has_package ?? 0;
  const features = {
    state_duration_minutes: computeStateDurationMinutes(history, currentState, now),
    rolling_activity_12h: countTransitions(history, now - 12 * HOUR),
    rolling_activity_24h: countTransitions(history, now - 24 * HOUR),
    lag_1h: findStateAtOrBefore(history, now - 1 * HOUR, currentState),
    lag_2h: findStateAtOrBefore(history, now - 2 * HOUR, currentState),
    lag_3h: findStateAtOrBefore(history, now - 3 * HOUR, currentState),
    temperature_c: typeof locker.temperature === "number" ? locker.temperature : 25,
    day_of_week: new Date(now).getDay(),
    hour_of_day: new Date(now).getHours()
  };

  return {
    locker_id: lockerId,
    generated_at: new Date(now),
    model_type: "mock-trained-logistic-regression",
    features,
    forecasts: HORIZONS.map((hours_ahead) => {
      const probability = predictProbability(features, hours_ahead);
      return {
        hours_ahead,
        has_package: probability >= 0.5 ? 1 : 0,
        empty: probability >= 0.5 ? 0 : 1,
        probability_has_package: Number(probability.toFixed(3))
      };
    })
  };
}

function getModelEvaluation() {
  return mockTrainingRun.evaluation;
}

module.exports = {
  buildForecast,
  getModelEvaluation
};
