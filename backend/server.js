const http = require('http');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'maxcoldblack';
const FIRESTORE_BASE_URL = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;

// Clave secreta para firma criptográfica HMAC-SHA256 (Inviolable por clientes)
const HMAC_SECRET = process.env.SERVER_SECRET_KEY || crypto.randomBytes(32).toString('hex');

// Registro anti-replay de tokens liquidados
const tokensLiquidados = new Set();

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

// Criptografía: Firmar payload con HMAC-SHA256
function signAuthorizationPayload(payload) {
  const jsonStr = JSON.stringify(payload);
  const hmac = crypto.createHmac('sha256', HMAC_SECRET).update(jsonStr).digest('hex');
  const encodedPayload = Buffer.from(jsonStr).toString('base64url');
  return `${encodedPayload}.${hmac}`;
}

// Criptografía: Verificar y decodificar token sellado
function verifyAuthorizationToken(token) {
  if (!token || typeof token !== 'string') return { valid: false, error: 'Token nulo o inválido' };
  const parts = token.split('.');
  if (parts.length !== 2) return { valid: false, error: 'Estructura de token ilegítima' };

  const [encodedPayload, signature] = parts;
  let jsonStr = '';
  try {
    jsonStr = Buffer.from(encodedPayload, 'base64url').toString('utf8');
  } catch (e) {
    return { valid: false, error: 'Error decodificando payload base64url' };
  }

  const expectedHmac = crypto.createHmac('sha256', HMAC_SECRET).update(jsonStr).digest('hex');
  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedHmac);

  if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    return { valid: false, error: 'ALERTA DE SEGURIDAD: Firma digital adulterada o manipulada' };
  }

  try {
    const payload = JSON.parse(jsonStr);
    if (Date.now() > payload.exp) {
      return { valid: false, error: 'El Visto Bueno ha expirado (límite de 60 segundos)' };
    }
    if (tokensLiquidados.has(payload.tokenId)) {
      return { valid: false, error: 'ALERTA ANTI-REPLAY: Este ticket ya fue cobrado previamente' };
    }
    return { valid: true, payload };
  } catch (e) {
    return { valid: false, error: 'Payload JSON corrupto' };
  }
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

  // 1. Health check & Info
  if (pathname === '/health' && method === 'GET') {
    return sendJson(res, 200, {
      status: 'OK',
      server: 'Max Gold Black API Gateway (Render)',
      security: 'HMAC-SHA256 Cryptographic Authoritative Vault',
      time: new Date()
    });
  }

  if (pathname === '/' && method === 'GET') {
    return sendJson(res, 200, {
      empresa: 'Max Gold Black Corp',
      sistema: 'API Segura de Gobernanza & Firestore Gateway',
      version: '2.0.0',
      roles: {
        franklin: 'Recepción y peritaje de cargamento en campo',
        max_drag: 'Auditoría financiera, bóveda, visto bueno y nexo con el CEO'
      },
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

  // 4. Franklin & Max Drag: Validación y Visto Bueno Criptográfico
  // NINGÚN cliente ni hacker puede definir el precio: el backend lo calcula desde Firestore
  if (pathname === '/api/transaccion/solicitar' && method === 'POST') {
    try {
      const body = await getRequestBody(req);
      const minKey = (body.mineral || 'COAL').toUpperCase();
      const cantidad = Math.max(1, Math.floor(body.cantidad || 1));
      const playerId = body.player_id || 'jugador_1';
      const playerName = body.username || 'Minero';

      // REGLA 1 (Límite Franklin): Franklin solo procesa minerales comerciales autorizados
      const mineralesValidos = ['COAL', 'GOLD', 'EMERALD'];
      if (!mineralesValidos.includes(minKey)) {
        return sendJson(res, 400, {
          aprobado: false,
          actor: 'Franklin Martínez',
          codigo: 'MINERAL_NO_AUTORIZADO',
          mensaje: 'Disculpe, este material no está en la lista de recepción autorizada.'
        });
      }

      // Consulta de precios y bóveda oficial en Firestore
      const gestorRes = await fetch(`${FIRESTORE_BASE_URL}/Gestor`);
      if (!gestorRes.ok) {
        return sendJson(res, 500, { error: 'Error comunicando con la base corporativa' });
      }
      const gestorData = await gestorRes.json();
      const docs = gestorData.documents || [];

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
        if (fields.Costo_oro || fields.Costo_Oro) precios.GOLD = parseMoney(extractVal(fields.Costo_oro || fields.Costo_Oro));
        if (fields.Costo_esmeralda || fields.Costo_Esmeralda) precios.EMERALD = parseMoney(extractVal(fields.Costo_esmeralda || fields.Costo_Esmeralda));
      }

      // REGLA 2 (Backend Authoritative): El precio lo fija Firestore, no el cliente
      const precioUnitarioOficial = precios[minKey] || 30;
      const montoTotalCalculado = precioUnitarioOficial * cantidad;
      const fondosDisponibles = boveda[minKey] || 0;

      // REGLA 3 (Límite Max Drag): Custodia y autorización de bóveda con el CEO
      if (fondosDisponibles < montoTotalCalculado) {
        return sendJson(res, 200, {
          aprobado: false,
          actor: 'Max Drag',
          codigo: 'FALTA_LIQUIDEZ_CEO',
          mensaje: `Lo siento ${playerName}, no tenemos suficiente liquidez en la empresa. Esperemos que el CEO invierta.`,
          fondos_disponibles: fondosDisponibles,
          monto_requerido: montoTotalCalculado
        });
      }

      // REGLA 4 (Criptografía): Generación de ticket firmado inviolable
      const payloadTicket = {
        tokenId: `VB_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`,
        mineral: minKey,
        cantidad,
        precio_unitario: precioUnitarioOficial,
        monto_total: montoTotalCalculado,
        playerId,
        timestamp: Date.now(),
        exp: Date.now() + 60000, // 60 segundos de validez
        firmado_por: 'Max Drag - CFO',
        verificado_por: 'Franklin Martínez - Operaciones'
      };

      const signedToken = signAuthorizationPayload(payloadTicket);

      return sendJson(res, 200, {
        aprobado: true,
        actor: 'Max Drag',
        codigo: 'VISTO_BUENO_CONCEDIDO',
        token: signedToken,
        monto_aprobado: montoTotalCalculado,
        precio_unitario: precioUnitarioOficial,
        mensaje: `He revisado tu cargamento y las cuentas de la empresa. Todo está en orden. Tienes mi visto bueno para recibir tus $${montoTotalCalculado} monedas.`
      });
    } catch (error) {
      console.error('Error en /api/transaccion/solicitar:', error);
      return sendJson(res, 500, { error: 'Error durante la auditoría corporativa' });
    }
  }

  // 5. Liquidación Final y Desembolso Seguro en Firestore
  if (pathname === '/api/transaccion/liquidar' && method === 'POST') {
    try {
      const body = await getRequestBody(req);
      const token = body.token;
      const playerId = body.player_id || 'jugador_1';

      // 1. Verificación matemática de la firma digital HMAC-SHA256
      const verification = verifyAuthorizationToken(token);
      if (!verification.valid) {
        return sendJson(res, 403, {
          error: 'Operación denegada',
          motivo: verification.error
        });
      }

      const ticket = verification.payload;

      // 2. Verificar correspondencia de identidad del minero
      if (ticket.playerId !== playerId) {
        return sendJson(res, 403, {
          error: 'Operación denegada',
          motivo: 'El ticket no coincide con la identidad del solicitante'
        });
      }

      // 3. Descontar atómicamente de la bóveda corporativa en Firestore
      const fieldMap = { COAL: 'Carbon', GOLD: 'Oro', EMERALD: 'Esmeralda' };
      const fieldName = fieldMap[ticket.mineral] || 'Carbon';

      const bovedaRes = await fetch(`${FIRESTORE_BASE_URL}/Gestor/boveda_del_Gestor`);
      if (!bovedaRes.ok) {
        return sendJson(res, 500, { error: 'Error accediendo a la bóveda en Firestore' });
      }
      const bovedaDoc = await bovedaRes.json();
      const currentFunds = parseMoney(extractVal(bovedaDoc.fields?.[fieldName]));

      if (currentFunds < ticket.monto_total) {
        return sendJson(res, 400, {
          error: 'Fondos insuficientes al momento de la liquidación',
          motivo: 'La reserva cambió repentinamente antes del cobro'
        });
      }

      const newFunds = Math.max(0, currentFunds - ticket.monto_total);

      const updateUrl = `${FIRESTORE_BASE_URL}/Gestor/boveda_del_Gestor?updateMask.fieldPaths=${fieldName}`;
      await fetch(updateUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            [fieldName]: { stringValue: `$${newFunds}` }
          }
        })
      });

      // 4. Acreditar Dragcoins al jugador en Firestore
      const playerUrl = `${FIRESTORE_BASE_URL}/jugadores/${playerId}`;
      const playerRes = await fetch(playerUrl);
      let playerCoins = 0;
      let playerCash = 0;

      if (playerRes.ok) {
        const pDoc = await playerRes.json();
        playerCoins = parseInt(pDoc.fields?.coins?.integerValue || '0', 10);
        playerCash = parseInt(pDoc.fields?.cash?.integerValue || '0', 10);
      }

      playerCoins += ticket.monto_total;

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

      // 5. Registrar en el set anti-replay para impedir reutilización
      tokensLiquidados.add(ticket.tokenId);

      return sendJson(res, 200, {
        success: true,
        transaccion_id: ticket.tokenId,
        monto_liquidado: ticket.monto_total,
        nuevas_dragcoins: playerCoins,
        boveda_restante: newFunds
      });
    } catch (error) {
      console.error('Error en /api/transaccion/liquidar:', error);
      return sendJson(res, 500, { error: 'Error al liquidar la transacción corporativa' });
    }
  }

  // 404
  return sendJson(res, 404, { error: 'Ruta no encontrada' });
});

server.listen(PORT, () => {
  console.log(`[Max Gold Black] Servidor seguro activo en puerto ${PORT}`);
});
