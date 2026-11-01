const http = require('http');
const url = require('url');

const PORT = process.env.PORT || 3000;
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'maxcoldblack';
const FIRESTORE_BASE_URL = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;

// Tokens de aprobación temporal (firmados por Max Drag)
const aprobacionesActivas = new Map();

// Helper: extraer valor de campo Firestore
function extractVal(fieldDict) {
  if (!fieldDict) return null;
  if (fieldDict.stringValue !== undefined) return fieldDict.stringValue;
  if (fieldDict.integerValue !== undefined) return parseInt(fieldDict.integerValue, 10);
  if (fieldDict.doubleValue !== undefined) return parseFloat(fieldDict.doubleValue);
  return null;
}

// Helper: parsear dinero a entero limpio
function parseMoney(val) {
  if (typeof val === 'number') return Math.floor(val);
  if (typeof val === 'string') {
    const clean = val.replace(/[^0-9]/g, '');
    return clean ? parseInt(clean, 10) : 0;
  }
  return 0;
}

// Helper para responder JSON con CORS
function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

// Helper para leer body JSON
function getRequestBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        resolve({});
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // Manejo de preflight CORS
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  // 1. Health check & Root
  if (pathname === '/health' && method === 'GET') {
    return sendJson(res, 200, { status: 'OK', server: 'Max Gold Black API Gateway (Render)', time: new Date() });
  }

  if (pathname === '/' && method === 'GET') {
    return sendJson(res, 200, {
      empresa: 'Max Gold Black Corp',
      sistema: 'API Segura de Gobernanza & Firestore Gateway',
      version: '1.0.0',
      status: 'Activo en Render'
    });
  }

  // 2. Consulta de Mercado en tiempo real (Gestor)
  if (pathname === '/api/mercado' && method === 'GET') {
    try {
      const response = await fetch(`${FIRESTORE_BASE_URL}/Gestor`);
      if (!response.ok) {
        return sendJson(res, response.status, { error: 'Error al consultar Firestore Gestor' });
      }
      const data = await response.json();
      const docs = data.documents || [];

      const precios = { COAL: 30, GOLD: 50, EMERALD: 100 };
      const boveda = { COAL: 1000000, GOLD: 1000000, EMERALD: 1000000 };

      for (const doc of docs) {
        const docId = doc.name.split('/').pop();
        const fields = doc.fields || {};

        if (docId === 'boveda_del_Gestor' || (fields.Carbon && fields.Oro && fields.Esmeralda)) {
          if (fields.Carbon) boveda.COAL = parseMoney(extractVal(fields.Carbon));
          if (fields.Oro) boveda.GOLD = parseMoney(extractVal(fields.Oro));
          if (fields.Esmeralda) boveda.EMERALD = parseMoney(extractVal(fields.Esmeralda));
        }

        if (fields.Costo_Carbon) precios.COAL = parseMoney(extractVal(fields.Costo_Carbon));
        if (fields.Costo_oro) precios.GOLD = parseMoney(extractVal(fields.Costo_oro));
        if (fields.Costo_Oro) precios.GOLD = parseMoney(extractVal(fields.Costo_Oro));
        if (fields.Costo_esmeralda) precios.EMERALD = parseMoney(extractVal(fields.Costo_esmeralda));
        if (fields.Costo_Esmeralda) precios.EMERALD = parseMoney(extractVal(fields.Costo_Esmeralda));
      }

      return sendJson(res, 200, { success: true, precios, boveda });
    } catch (error) {
      console.error('Error en /api/mercado:', error);
      return sendJson(res, 500, { error: 'Error interno del servidor' });
    }
  }

  // 3. Consulta de Camionetas en tiempo real (Taller)
  if (pathname === '/api/taller' && method === 'GET') {
    try {
      const response = await fetch(`${FIRESTORE_BASE_URL}/Taller`);
      if (!response.ok) {
        return sendJson(res, response.status, { error: 'Error al consultar Firestore Taller' });
      }
      const data = await response.json();
      const docs = data.documents || [];

      const taller = {};
      for (const doc of docs) {
        const docId = doc.name.split('/').pop();
        const fields = doc.fields || {};

        let tier = 1;
        const lower = docId.toLowerCase();
        if (lower.includes('normal')) tier = 2;
        else if (lower.includes('media')) tier = 3;
        else if (lower.includes('alta')) tier = 4;

        const costo = parseMoney(extractVal(fields.Costo || fields.costo));
        const combustible = parseMoney(extractVal(fields.combustible_por_kilometro));
        const reparacion = parseMoney(extractVal(fields['costo de reparacion']));
        const titulo = extractVal(fields.titulo) || docId;
        const descripcion = extractVal(fields.descripcion) || '';

        taller[tier] = {
          doc_id: docId,
          titulo,
          costo,
          combustible: combustible || 15,
          reparacion: reparacion || 10,
          descripcion
        };
      }

      return sendJson(res, 200, { success: true, taller });
    } catch (error) {
      console.error('Error en /api/taller:', error);
      return sendJson(res, 500, { error: 'Error interno del servidor' });
    }
  }

  // 4. Franklin & Max Drag: Auditoría y Visto Bueno
  if (pathname === '/api/transaccion/solicitar' && method === 'POST') {
    try {
      const body = await getRequestBody(req);
      const minKey = (body.mineral || 'COAL').toUpperCase();
      const precioPropuesto = parseMoney(body.precio_propuesto);
      const playerId = body.player_id || 'jugador_1';
      const playerName = body.username || 'Minero';

      const bovedaRes = await fetch(`${FIRESTORE_BASE_URL}/Gestor/boveda_del_Gestor`);
      if (!bovedaRes.ok) {
        return sendJson(res, 500, { error: 'No se pudo verificar la bóveda corporativa' });
      }
      const bovedaDoc = await bovedaRes.json();
      const fields = bovedaDoc.fields || {};

      const fieldMap = { COAL: 'Carbon', GOLD: 'Oro', EMERALD: 'Esmeralda' };
      const fieldName = fieldMap[minKey] || 'Carbon';
      const fondosActuales = parseMoney(extractVal(fields[fieldName]));

      if (fondosActuales < precioPropuesto) {
        return sendJson(res, 200, {
          aprobado: false,
          codigo: 'FALTA_LIQUIDEZ',
          mensaje: `Lo siento ${playerName}, no tenemos suficiente liquidez en la empresa. Esperemos que el CEO invierta.`,
          fondos_disponibles: fondosActuales
        });
      }

      const token = `VB_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      aprobacionesActivas.set(token, {
        mineral: minKey,
        monto: precioPropuesto,
        playerId,
        fieldName,
        expiresAt: Date.now() + 60000
      });

      return sendJson(res, 200, {
        aprobado: true,
        codigo: 'APROBADO',
        token,
        mensaje: `He revisado tu cargamento y las cuentas de la empresa. Todo está en orden. Tienes mi visto bueno para recibir tus $${precioPropuesto} monedas.`
      });
    } catch (error) {
      console.error('Error en /api/transaccion/solicitar:', error);
      return sendJson(res, 500, { error: 'Error durante la auditoría financiera' });
    }
  }

  // 5. Liquidación Final y Desembolso Seguro en Firestore
  if (pathname === '/api/transaccion/liquidar' && method === 'POST') {
    try {
      const body = await getRequestBody(req);
      const token = body.token;
      const playerId = body.player_id || 'jugador_1';

      if (!token || !aprobacionesActivas.has(token)) {
        return sendJson(res, 400, { error: 'Token de visto bueno inválido o expirado' });
      }

      const aprobacion = aprobacionesActivas.get(token);
      if (Date.now() > aprobacion.expiresAt) {
        aprobacionesActivas.delete(token);
        return sendJson(res, 400, { error: 'El visto bueno ha expirado.' });
      }

      // Descontar de la bóveda en Firestore
      const bovedaRes = await fetch(`${FIRESTORE_BASE_URL}/Gestor/boveda_del_Gestor`);
      const bovedaDoc = await bovedaRes.json();
      const currentFunds = parseMoney(extractVal(bovedaDoc.fields[aprobacion.fieldName]));
      const newFunds = Math.max(0, currentFunds - aprobacion.monto);

      const updateUrl = `${FIRESTORE_BASE_URL}/Gestor/boveda_del_Gestor?updateMask.fieldPaths=${aprobacion.fieldName}`;
      await fetch(updateUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            [aprobacion.fieldName]: { stringValue: `$${newFunds}` }
          }
        })
      });

      // Acreditar Dragcoins al jugador en Firestore
      const playerUrl = `${FIRESTORE_BASE_URL}/jugadores/${playerId}`;
      const playerRes = await fetch(playerUrl);
      let playerCoins = 0;
      let playerCash = 0;

      if (playerRes.ok) {
        const pDoc = await playerRes.json();
        playerCoins = parseInt(pDoc.fields?.coins?.integerValue || '0', 10);
        playerCash = parseInt(pDoc.fields?.cash?.integerValue || '0', 10);
      }

      playerCoins += aprobacion.monto;

      await fetch(playerUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            coins: { integerValue: String(playerCoins) },
            cash: { integerValue: String(playerCash) },
            player_id: { stringValue: playerId },
            last_updated: { stringValue: new Date().toISOString() }
          }
        })
      });

      aprobacionesActivas.delete(token);

      return sendJson(res, 200, {
        success: true,
        desembolso: aprobacion.monto,
        nuevas_dragcoins: playerCoins,
        boveda_restante: newFunds
      });
    } catch (error) {
      console.error('Error en /api/transaccion/liquidar:', error);
      return sendJson(res, 500, { error: 'Error al liquidar la transacción' });
    }
  }

  // 404 para cualquier otra ruta
  return sendJson(res, 404, { error: 'Ruta no encontrada' });
});

server.listen(PORT, () => {
  console.log(`[Max Gold Black] Servidor seguro activo en puerto ${PORT}`);
});
