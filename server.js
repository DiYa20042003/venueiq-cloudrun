'use strict';

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// ─── IN-MEMORY STATE ────────────────────────────────────────────────────────

let state = {
  meta: { matchTime: 74, score: '2 — 1', venue: 'City Stadium', capacity: 52000 },
  attendance: 47832,
  zones: [
    { id: 'north', name: 'North Stand',   pct: 82, color: '#00d4aa' },
    { id: 'south', name: 'South Stand',   pct: 94, color: '#f59e0b' },
    { id: 'west',  name: 'West Stand',    pct: 68, color: '#a78bfa' },
    { id: 'east',  name: 'East Stand',    pct: 97, color: '#ef4444' },
    { id: 'ca',    name: 'Concourse A',   pct: 55, color: '#4f8ef7' },
    { id: 'cb',    name: 'Concourse B',   pct: 71, color: '#22c55e' },
    { id: 'vip',   name: 'VIP Lounge',    pct: 43, color: '#00d4aa' },
    { id: 'fc',    name: 'Food Court',    pct: 88, color: '#f59e0b' },
  ],
  queues: [
    { id: 'q1',  name: 'Gate N1',      zone: 'North', wait: 2.1,  people: 48,  status: 'green' },
    { id: 'q2',  name: 'Gate N2',      zone: 'North', wait: 3.4,  people: 72,  status: 'green' },
    { id: 'q3',  name: 'Gate N3',      zone: 'North', wait: 1.2,  people: 26,  status: 'green' },
    { id: 'q4',  name: 'Gate E1',      zone: 'East',  wait: 8.7,  people: 180, status: 'amber' },
    { id: 'q5',  name: 'Gate E2',      zone: 'East',  wait: 12.4, people: 264, status: 'red'   },
    { id: 'q6',  name: 'Gate E3',      zone: 'East',  wait: 9.2,  people: 196, status: 'amber' },
    { id: 'q7',  name: 'Gate S1',      zone: 'South', wait: 5.2,  people: 108, status: 'amber' },
    { id: 'q8',  name: 'Gate S2',      zone: 'South', wait: 4.1,  people: 88,  status: 'green' },
    { id: 'q9',  name: 'Gate W1',      zone: 'West',  wait: 2.8,  people: 60,  status: 'green' },
    { id: 'q10', name: 'Concession 4', zone: 'Food',  wait: 6.8,  people: 142, status: 'amber' },
    { id: 'q11', name: 'Merchandise',  zone: 'East',  wait: 11.2, people: 238, status: 'red'   },
  ],
  gates: [
    { id:'N1', status:'open',   flow:320 }, { id:'N2', status:'open',   flow:280 },
    { id:'N3', status:'open',   flow:190 }, { id:'N4', status:'open',   flow:210 },
    { id:'E1', status:'busy',   flow:520 }, { id:'E2', status:'busy',   flow:640 },
    { id:'E3', status:'busy',   flow:580 }, { id:'E4', status:'busy',   flow:490 },
    { id:'S1', status:'open',   flow:350 }, { id:'S2', status:'open',   flow:310 },
    { id:'S3', status:'open',   flow:280 }, { id:'S4', status:'open',   flow:240 },
    { id:'W1', status:'open',   flow:180 }, { id:'W2', status:'open',   flow:200 },
    { id:'W3', status:'closed', flow:0   }, { id:'W4', status:'closed', flow:0   },
  ],
  alerts: [
    { id:1, type:'critical', msg:'East Stand at 97% capacity — crowd surge risk detected', time:'18:42', zone:'East Stand' },
    { id:2, type:'warn',     msg:'Gate E2 queue exceeds 12 minutes — staff reallocation needed', time:'18:39', zone:'Gate E2' },
    { id:3, type:'warn',     msg:'Food Court occupancy at 88% — open backup counters', time:'18:35', zone:'Food Court' },
    { id:4, type:'info',     msg:'Match halftime in 16 minutes — prepare dispersal routes', time:'18:30', zone:'All zones' },
    { id:5, type:'success',  msg:'West Stand queue cleared — staff deployment successful', time:'18:22', zone:'West Stand' },
    { id:6, type:'info',     msg:'VIP Gate lane added — high-value ticket holders redirected', time:'18:15', zone:'VIP Zone' },
  ],
  concessions: [
    { id:'C1', name:'Main Food Court A', zone:'North', status:'open',   orders:1840, revenue:1200000, wait:1.8, stock:'OK'       },
    { id:'C2', name:'Main Food Court B', zone:'South', status:'busy',   orders:2240, revenue:1600000, wait:4.2, stock:'LOW'      },
    { id:'C3', name:'East Kiosk 1',      zone:'East',  status:'open',   orders:980,  revenue:680000,  wait:2.1, stock:'OK'       },
    { id:'C4', name:'East Kiosk 2',      zone:'East',  status:'busy',   orders:1120, revenue:740000,  wait:5.1, stock:'OK'       },
    { id:'C5', name:'West Lounge Bar',   zone:'West',  status:'open',   orders:620,  revenue:540000,  wait:1.2, stock:'LOW'      },
    { id:'C6', name:'VIP Dining',        zone:'VIP',   status:'open',   orders:340,  revenue:980000,  wait:0.8, stock:'OK'       },
    { id:'C7', name:'North Snack Bar',   zone:'North', status:'closed', orders:0,    revenue:0,       wait:0,   stock:'CRITICAL' },
    { id:'C8', name:'South Corner',      zone:'South', status:'open',   orders:760,  revenue:480000,  wait:3.2, stock:'OK'       },
  ],
};

let alertIdSeq = 100;

function queueStatus(wait) {
  return wait < 4 ? 'green' : wait < 9 ? 'amber' : 'red';
}

// ─── REST API ────────────────────────────────────────────────────────────────

// Health
app.get('/api/health', (_, res) => res.json({ ok: true, ts: Date.now() }));

// Full state snapshot
app.get('/api/state', (_, res) => res.json(state));

// Zones
app.get('/api/zones', (_, res) => res.json(state.zones));

// Queues
app.get('/api/queues', (_, res) => res.json(state.queues));

app.post('/api/queues/rebalance', (_, res) => {
  state.queues.forEach(q => {
    if (q.status === 'red')   { q.wait = Math.max(3, q.wait - 4); q.people = Math.max(50, q.people - 80); }
    if (q.status === 'amber') { q.wait = Math.max(2, q.wait - 1.5); }
    q.status = queueStatus(q.wait);
  });
  io.emit('state:update', { queues: state.queues });
  res.json({ ok: true, queues: state.queues });
});

// Gates
app.get('/api/gates', (_, res) => res.json(state.gates));

app.post('/api/gates/:id/toggle', (req, res) => {
  const gate = state.gates.find(g => g.id === req.params.id);
  if (!gate) return res.status(404).json({ error: 'Gate not found' });
  const cycle = { open: 'busy', busy: 'closed', closed: 'open' };
  gate.status = cycle[gate.status];
  gate.flow = gate.status === 'closed' ? 0 : Math.floor(Math.random() * 400 + 150);
  io.emit('state:update', { gates: state.gates });
  res.json({ ok: true, gate });
});

app.post('/api/gates/open-all', (_, res) => {
  state.gates.forEach(g => { g.status = 'open'; g.flow = Math.floor(Math.random() * 300 + 200); });
  io.emit('state:update', { gates: state.gates });
  res.json({ ok: true });
});

app.post('/api/gates/close-all', (_, res) => {
  state.gates.forEach(g => { g.status = 'closed'; g.flow = 0; });
  io.emit('state:update', { gates: state.gates });
  res.json({ ok: true });
});

// Alerts
app.get('/api/alerts', (_, res) => res.json(state.alerts));

app.post('/api/alerts', (req, res) => {
  const { type = 'info', msg, zone = 'System' } = req.body;
  const alert = {
    id: ++alertIdSeq,
    type,
    msg: msg || 'System alert',
    zone,
    time: new Date().toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' }),
  };
  state.alerts.unshift(alert);
  io.emit('state:update', { alerts: state.alerts });
  res.status(201).json({ ok: true, alert });
});

app.delete('/api/alerts', (_, res) => {
  state.alerts = [];
  io.emit('state:update', { alerts: state.alerts });
  res.json({ ok: true });
});

// Concessions
app.get('/api/concessions', (_, res) => res.json(state.concessions));

app.post('/api/concessions/:id/restock', (req, res) => {
  const c = state.concessions.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'Stand not found' });
  c.stock = 'OK';
  io.emit('state:update', { concessions: state.concessions });
  res.json({ ok: true, concession: c });
});

// Push notification stub
app.post('/api/routing/push', (req, res) => {
  const { queueId, message } = req.body;
  io.emit('push:notification', { queueId, message, ts: Date.now() });
  res.json({ ok: true, sent: true });
});

// Catch-all → SPA
app.get('*', (_, res) => res.sendFile(path.join(__dirname, '../public/index.html')));

// ─── WEBSOCKET ───────────────────────────────────────────────────────────────

io.on('connection', socket => {
  socket.emit('state:snapshot', state);

  socket.on('gate:toggle', id => {
    const gate = state.gates.find(g => g.id === id);
    if (!gate) return;
    const cycle = { open: 'busy', busy: 'closed', closed: 'open' };
    gate.status = cycle[gate.status];
    gate.flow = gate.status === 'closed' ? 0 : Math.floor(Math.random() * 400 + 150);
    io.emit('state:update', { gates: state.gates });
  });

  socket.on('queues:rebalance', () => {
    state.queues.forEach(q => {
      if (q.status === 'red')   { q.wait = Math.max(3, q.wait - 4); q.people = Math.max(50, q.people - 80); }
      if (q.status === 'amber') { q.wait = Math.max(2, q.wait - 1.5); }
      q.status = queueStatus(q.wait);
    });
    io.emit('state:update', { queues: state.queues });
  });
});

// ─── LIVE SIMULATION TICK ────────────────────────────────────────────────────

setInterval(() => {
  // Attendance drift
  state.attendance = Math.min(state.meta.capacity, state.attendance + Math.floor(Math.random() * 8 - 2));

  // Zone occupancy micro-changes
  state.zones.forEach(z => {
    z.pct = Math.min(100, Math.max(20, z.pct + Math.floor(Math.random() * 3 - 1)));
  });

  // Queue wait drift
  state.queues.forEach(q => {
    q.wait = Math.max(0.5, +(q.wait + (Math.random() * 0.6 - 0.3)).toFixed(1));
    q.people = Math.max(5, q.people + Math.floor(Math.random() * 10 - 5));
    q.status = queueStatus(q.wait);
  });

  // Match time
  if (state.meta.matchTime < 90) state.meta.matchTime += 1;

  io.emit('state:tick', {
    attendance: state.attendance,
    zones: state.zones,
    queues: state.queues,
    matchTime: state.meta.matchTime,
  });
}, 3000);

// ─── START ───────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 8080;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`VenueIQ server running on port ${PORT}`);
});
