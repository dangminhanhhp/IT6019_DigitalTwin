/**
 * simulation.js
 * Digital Twin simulation formulas and logic
 */

const AC_POSITION = { row: 0, col: 4 };
const OCCUPANCY_ZONE = [
  { row: 2, col: 2 },
  { row: 2, col: 1 },
  { row: 3, col: 2 }
];

export function getManhattanDistance(p1, p2) {
  return Math.abs(p1.row - p2.row) + Math.abs(p1.col - p2.col);
}

// Room-level temperature formula:
// next_room_temp = current_room_temp + outside_effect + occupancy_effect - ac_cooling_effect + humidity_effect + random_noise
export function calculateNextRoomTemp(currentRoomTemp, outsideTemp, occupancyCount, acStatus, acSetpoint, humidity, useNoise = true) {
  const outside_effect = (outsideTemp - currentRoomTemp) * 0.03;
  const occupancy_effect = occupancyCount * 0.015;
  const ac_cooling_effect = acStatus === "ON" ? 0.08 * Math.max(currentRoomTemp - acSetpoint, 0) : 0;
  const humidity_effect = Math.max(humidity - 60, 0) * 0.005;
  const random_noise = useNoise ? (Math.random() * 0.2 - 0.1) : 0; // between -0.1 and 0.1

  const nextTemp = currentRoomTemp + outside_effect + occupancy_effect - ac_cooling_effect + humidity_effect + random_noise;
  return Number(nextTemp.toFixed(2));
}

// Cell-level heatmap formula:
// cell_temp = room_temp + outside_heat_strength / (distance_to_window + 1) + occupancy_heat_strength / (distance_to_occupancy_zone + 1) - ac_strength / (distance_to_ac + 1) + cell_noise
export function generateHeatmap(roomTemp, outsideTemp, occupancyCount, acStatus, acSetpoint, humidity, useNoise = true) {
  const grid = [];
  let hottest = { row: 0, col: 0, temp: -999 };
  let coolest = { row: 0, col: 0, temp: 999 };

  const outside_heat_strength = Math.max(outsideTemp - roomTemp, 0) * 0.08;
  const occupancy_heat_strength = Math.min(occupancyCount * 0.03, 1.2);
  const ac_strength = acStatus === "ON" ? (1.2 + Math.max(roomTemp - acSetpoint, 0) * 0.1) : 0;

  for (let r = 0; r < 5; r++) {
    const row = [];
    for (let c = 0; c < 5; c++) {
      const distance_to_window = c; // col = 0 is window
      const distance_to_occupancy_zone = Math.min(
        ...OCCUPANCY_ZONE.map(p => getManhattanDistance({ row: r, col: c }, p))
      );
      const distance_to_ac = getManhattanDistance({ row: r, col: c }, AC_POSITION);
      const cell_noise = useNoise ? (Math.random() * 0.2 - 0.1) : 0;

      let cell_temp = roomTemp
        + outside_heat_strength / (distance_to_window + 1)
        + occupancy_heat_strength / (distance_to_occupancy_zone + 1)
        - ac_strength / (distance_to_ac + 1)
        + cell_noise;

      cell_temp = Number(cell_temp.toFixed(2));

      const cellData = { row: r, col: c, temp: cell_temp };
      row.push(cellData);

      if (cell_temp > hottest.temp) {
        hottest = { row: r, col: c, temp: cell_temp };
      }
      if (cell_temp < coolest.temp) {
        coolest = { row: r, col: c, temp: cell_temp };
      }
    }
    grid.push(row);
  }

  return { grid, hottest, coolest };
}

// Comfort score calculation
export function calculateComfortScore(avgTemp, maxCellTemp, minCellTemp, humidity) {
  let score = 100;

  if (avgTemp < 22) {
    score -= (22 - avgTemp) * 8;
  }
  if (avgTemp > 26) {
    score -= (avgTemp - 26) * 8;
  }
  if (maxCellTemp > 28) {
    score -= (maxCellTemp - 28) * 6;
  }
  if (humidity > 70) {
    score -= (humidity - 70) * 1;
  }
  const variance = maxCellTemp - minCellTemp;
  if (variance > 3) {
    score -= (variance - 3) * 5;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

// Energy score calculation
export function calculateEnergyScore(acStatus, acSetpoint, outsideTemp, roomTemp) {
  if (acStatus === "OFF") {
    return 100; // high energy score when AC is off
  }

  let score = 100;
  score -= Math.max(0, 26 - acSetpoint) * 12;
  score -= Math.max(0, outsideTemp - acSetpoint) * 1.2;
  score -= Math.max(0, roomTemp - acSetpoint) * 5;

  return Math.max(0, Math.min(100, Math.round(score)));
}

// Run 30-minute what-if setpoint simulation for 24, 25, 26, 27
export function runWhatIfSimulation(currentRoomTemp, outsideTemp, occupancyCount, humidity) {
  const setpoints = [24, 25, 26, 27];
  return setpoints.map(setpoint => {
    // Simulate 30 steps (minutes)
    let temp = currentRoomTemp;
    for (let i = 0; i < 30; i++) {
      temp = calculateNextRoomTemp(temp, outsideTemp, occupancyCount, "ON", setpoint, humidity, false);
    }

    const { grid, hottest, coolest } = generateHeatmap(temp, outsideTemp, occupancyCount, "ON", setpoint, humidity, false);
    const comfortScore = calculateComfortScore(temp, hottest.temp, coolest.temp, humidity);
    const energyScore = calculateEnergyScore("ON", setpoint, outsideTemp, temp);
    const totalScore = Number((comfortScore * 0.65 + energyScore * 0.35).toFixed(1));

    return {
      setpoint,
      predicted_temp: Number(temp.toFixed(2)),
      max_cell_temp: hottest.temp,
      comfort_score: comfortScore,
      energy_score: energyScore,
      total_score: totalScore
    };
  });
}

// Generate the recommendation based on what-if results
export function generateRecommendation(whatIfResults, occupancyCount) {
  // Recommendation logic:
  // - Pick the candidate with the highest total score.
  // - Total score = comfort_score * 0.65 + energy_score * 0.35.
  // - Prefer candidates with comfort_score >= 70.
  // - If no candidate has comfort_score >= 70, pick the one with highest comfort_score.
  
  const comfortCandidates = whatIfResults.filter(r => r.comfort_score >= 70);
  let bestCandidate;

  if (comfortCandidates.length > 0) {
    bestCandidate = comfortCandidates.reduce((best, curr) => curr.total_score > best.total_score ? curr : best, comfortCandidates[0]);
  } else {
    bestCandidate = whatIfResults.reduce((best, curr) => curr.comfort_score > best.comfort_score ? curr : best, whatIfResults[0]);
  }

  // Set decisions
  const resultsWithDecision = whatIfResults.map(r => {
    let decision = "not recommended";
    if (r.setpoint === bestCandidate.setpoint) {
      decision = "recommended";
    } else if (r.comfort_score >= 70) {
      decision = "acceptable";
    }
    return { ...r, decision };
  });

  const lowerSetpoint = whatIfResults.find(r => r.setpoint === bestCandidate.setpoint - 1);
  const higherSetpoint = whatIfResults.find(r => r.setpoint === bestCandidate.setpoint + 1);
  const actionLabel = `Set AC to ${bestCandidate.setpoint}°C`;
  const reasonParts = [
    `Setpoint ${bestCandidate.setpoint}°C is recommended because it provides the best comfort-energy balance for ${occupancyCount} occupants.`,
    `The 30-minute digital twin simulation predicts an average room temperature of ${bestCandidate.predicted_temp}°C with comfort score ${bestCandidate.comfort_score}% and energy score ${bestCandidate.energy_score}%.`
  ];

  if (lowerSetpoint && lowerSetpoint.energy_score < bestCandidate.energy_score) {
    reasonParts.push(`A lower setpoint such as ${lowerSetpoint.setpoint}°C improves cooling only marginally but has higher energy cost.`);
  }

  if (higherSetpoint && higherSetpoint.comfort_score < bestCandidate.comfort_score) {
    reasonParts.push(`A higher setpoint such as ${higherSetpoint.setpoint}°C saves more energy but reduces predicted comfort.`);
  }

  const reason = reasonParts.join(' ');

  return {
    recommended_setpoint: bestCandidate.setpoint,
    action_label: actionLabel,
    reason,
    comfort_impact: bestCandidate.comfort_score,
    energy_impact: bestCandidate.energy_score,
    results: resultsWithDecision
  };
}
