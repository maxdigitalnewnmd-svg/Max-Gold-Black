const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const AUTH_TOKEN = process.env.MAX_AUTH_TOKEN || 'MAXTRAIDE-SOVEREIGN-CLOUD-2026';

app.use(cors());
app.use(express.json());

// Almacén en memoria de estado soberano de MAXTRAIDE AI
let state = {
  service: 'MAXTRAIDE AI Cloud Gateway',
  version: '2.0.0',
  connected: false,
  last_heartbeat: null,
  telemetry: {
    status: 'Iniciando conexión local...',
    saldo: 0.0,
    tipo_cuenta: 'training',
    is_scanning: false,
    pares_activos: 0,
    modo: 'Automático',
    ia_max: {
      avatar_status: '● Activa',
      tarea_activa: 'Vigilancia General',
      gemini_health: '200 OK',
      pureza_memoria: '100% Pura'
    }
  },
  trades: [],
  command_queue: []
};

// Middleware opcional de autenticación para endpoints de mutación
function verifyAuth(req, res, next) {
  const token = req.headers['x-max-auth-token'] || req.query.token;
  if (AUTH_TOKEN && token && token !== AUTH_TOKEN) {
    return res.status(401).json({ error: 'Token de autorización inválido' });
  }
  next();
}

// 1. Healthcheck estándar para Render (previene reinicios)
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'MAXTRAIDE AI Cloud Gateway',
    version: '2.0.0',
    ia_max_ready: true,
    last_heartbeat: state.last_heartbeat,
    server_time: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: Date.now() });
});

// 2. Telemetría enviada por el software local de escritorio
app.post('/api/telemetry', verifyAuth, (req, res) => {
  const data = req.body || {};
  state.connected = true;
  state.last_heartbeat = new Date().toISOString();
  state.telemetry = {
    ...state.telemetry,
    ...data,
    updated_at: state.last_heartbeat
  };
  res.json({ success: true, timestamp: state.last_heartbeat });
});

app.get('/api/status', (req, res) => {
  res.json({
    connected: state.connected && (Date.now() - new Date(state.last_heartbeat || 0).getTime() < 120000),
    last_heartbeat: state.last_heartbeat,
    telemetry: state.telemetry
  });
});

// 3. Registro de operaciones y autopsias forenses
app.post('/api/trades', verifyAuth, (req, res) => {
  const trade = req.body;
  if (trade && trade.par) {
    state.trades.unshift({
      id: Date.now(),
      timestamp: new Date().toISOString(),
      ...trade
    });
    // Conservar las últimas 50 operaciones
    if (state.trades.length > 50) {
      state.trades = state.trades.slice(0, 50);
    }
  }
  res.json({ success: true, count: state.trades.length });
});

app.get('/api/trades', (req, res) => {
  res.json({ trades: state.trades });
});

// 4. Cola de Comandos Remotos (Lista para futuras funciones)
app.post('/api/commands', verifyAuth, (req, res) => {
  const { command, payload } = req.body || {};
  if (!command) {
    return res.status(400).json({ error: 'Comando requerido' });
  }
  const cmdObj = {
    id: `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    command,
    payload: payload || {},
    status: 'pending',
    created_at: new Date().toISOString()
  };
  state.command_queue.push(cmdObj);
  res.json({ success: true, command: cmdObj });
});

app.get('/api/commands/pending', verifyAuth, (req, res) => {
  const pending = state.command_queue.filter(c => c.status === 'pending');
  res.json({ commands: pending });
});

app.post('/api/commands/:id/ack', verifyAuth, (req, res) => {
  const { id } = req.params;
  const { result, error } = req.body || {};
  const cmd = state.command_queue.find(c => c.id === id);
  if (cmd) {
    cmd.status = error ? 'failed' : 'completed';
    cmd.result = result;
    cmd.error = error;
    cmd.acknowledged_at = new Date().toISOString();
    return res.json({ success: true, command: cmd });
  }
  res.status(404).json({ error: 'Comando no encontrado' });
});

// 5. Tablero Visual Web Ultra-Moderno (Monitoreo desde Teléfono o Navegador)
app.get('/dashboard', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MAXTRAIDE AI • Sovereign Cloud Monitor</title>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;800&family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0b0e14;
      --card: #151a24;
      --border: #232b3b;
      --cyan: #00d2ff;
      --green: #20c997;
      --red: #dc3545;
      --text: #e2e8f0;
      --muted: #8892b0;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: 'Inter', sans-serif;
      padding: 20px;
      display: flex;
      flex-direction: column;
      align-items: center;
      min-height: 100vh;
    }
    .header {
      width: 100%;
      max-width: 900px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 20px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 25px;
    }
    .brand { font-size: 22px; font-weight: 800; color: #fff; letter-spacing: -0.5px; }
    .brand span { color: var(--cyan); }
    .status-badge {
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      padding: 6px 14px;
      border-radius: 20px;
      background: rgba(32, 201, 151, 0.15);
      color: var(--green);
      border: 1px solid rgba(32, 201, 151, 0.3);
      font-weight: 600;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 15px;
      width: 100%;
      max-width: 900px;
      margin-bottom: 25px;
    }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 18px;
    }
    .card-title { font-size: 12px; color: var(--muted); text-transform: uppercase; font-weight: 700; margin-bottom: 8px; }
    .card-val { font-size: 24px; font-weight: 800; font-family: 'JetBrains Mono', monospace; color: #fff; }
    .card-sub { font-size: 12px; color: var(--muted); margin-top: 6px; }
    .trades-card { width: 100%; max-width: 900px; }
    .trade-row {
      display: flex;
      justify-content: space-between;
      padding: 12px 16px;
      border-bottom: 1px solid rgba(255,255,255,0.05);
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
    }
    .win { color: var(--green); font-weight: 700; }
    .loss { color: var(--red); font-weight: 700; }
  </style>
</head>
<body>
  <div class="header">
    <div class="brand">MAXTRAIDE <span>AI</span> • CLOUD</div>
    <div id="badge" class="status-badge">● CONECTANDO...</div>
  </div>

  <div class="grid">
    <div class="card">
      <div class="card-title">Saldo en Broker</div>
      <div id="saldo" class="card-val" style="color: var(--cyan);">$0.00 USD</div>
      <div id="tipo_cuenta" class="card-sub">Cuenta: Training</div>
    </div>
    <div class="card">
      <div class="card-title">Supervisión IA MAX</div>
      <div id="ia_max" class="card-val" style="color: var(--green);">● Activa</div>
      <div id="ia_tarea" class="card-sub">Tarea: Salud APIs 200 OK</div>
    </div>
    <div class="card">
      <div class="card-title">Radar Sniper</div>
      <div id="radar_status" class="card-val" style="color: #ffc107;">Esperando...</div>
      <div id="radar_pares" class="card-sub">0 pares en monitoreo</div>
    </div>
  </div>

  <div class="card trades-card">
    <div class="card-title" style="margin-bottom: 15px;">Últimas Operaciones & Autopsias Forenses</div>
    <div id="trades_list">
      <div style="text-align: center; color: var(--muted); padding: 30px; font-size: 13px;">
        Esperando telemetría del software local...
      </div>
    </div>
  </div>

  <script>
    async function actualizar() {
      try {
        const res = await fetch('/api/status');
        const data = await res.json();
        const t = data.telemetry || {};
        
        document.getElementById('badge').innerHTML = data.connected ? '● CONECTADO EN VIVO' : '○ ESPERANDO SOFTWARE LOCAL';
        document.getElementById('badge').style.color = data.connected ? 'var(--green)' : '#ffc107';
        
        if (t.saldo !== undefined) document.getElementById('saldo').innerText = '$' + Number(t.saldo).toFixed(2) + ' USD';
        if (t.tipo_cuenta) document.getElementById('tipo_cuenta').innerText = 'Cuenta: ' + t.tipo_cuenta.toUpperCase();
        if (t.ia_max && t.ia_max.avatar_status) document.getElementById('ia_max').innerText = t.ia_max.avatar_status;
        if (t.ia_max && t.ia_max.tarea_activa) document.getElementById('ia_tarea').innerText = 'Tarea: ' + t.ia_max.tarea_activa;
        if (t.is_scanning !== undefined) {
          document.getElementById('radar_status').innerText = t.is_scanning ? '🟢 Activo' : '⏸️ Detenido';
          document.getElementById('radar_status').style.color = t.is_scanning ? 'var(--green)' : 'var(--muted)';
        }
        if (t.pares_activos !== undefined) document.getElementById('radar_pares').innerText = t.pares_activos + ' pares en monitoreo';
      } catch (e) {
        console.error(e);
      }
    }
    setInterval(actualizar, 3000);
    actualizar();
  </script>
</body>
</html>
  `);
});

app.listen(PORT, () => {
  console.log(`🚀 [MAXTRAIDE AI CLOUD]: Gateway soberano activo en puerto ${PORT}`);
});
