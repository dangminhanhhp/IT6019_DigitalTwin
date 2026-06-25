# Smart Classroom Digital Twin

A full-stack web prototype for a **Digital Twin-based Smart Classroom Environment Optimization** project. The app simulates classroom telemetry, visualizes a 5x5 2D thermal heatmap, predicts near-future room temperature, compares AC setpoint options, and recommends an AC configuration based on a comfort-energy trade-off.

The prototype intentionally uses **simulated data** and **in-memory state** only. It does not require IoT hardware or a database.

---

## Key Features

- **Current Room Status**: average temperature, humidity, outside temperature, occupancy, AC status, AC setpoint, comfort score, energy score, hottest area, and coolest area.
- **2D Thermal Heatmap**: a 5x5 room grid showing local temperature differences.
- **Digital Twin Simulation**: room-level and cell-level formulas model the effect of outside heat, occupancy heat, AC cooling, and humidity.
- **Prediction**: 10, 20, and 30-minute temperature forecast.
- **What-if Setpoint Simulation**: compares AC setpoints 24°C, 25°C, 26°C, and 27°C.
- **Comfort-Energy Recommendation**: recommends a setpoint using `total_score = comfort_score * 0.65 + energy_score * 0.35`.
- **Scenario Control**: normal room, crowded room, hot outside, and energy saving mode.
- **No Database**: uses in-memory state/history for fast classroom-demo setup.

---

## Tech Stack

- React + Vite
- TypeScript
- Tailwind CSS
- Recharts
- Node.js + Express
- In-memory simulator, no database
- Docker-ready for Google Cloud Run

---

## Project Structure

```text
smart-classroom-digital-twin/
├── Dockerfile
├── README.md
├── package.json
├── server/
│   ├── index.js
│   └── simulation.js
├── src/
│   ├── App.tsx
│   ├── index.css
│   └── main.tsx
├── index.html
├── tsconfig.json
└── vite.config.ts
```

---

## Local Development

### 1. Install dependencies

```bash
npm install
```

### 2. Run development mode

```bash
npm run dev
```

This starts:

- Express backend on `http://localhost:3001`
- Vite frontend on `http://localhost:3000`

Vite proxies `/api/*` requests to the Express server.

---

## Production Build & Run

### 1. Build frontend

```bash
npm run build
```

### 2. Start unified Express server

```bash
npm start
```

By default, production mode uses port `8080` unless `PORT` is set.

Open:

```text
http://localhost:8080
```

---

## API Endpoints

### Health check

```http
GET /api/health
```

### Digital Twin APIs

```http
GET /api/twin/current
GET /api/twin/history
GET /api/twin/heatmap
GET /api/twin/prediction
GET /api/twin/what-if
GET /api/twin/recommendation
```

### Control APIs

```http
POST /api/scenario
POST /api/ac
```

Example scenario request:

```json
{
  "scenario": "crowded_room"
}
```

Supported scenarios:

- `normal_room`
- `crowded_room`
- `hot_outside`
- `energy_saving`

Example AC request:

```json
{
  "ac_status": "ON",
  "ac_setpoint": 25
}
```

---

## Docker Deployment

### 1. Build image

```bash
docker build -t smart-classroom-digital-twin .
```

### 2. Run container locally

```bash
docker run -p 8080:8080 smart-classroom-digital-twin
```

Open:

```text
http://localhost:8080
```

---

## Google Cloud Run Deployment

Deploy the project as a single full-stack service:

```bash
gcloud run deploy smart-classroom-digital-twin \
  --source . \
  --region asia-southeast1 \
  --allow-unauthenticated
```

Cloud Run injects the `$PORT` environment variable automatically. The Express server serves both the REST APIs and the built Vite frontend.

---

## Simulation Model Summary

### Room-level temperature model

```text
next_room_temp = current_room_temp
               + outside_effect
               + occupancy_effect
               - ac_cooling_effect
               + humidity_effect
               + random_noise
```

### Cell-level heatmap model

```text
cell_temp = room_temp
          + window_heat_effect
          + occupancy_zone_effect
          - ac_proximity_cooling
          + cell_noise
```

The room grid uses:

- AC at top-right cell: row `0`, col `4`
- Window/outside heat source along the left side: col `0`
- Occupancy zone around the center cells

---

## Notes for Report

This prototype focuses on the Digital Twin loop:

```text
simulated telemetry
→ digital twin state
→ 2D thermal heatmap
→ prediction
→ what-if simulation
→ comfort-energy recommendation
→ dashboard
```

A database is intentionally excluded from the implementation to keep the prototype lightweight. In a production extension, a database could be added to store sensor history, heatmap snapshots, prediction results, and recommendation logs.

---

## Limitations

- Sensor data is simulated, not collected from real IoT devices.
- The thermal model is simplified and not a physically accurate HVAC/CFD model.
- Data is stored in memory and resets when the server restarts.
- The prototype models one room only.
- The system does not control a real AC device.

---

## Future Work

- Integrate real IoT sensors.
- Store telemetry and heatmap snapshots in a database.
- Connect to a real Building Management System or HVAC controller.
- Expand from one room to multiple rooms.
- Improve the prediction model with real historical data or machine learning.
- Add more accurate airflow and thermal distribution modeling.
