/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  CartesianGrid
} from 'recharts';
import {
  Activity,
  Cpu,
  Thermometer,
  Droplets,
  Users,
  Wind,
  Layers,
  Sparkles,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle,
  AlertTriangle,
  Lightbulb,
  XCircle
} from 'lucide-react';

interface HottestCoolestCell {
  row: number;
  col: number;
  temp: number;
}

interface CurrentData {
  scenario: string;
  room_temp: number;
  humidity: number;
  occupancy_count: number;
  outside_temp: number;
  ac_status: 'ON' | 'OFF';
  ac_setpoint: number;
  comfort_status: string;
  comfort_score: number;
  energy_score: number;
  hottest_cell: HottestCoolestCell;
  coolest_cell: HottestCoolestCell;
}

interface HistoryRecord {
  time: string;
  room_temp: number;
  humidity: number;
  occupancy_count: number;
}

interface HeatmapCell {
  row: number;
  col: number;
  temp: number;
}

interface PredictionData {
  prediction_10m: number;
  prediction_20m: number;
  prediction_30m: number;
  trend: 'warming' | 'cooling' | 'stable';
  predicted_heatmap_30m: HeatmapCell[][];
}

interface WhatIfRecord {
  setpoint: number;
  predicted_temp: number;
  max_cell_temp: number;
  comfort_score: number;
  energy_score: number;
  total_score: number;
  decision: 'recommended' | 'acceptable' | 'not recommended';
}

interface RecommendationData {
  recommended_setpoint: number;
  action_label: string;
  reason: string;
  comfort_impact: number;
  energy_impact: number;
  results: WhatIfRecord[];
}

const AC_POSITION = { row: 0, col: 4 };
const OCCUPANCY_ZONE = [
  { row: 2, col: 2 },
  { row: 2, col: 1 },
  { row: 3, col: 2 }
];

export default function App() {
  const [currentData, setCurrentData] = useState<CurrentData | null>(null);
  const [historyData, setHistoryData] = useState<HistoryRecord[]>([]);
  const [predictionData, setPredictionData] = useState<PredictionData | null>(null);
  const [whatIfData, setWhatIfData] = useState<WhatIfRecord[]>([]);
  const [recommendation, setRecommendation] = useState<RecommendationData | null>(null);
  const [heatmapGrid, setHeatmapGrid] = useState<HeatmapCell[][]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'current' | 'predicted'>('current');
  const [lastSync, setLastSync] = useState<string>('');

  // Fetch all simulation telemetry and updates
  const fetchAllData = async () => {
    try {
      const [currentRes, historyRes, predictionRes, whatIfRes, recRes, heatmapRes] = await Promise.all([
        fetch('/api/twin/current').then(r => r.json()),
        fetch('/api/twin/history').then(r => r.json()),
        fetch('/api/twin/prediction').then(r => r.json()),
        fetch('/api/twin/what-if').then(r => r.json()),
        fetch('/api/twin/recommendation').then(r => r.json()),
        fetch('/api/twin/heatmap').then(r => r.json())
      ]);

      setCurrentData(currentRes);
      setHistoryData(historyRes);
      setPredictionData(predictionRes);
      setWhatIfData(whatIfRes);
      setRecommendation(recRes);
      setHeatmapGrid(heatmapRes.grid);
      setLastSync(new Date().toLocaleTimeString());
      setError(null);
    } catch (err) {
      console.error('Failed to sync digital twin state:', err);
      setError('Connection with Digital Twin model lost. Retrying...');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
    // Poll the backend simulator every 3 seconds
    const interval = setInterval(fetchAllData, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleScenarioChange = async (scenario: string) => {
    try {
      const res = await fetch('/api/scenario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario })
      });
      if (res.ok) {
        fetchAllData();
      }
    } catch (err) {
      console.error('Error changing scenario:', err);
    }
  };

  const handleAcUpdate = async (status: 'ON' | 'OFF', setpoint?: number) => {
    try {
      const res = await fetch('/api/ac', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ac_status: status, ac_setpoint: setpoint })
      });
      if (res.ok) {
        fetchAllData();
      }
    } catch (err) {
      console.error('Error updating AC state:', err);
    }
  };

  if (loading && !currentData) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center text-slate-600 gap-4">
        <Cpu className="w-12 h-12 text-blue-600 animate-spin" />
        <p className="font-semibold text-lg">Initializing Digital Twin Physics Engine...</p>
        <p className="text-sm text-slate-400">Setting up 5x5 thermal grid matrix and in-memory streams</p>
      </div>
    );
  }

  // Helpers for identifying zone features on grid
  const isAcCell = (r: number, c: number) => r === AC_POSITION.row && c === AC_POSITION.col;
  const isWindowCell = (r: number, c: number) => c === 0;
  const isOccupancyCell = (r: number, c: number) => OCCUPANCY_ZONE.some(p => p.row === r && p.col === c);

  // Heatmap temperature color mappings
  const getTempClass = (temp: number) => {
    if (temp < 23) return 'bg-blue-100 text-blue-800 border-blue-200';
    if (temp >= 23 && temp < 25) return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    if (temp >= 25 && temp < 27) return 'bg-yellow-100 text-yellow-800 border-yellow-700/30';
    if (temp >= 27 && temp < 29) return 'bg-orange-100 text-orange-800 border-orange-300';
    return 'bg-red-100 text-red-800 border-red-300';
  };

  // Helper to render trend indicators
  const renderTrendIcon = (trend: string) => {
    switch (trend) {
      case 'cooling':
        return <TrendingDown className="w-4 h-4 text-emerald-600 animate-bounce" />;
      case 'warming':
        return <TrendingUp className="w-4 h-4 text-amber-600 animate-bounce" />;
      default:
        return <Minus className="w-4 h-4 text-slate-400" />;
    }
  };

  // Grid displaying either current state or 30-min prediction state
  const activeGrid = viewMode === 'current' ? heatmapGrid : (predictionData?.predicted_heatmap_30m || []);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900 selection:bg-blue-100">
      
      {/* Upper Navigation Header */}
      <header className="bg-slate-900 text-white h-16 flex items-center justify-between px-6 shadow-md shrink-0 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="bg-blue-500 p-2 rounded-lg text-white">
            <Cpu className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">Smart Classroom Digital Twin</h1>
            <p className="text-[10px] text-slate-400">Environment Optimization &amp; 2D Thermal Analytics</p>
          </div>
        </div>

        <div className="flex gap-4 items-center">
          {error ? (
            <div className="bg-red-500/10 text-red-400 px-3 py-1 rounded-full text-xs font-semibold border border-red-500/20 flex items-center gap-1.5 animate-pulse">
              <AlertTriangle className="w-3.5 h-3.5" />
              {error}
            </div>
          ) : (
            <div className="bg-emerald-500/10 text-emerald-400 px-3 py-1 rounded-full text-xs font-semibold border border-emerald-500/20 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>Twin Connected</span>
            </div>
          )}
          <div className="text-xs text-slate-400">
            Telemetry Sync: <span className="text-white font-mono">{lastSync || 'Connecting...'}</span>
          </div>
        </div>
      </header>

      {/* Main Grid Workspace */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        
        {/* Left Side: Scenario Controllers & Status Cards */}
        <aside className="w-full lg:w-72 bg-white border-b lg:border-b-0 lg:border-r border-slate-200 p-5 flex flex-col gap-6 overflow-y-auto shrink-0">
          
          {/* Section: Scenario Settings */}
          <div>
            <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-blue-500" />
              Scenario Control
            </h2>
            <div className="grid grid-cols-2 lg:grid-cols-1 gap-2">
              {[
                { id: 'normal_room', label: 'Normal Room', desc: 'Standard default parameters' },
                { id: 'crowded_room', label: 'Crowded Room', desc: 'High occupancy, elevated warmth' },
                { id: 'hot_outside', label: 'Hot Outside', desc: 'High solar load, 38°C environment' },
                { id: 'energy_saving', label: 'Energy Saving', desc: 'Minimum resource carbon profile' }
              ].map((sc) => (
                <button
                  key={sc.id}
                  id={`scenario-btn-${sc.id}`}
                  onClick={() => handleScenarioChange(sc.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg border text-xs font-medium transition-all ${
                    currentData?.scenario === sc.id
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="font-bold">{sc.label}</div>
                  <div className={`text-[10px] ${currentData?.scenario === sc.id ? 'text-blue-100' : 'text-slate-400'}`}>
                    {sc.desc}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* Section: Current Room Telemetry */}
          <div className="flex-1">
            <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1">
              <Activity className="w-3.5 h-3.5 text-blue-500" />
              Current Status
            </h2>
            
            <div className="space-y-2.5">
              
              {/* Avg Room Temperature */}
              <div className="p-3 border border-slate-100 rounded-xl bg-slate-50/50 flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-slate-500 flex items-center gap-1 font-semibold">
                    <Thermometer className="w-3.5 h-3.5 text-orange-500" />
                    Avg Room Temp
                  </div>
                  <div className="text-xl font-bold font-mono text-slate-800">
                    {currentData?.room_temp?.toFixed(1) || '--'}°C
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[9px] uppercase text-slate-400">Outside</div>
                  <div className="text-sm font-semibold font-mono text-slate-600">
                    {currentData?.outside_temp || '--'}°C
                  </div>
                </div>
              </div>

              {/* Humidity */}
              <div className="p-3 border border-slate-100 rounded-xl bg-slate-50/50 flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-slate-500 flex items-center gap-1 font-semibold">
                    <Droplets className="w-3.5 h-3.5 text-blue-500" />
                    Humidity
                  </div>
                  <div className="text-xl font-bold font-mono text-slate-800">
                    {currentData?.humidity || '--'}%
                  </div>
                </div>
                <div className="text-right">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                    (currentData?.humidity || 50) > 60 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                  }`}>
                    {(currentData?.humidity || 50) > 60 ? 'High' : 'Optimal'}
                  </span>
                </div>
              </div>

              {/* Occupancy */}
              <div className="p-3 border border-slate-100 rounded-xl bg-slate-50/50 flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-slate-500 flex items-center gap-1 font-semibold">
                    <Users className="w-3.5 h-3.5 text-purple-500" />
                    Occupancy
                  </div>
                  <div className="text-xl font-bold font-mono text-slate-800">
                    {currentData?.occupancy_count || 0} <span className="text-xs font-normal text-slate-400">/ 30 max</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-bold">
                    Zone Center
                  </span>
                </div>
              </div>

              {/* Grid extreme heat elements */}
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div className="bg-red-50 border border-red-100 p-2 rounded-lg">
                  <div className="text-red-700 font-bold">Hottest Cell</div>
                  <div className="font-mono text-red-900 font-extrabold mt-0.5">
                    {currentData?.hottest_cell ? `${currentData.hottest_cell.temp}°C` : '--'}
                  </div>
                  <div className="text-slate-400 text-[9px] mt-0.5">
                    Row {currentData?.hottest_cell?.row}, Col {currentData?.hottest_cell?.col}
                  </div>
                </div>

                <div className="bg-blue-50 border border-blue-100 p-2 rounded-lg">
                  <div className="text-blue-700 font-bold">Coolest Cell</div>
                  <div className="font-mono text-blue-900 font-extrabold mt-0.5">
                    {currentData?.coolest_cell ? `${currentData.coolest_cell.temp}°C` : '--'}
                  </div>
                  <div className="text-slate-400 text-[9px] mt-0.5">
                    Row {currentData?.coolest_cell?.row}, Col {currentData?.coolest_cell?.col}
                  </div>
                </div>
              </div>

            </div>
          </div>

          {/* Comfort Score Ring Progress */}
          <div className="pt-4 border-t border-slate-100">
            <div className="flex justify-between items-center text-xs font-semibold mb-2">
              <span className="text-slate-500">Global Comfort Score</span>
              <span className={`font-bold text-sm ${
                (currentData?.comfort_score || 0) >= 80 ? 'text-emerald-600' : 'text-amber-600'
              }`}>
                {currentData?.comfort_score || 0}%
              </span>
            </div>
            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  (currentData?.comfort_score || 0) >= 80 ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
                style={{ width: `${currentData?.comfort_score || 0}%` }}
              />
            </div>
            <div className="flex justify-between text-[9px] text-slate-400 mt-1">
              <span>Status: {currentData?.comfort_status || 'Checking'}</span>
              <span>Variance subtracted</span>
            </div>
          </div>

        </aside>

        {/* Center Canvas: Heatmap grid & Historic Charts */}
        <section className="flex-1 flex flex-col p-5 gap-5 overflow-y-auto">
          
          {/* Main 2D Heatmap Grid Panel */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col flex-1 min-h-[420px]">
            <div className="flex justify-between items-center mb-3">
              <div>
                <h2 className="text-sm font-bold flex items-center gap-2 text-slate-800">
                  <Wind className="w-4 h-4 text-blue-500" />
                  2D Room Thermal Spatial Grid (5x5)
                </h2>
                <p className="text-[10px] text-slate-400">Visualizing heat gradients across physical learning spaces</p>
              </div>

              {/* View toggle (Current vs 30-min prediction) */}
              <div className="flex bg-slate-100 p-1 rounded-lg">
                <button
                  onClick={() => setViewMode('current')}
                  className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-all ${
                    viewMode === 'current' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Current Telemetry
                </button>
                <button
                  onClick={() => setViewMode('predicted')}
                  className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-all ${
                    viewMode === 'predicted' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  30m Forecast Grid
                </button>
              </div>
            </div>

            {/* Grid display layout */}
            <div className="grid grid-cols-5 gap-1.5 flex-1 min-h-[220px]">
              {activeGrid.map((rowArr, rIdx) =>
                rowArr.map((cell, cIdx) => {
                  const isAC = isAcCell(rIdx, cIdx);
                  const isWindow = isWindowCell(rIdx, cIdx);
                  const isOccupancy = isOccupancyCell(rIdx, cIdx);

                  return (
                    <div
                      key={`cell-${rIdx}-${cIdx}`}
                      className={`relative border flex flex-col items-center justify-center rounded-lg shadow-sm transition-all duration-300 p-1 select-none ${getTempClass(cell.temp)}`}
                    >
                      <span className="text-sm font-extrabold font-mono tracking-tight">{cell.temp.toFixed(1)}°C</span>
                      <span className="text-[8px] text-slate-500/80 font-mono mt-0.5">({rIdx},{cIdx})</span>
                      
                      {/* Grid overlay markers */}
                      {isAC && (
                        <div className="absolute top-1 right-1 bg-blue-600 text-white font-extrabold text-[8px] px-1 rounded flex items-center gap-0.5">
                          ❄️ AC
                        </div>
                      )}
                      {isWindow && (
                        <div className="absolute bottom-1 left-1 bg-orange-500 text-white font-extrabold text-[7px] px-0.5 rounded">
                          ☀️ Window
                        </div>
                      )}
                      {isOccupancy && (
                        <div className="absolute top-1 left-1 bg-purple-600 text-white font-extrabold text-[7px] px-0.5 rounded">
                          👥 Zone
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Heatmap Legend */}
            <div className="mt-3 flex flex-wrap justify-between items-center text-[10px] text-slate-500 bg-slate-50 p-2.5 rounded-lg border border-slate-100 gap-2">
              <div className="flex gap-4">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-blue-100 border border-blue-200"></span> Cool (&lt;23°C)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-emerald-100 border border-emerald-200"></span> Comfortable (23-25°C)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-yellow-100 border border-yellow-200"></span> Warm (25-27°C)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-orange-100 border border-orange-200"></span> Hot (27-29°C)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-red-100 border border-red-200"></span> High Hot (&gt;29°C)
                </span>
              </div>
              <div className="text-[9px] text-slate-400 italic">
                *Manhattan distance thermal propagation model enabled.
              </div>
            </div>
          </div>

          {/* Interactive AC controller & Environmental History charts side-by-side */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            {/* Interactive AC Controller */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col justify-between">
              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5">
                  AC Hardware Telemetry
                </h3>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-slate-500 font-semibold">Power Status</span>
                  <button
                    onClick={() => handleAcUpdate(currentData?.ac_status === 'ON' ? 'OFF' : 'ON', currentData?.ac_setpoint)}
                    className={`px-3 py-1 text-xs font-extrabold rounded-lg transition-all ${
                      currentData?.ac_status === 'ON'
                        ? 'bg-emerald-500 text-white'
                        : 'bg-red-500/10 text-red-600 border border-red-200'
                    }`}
                  >
                    {currentData?.ac_status || 'ON'}
                  </button>
                </div>

                <div className="mb-2">
                  <div className="flex justify-between text-xs text-slate-500 mb-1">
                    <span className="font-semibold">Setpoint Adjustment</span>
                    <span className="font-bold text-blue-600 font-mono">{currentData?.ac_setpoint}°C</span>
                  </div>
                  <input
                    type="range"
                    min="18"
                    max="28"
                    value={currentData?.ac_setpoint || 24}
                    onChange={(e) => handleAcUpdate(currentData?.ac_status || 'ON', Number(e.target.value))}
                    className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                  <div className="flex justify-between text-[8px] text-slate-400 font-mono mt-1">
                    <span>18°C</span>
                    <span>Optimized: 24-25°C</span>
                    <span>28°C</span>
                  </div>
                </div>
              </div>

              <div className="bg-blue-50/50 p-2 rounded-lg border border-blue-100 text-[10px] text-slate-600 leading-relaxed mt-2">
                🌟 <strong className="text-blue-800">Dynamic Loop:</strong> Setpoint changes dynamically shift cells adjacent to AC coordinates row 0, col 4.
              </div>
            </div>

            {/* Environmental Temperature Chart */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col md:col-span-2">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Room Temp &amp; Occupancy Trend History
              </h3>
              <div className="h-32">
                {historyData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={historyData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="time" tick={{ fontSize: 8 }} stroke="#94a3b8" />
                      <YAxis domain={['auto', 'auto']} tick={{ fontSize: 8 }} stroke="#94a3b8" />
                      <Tooltip contentStyle={{ fontSize: 10, borderRadius: 8 }} />
                      <Line
                        type="monotone"
                        dataKey="room_temp"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        dot={false}
                        name="Temp (°C)"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-slate-400">
                    Pre-populating historical telemetry stream...
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* What-if Setpoint Simulation Panel */}
          <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="bg-amber-100 text-amber-800 p-1 rounded">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-800">What-if Setpoint Optimization Matrix</h2>
                <p className="text-[10px] text-slate-400">Simulating 30-minute thermodynamic outcomes across AC candidate setpoints</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-slate-400 border-b border-slate-100">
                  <tr className="text-left font-semibold">
                    <th className="pb-2">AC Candidate</th>
                    <th className="pb-2">Predicted Avg (30m)</th>
                    <th className="pb-2">Predicted Max Cell</th>
                    <th className="pb-2">Comfort Score</th>
                    <th className="pb-2">Energy Score</th>
                    <th className="pb-2">Aggregate Score</th>
                    <th className="pb-2 text-right">Optimization Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-slate-600">
                  {whatIfData.map((row) => (
                    <tr
                      key={row.setpoint}
                      className={`hover:bg-slate-50/50 transition-colors ${
                        row.decision === 'recommended' ? 'bg-blue-50/40 font-semibold text-slate-900' : ''
                      }`}
                    >
                      <td className="py-2.5 font-bold">
                        {row.setpoint}°C
                        {row.decision === 'recommended' && (
                          <span className="ml-2 bg-blue-500 text-white text-[8px] px-1.5 py-0.5 rounded font-extrabold uppercase">
                            Ideal
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 font-mono">{row.predicted_temp.toFixed(2)}°C</td>
                      <td className="py-2.5 font-mono text-slate-500">{row.max_cell_temp.toFixed(1)}°C</td>
                      <td className="py-2.5">
                        <div className="flex items-center gap-1.5">
                          <div className="w-12 bg-slate-100 h-1 rounded-full overflow-hidden">
                            <div className="bg-emerald-500 h-full" style={{ width: `${row.comfort_score}%` }}></div>
                          </div>
                          <span>{row.comfort_score}%</span>
                        </div>
                      </td>
                      <td className="py-2.5">
                        <div className="flex items-center gap-1.5">
                          <div className="w-12 bg-slate-100 h-1 rounded-full overflow-hidden">
                            <div className="bg-blue-500 h-full" style={{ width: `${row.energy_score}%` }}></div>
                          </div>
                          <span>{row.energy_score}%</span>
                        </div>
                      </td>
                      <td className="py-2.5">
                        <span className={`font-mono font-bold ${
                          row.decision === 'recommended' ? 'text-blue-600' : 'text-slate-700'
                        }`}>
                          {row.total_score.toFixed(1)}
                        </span>
                      </td>
                      <td className="py-2.5 text-right font-bold">
                        {row.decision === 'recommended' && (
                          <span className="text-blue-600 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-full text-[10px]">
                            Recommended
                          </span>
                        )}
                        {row.decision === 'acceptable' && (
                          <span className="text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full text-[10px]">
                            Acceptable
                          </span>
                        )}
                        {row.decision === 'not recommended' && (
                          <span className="text-slate-400 bg-slate-100 px-2.5 py-0.5 rounded-full text-[10px]">
                            Not Recommended
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-[10px] text-slate-400 mt-2.5 leading-relaxed bg-slate-50 p-2.5 rounded-lg border border-slate-100">
              💡 <strong>Model Core:</strong> Total score weights are statically configured to 65% Comfort index and 35% Energy efficiency metric.
            </div>
          </section>

        </section>

        {/* Right Side: Smart Recommendation & Forecasting Panels */}
        <aside className="w-full lg:w-72 bg-white border-t lg:border-t-0 lg:border-l border-slate-200 p-5 flex flex-col gap-5 overflow-y-auto shrink-0">
          
          {/* Recommendation Box */}
          <div className="bg-slate-900 text-white rounded-xl p-4 shadow-lg flex flex-col justify-between min-h-[180px] border border-slate-800">
            <div>
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                  AI Recommendation
                </h3>
                <span className="bg-blue-500/25 text-blue-400 font-extrabold text-[8px] px-1.5 py-0.5 rounded uppercase border border-blue-500/20 flex items-center gap-0.5">
                  <Lightbulb className="w-2.5 h-2.5" />
                  Active
                </span>
              </div>
              <div className="text-lg font-bold text-blue-400 mb-1">
                {recommendation?.action_label || 'Optimizing...'}
              </div>
              <p className="text-[11px] leading-relaxed text-slate-300">
                {recommendation?.reason || 'Predicting stabilization patterns based on occupancy...'}
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800">
              <button
                onClick={() => {
                  if (recommendation?.recommended_setpoint) {
                    handleAcUpdate('ON', recommendation.recommended_setpoint);
                  }
                }}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-lg text-xs font-bold transition-colors shadow-sm flex items-center justify-center gap-1"
              >
                Apply Recommendation
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Forecasting Panel */}
          <div className="flex-1 flex flex-col gap-4">
            <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Activity className="w-3.5 h-3.5 text-blue-500" />
              Climate Predictions
            </h3>

            <div className="space-y-2.5">
              
              {/* 10 Min */}
              <div className="p-3 border border-slate-100 rounded-xl hover:shadow-sm transition-all bg-slate-50/50 flex justify-between items-center">
                <div>
                  <div className="text-xs font-bold text-slate-700">In 10 Minutes</div>
                  <div className="text-slate-400 text-[10px] mt-0.5">
                    {predictionData?.trend === 'cooling' ? 'Cooling drift' : predictionData?.trend === 'warming' ? 'Thermal accumulation' : 'Consistent trajectory'}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-bold font-mono text-slate-800">
                    {predictionData?.prediction_10m?.toFixed(1) || '--'}°C
                  </span>
                  {predictionData?.trend && renderTrendIcon(predictionData.trend)}
                </div>
              </div>

              {/* 20 Min */}
              <div className="p-3 border border-slate-100 rounded-xl hover:shadow-sm transition-all bg-slate-50/50 flex justify-between items-center">
                <div>
                  <div className="text-xs font-bold text-slate-700">In 20 Minutes</div>
                  <div className="text-slate-400 text-[10px] mt-0.5">
                    Predicted temperature level
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-bold font-mono text-slate-800">
                    {predictionData?.prediction_20m?.toFixed(1) || '--'}°C
                  </span>
                  {predictionData?.trend && renderTrendIcon(predictionData.trend)}
                </div>
              </div>

              {/* 30 Min */}
              <div className="p-3 border border-slate-100 rounded-xl hover:shadow-sm transition-all bg-slate-50/50 flex justify-between items-center">
                <div>
                  <div className="text-xs font-bold text-slate-700">In 30 Minutes</div>
                  <div className="text-slate-400 text-[10px] mt-0.5">
                    Predicted stabilized state
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-bold font-mono text-slate-800">
                    {predictionData?.prediction_30m?.toFixed(1) || '--'}°C
                  </span>
                  {predictionData?.trend && renderTrendIcon(predictionData.trend)}
                </div>
              </div>

            </div>

            <div className="mt-auto border-t border-slate-100 pt-4 text-[10px] text-slate-400 italic text-center">
              "Digital Twin leverages real-time thermodynamic modeling. Solar load vectors and occupant density are analyzed at the grid level."
            </div>
          </div>

        </aside>

      </div>

    </div>
  );
}
