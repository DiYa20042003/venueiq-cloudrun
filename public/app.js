// ─── STATE ────────────────────────────────────────────────────────────────────
let appState = { zones:[], queues:[], gates:[], alerts:[], concessions:[], attendance:0, matchTime:74 };
let alertFilter = 'all';

// ─── SOCKET ──────────────────────────────────────────────────────────────────
const socket = io();
const wsDot = document.getElementById('ws-dot');
const wsLabel = document.getElementById('ws-label');

socket.on('connect', () => {
  if (wsDot) wsDot.classList.add('connected');
  if (wsLabel) wsLabel.textContent = 'Live';
});

socket.on('disconnect', () => {
  if (wsDot) wsDot.classList.remove('connected');
  if (wsLabel) wsLabel.textContent = 'Reconnecting…';
});

socket.on('state:snapshot', data => {
  Object.assign(appState, data);
  renderAll();
});

socket.on('state:update', patch => {
  Object.assign(appState, patch);
  renderAll();
});

socket.on('state:tick', patch => {
  if (patch.attendance)  appState.attendance = patch.attendance;
  if (patch.zones)       appState.zones = patch.zones;
  if (patch.queues)      appState.queues = patch.queues;
  if (patch.matchTime)   appState.matchTime = patch.matchTime;
  renderTick();
});

// ─── API HELPERS ─────────────────────────────────────────────────────────────
async function apiPost(url, body) {
  try {
    const r = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
    const d = await r.json();
    if (d.ok) showToast('Action applied', 'success');
    return d;
  } catch(e) { showToast('Request failed', 'error'); }
}

async function apiDelete(url) {
  try {
    await fetch(url, { method:'DELETE' });
    showToast('Cleared', 'success');
  } catch(e) {}
}

// ─── TOAST ───────────────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg, type='info') {
  const t = document.getElementById('toast');
  if (!t) return;
  const icons = {info:'ℹ',success:'✓',warn:'⚠',error:'✗'};
  const colors = {info:'var(--accent)',success:'var(--success)',warn:'var(--warn)',error:'var(--danger)'};
  document.getElementById('toast-msg').textContent = msg;
  document.getElementById('toast-icon').textContent = icons[type]||'ℹ';
  t.style.borderLeftColor = `var(--${type==='error'?'danger':type==='info'?'accent':type})`;
  t.style.boxShadow = `0 10px 40px rgba(0,0,0,0.5), 0 0 20px ${colors[type]}40`;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>t.classList.remove('show'), 3000);
}

// ─── TABS / NAVIGATION ───────────────────────────────────────────────────────
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    const panel = btn.dataset.panel;
    document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(t=>t.classList.remove('active'));
    const targetPanel = document.getElementById('panel-'+panel);
    if (targetPanel) targetPanel.classList.add('active');
    btn.classList.add('active');
    if (panel==='concessions') setTimeout(renderMenuChart, 80);
    if (panel==='crowd') setTimeout(renderFlowChart, 80);
  });
});

function switchTab(name) {
  const btn = document.querySelector(`.nav-item[data-panel="${name}"]`);
  if (btn) btn.click();
}

// ─── RENDER ALL ───────────────────────────────────────────────────────────────
function renderAll() {
  renderHeaderStats();
  renderZoneBars();
  renderMapLabels();
  renderQueues();
  renderGates();
  renderAlerts();
  renderConcessions();
  renderTimeline();
  renderSecurityLists();
  renderHotspots();
  renderSectorHeatmap();
  renderCrowdDots();
  setTimeout(renderAttendanceChart, 80);
  setTimeout(renderMenuChart, 80);
  setTimeout(renderFlowChart, 80);
}

// ─── TICK (lightweight) ───────────────────────────────────────────────────────
function renderTick() {
  renderHeaderStats();
  renderZoneBars();
  renderMapLabels();
  renderQueueStats();
  renderGateStats();
}

// ─── HEADER STATS ─────────────────────────────────────────────────────────────
function renderHeaderStats() {
  const s = appState;
  animateValue('s-attendance', parseInt(document.getElementById('s-attendance')?.textContent?.replace(/,/g,''))||0, s.attendance||0, 1000);
  setText('match-time', s.matchTime||74);
  setText('cf-footfall', (s.attendance||0).toLocaleString());

  const critCount = (s.alerts||[]).filter(a=>a.type==='critical').length;
  const warnCount = (s.alerts||[]).filter(a=>a.type==='warn').length;
  setText('s-alerts', (s.alerts||[]).length);
  setText('s-alerts-sub', `${critCount} critical, ${warnCount} warnings`);

  const activeGates = (s.gates||[]).filter(g=>g.status!=='closed').length;
  setText('s-gates', activeGates+'/'+((s.gates||[]).length||16));

  const avgs = (s.queues||[]);
  if (avgs.length) {
    const avg = avgs.reduce((a,q)=>a+q.wait,0)/avgs.length;
    setText('s-avgwait', avg.toFixed(1)+'min');
  }
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function animateValue(id, start, end, duration) {
  if (start === end) {
      setText(id, end.toLocaleString());
      return;
  }
  const obj = document.getElementById(id);
  if (!obj) return;
  let startTimestamp = null;
  const step = (timestamp) => {
    if (!startTimestamp) startTimestamp = timestamp;
    const progress = Math.min((timestamp - startTimestamp) / duration, 1);
    const easeOutQuart = 1 - Math.pow(1 - progress, 4);
    const current = Math.floor(easeOutQuart * (end - start) + start);
    obj.innerHTML = current.toLocaleString();
    if (progress < 1) {
      window.requestAnimationFrame(step);
    } else {
      obj.innerHTML = end.toLocaleString();
    }
  };
  window.requestAnimationFrame(step);
}


// ─── ZONE BARS ────────────────────────────────────────────────────────────────
function renderZoneBars() {
  const el = document.getElementById('zone-bars');
  if (!el || !appState.zones) return;
  el.innerHTML = appState.zones.map(z => {
    const color = z.pct>90?'var(--danger)':z.pct>75?'var(--warn)':'var(--success)';
    return `<div class="zone-row">
      <div class="zone-name">${z.name.split(' ')[0]}</div>
      <div class="zone-bar-track"><div class="zone-bar-fill" style="width:${z.pct}%;background:${color};box-shadow: 0 0 10px ${color}"></div></div>
      <div class="zone-pct" style="color:${color}">${z.pct}%</div>
    </div>`;
  }).join('');

  const rec = document.getElementById('recommendations');
  if (rec) {
    const hot = appState.zones.filter(z=>z.pct>90);
    rec.innerHTML = hot.length
      ? hot.map(z=>`→ Redirect away from <b style="color:var(--text)">${z.name}</b> (${z.pct}%)`).join('<br>')
      : '<span style="color:var(--success)">All zones within safe limits</span>';
  }
}

// ─── MAP LABELS ───────────────────────────────────────────────────────────────
function renderMapLabels() {
  if (!appState.zones) return;
  const find = id => appState.zones.find(z=>z.id===id);
  const n=find('north'), s=find('south'), w=find('west'), e=find('east');
  if (n) { setText('lbl-north', `NORTH  ${n.pct}%`); updateMapZone('map-north', n.pct); }
  if (s) { setText('lbl-south', `SOUTH  ${s.pct}%`); updateMapZone('map-south', s.pct); }
  if (w) { setText('lbl-west-p', `${w.pct}%`); updateMapZone('map-west', w.pct); }
  if (e) { setText('lbl-east-p', `${e.pct}%`); updateMapZone('map-east', e.pct); }
}

function updateMapZone(id, pct) {
    const el = document.getElementById(id);
    if (!el) return;
    const r = pct>90?255:pct>75?255:0;
    const g = pct>90?23:pct>75?171:230;
    const b = pct>90?68:pct>75?0:118;
    el.style.fill = `rgba(${r},${g},${b},0.15)`;
    el.style.stroke = `rgba(${r},${g},${b},0.8)`;
    if (pct>90) {
        el.style.animation = 'pulse 1.5s infinite';
    } else {
        el.style.animation = 'none';
    }
}


// ─── CROWD DOTS ───────────────────────────────────────────────────────────────
function renderCrowdDots() {
  const g = document.getElementById('crowd-dots');
  if (!g) return;
  const zones=[{x:[145,445],y:[15,60]},{x:[145,445],y:[278,328]},{x:[12,128],y:[65,270]},{x:[468,588],y:[65,270]}];
  const colors=['#00f0ff','#ffab00','#ff1744','#00e676'];
  let h='';
  for(let i=0;i<100;i++){
    const z=zones[Math.floor(Math.random()*4)];
    const x=(z.x[0]+Math.random()*(z.x[1]-z.x[0])).toFixed(1);
    const y=(z.y[0]+Math.random()*(z.y[1]-z.y[0])).toFixed(1);
    const color = colors[Math.floor(Math.random()*4)];
    h+=`<circle cx="${x}" cy="${y}" r="1.5" fill="${color}" opacity="${(.4+Math.random()*.6).toFixed(2)}" filter="blur(0.5px)"/>`;
  }
  g.innerHTML=h;
}

// ─── QUEUES ───────────────────────────────────────────────────────────────────
function renderQueues() {
  const el = document.getElementById('queue-list');
  if (!el || !appState.queues) return;
  const colors={green:'var(--success)',amber:'var(--warn)',red:'var(--danger)'};
  const sorted=[...appState.queues].sort((a,b)=>b.wait-a.wait);
  el.innerHTML = sorted.map(q=>`
    <div class="queue-item">
      <div class="queue-indicator" style="background:${colors[q.status]}"></div>
      <div style="flex:1; margin-left: 12px">
        <div class="queue-name">${q.name}</div>
        <div class="queue-meta">${q.people} people · ${q.zone}</div>
      </div>
      <div style="text-align:right">
        <div class="queue-time" style="color:${colors[q.status]}">${q.wait}min</div>
        <button class="btn btn-sm" style="margin-top:6px" onclick="apiPost('/api/routing/push',{queueId:'${q.id}',message:'Use alternate gate'})">Redirect</button>
      </div>
    </div>`).join('');

  renderQueueStats();

  const rs = document.getElementById('routing-suggestions');
  if (rs) {
    rs.innerHTML = appState.queues.filter(q=>q.status!=='green').slice(0,3).map(q=>`
      <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:14px;margin-bottom:8px">
        <div style="font-size:13px;font-weight:600;margin-bottom:6px;display:flex;justify-content:space-between">
            <span>${q.name}</span>
            <span style="color:var(--warn)">${q.wait}min wait</span>
        </div>
        <div style="font-size:12px;color:var(--muted);margin-bottom:10px">Redirect to nearest underutilised gate</div>
        <button class="btn btn-sm btn-accent" style="width:100%" onclick="apiPost('/api/routing/push',{queueId:'${q.id}',message:'Alternate gate recommended'})">Send Push Notification</button>
      </div>`).join('');
  }
}

function renderQueueStats() {
  if (!appState.queues||!appState.queues.length) return;
  const sorted=[...appState.queues].sort((a,b)=>a.wait-b.wait);
  const mn=sorted[0], mx=sorted[sorted.length-1];
  setText('q-min', mn.wait+'min');
  setText('q-min-label', mn.name);
  setText('q-max', mx.wait+'min');
  setText('q-max-label', mx.name);
}

// ─── GATES ────────────────────────────────────────────────────────────────────
function renderGates() {
  const el = document.getElementById('gate-grid');
  if (!el || !appState.gates) return;
  el.innerHTML = appState.gates.map(g=>`
    <div class="gate-cell ${g.status}" onclick="toggleGate('${g.id}')">
      <div class="gate-num">G-${g.id}</div>
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--${g.status==='open'?'success':g.status==='busy'?'warn':'danger'});margin-bottom:3px">${g.status}</div>
      <div class="gate-flow">${g.flow>0?g.flow+'/hr':'—'}</div>
    </div>`).join('');
  renderGateStats();
}

function renderGateStats() {
  if (!appState.gates) return;
  setText('g-open', appState.gates.filter(g=>g.status==='open').length);
  setText('g-busy', appState.gates.filter(g=>g.status==='busy').length);
  setText('g-closed', appState.gates.filter(g=>g.status==='closed').length);
  const totalFlow = appState.gates.filter(g=>g.status!=='closed').reduce((s,g)=>s+g.flow,0);
  setText('g-scans', Math.round(totalFlow/60));
  setText('s-gates', appState.gates.filter(g=>g.status!=='closed').length+'/'+appState.gates.length);
}

window.toggleGate = function(id) {
  socket.emit('gate:toggle', id);
  showToast(`Gate ${id} toggled`, 'info');
}

// ─── ALERTS ───────────────────────────────────────────────────────────────────
function renderAlerts() {
  const el = document.getElementById('alert-list');
  const alerts = appState.alerts||[];
  const filtered = alertFilter==='all'?alerts:alerts.filter(a=>a.type===alertFilter);
  const html = filtered.map(a=>`
    <div class="alert-item ${a.type}">
      <div class="alert-text"><div style="font-weight:500;color:var(--text);margin-bottom:4px">${a.msg}</div><div style="font-size:12px;color:var(--muted)">${a.zone}</div></div>
      <div class="alert-time">${a.time}</div>
    </div>`).join('') || '<div style="text-align:center;color:var(--muted);padding:32px;font-size:14px">No active alerts</div>';
  if (el) el.innerHTML = html;

  const mini = document.getElementById('recent-alerts-mini');
  if (mini) {
    mini.innerHTML = alerts.slice(0,3).map(a=>`
      <div class="alert-item ${a.type}" style="margin-bottom:8px; padding: 10px">
        <div class="alert-text" style="font-size:12px">${a.msg.substring(0,55)}…</div>
      </div>`).join('');
  }
}

window.filterAlerts = function(type, btn) {
  alertFilter=type;
  document.querySelectorAll('#alert-filter-row .btn').forEach(b=>b.classList.remove('btn-accent'));
  btn.classList.add('btn-accent');
  renderAlerts();
}

window.simulateAlert = function() {
  const types=['critical','warn','info','success'];
  const msgs=['Suspicious activity near Gate W3','Concession C4 offline — backup needed','VIP guests arriving at Gate V1','Staff rotation complete — all zones covered'];
  const zones=['Gate W3','Concession C4','VIP Zone','All Zones'];
  const i=Math.floor(Math.random()*4);
  apiPost('/api/alerts',{type:types[i],msg:msgs[i],zone:zones[i]});
}

// ─── CONCESSIONS ─────────────────────────────────────────────────────────────
function renderConcessions() {
  const el=document.getElementById('concession-table');
  if(!el||!appState.concessions) return;
  const sp={open:'pill-green',busy:'pill-amber',closed:'pill-red'};
  const sk={OK:'pill-green',LOW:'pill-amber',CRITICAL:'pill-red'};
  el.innerHTML=`<thead><tr><th>Stand</th><th>Zone</th><th>Status</th><th>Orders</th><th>Revenue</th><th>Wait</th><th>Stock</th><th>Action</th></tr></thead>
  <tbody>${appState.concessions.map(c=>`<tr>
    <td style="font-weight:500">${c.name}</td>
    <td style="color:var(--muted)">${c.zone}</td>
    <td><span class="pill ${sp[c.status]}">${c.status}</span></td>
    <td style="font-family:var(--mono)">${c.orders.toLocaleString()}</td>
    <td style="font-family:var(--mono);color:var(--success)">₹${(c.revenue/100000).toFixed(1)}L</td>
    <td style="font-family:var(--mono)">${c.wait>0?c.wait+'min':'—'}</td>
    <td><span class="pill ${sk[c.stock]}">${c.stock}</span></td>
    <td><button class="btn btn-sm" onclick="apiPost('/api/concessions/${c.id}/restock',{})">${c.status==='closed'?'Open':'Restock'}</button></td>
  </tr>`).join('')}</tbody>`;

  const low=appState.concessions.filter(c=>c.stock!=='OK');
  setText('low-stock-count', low.length);
  const sa=document.getElementById('stock-alerts');
  if(sa) sa.innerHTML=low.map(c=>`
    <div class="alert-item ${c.stock==='CRITICAL'?'critical':'warn'}">
      <div class="alert-text"><div style="font-weight:600;color:var(--text)">${c.name}</div><div style="font-size:12px;color:var(--muted)">${c.stock} · ${c.zone}</div></div>
      <button class="btn btn-sm btn-accent" onclick="apiPost('/api/concessions/${c.id}/restock',{})">Restock</button>
    </div>`).join('');
}

window.restockAll = function() {
  (appState.concessions||[]).filter(c=>c.stock!=='OK').forEach(c=>apiPost('/api/concessions/'+c.id+'/restock',{}));
  showToast('All restock orders placed','success');
}

// ─── TIMELINE ─────────────────────────────────────────────────────────────────
function renderTimeline() {
  const el=document.getElementById('match-timeline');
  if(!el) return;
  const items=[
    {time:'17:00',text:'Gates opened — smooth entry flow',active:false},
    {time:'17:45',text:'Peak entry period begins',active:false},
    {time:'18:00',text:'Kickoff — East stand surge detected',active:false},
    {time:'18:15',text:'VIP lane added, West queue cleared',active:false},
    {time:'18:35',text:'Food Court backup counters opened',active:true},
    {time:'~18:58',text:'Halftime — dispersal prep active',active:false},
    {time:'~21:00',text:'Predicted match end + exit plan',active:false},
  ];
  el.innerHTML=items.map(i=>`<div class="timeline-item ${i.active?'active':''}"><div class="timeline-time">${i.time}</div><div class="timeline-text" style="color:${i.active?'var(--text)':'var(--muted)'}">${i.text}</div></div>`).join('');
}

// ─── SECURITY / STAFF ─────────────────────────────────────────────────────────
function renderSecurityLists() {
  const sl=document.getElementById('security-list');
  if(sl) sl.innerHTML=[
    {t:'Perimeter check — all clear',ts:'18:40'},
    {t:'CCTV: 48/48 cameras active',ts:'18:38'},
    {t:'Medical team on standby — Section E7',ts:'18:35'},
  ].map(i=>`<div class="alert-item success"><div class="alert-text">${i.t}</div><div class="alert-time">${i.ts}</div></div>`).join('');

  const stl=document.getElementById('staff-list');
  if(stl) stl.innerHTML=[
    {zone:'East Stand',count:18,role:'Queue + Crowd'},
    {zone:'South Stand',count:12,role:'Crowd Control'},
    {zone:'Food Court',count:8,role:'Queue Management'},
    {zone:'Gates E1-E4',count:10,role:'Gate Officers'},
  ].map(s=>`<div class="queue-item"><div style="flex:1"><div class="queue-name">${s.zone}</div><div class="queue-meta">${s.role}</div></div><div class="queue-time" style="color:var(--accent); text-shadow: 0 0 10px var(--accent)">${s.count}</div></div>`).join('');
}

// ─── HOTSPOTS ─────────────────────────────────────────────────────────────────
function renderHotspots() {
  const el=document.getElementById('hotspot-list');
  if(!el||el.children.length) return;
  [{name:'East Stand Entry Cluster',pct:97,action:'Open overflow routes'},{name:'Food Court Central',pct:88,action:'Activate backup counters'},{name:'South Gate S1',pct:72,action:'Monitor closely'}].forEach(h=>{
    const color=h.pct>90?'var(--danger)':h.pct>75?'var(--warn)':'var(--success)';
    const div=document.createElement('div');
    div.className='queue-item';
    div.innerHTML=`<div style="flex:1"><div class="queue-name">${h.name}</div><div class="queue-meta">${h.action}</div></div><div style="text-align:right"><span class="pill" style="background:${color}22;color:${color}">${h.pct>90?'CRITICAL':h.pct>75?'HIGH':'MEDIUM'}</span><div style="font-size:12px;color:var(--muted);margin-top:4px;font-family:var(--mono)">${h.pct}%</div></div>`;
    el.appendChild(div);
  });
}

// ─── SECTOR HEATMAP ──────────────────────────────────────────────────────────
function renderSectorHeatmap() {
  const el=document.getElementById('sector-heatmap');
  if(!el||el.children.length) return;
  const vals=[55,72,94,88,67,45,82,91,48,63,97,85,72,58,76,89,40,55,78,92,68,45,62,80,52,69,84,97,71,48,60,75,45,58,72,88,65,50,68,84,38,52,65,79,55,42,58,72,44,60,75,90,64,47,63,78,50,66,82,96,70,44,60,74];
  el.innerHTML=vals.map((v,i)=>{
    const r=v>90?255:v>75?255:v>60?0:0;
    const g=v>90?23:v>75?171:v>60?240:230;
    const b=v>90?68:v>75?0:v>60?255:118;
    return `<div title="Sector ${i+1}: ${v}%" style="background:rgba(${r},${g},${b},${(v/100*.8+.1).toFixed(2)});height:24px;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:10px;font-family:var(--mono);color:rgba(255,255,255,.9);font-weight:600">${v}</div>`;
  }).join('');
}

// ─── CHARTS ──────────────────────────────────────────────────────────────────
function renderAttendanceChart() {
  const c=document.getElementById('attendance-chart');
  if(!c) return;
  const ctx=c.getContext('2d');
  const w=c.offsetWidth,h=120;
  c.width=w;c.height=h;
  const pts=[0,2800,8200,18400,31200,39800,44100,46200,appState.attendance||47832];
  ctx.clearRect(0,0,w,h);
  
  // Smooth line
  ctx.strokeStyle='#00f0ff';
  ctx.lineWidth=3;
  ctx.shadowBlur = 10;
  ctx.shadowColor = '#00f0ff';
  
  ctx.beginPath();
  pts.forEach((v,i)=>{
      const x=i/(pts.length-1)*w;
      const y=h-(v/52000)*(h-10) - 5;
      if (i===0) ctx.moveTo(x,y);
      else {
          const px=(i-1)/(pts.length-1)*w;
          const py=h-(pts[i-1]/52000)*(h-10) - 5;
          const cx=(x+px)/2;
          ctx.bezierCurveTo(cx,py,cx,y,x,y);
      }
  });
  ctx.stroke();
  
  // Gradient fill
  ctx.shadowBlur = 0;
  const grad = ctx.createLinearGradient(0,0,0,h);
  grad.addColorStop(0, 'rgba(0, 240, 255, 0.3)');
  grad.addColorStop(1, 'rgba(0, 240, 255, 0)');
  ctx.fillStyle = grad;
  ctx.lineTo(w,h);ctx.lineTo(0,h);ctx.fill();
}

function renderMenuChart() {
  const c=document.getElementById('menu-chart');
  if(!c) return;
  const ctx=c.getContext('2d');
  const w=c.offsetWidth,h=180;
  c.width=w;c.height=h;
  const items=[{n:'Burgers',v:3200,c:'#00f0ff'},{n:'Drinks',v:4800,c:'#d500f9'},{n:'Pizza',v:2100,c:'#ffab00'},{n:'Snacks',v:2800,c:'#00e676'},{n:'Merch',v:1200,c:'#ff1744'}];
  const max=Math.max(...items.map(i=>i.v));
  const gap=w/items.length;
  const bw=gap*.5;
  
  ctx.clearRect(0,0,w,h);
  
  items.forEach((item,i)=>{
    const bh=(item.v/max)*(h-40);
    const x=gap*i+gap*.25;
    
    // Bar gradient
    const grad = ctx.createLinearGradient(0,h-30-bh,0,h-30);
    grad.addColorStop(0, item.c);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle=grad;
    
    // Bar body with glow
    ctx.shadowBlur = 10;
    ctx.shadowColor = item.c;
    ctx.fillRect(x,h-30-bh,bw,bh);
    
    ctx.shadowBlur = 0;
    // Top cap
    ctx.fillStyle='#fff';
    ctx.fillRect(x,h-30-bh,bw,3);
    
    // Text
    ctx.fillStyle='rgba(255,255,255,.7)';ctx.font='11px Outfit';ctx.textAlign='center';
    ctx.fillText(item.n,x+bw/2,h-10);
    ctx.fillStyle='#fff';ctx.font='bold 11px Space Mono';
    ctx.fillText(item.v.toLocaleString(),x+bw/2,h-30-bh-8);
  });
}

function renderFlowChart() {
  const c=document.getElementById('flow-chart');
  if(!c) return;
  const ctx=c.getContext('2d');
  const w=c.offsetWidth,h=200;
  c.width=w;c.height=h;
  if(!appState.gates||!appState.gates.length) return;
  const clusters=[
    {n:'North',ids:['N1','N2','N3','N4'],col:'#00f0ff'},
    {n:'East', ids:['E1','E2','E3','E4'],col:'#ff1744'},
    {n:'South',ids:['S1','S2','S3','S4'],col:'#ffab00'},
    {n:'West', ids:['W1','W2','W3','W4'],col:'#d500f9'},
  ];
  const max=700;
  const totalSlots=clusters.reduce((a,c)=>a+c.ids.length,0);
  const bw=Math.min(24,(w-80)/(totalSlots+clusters.length));
  let xi=30;
  
  ctx.clearRect(0,0,w,h);
  
  clusters.forEach(cl=>{
    cl.ids.forEach(gid=>{
      const gate=appState.gates.find(g=>g.id===gid);
      const v=gate?gate.flow:0;
      const bh=(v/max)*(h-50);
      
      const grad = ctx.createLinearGradient(0,h-40-bh,0,h-40);
      grad.addColorStop(0, cl.col);
      grad.addColorStop(1, 'rgba(0,0,0,0.2)');
      
      ctx.fillStyle=grad;
      ctx.fillRect(xi,h-40-bh,bw,bh);
      
      ctx.fillStyle='#fff';
      ctx.fillRect(xi,h-40-bh,bw,2);
      
      xi+=bw+6;
    });
    ctx.fillStyle='rgba(255,255,255,0.7)';ctx.font='12px Outfit';ctx.textAlign='center';
    ctx.fillText(cl.n,xi-cl.ids.length*(bw+6)/2,h-15);
    xi+=12;
  });
}

// ─── INIT ────────────────────────────────────────────────────────────────────
fetch('/api/state').then(r=>r.json()).then(data=>{
  Object.assign(appState, data);
  renderAll();
}).catch(()=>{});

// Global API exposure for inline handlers
window.apiPost = apiPost;
window.apiDelete = apiDelete;
