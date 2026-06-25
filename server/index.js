/**
 * index.js
 * Express server for Digital Twin Smart Classroom
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import {
  calculateNextRoomTemp,
  generateHeatmap,
  calculateComfortScore,
  calculateEnergyScore,
  runWhatIfSimulation,
  generateRecommendation
} from './simulation.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// In-memory state
let currentScenario = 'normal_room';
let state = {
  scenario: 'normal_room',
  room_temp: 24.5,
  humidity: 50,
  occupancy_count: 12,
  outside_temp: 30,
  ac_status: 'ON',
  ac_setpoint: 24
};

let history = [];

// Helper to initialize scenario state and pre-populate history
function initScenario(scenarioName) {
  let config = {
    room_temp: 24.5,
    humidity: 50,
    occupancy_count: 12,
    outside_temp: 30,
    ac_status: 'ON',
    ac_setpoint: 24
  };

  switch (scenarioName) {
    case 'crowded_room':
      config = {
        room_temp: 26.2,
        humidity: 65,
        occupancy_count: 28,
        outside_temp: 30,
        ac_status: 'ON',
        ac_setpoint: 22
      };
      break;
    case 'hot_outside':
      config = {
        room_temp: 27.5,
        humidity: 45,
        occupancy_count: 8,
        outside_temp: 38,
        ac_status: 'ON',
        ac_setpoint: 23
      };
      break;
    case 'energy_saving':
      config = {
        room_temp: 25.8,
        humidity: 50,
        occupancy_count: 5,
        outside_temp: 31,
        ac_status: 'ON',
        ac_setpoint: 26
      };
      break;
  }

  currentScenario = scenarioName;
  state = {
    scenario: scenarioName,
    ...config
  };

  // Pre-populate history with 50 entries
  history = [];
  const now = Date.now();
  let temp = state.room_temp - 1.5; // lead-in drift
  for (let i = 49; i >= 0; i--) {
    temp = calculateNextRoomTemp(
      temp,
      state.outside_temp,
      state.occupancy_count,
      state.ac_status,
      state.ac_setpoint,
      state.humidity,
      true
    );
    // HH:MM:SS format
    const timeStr = new Date(now - i * 15000).toLocaleTimeString();
    history.push({
      time: timeStr,
      room_temp: Number(temp.toFixed(1)),
      humidity: Math.round(state.humidity + (Math.random() * 4 - 2)),
      occupancy_count: state.occupancy_count
    });
  }
}

// Initial setup
initScenario('normal_room');

// Background updates to simulate continuous real-time telemetry (every 3s)
setInterval(() => {
  state.room_temp = calculateNextRoomTemp(
    state.room_temp,
    state.outside_temp,
    state.occupancy_count,
    state.ac_status,
    state.ac_setpoint,
    state.humidity,
    true
  );

  const timeStr = new Date().toLocaleTimeString();
  history.push({
    time: timeStr,
    room_temp: Number(state.room_temp.toFixed(1)),
    humidity: Math.round(state.humidity + (Math.random() * 2 - 1)),
    occupancy_count: state.occupancy_count
  });

  if (history.length > 50) {
    history.shift();
  }
}, 3000);

// Helper to compile current response payload with scores & cell telemetry
function getCurrentPayload() {
  const { grid, hottest, coolest } = generateHeatmap(
    state.room_temp,
    state.outside_temp,
    state.occupancy_count,
    state.ac_status,
    state.ac_setpoint,
    state.humidity,
    false
  );

  const comfort_score = calculateComfortScore(state.room_temp, hottest.temp, coolest.temp, state.humidity);
  const energy_score = calculateEnergyScore(state.ac_status, state.ac_setpoint, state.outside_temp, state.room_temp);

  return {
    ...state,
    comfort_status: comfort_score >= 80 ? 'Comfortable' : comfort_score >= 60 ? 'Acceptable' : 'Uncomfortable',
    comfort_score,
    energy_score,
    hottest_cell: hottest,
    coolest_cell: coolest
  };
}

// API Routes
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'smart-classroom-digital-twin',
    scenario: currentScenario,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/twin/current', (req, res) => {
  res.json(getCurrentPayload());
});

app.get('/api/twin/history', (req, res) => {
  res.json(history);
});

app.get('/api/twin/heatmap', (req, res) => {
  const { grid, hottest, coolest } = generateHeatmap(
    state.room_temp,
    state.outside_temp,
    state.occupancy_count,
    state.ac_status,
    state.ac_setpoint,
    state.humidity,
    true
  );
  res.json({ grid, hottest, coolest });
});

app.get('/api/twin/prediction', (req, res) => {
  // Simulate 10, 20, 30 min prediction
  let temp10 = state.room_temp;
  for (let i = 0; i < 10; i++) {
    temp10 = calculateNextRoomTemp(temp10, state.outside_temp, state.occupancy_count, state.ac_status, state.ac_setpoint, state.humidity, false);
  }
  let temp20 = temp10;
  for (let i = 0; i < 10; i++) {
    temp20 = calculateNextRoomTemp(temp20, state.outside_temp, state.occupancy_count, state.ac_status, state.ac_setpoint, state.humidity, false);
  }
  let temp30 = temp20;
  for (let i = 0; i < 10; i++) {
    temp30 = calculateNextRoomTemp(temp30, state.outside_temp, state.occupancy_count, state.ac_status, state.ac_setpoint, state.humidity, false);
  }

  let trend = 'stable';
  const diff = temp30 - state.room_temp;
  if (diff > 0.2) {
    trend = 'warming';
  } else if (diff < -0.2) {
    trend = 'cooling';
  }

  const { grid: predictedGrid } = generateHeatmap(temp30, state.outside_temp, state.occupancy_count, state.ac_status, state.ac_setpoint, state.humidity, false);

  res.json({
    prediction_10m: Number(temp10.toFixed(2)),
    prediction_20m: Number(temp20.toFixed(2)),
    prediction_30m: Number(temp30.toFixed(2)),
    trend,
    predicted_heatmap_30m: predictedGrid
  });
});

app.get('/api/twin/what-if', (req, res) => {
  const whatIfResults = runWhatIfSimulation(state.room_temp, state.outside_temp, state.occupancy_count, state.humidity);
  res.json(whatIfResults);
});

app.get('/api/twin/recommendation', (req, res) => {
  const whatIfResults = runWhatIfSimulation(state.room_temp, state.outside_temp, state.occupancy_count, state.humidity);
  const rec = generateRecommendation(whatIfResults, state.occupancy_count);
  res.json(rec);
});

app.post('/api/scenario', (req, res) => {
  const { scenario } = req.body;
  if (!['normal_room', 'crowded_room', 'hot_outside', 'energy_saving'].includes(scenario)) {
    return res.status(400).json({ error: 'Invalid scenario type' });
  }
  initScenario(scenario);
  res.json({ message: `Scenario switched to ${scenario}`, current: getCurrentPayload() });
});

app.post('/api/ac', (req, res) => {
  const { ac_status, ac_setpoint } = req.body;
  if (ac_status !== undefined) {
    state.ac_status = ac_status;
  }
  if (ac_setpoint !== undefined) {
    state.ac_setpoint = Number(ac_setpoint);
  }
  res.json({ message: 'AC settings updated', current: getCurrentPayload() });
});

// Serve built client in production
const distPath = path.join(__dirname, '../dist');
app.use(express.static(distPath));

// Fallback all other routes to single page app index.html
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(distPath, 'index.html'));
});

// Port configuration
// In development, run Express on port 3001. In production/Docker, use PORT or default to 8080.
const PORT = process.env.PORT || (process.env.NODE_ENV === 'production' ? 8080 : 3001);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Express server running on port ${PORT}`);
});
