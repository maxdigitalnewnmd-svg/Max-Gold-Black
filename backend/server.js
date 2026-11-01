const http = require('http');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'maxcoldblack';
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyBUzF2MSfzmBPxPC2ILBlXhuT4k-4rmh9A';
const FIRESTORE_BASE_URL = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;
const FIREBASE_AUTH_BASE = 'https://identitytoolkit.googleapis.com/v1/accounts';

// Clave simétrica de 256 bits para encriptación total End-to-End con Godot / Telegram
const ENCRYPTION_KEY_STR = process.env.ENCRYPTION_KEY || 'M4xG0ldBl4ckTatacoaDesert2026Key';
const ENCRYPTION_KEY_BUF = Buffer.from(ENCRYPTION_KEY_STR, 'utf8');

// Clave HMAC para tickets corporativos firmados
const HMAC_SECRET = process.env.SERVER_SECRET_KEY || crypto.randomBytes(32).toString('hex');

// Identidad Oficial e Inmutable del CEO Fundador (Máxima Autoridad Incorregible)
const CEO_CONFIG = {
  uid: 'QEMLQtpeFYgfXmZL8eXQSzlMypg2',
  username: 'Dramax',
  correo: 'maxdigitalnewnmd@gmail.com',
  tipo: 'CEO',
  fecha_creacion: '2026-11-01 15:37:24 (Cuenta Fundacional CEO)'
};

// Historial temporal de jugadores para prevención de Speedhacks y validación temporal
const lastExplorationTimes = new Map(); // uid -> timestamp
const tokensLiquidados = new Set(); // Anti-replay cache

// Reglas estrictas de probabilidad y tiempos mínimos por tipo de camioneta
const FLEET_EXPLORATION_RULES = {
  1: {
    nombre: 'T1 BÁSICO (Vibroseis Clásico)',
    frecuencia_nominal_ms: 3200,
    frecuencia_minima_segura_ms: 2700,
    probabilidades_max: {
      COAL: 0.80,
      GOLD: 0.30,
      CRUDE: 0.15,
      EMERALD: 0.00 // ¡0% de Esmeraldas en T1!
    }
  },
  2: {
    nombre: 'T2 AVANZADO (Doble Pistón Sísmico)',
    frecuencia_nominal_ms: 2000,
    frecuencia_minima_segura_ms: 1650,
    probabilidades_max: {
      COAL: 1.00,
      GOLD: 0.70,
      CRUDE: 0.50,
      EMERALD: 0.20
    }
  },
  3: {
    nombre: 'T3 MINERO PESADO (Oro & Crudo)',
    frecuencia_nominal_ms: 1300,
    frecuencia_minima_segura_ms: 1000,
    probabilidades_max: {
      GOLD: 1.00,
      CRUDE: 0.80,
      EMERALD: 0.50,
      COAL: 0.30
    }
  },
  4: {
    nombre: 'T4 ÉLITE CUÁNTICO (Petróleo & Gemas)',
    frecuencia_nominal_ms: 750,
    frecuencia_minima_segura_ms: 550,
    probabilidades_max: {
      CRUDE: 0.95,
      EMERALD: 0.85,
      GOLD: 0.60,
      COAL: 0.15
    }
  }
};

// ----------------- MÓDULO CRIPTOGRÁFICO MILITAR (AES-256-CBC + HMAC-SHA256) -----------------
function encryptPayload(dataObj) {
  const jsonStr = JSON.stringify(dataObj);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY_BUF, iv);
  let encrypted = cipher.update(jsonStr, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const cipherBuf = Buffer.from(encrypted, 'hex');
  const hmac = crypto.createHmac('sha256', ENCRYPTION_KEY_BUF).update(Buffer.concat([iv, cipherBuf])).digest('hex');

  return {
    payload: encrypted,
    iv: iv.toString('hex'),
    hmac: hmac,
    t: Date.now()
  };
}

function decryptPayload(envelope) {
  if (!envelope || !envelope.payload || !envelope.iv || !envelope.hmac) {
    throw new Error('Sobre criptográfico incompleto o corrupto');
  }

  const ivBuf = Buffer.from(envelope.iv, 'hex');
  const cipherBuf = Buffer.from(envelope.payload, 'hex');

  const expectedHmac = crypto.createHmac('sha256', ENCRYPTION_KEY_BUF).update(Buffer.concat([ivBuf, cipherBuf])).digest('hex');
  const receivedHmacBuf = Buffer.from(envelope.hmac, 'utf8');
  const expectedHmacBuf = Buffer.from(expectedHmac, 'utf8');

  if (receivedHmacBuf.length !== expectedHmacBuf.length || !crypto.timingSafeEqual(receivedHmacBuf, expectedHmacBuf)) {
    throw new Error('ALERTA DE SEGURIDAD: Firma HMAC adulterada. Solicitud manipulada por cliente o interceptor.');
  }

  const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY_BUF, ivBuf);
  let decrypted = decipher.update(cipherBuf, null, 'utf8');
  decrypted += decipher.final('utf8');
  return JSON.parse(decrypted);
}

function extractVal(fieldDict) {
  if (!fieldDict) return null;
  if (fieldDict.stringValue !== undefined) return fieldDict.stringValue;
  if (fieldDict.integerValue !== undefined) return parseInt(fieldDict.integerValue, 10);
  if (fieldDict.doubleValue !== undefined) return parseFloat(fieldDict.doubleValue);
  return null;
}

function parseMoney(val) {
  if (typeof val === 'number') return Math.floor(val);
  if (typeof val === 'string') {
    const clean = val.replace(/[^0-9]/g, '');
    return clean ? parseInt(clean, 10) : 0;
  }
  return 0;
}

function sendEncryptedResponse(res, statusCode, dataObj, forcePlain = false) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Encrypted'
  });

  if (forcePlain) {
    res.end(JSON.stringify(dataObj));
  } else {
    const envelope = encryptPayload(dataObj);
    res.end(JSON.stringify(envelope));
  }
}

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

// ----------------- GOBERNANZA DE USUARIOS Y VALIDACIÓN DEL CEO -----------------
async function getOrSyncUser(uid, candidateData = {}) {
  const isCeoUid = (uid === CEO_CONFIG.uid);
  const url = `${FIRESTORE_BASE_URL}/Usuarios/${uid}`;
  const res = await fetch(url);

  if (res.ok) {
    const doc = await res.json();
    const fields = doc.fields || {};

    let fechaCreacion = extractVal(fields.fecha_creacion);
    if (!fechaCreacion) {
      fechaCreacion = isCeoUid ? CEO_CONFIG.fecha_creacion : (doc.createTime || new Date().toISOString());
      await fetch(`${url}?updateMask.fieldPaths=fecha_creacion`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { fecha_creacion: { stringValue: fechaCreacion } } })
      });
    }

    const userData = {
      uid: uid,
      username: isCeoUid ? CEO_CONFIG.username : (extractVal(fields.Username) || candidateData.username || 'Minero'),
      correo: isCeoUid ? CEO_CONFIG.correo : (extractVal(fields.correo) || candidateData.correo || 'minero@maxgoldblack.com'),
      tipo: isCeoUid ? CEO_CONFIG.tipo : (extractVal(fields.Tipo) || 'Minero'),
      fecha_creacion: fechaCreacion,
      moneda: parseMoney(extractVal(fields.Moneda)),
      billete: parseMoney(extractVal(fields.Billete)),
      carbon: parseMoney(extractVal(fields.Carbon)),
      oro: parseMoney(extractVal(fields.Oro)),
      esmeralda: parseMoney(extractVal(fields.Esmeralda)),
      es_ceo: isCeoUid,
      inmutable: true
    };

    return userData;
  }

  // Si no existe y es el CEO, crearlo con datos fundacionales inmutables
  if (isCeoUid) {
    const ceoFields = {
      UID: { stringValue: CEO_CONFIG.uid },
      Username: { stringValue: CEO_CONFIG.username },
      correo: { stringValue: CEO_CONFIG.correo },
      Tipo: { stringValue: CEO_CONFIG.tipo },
      fecha_creacion: { stringValue: CEO_CONFIG.fecha_creacion },
      Moneda: { stringValue: '0' },
      Billete: { stringValue: '0' },
      Carbon: { stringValue: '0' },
      Oro: { stringValue: '0' },
      Esmeralda: { stringValue: '0' }
    };

    await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: ceoFields })
    });

    return {
      uid: CEO_CONFIG.uid,
      username: CEO_CONFIG.username,
      correo: CEO_CONFIG.correo,
      tipo: CEO_CONFIG.tipo,
      fecha_creacion: CEO_CONFIG.fecha_creacion,
      moneda: 0,
      billete: 0,
      carbon: 0,
      oro: 0,
      esmeralda: 0,
      es_ceo: true,
      inmutable: true
    };
  }

  // Si es un usuario nuevo, registrarlo como Minero con fecha de creación actual
  const nowStr = new Date().toISOString();
  const safeUsername = (candidateData.username && candidateData.username !== 'Dramax' && candidateData.username !== 'CEO')
    ? candidateData.username : `Minero_${uid.substring(0, 5)}`;
  const safeEmail = (candidateData.correo && candidateData.correo !== CEO_CONFIG.correo)
    ? candidateData.correo : `usuario_${uid.substring(0, 6)}@maxgoldblack.com`;

  const newFields = {
    UID: { stringValue: uid },
    Username: { stringValue: safeUsername },
    correo: { stringValue: safeEmail },
    Tipo: { stringValue: 'Minero' },
    fecha_creacion: { stringValue: nowStr },
    Moneda: { stringValue: '0' },
    Billete: { stringValue: '0' },
    Carbon: { stringValue: '0' },
    Oro: { stringValue: '0' },
    Esmeralda: { stringValue: '0' }
  };

  await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: newFields })
  });

  return {
    uid,
    username: safeUsername,
    correo: safeEmail,
    tipo: 'Minero',
    fecha_creacion: nowStr,
    moneda: 0,
    billete: 0,
    carbon: 0,
    oro: 0,
    esmeralda: 0,
    es_ceo: false,
    inmutable: true
  };
}

// ----------------- AUTENTICACIÓN FIREBASE AUTH VÍA RENDER -----------------
async function handleFirebaseAuthLogin(email, password) {
  const url = `${FIREBASE_AUTH_BASE}:signInWithPassword?key=${FIREBASE_API_KEY}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });

  const data = await response.json();
  if (!response.ok) {
    const errorMsg = data.error?.message || 'ERROR_AUTH';
    if (errorMsg === 'EMAIL_NOT_FOUND') {
      return { success: false, code: 'EMAIL_NOT_FOUND', error: 'El usuario no existe. Debe crear una cuenta para ingresar.' };
    }
    if (errorMsg === 'INVALID_PASSWORD' || errorMsg === 'INVALID_LOGIN_CREDENTIALS') {
      return { success: false, code: 'INVALID_PASSWORD', error: 'Contraseña o credenciales incorrectas.' };
    }
    if (errorMsg === 'USER_DISABLED') {
      return { success: false, code: 'USER_DISABLED', error: 'Esta cuenta ha sido inhabilitada por la dirección.' };
    }
    if (errorMsg.includes('TOO_MANY_ATTEMPTS')) {
      return { success: false, code: 'TOO_MANY_ATTEMPTS', error: 'Demasiados intentos fallidos. Intente más tarde.' };
    }
    return { success: false, code: errorMsg, error: 'Error al iniciar sesión: verifique sus credenciales.' };
  }

  const uid = data.localId;
  const userProfile = await getOrSyncUser(uid, { correo: email });

  return {
    success: true,
    token: data.idToken,
    refreshToken: data.refreshToken,
    expiresIn: data.expiresIn,
    usuario: userProfile,
    mensaje: userProfile.es_ceo
      ? '¡Bienvenido de nuevo, Señor CEO Dramax! Sesión corporativa iniciada.'
      : `¡Bienvenido de nuevo, ${userProfile.username}! Sesión iniciada con éxito.`
  };
}

async function handleFirebaseAuthRegister(email, password, username) {
  // Prohibición estricta de multicuentas y suplantación del CEO
  if (email.toLowerCase() === CEO_CONFIG.correo.toLowerCase()) {
    return {
      success: false,
      code: 'CEO_EMAIL_RESERVED',
      error: 'Este correo institucional está reservado exclusivamente para la cuenta fundacional del CEO.'
    };
  }

  const url = `${FIREBASE_AUTH_BASE}:signUp?key=${FIREBASE_API_KEY}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });

  const data = await response.json();
  if (!response.ok) {
    const errorMsg = data.error?.message || 'ERROR_REGISTER';
    if (errorMsg.includes('EMAIL_EXISTS')) {
      return {
        success: false,
        code: 'EMAIL_EXISTS',
        error: 'Este correo ya está registrado en la empresa. Inicie sesión directamente; las multicuentas están estrictamente prohibidas.'
      };
    }
    if (errorMsg.includes('WEAK_PASSWORD')) {
      return { success: false, code: 'WEAK_PASSWORD', error: 'La contraseña debe tener al menos 6 caracteres.' };
    }
    if (errorMsg.includes('INVALID_EMAIL')) {
      return { success: false, code: 'INVALID_EMAIL', error: 'El formato de correo electrónico es inválido.' };
    }
    return { success: false, code: errorMsg, error: 'No se pudo crear la cuenta: verifique los datos ingresados.' };
  }

  const uid = data.localId;
  const safeUsername = username && username.trim().length > 0 ? username.trim() : email.split('@')[0];
  const userProfile = await getOrSyncUser(uid, { correo: email, username: safeUsername });

  return {
    success: true,
    token: data.idToken,
    refreshToken: data.refreshToken,
    expiresIn: data.expiresIn,
    usuario: userProfile,
    mensaje: `¡Cuenta creada exitosamente! Bienvenido al equipo de exploración de Max Gold Black, ${safeUsername}.`
  };
}

// ----------------- CONSULTAS A GESTOR Y TALLER -----------------
async function fetchGestorData() {
  const response = await fetch(`${FIRESTORE_BASE_URL}/Gestor`);
  if (!response.ok) throw new Error('Fallo al consultar Firestore Gestor');
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
    if (fields.Costo_oro || fields.Costo_Oro) precios.GOLD = parseMoney(extractVal(fields.Costo_oro || fields.Costo_Oro));
    if (fields.Costo_esmeralda || fields.Costo_Esmeralda) precios.EMERALD = parseMoney(extractVal(fields.Costo_esmeralda || fields.Costo_Esmeralda));
  }

  return { precios, boveda };
}

async function fetchTallerData() {
  const response = await fetch(`${FIRESTORE_BASE_URL}/Taller`);
  if (!response.ok) throw new Error('Fallo al consultar Firestore Taller');
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
  return taller;
}

function signAuthorizationPayload(payload) {
  const jsonStr = JSON.stringify(payload);
  const hmac = crypto.createHmac('sha256', HMAC_SECRET).update(jsonStr).digest('hex');
  const encodedPayload = Buffer.from(jsonStr).toString('base64url');
  return `${encodedPayload}.${hmac}`;
}

function verifyAuthorizationToken(token) {
  if (!token || typeof token !== 'string') return { valid: false, error: 'Token nulo o inválido' };
  const parts = token.split('.');
  if (parts.length !== 2) return { valid: false, error: 'Estructura ilegítima' };

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
    return { valid: false, error: 'ALERTA: Firma digital adulterada' };
  }

  try {
    const payload = JSON.parse(jsonStr);
    if (Date.now() > payload.exp) {
      return { valid: false, error: 'El Visto Bueno ha expirado' };
    }
    if (tokensLiquidados.has(payload.tokenId)) {
      return { valid: false, error: 'ALERTA ANTI-REPLAY: Ticket ya liquidado previamente' };
    }
    return { valid: true, payload };
  } catch (e) {
    return { valid: false, error: 'Payload corrupto' };
  }
}

// ----------------- SERVIDOR HTTP / API GATEWAY -----------------
const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Encrypted'
    });
    return res.end();
  }

  // 1. Healthcheck público
  if (pathname === '/health' && method === 'GET') {
    return sendEncryptedResponse(res, 200, {
      status: 'OK',
      server: 'Max Gold Black API Gateway (Render)',
      middleware: 'Intermediario Obligatorio Activo',
      ceo: 'Dramax (QEMLQtpeFYgfXmZL8eXQSzlMypg2)',
      auth: 'Firebase Auth API Gateway Activo',
      security: 'End-to-End AES-256-CBC + HMAC-SHA256',
      time: new Date()
    }, true);
  }

  // 2. PUERTA DE ENLACE PRINCIPAL ENCRIPTADA OBLIGATORIA (/api/gateway/secure)
  if (pathname === '/api/gateway/secure' && method === 'POST') {
    try {
      const rawBody = await getRequestBody(req);
      let requestData;

      try {
        if (rawBody.payload && rawBody.iv && rawBody.hmac) {
          requestData = decryptPayload(rawBody);
        } else {
          return sendEncryptedResponse(res, 403, {
            error: 'ACCESO DENEGADO: La petición debe viajar rigurosamente encriptada con AES-256-CBC.',
            codigo: 'ENCRYPTION_REQUIRED'
          }, true);
        }
      } catch (decryptErr) {
        return sendEncryptedResponse(res, 403, {
          error: 'VIOLACIÓN DE INTEGRIDAD: El paquete fue alterado en tránsito.',
          motivo: decryptErr.message
        }, true);
      }

      const action = requestData.action;

      // --- ACCIÓN: AUTENTICACIÓN - INICIAR SESIÓN (AUTH_LOGIN) ---
      if (action === 'AUTH_LOGIN') {
        const email = (requestData.email || '').trim();
        const password = requestData.password || '';

        if (!email || !password) {
          return sendEncryptedResponse(res, 400, {
            success: false,
            error: 'Debe ingresar su correo electrónico y contraseña.'
          });
        }

        const loginResult = await handleFirebaseAuthLogin(email, password);
        const httpStatus = loginResult.success ? 200 : 400;
        return sendEncryptedResponse(res, httpStatus, loginResult);
      }

      // --- ACCIÓN: AUTENTICACIÓN - REGISTRARSE (AUTH_REGISTER) ---
      if (action === 'AUTH_REGISTER') {
        const email = (requestData.email || '').trim();
        const password = requestData.password || '';
        const confirmPassword = requestData.confirm_password || '';
        const username = (requestData.username || '').trim();

        if (!email || !password) {
          return sendEncryptedResponse(res, 400, {
            success: false,
            error: 'Todos los campos son obligatorios para el registro.'
          });
        }

        if (password.length < 6) {
          return sendEncryptedResponse(res, 400, {
            success: false,
            error: 'La contraseña debe contener un mínimo de 6 caracteres.'
          });
        }

        if (password !== confirmPassword) {
          return sendEncryptedResponse(res, 400, {
            success: false,
            error: 'Las contraseñas no coinciden. Por favor verifíquelas.'
          });
        }

        const registerResult = await handleFirebaseAuthRegister(email, password, username);
        const httpStatus = registerResult.success ? 200 : 400;
        return sendEncryptedResponse(res, httpStatus, registerResult);
      }

      const uid = requestData.uid || requestData.player_id || CEO_CONFIG.uid;

      // VALIDACIÓN ANTI-SUPLANTACIÓN DEL CEO
      if (uid !== CEO_CONFIG.uid) {
        const candidateUser = (requestData.username || '').toLowerCase();
        const candidateEmail = (requestData.correo || '').toLowerCase();
        const candidateTipo = (requestData.tipo || '').toUpperCase();

        if (candidateUser === 'dramax' || candidateEmail === CEO_CONFIG.correo || candidateTipo === 'CEO') {
          console.warn(`[SEGURIDAD] Intento de suplantación del CEO detectado por UID no autorizado: ${uid}`);
          return sendEncryptedResponse(res, 403, {
            error: 'VIOLACIÓN DE IDENTIDAD: Intento de suplantación del CEO Dramax bloqueado por Render Gateway.',
            codigo: 'CEO_IMPERSONATION_BLOCKED'
          });
        }
      }

      // --- ACCIÓN: OBTENER DATOS DE USUARIO AUDITADOS (PERFIL CORPORATIVO) ---
      if (action === 'GET_USUARIO') {
        const user = await getOrSyncUser(uid, requestData);
        return sendEncryptedResponse(res, 200, {
          success: true,
          usuario: user,
          mensaje: 'Identidad corporativa verificada y protegida por Render.'
        });
      }

      // --- ACCIÓN: CONSULTAR MERCADO ---
      if (action === 'GET_MERCADO') {
        const gestor = await fetchGestorData();
        return sendEncryptedResponse(res, 200, {
          success: true,
          precios: gestor.precios,
          boveda: gestor.boveda
        });
      }

      // --- ACCIÓN: CONSULTAR TALLER ---
      if (action === 'GET_TALLER') {
        const taller = await fetchTallerData();
        return sendEncryptedResponse(res, 200, {
          success: true,
          taller
        });
      }

      // --- ACCIÓN: VALIDACIÓN ANTI-HACKERS DE HALLAZGO (PROOF-OF-EXPLORATION) ---
      if (action === 'REPORTAR_HALLAZGO') {
        const tier = parseInt(requestData.camioneta_tier || 1, 10);
        const resourceType = (requestData.tipo_hallazgo || '').toUpperCase();
        const now = Date.now();

        const rule = FLEET_EXPLORATION_RULES[tier];
        if (!rule) {
          return sendEncryptedResponse(res, 400, {
            error: 'Camioneta no reconocida en el parque automotor oficial.'
          });
        }

        // VALIDACIÓN TEMPORAL (Speedhack Prevention)
        const lastTime = lastExplorationTimes.get(uid) || 0;
        const elapsed = now - lastTime;
        if (lastTime > 0 && elapsed < rule.frecuencia_minima_segura_ms) {
          console.warn(`[ANTI-HACK] Speedhack detectado para ${uid}: ${elapsed}ms < ${rule.frecuencia_minima_segura_ms}ms`);
          return sendEncryptedResponse(res, 429, {
            error: 'ANOMALÍA TEMPORAL DETECTADA: Frecuencia de muestreo físicamente imposible para el sensor sísmico.',
            codigo: 'SPEEDHACK_BLOCKED',
            tiempo_transcurrido_ms: elapsed,
            minimo_requerido_ms: rule.frecuencia_minima_segura_ms
          });
        }

        // VALIDACIÓN DE PROBABILIDAD (0% Esmeralda en T1)
        const maxProb = rule.probabilidades_max[resourceType];
        if (maxProb === undefined || maxProb <= 0) {
          console.warn(`[ANTI-HACK] Intento de inyección de mineral imposible: ${resourceType} en ${rule.nombre}`);
          return sendEncryptedResponse(res, 403, {
            error: `FRAUDE BLOQUEADO: El vehículo ${rule.nombre} no tiene capacidad sísmica para extraer ${resourceType} (Probabilidad: 0%).`,
            codigo: 'IMPOSSIBLE_RESOURCE_INJECTION'
          });
        }

        lastExplorationTimes.set(uid, now);

        return sendEncryptedResponse(res, 200, {
          success: true,
          validado: true,
          mineral: resourceType,
          tier_verificado: tier,
          mensaje: 'Muestra sísmica auditada y validada legalmente por el Gateway de Render.'
        });
      }

      // --- ACCIÓN: SOLICITUD DE TRANSACCIÓN (FRANKLIN & MAX DRAG GOBERNANZA) ---
      if (action === 'SOLICITAR_TRANSACCION') {
        const minKey = (requestData.mineral || 'COAL').toUpperCase();
        const cantidad = Math.max(1, Math.floor(requestData.cantidad || 1));

        const user = await getOrSyncUser(uid, requestData);

        const validos = ['COAL', 'GOLD', 'EMERALD'];
        if (!validos.includes(minKey)) {
          return sendEncryptedResponse(res, 400, {
            aprobado: false,
            actor: 'Franklin Martínez',
            codigo: 'MINERAL_NO_AUTORIZADO',
            mensaje: 'Disculpe, este material no está en la lista de recepción autorizada.'
          });
        }

        const gestor = await fetchGestorData();
        const precioOficial = gestor.precios[minKey] || 30;
        const montoTotal = precioOficial * cantidad;
        const fondosDisponibles = gestor.boveda[minKey] || 0;

        if (fondosDisponibles < montoTotal) {
          const mensajeLiquidez = user.es_ceo
            ? `Estimado CEO ${user.username}, la bóveda corporativa se encuentra temporalmente sin liquidez para esta transacción. Se requiere orden de capitalización.`
            : `Lo siento ${user.username}, no tenemos suficiente liquidez en la empresa. Esperemos que el CEO invierta.`;

          return sendEncryptedResponse(res, 200, {
            aprobado: false,
            actor: 'Max Drag',
            codigo: 'FALTA_LIQUIDEZ_CEO',
            mensaje: mensajeLiquidez,
            fondos_disponibles: fondosDisponibles,
            monto_requerido: montoTotal
          });
        }

        const payloadTicket = {
          tokenId: `VB_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`,
          mineral: minKey,
          cantidad,
          precio_unitario: precioOficial,
          monto_total: montoTotal,
          uid: user.uid,
          username: user.username,
          correo: user.correo,
          tipo: user.tipo,
          timestamp: Date.now(),
          exp: Date.now() + 60000,
          firmado_por: 'Max Drag - CFO',
          verificado_por: 'Franklin Martínez - Operaciones'
        };

        const signedToken = signAuthorizationPayload(payloadTicket);

        const mensajeExito = user.es_ceo
          ? `Estimado CEO ${user.username}, he verificado sus credenciales y el cargamento en bóveda. Todo está en orden bajo la normativa. Tiene mi visto bueno institucional para recibir sus $${montoTotal} Dragcoins.`
          : `He revisado tu cargamento y tus credenciales de minero. Todo está en orden. Tienes mi visto bueno para recibir tus $${montoTotal} Dragcoins.`;

        return sendEncryptedResponse(res, 200, {
          aprobado: true,
          actor: 'Max Drag',
          codigo: 'VISTO_BUENO_CONCEDIDO',
          token: signedToken,
          monto_aprobado: montoTotal,
          precio_unitario: precioOficial,
          usuario_verificado: {
            uid: user.uid,
            username: user.username,
            tipo: user.tipo
          },
          mensaje: mensajeExito
        });
      }

      // --- ACCIÓN: LIQUIDAR TRANSACCIÓN SEGURA EN FIRESTORE ---
      if (action === 'LIQUIDAR_TRANSACCION') {
        const token = requestData.token;
        const verification = verifyAuthorizationToken(token);
        if (!verification.valid) {
          return sendEncryptedResponse(res, 403, {
            error: 'Operación denegada',
            motivo: verification.error
          });
        }

        const ticket = verification.payload;
        if (ticket.uid !== uid) {
          return sendEncryptedResponse(res, 403, {
            error: 'Violación de identidad en ticket',
            motivo: 'El ticket no pertenece al usuario autenticado'
          });
        }

        // 1. Debitar de la bóveda en Gestor
        const fieldMap = { COAL: 'Carbon', GOLD: 'Oro', EMERALD: 'Esmeralda' };
        const fieldName = fieldMap[ticket.mineral] || 'Carbon';

        const bovedaRes = await fetch(`${FIRESTORE_BASE_URL}/Gestor/boveda_del_Gestor`);
        const bovedaDoc = await bovedaRes.json();
        const currentFunds = parseMoney(extractVal(bovedaDoc.fields?.[fieldName]));
        const newFunds = Math.max(0, currentFunds - ticket.monto_total);

        await fetch(`${FIRESTORE_BASE_URL}/Gestor/boveda_del_Gestor?updateMask.fieldPaths=${fieldName}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: { [fieldName]: { stringValue: `$${newFunds}` } }
          })
        });

        // 2. Acreditar Dragcoins en Usuarios/{uid}
        const userUrl = `${FIRESTORE_BASE_URL}/Usuarios/${uid}`;
        const userRes = await fetch(userUrl);
        let userCoins = 0;
        let userCash = 0;

        if (userRes.ok) {
          const uDoc = await userRes.json();
          userCoins = parseMoney(extractVal(uDoc.fields?.Moneda));
          userCash = parseMoney(extractVal(uDoc.fields?.Billete));
        }

        userCoins += ticket.monto_total;

        await fetch(`${userUrl}?updateMask.fieldPaths=Moneda`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              Moneda: { stringValue: String(userCoins) }
            }
          })
        });

        // 3. Sincronizar en jugadores/{uid}
        await fetch(`${FIRESTORE_BASE_URL}/jugadores/${uid}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              coins: { integerValue: String(userCoins) },
              cash: { integerValue: String(userCash) },
              player_id: { stringValue: uid },
              last_updated: { stringValue: new Date().toISOString() }
            }
          })
        });

        tokensLiquidados.add(ticket.tokenId);

        return sendEncryptedResponse(res, 200, {
          success: true,
          transaccion_id: ticket.tokenId,
          monto_liquidado: ticket.monto_total,
          nuevas_dragcoins: userCoins,
          boveda_restante: newFunds
        });
      }

      return sendEncryptedResponse(res, 400, { error: `Acción '${action}' no reconocida por el Gateway.` });

    } catch (err) {
      console.error('Error procesando /api/gateway/secure:', err);
      return sendEncryptedResponse(res, 500, { error: 'Error interno en el Middleware de Render' });
    }
  }

  // Compatibilidad
  if (pathname === '/api/mercado' && method === 'GET') {
    try {
      const data = await fetchGestorData();
      return sendEncryptedResponse(res, 200, { success: true, ...data }, true);
    } catch (e) {
      return sendEncryptedResponse(res, 500, { error: e.message }, true);
    }
  }

  if (pathname === '/api/taller' && method === 'GET') {
    try {
      const taller = await fetchTallerData();
      return sendEncryptedResponse(res, 200, { success: true, taller }, true);
    } catch (e) {
      return sendEncryptedResponse(res, 500, { error: e.message }, true);
    }
  }

  return sendEncryptedResponse(res, 404, { error: 'Endpoint no encontrado' }, true);
});

server.listen(PORT, () => {
  console.log(`[Max Gold Black] Middleware API Gateway de Render activo en puerto ${PORT}`);
  console.log(`[Seguridad] Firebase Auth Gateway y Prevención de Multicuentas Activa.`);
});
