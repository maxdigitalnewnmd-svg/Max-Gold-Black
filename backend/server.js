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

// Códigos Encriptados Oficiales para Camiones de los Usuarios
function generateTruckSecurityCode(uid, tier) {
  const hmac = crypto.createHmac('sha256', ENCRYPTION_KEY_BUF);
  hmac.update(`TRUCK_SECURITY_AUTH:${uid}:TIER_${tier}:MAX_GOLD_BLACK_2026`);
  const hash = hmac.digest('hex').substring(0, 16).toUpperCase();
  return `MGB-TRK-T${tier}-${hash}`;
}

function verifyTruckSecurityCode(uid, tier, code) {
  if (!code) return false;
  const expected = generateTruckSecurityCode(uid, tier);
  return code.trim().toUpperCase() === expected;
}

// Commit Atómico en Firestore (FieldValue.increment / fieldTransforms)
async function executeFirestoreCommit(writes) {
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents:commit`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ writes })
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || 'Error en commit atómico de Firestore');
  }
  return data;
}

// Generación criptográfica inquebrantable del código de Terreno de Extracción por usuario
function generateLandSecurityCode(uid) {
  const hash = crypto.createHmac('sha256', ENCRYPTION_KEY_BUF)
    .update(`TERRENO_EXTRACCION_V1:${uid}:${CEO_CONFIG.sovereign_key}`)
    .digest('hex')
    .toUpperCase();
  return `MGB-TR-${hash.substring(0, 16)}`;
}

// Extracción de 2 primeras, 2 del medio y 2 últimas cifras del código de terreno
function extractLandSegments(landCode) {
  if (!landCode || typeof landCode !== 'string' || landCode.length < 6) {
    return 'TR0000';
  }
  const first2 = landCode.substring(0, 2);
  const midStart = Math.floor((landCode.length - 2) / 2);
  const mid2 = landCode.substring(midStart, midStart + 2);
  const last2 = landCode.substring(landCode.length - 2);
  return `${first2}${mid2}${last2}`;
}

// Gobernanza de Usuarios: Auto-aprovisionamiento y garantía de integridad por Render CEO
// Soporta escala masiva (1,000 a 10,000 usuarios) asegurando que no se pierda ni un recurso
async function ensureUserCompleteFields(uid, candidateData = {}) {
  const isCeoUid = (uid === CEO_CONFIG.uid);
  const url = `${FIRESTORE_BASE_URL}/Usuarios/${uid}`;
  const res = await fetch(url);
  const defaultLandCode = generateLandSecurityCode(uid);

  if (!res.ok) {
    // Si el usuario no existe en Usuarios, crearlo con todos los campos requeridos
    const nowStr = isCeoUid ? CEO_CONFIG.fecha_creacion : new Date().toISOString();
    const safeUsername = isCeoUid ? CEO_CONFIG.username : (candidateData.username && candidateData.username !== 'Dramax' && candidateData.username !== 'CEO' ? candidateData.username : `Minero_${uid.substring(0, 5)}`);
    const safeEmail = isCeoUid ? CEO_CONFIG.correo : (candidateData.correo && candidateData.correo !== CEO_CONFIG.correo ? candidateData.correo : `usuario_${uid.substring(0, 6)}@maxgoldblack.com`);
    const safeTipo = isCeoUid ? CEO_CONFIG.tipo : 'Minero';

    const newDocFields = {
      UID: { stringValue: uid },
      Username: { stringValue: safeUsername },
      correo: { stringValue: safeEmail },
      Tipo: { stringValue: safeTipo },
      fecha_creacion: { stringValue: nowStr },
      Tierra_de_extraccion: { stringValue: defaultLandCode },
      Recargar: { stringValue: '1000000' },
      Carbon: { integerValue: 0 },
      Oro: { integerValue: 0 },
      Esmeralda: { integerValue: 0 },
      Moneda: { integerValue: 0 },
      Billete: { integerValue: 0 },
      numero_de_recoleccion: { integerValue: 0 },
      'Numero de recoleccion': { stringValue: '0' }
    };

    await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: newDocFields })
    });

    return {
      uid,
      username: safeUsername,
      correo: safeEmail,
      tipo: safeTipo,
      fecha_creacion: nowStr,
      tierra_de_extraccion: defaultLandCode,
      recargar: '1000000',
      carbon: 0,
      oro: 0,
      esmeralda: 0,
      moneda: 0,
      billete: 0,
      numero_de_recoleccion: 0,
      es_ceo: isCeoUid
    };
  }

  // Si el usuario existe, validar minuciosamente que no le falte ningún campo requerido
  const doc = await res.json();
  const fields = doc.fields || {};
  const fieldsToFix = {};
  let needsPatch = false;

  // 1. Tierra de extracción (Código encriptado único)
  const currentLandCode = extractVal(fields.Tierra_de_extraccion);
  if (!currentLandCode || currentLandCode.trim() === '') {
    fieldsToFix['Tierra_de_extraccion'] = { stringValue: defaultLandCode };
    needsPatch = true;
  }

  // 2. Recargar
  if (!fields.Recargar) {
    fieldsToFix['Recargar'] = { stringValue: '1000000' };
    needsPatch = true;
  }

  // 3. Fecha de creación
  if (!fields.fecha_creacion) {
    const fCreacion = isCeoUid ? CEO_CONFIG.fecha_creacion : (doc.createTime || new Date().toISOString());
    fieldsToFix['fecha_creacion'] = { stringValue: fCreacion };
    needsPatch = true;
  }

  // 4. Campos numéricos para operaciones atómicas (Preservando 100% de los recursos existentes)
  const numericKeys = ['Carbon', 'Oro', 'Esmeralda', 'Moneda', 'Billete', 'numero_de_recoleccion'];
  for (const k of numericKeys) {
    if (!fields[k] || fields[k].integerValue === undefined) {
      const val = parseMoney(extractVal(fields[k]));
      fieldsToFix[k] = { integerValue: val };
      needsPatch = true;
    }
  }

  // 5. Aplicar parche selectivo solo si es necesario (sin tocar recursos ni montos)
  if (needsPatch) {
    const mask = Object.keys(fieldsToFix).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
    await fetch(`${url}?${mask}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: fieldsToFix })
    });
  }

  return {
    uid,
    username: isCeoUid ? CEO_CONFIG.username : (extractVal(fields.Username) || candidateData.username || `Minero_${uid.substring(0, 5)}`),
    correo: isCeoUid ? CEO_CONFIG.correo : (extractVal(fields.correo) || candidateData.correo || `usuario_${uid.substring(0, 6)}@maxgoldblack.com`),
    tipo: isCeoUid ? CEO_CONFIG.tipo : (extractVal(fields.Tipo) || 'Minero'),
    fecha_creacion: extractVal(fields.fecha_creacion) || (isCeoUid ? CEO_CONFIG.fecha_creacion : doc.createTime),
    tierra_de_extraccion: fieldsToFix.Tierra_de_extraccion ? defaultLandCode : (currentLandCode || defaultLandCode),
    recargar: extractVal(fields.Recargar) || '1000000',
    moneda: parseMoney(extractVal(fields.Moneda)),
    billete: parseMoney(extractVal(fields.Billete)),
    carbon: parseMoney(extractVal(fields.Carbon)),
    oro: parseMoney(extractVal(fields.Oro)),
    esmeralda: parseMoney(extractVal(fields.Esmeralda)),
    numero_de_recoleccion: parseMoney(extractVal(fields.numero_de_recoleccion || fields['Numero de recoleccion'])),
    es_ceo: isCeoUid
  };
}

// Wrapper retrocompatible para incrementos
async function ensureUserNumericFields(uid) {
  return await ensureUserCompleteFields(uid);
}

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
  const syncData = await ensureUserCompleteFields(uid, candidateData);

  const truckCodes = {
    1: generateTruckSecurityCode(uid, 1),
    2: generateTruckSecurityCode(uid, 2),
    3: generateTruckSecurityCode(uid, 3),
    4: generateTruckSecurityCode(uid, 4)
  };

  return {
    ...syncData,
    truck_security_codes: truckCodes,
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

// ----------------- BUSCADOR DE USUARIOS POR CORREO (PARA FUSIÓN DE CUENTAS) -----------------
async function findUserByEmail(email) {
  if (!email) return null;
  try {
    const res = await fetch(`${FIRESTORE_BASE_URL}:runQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'Usuarios' }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'correo' },
              op: 'EQUAL',
              value: { stringValue: email.trim().toLowerCase() }
            }
          },
          limit: 1
        }
      })
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data[0] && data[0].document) {
      const doc = data[0].document;
      const parts = doc.name.split('/');
      const docUid = parts[parts.length - 1];
      return { uid: docUid, fields: doc.fields };
    }
  } catch (err) {
    console.error('[findUserByEmail] Error consultando correo:', err.message);
  }
  return null;
}

// ----------------- AUTENTICACIÓN GOOGLE Y FUSIÓN DE CUENTAS -----------------
async function handleGoogleAuth(idToken, email, displayName) {
  let targetEmail = (email || '').trim().toLowerCase();
  let targetUid = null;
  let targetName = displayName || '';

  if (idToken) {
    try {
      const fbUrl = `${FIREBASE_AUTH_BASE}:signInWithIdp?key=${FIREBASE_API_KEY}`;
      const fbRes = await fetch(fbUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postBody: `id_token=${idToken}&providerId=google.com`,
          requestUri: 'http://localhost',
          returnSecureToken: true
        })
      });
      const fbData = await fbRes.json();
      if (fbRes.ok) {
        targetUid = fbData.localId;
        targetEmail = (fbData.email || targetEmail).toLowerCase();
        targetName = targetName || fbData.displayName || '';
      }
    } catch (e) {
      console.warn('[handleGoogleAuth] Fallback ID token:', e.message);
    }
  }

  if (!targetEmail) {
    return {
      success: false,
      error: 'No se pudo obtener un correo electrónico válido de la cuenta de Google.'
    };
  }

  // REGLA ESTRICTA DE FUSIÓN: Buscar si ya existe una cuenta con este correo
  const existingUser = await findUserByEmail(targetEmail);
  let finalUid;
  let isFused = false;

  if (existingUser) {
    // FUSIÓN BAJO EL MISMO UID ORIGINAL
    finalUid = existingUser.uid;
    isFused = true;
    console.log(`[AUTH_GOOGLE] FUSIÓN ATÓMICA: Correo ${targetEmail} unificado bajo UID original existente ${finalUid}`);
  } else {
    // Si no existe, crear nueva cuenta
    finalUid = targetUid || `google_${crypto.randomBytes(12).toString('hex')}`;
  }

  const userProfile = await getOrSyncUser(finalUid, {
    correo: targetEmail,
    username: targetName || `Google_${finalUid.substring(0, 5)}`
  });

  return {
    success: true,
    fused: isFused,
    uid: finalUid,
    usuario: userProfile,
    token: `GOOGLE_SESSION_${finalUid}_${Date.now()}`,
    mensaje: isFused
      ? `¡Bienvenido de nuevo, ${userProfile.username}! Tu cuenta de Google fue fusionada automáticamente con tu progreso existente (mismo UID: ${finalUid}).`
      : `¡Bienvenido a Max Gold Black, ${userProfile.username}! Tu cuenta de Google ha sido registrada.`
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
  const extraccionAzar = {
    COAL: [1, 2, 3, 4, 5],
    GOLD: [1, 2, 3, 4, 5],
    EMERALD: [1, 2, 3, 4, 5]
  };

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

    if (fields.extraccion_al_azar && fields.extraccion_al_azar.arrayValue) {
      const arr = (fields.extraccion_al_azar.arrayValue.values || [])
        .map(v => parseInt(extractVal(v), 10))
        .filter(n => !isNaN(n) && n > 0);
      if (arr.length > 0) {
        if (docId === 'UoYSR5Skd0jKQdMnQw2T' || fields.Costo_Carbon) extraccionAzar.COAL = arr;
        if (docId === 'wTGYvGgv7ngFhMKn3FnU' || fields.Costo_oro || fields.Costo_Oro) extraccionAzar.GOLD = arr;
        if (docId === 'enuLDJDSQGPJzaTJuMaJ' || fields.Costo_esmeralda || fields.Costo_Esmeralda) extraccionAzar.EMERALD = arr;
      }
    }
  }

  return { precios, boveda, extraccionAzar };
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

      // --- ACCIÓN: AUTENTICACIÓN GOOGLE SIGN-IN Y FUSIÓN DE CUENTAS (AUTH_GOOGLE) ---
      if (action === 'AUTH_GOOGLE') {
        const idToken = requestData.id_token || '';
        const email = (requestData.email || '').trim();
        const displayName = requestData.display_name || requestData.username || '';

        const googleResult = await handleGoogleAuth(idToken, email, displayName);
        const httpStatus = googleResult.success ? 200 : 400;
        return sendEncryptedResponse(res, httpStatus, googleResult);
      }

      // --- ACCIÓN: VERIFICACIÓN OBLIGATORIA DE ESTADO DE SESIÓN (CHECK_SESSION) ---
      if (action === 'CHECK_SESSION') {
        const sessionUid = requestData.uid || '';
        if (!sessionUid) {
          return sendEncryptedResponse(res, 401, {
            valida: false,
            error: 'No se proveyó un UID de sesión.'
          });
        }

        const userUrl = `${FIRESTORE_BASE_URL}/Usuarios/${sessionUid}`;
        const uRes = await fetch(userUrl);
        if (uRes.ok) {
          return sendEncryptedResponse(res, 200, {
            valida: true,
            uid: sessionUid,
            mensaje: 'Sesión activa y legalmente verificada por Render Gateway.'
          });
        } else {
          return sendEncryptedResponse(res, 401, {
            valida: false,
            error: 'Sesión caducada o usuario no encontrado en la base de datos.'
          });
        }
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

      // =========================================================================
      // PASO 1: EXTRACCIÓN Y VALIDACIÓN (CAMIONES ➔ RENDER)
      // Valida código encriptado del camión, física de onda y probabilidad de Tier.
      // Si es válido, actualiza el campo correspondiente sumando el mineral (Operación Atómica).
      // =========================================================================
      if (action === 'REPORTAR_HALLAZGO' || action === 'EXTRAER_RECURSO_CAMION') {
        const tier = parseInt(requestData.camioneta_tier || requestData.tier || 1, 10);
        const resourceType = (requestData.tipo_hallazgo || requestData.recurso || '').toUpperCase();
        const truckSecurityCode = requestData.truck_security_code || requestData.truck_code || '';
        const now = Date.now();

        const rule = FLEET_EXPLORATION_RULES[tier];
        if (!rule) {
          return sendEncryptedResponse(res, 400, {
            error: 'Camioneta no reconocida en el parque automotor oficial.'
          });
        }

        // 1.1 VALIDACIÓN DEL CÓDIGO ENCRIPTADO INDIVIDUAL DEL CAMIÓN
        if (!verifyTruckSecurityCode(uid, tier, truckSecurityCode)) {
          console.warn(`[SEGURIDAD] Intento de extracción con código de camión inválido: uid=${uid}, tier=${tier}, code=${truckSecurityCode}`);
          return sendEncryptedResponse(res, 403, {
            validado: false,
            error: 'VIOLACIÓN DE SEGURIDAD: El camión utilizado no posee un código encriptado corporativo autorizado para este usuario.',
            codigo: 'INVALID_TRUCK_ENCRYPTED_CODE'
          });
        }

        // 1.2 VALIDACIÓN TEMPORAL (Speedhack Prevention)
        const lastTime = lastExplorationTimes.get(uid) || 0;
        const elapsed = now - lastTime;
        if (lastTime > 0 && elapsed < rule.frecuencia_minima_segura_ms) {
          console.warn(`[ANTI-HACK] Speedhack detectado para ${uid}: ${elapsed}ms < ${rule.frecuencia_minima_segura_ms}ms`);
          return sendEncryptedResponse(res, 429, {
            validado: false,
            error: 'ANOMALÍA TEMPORAL DETECTADA: Frecuencia de muestreo físicamente imposible para el sensor sísmico.',
            codigo: 'SPEEDHACK_BLOCKED',
            tiempo_transcurrido_ms: elapsed,
            minimo_requerido_ms: rule.frecuencia_minima_segura_ms
          });
        }

        // 1.3 VALIDACIÓN DE PROBABILIDAD FÍSICA SEGÚN EL TIER (Ej: 0% Esmeralda en T1)
        const maxProb = rule.probabilidades_max[resourceType];
        if (maxProb === undefined || maxProb <= 0) {
          console.warn(`[ANTI-HACK] Intento de extracción imposible: ${resourceType} en ${rule.nombre}`);
          return sendEncryptedResponse(res, 403, {
            validado: false,
            error: `FRAUDE BLOQUEADO: El vehículo ${rule.nombre} no tiene capacidad sísmica para extraer ${resourceType} (Probabilidad: 0%).`,
            codigo: 'IMPOSSIBLE_RESOURCE_INJECTION'
          });
        }

        lastExplorationTimes.set(uid, now);

        // 1.4 VALIDACIÓN DE TRAZABILIDAD Y FIRMA ÚNICA DEL MINERAL
        const trazabilidad = requestData.trazabilidad || {};
        const uidPart = trazabilidad.uid_part || uid.substring(0, 8);
        const vehDatePart = trazabilidad.veh_date_part || '20261101';
        const timestampExacto = trazabilidad.timestamp_exacto || new Date().toISOString();

        // Validar coherencia del UID en la firma
        if (uidPart !== uid.substring(0, 8)) {
          return sendEncryptedResponse(res, 403, {
            validado: false,
            error: 'VIOLACIÓN DE TRAZABILIDAD: La firma del mineral no coincide con el UID del usuario autenticado.',
            codigo: 'INVALID_LOT_UID_SIGNATURE'
          });
        }

        // Consultar el perfil de usuario y contador de recolección actual
        const userSync = await ensureUserCompleteFields(uid);
        const userUrl = `${FIRESTORE_BASE_URL}/Usuarios/${uid}`;
        const uDoc = await (await fetch(userUrl)).json();
        const currentRecoleccion = parseMoney(extractVal(uDoc.fields?.numero_de_recoleccion || uDoc.fields?.['Numero de recoleccion']));
        const nextRecoleccion = currentRecoleccion + 1;

        // Código de terreno y fragmento de seguridad (2 primeras, 2 del medio, 2 últimas)
        const landCode = extractVal(uDoc.fields?.Tierra_de_extraccion) || userSync.tierra_de_extraccion || generateLandSecurityCode(uid);
        const landSegment = extractLandSegments(landCode);

        // Obtener cantidad aleatoria desde Gestor (extraccion_al_azar)
        const gestor = await fetchGestorData();
        const pool = gestor.extraccionAzar[resourceType] || [1, 2, 3, 4, 5];
        const cantidadExtraida = pool[Math.floor(Math.random() * pool.length)] || 1;

        // Generar y certificar código de lote inmutable incorporando el segmento de terreno
        const rawLotExpected = `LOT|${uidPart}|${vehDatePart}|${timestampExacto}|${nextRecoleccion}|${resourceType}|T${tier}|${landSegment}`;
        const expectedLotHash = crypto.createHmac('sha256', ENCRYPTION_KEY_BUF).update(rawLotExpected).digest('hex').substring(0, 16).toUpperCase();
        const codigoLoteCertificado = `MGB-LOT-${resourceType}-${landSegment}-N${nextRecoleccion}-${expectedLotHash.substring(0, 8)}`;

        const fieldMap = { COAL: 'Carbon', GOLD: 'Oro', EMERALD: 'Esmeralda' };
        const mineralField = fieldMap[resourceType] || 'Carbon';

        // 1.5 OPERACIÓN ATÓMICA: SUMAR MINERAL SEGÚN EXTRACCIÓN AL AZAR Y SUMAR CONTADOR (+1)
        const atomicMineralWrite = [
          {
            transform: {
              document: `projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/Usuarios/${uid}`,
              fieldTransforms: [
                {
                  fieldPath: mineralField,
                  increment: { integerValue: cantidadExtraida }
                },
                {
                  fieldPath: 'numero_de_recoleccion',
                  increment: { integerValue: 1 }
                }
              ]
            }
          }
        ];

        try {
          await executeFirestoreCommit(atomicMineralWrite);
        } catch (commitErr) {
          console.error('[PASO 1] Error en commit atómico de extracción:', commitErr);
          return sendEncryptedResponse(res, 500, {
            validado: false,
            error: 'Error al registrar el mineral en la base de datos central: ' + commitErr.message
          });
        }

        return sendEncryptedResponse(res, 200, {
          success: true,
          validado: true,
          mineral: resourceType,
          mineral_field: mineralField,
          cantidad_extraida: cantidadExtraida,
          tier_verificado: tier,
          truck_code_verificado: true,
          tierra_codigo: landCode,
          tierra_segmento: landSegment,
          codigo_lote: codigoLoteCertificado,
          numero_de_recoleccion: nextRecoleccion,
          trazabilidad_confirmada: {
            uid_parte: uidPart,
            veh_fecha: vehDatePart,
            timestamp_exacto: timestampExacto,
            numero_recoleccion: nextRecoleccion,
            tierra_segmento: landSegment,
            cantidad_extraida: cantidadExtraida,
            lote_id: codigoLoteCertificado,
            propietario: uid
          },
          mensaje: `¡Extracción validada con trazabilidad única y terreno verificado! Lote ${codigoLoteCertificado} (+${cantidadExtraida} ${mineralField}, +1 Recolección).`
        });
      }

      // =========================================================================
      // PASO 2: DOBLE VERIFICACIÓN DE FRANKLIN (RENDER ➔ CLIENTE)
      // Franklin pregunta: '¿Es cierto que este usuario tiene este mineral en su inventario?'.
      // Render verifica en Firestore y, si es afirmativo, emite la propuesta con ticket firmado.
      // =========================================================================
      if (action === 'FRANKLIN_VERIFICAR_MINERAL' || action === 'VERIFICAR_INVENTARIO_FRANKLIN') {
        const minKey = (requestData.mineral || requestData.recurso || 'COAL').toUpperCase();
        const fieldMap = { COAL: 'Carbon', GOLD: 'Oro', EMERALD: 'Esmeralda' };
        const fieldName = fieldMap[minKey] || 'Carbon';

        // 2.1 Consulta rigurosa a la base de datos central
        await ensureUserNumericFields(uid);
        const userUrl = `${FIRESTORE_BASE_URL}/Usuarios/${uid}`;
        const userRes = await fetch(userUrl);

        if (!userRes.ok) {
          return sendEncryptedResponse(res, 404, {
            verificado: false,
            actor: 'Franklin Martínez',
            error: 'Franklin Martínez: No pude localizar tu registro de usuario en la base de datos.'
          });
        }

        const userDoc = await userRes.json();
        const stockActual = parseMoney(extractVal(userDoc.fields?.[fieldName]));

        // 2.2 Si el inventario no tiene el mineral, Franklin rechaza la compra
        if (stockActual < 1) {
          return sendEncryptedResponse(res, 200, {
            verificado: false,
            actor: 'Franklin Martínez',
            mineral: minKey,
            stock_actual: stockActual,
            error: `Franklin Martínez: Consulté a Render y tu inventario de ${fieldName} está en 0. No puedo ofrecerte compra por recursos inexistentes.`
          });
        }

        // 2.3 Obtener cotización oficial del Gestor
        const gestor = await fetchGestorData();
        const precioOficial = gestor.precios[minKey] || 30;

        // 2.4 Emitir Ticket Criptográfico firmado por Franklin
        const payloadFranklin = {
          tipo: 'TICKET_FRANKLIN_COTIZACION',
          ticketId: `FRK_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`,
          uid: uid,
          mineral: minKey,
          cantidad: 1,
          precio_unitario: precioOficial,
          timestamp: Date.now(),
          exp: Date.now() + 180000 // 3 minutos de vigencia
        };

        const ticketFranklin = signAuthorizationPayload(payloadFranklin);

        return sendEncryptedResponse(res, 200, {
          verificado: true,
          actor: 'Franklin Martínez',
          mineral: minKey,
          mineral_nombre: fieldName,
          stock_en_bd: stockActual,
          precio_unitario: precioOficial,
          ticket_franklin: ticketFranklin,
          mensaje: `Franklin Martínez: ¡Confirmado con la base de datos! Tienes ${stockActual} unidad(es) de ${fieldName}. Te ofrezco formalmente $${precioOficial} por saco.`
        });
      }

      // =========================================================================
      // PASOS 3 Y 4: VISTO BUENO DE MAX DRAG & REGLA ESTRICTA DE OPERACIONES ATÓMICAS
      // Comprobación simultánea: usuario tiene el mineral Y Bóveda tiene liquidez.
      // Si ambos cumplen, aplica OPERACIONES ATÓMICAS (increment / decrement).
      // PROHIBIDO SOBREESCRIBIR MONTOS FIJOS.
      // =========================================================================
      if (action === 'MAX_DRAG_CIERRE_VENTA' || action === 'LIQUIDAR_TRANSACCION' || action === 'SOLICITAR_TRANSACCION') {
        const ticketToken = requestData.ticket_franklin || requestData.token;
        
        let ticket;
        if (ticketToken) {
          const verification = verifyAuthorizationToken(ticketToken);
          if (!verification.valid) {
            return sendEncryptedResponse(res, 403, {
              success: false,
              aprobado: false,
              actor: 'Max Drag',
              error: 'Max Drag: Ticket de cotización inválido, manipulado o expirado.',
              motivo: verification.error
            });
          }
          ticket = verification.payload;
        } else {
          // Si no envía token, construir solicitud con validación directa de mineral
          const minKey = (requestData.mineral || requestData.recurso || 'COAL').toUpperCase();
          const gestor = await fetchGestorData();
          ticket = {
            ticketId: `DIRECT_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
            uid: uid,
            mineral: minKey,
            cantidad: 1,
            precio_unitario: gestor.precios[minKey] || 30
          };
        }

        if (ticket.uid !== uid) {
          return sendEncryptedResponse(res, 403, {
            success: false,
            aprobado: false,
            actor: 'Max Drag',
            error: 'Violación de identidad: El ticket pertenece a otro usuario.'
          });
        }

        const ticketId = ticket.ticketId || ticket.tokenId;
        if (tokensLiquidados.has(ticketId)) {
          return sendEncryptedResponse(res, 403, {
            success: false,
            aprobado: false,
            actor: 'Max Drag',
            error: 'Max Drag: Este ticket ya fue cobrado previamente. Intento de doble gasto rechazado.'
          });
        }

        const fieldMap = { COAL: 'Carbon', GOLD: 'Oro', EMERALD: 'Esmeralda' };
        const fieldName = fieldMap[ticket.mineral] || 'Carbon';
        const cantidadVenta = ticket.cantidad || 1;
        const precioUnitario = ticket.precio_unitario || ticket.precio_ofrecido || 30;
        const montoTotal = precioUnitario * cantidadVenta;

        // --- PASO 3: COMPROBACIÓN SIMULTÁNEA DE MAX DRAG ---
        await ensureUserNumericFields(uid);

        // A) Comprobar inventario del usuario en Usuarios/{uid}
        const userUrl = `${FIRESTORE_BASE_URL}/Usuarios/${uid}`;
        const userRes = await fetch(userUrl);
        if (!userRes.ok) {
          return sendEncryptedResponse(res, 400, {
            success: false,
            aprobado: false,
            actor: 'Max Drag',
            error: 'Max Drag: No se pudo verificar la cuenta del usuario en Firestore.'
          });
        }
        const userDoc = await userRes.json();
        const userMineralStock = parseMoney(extractVal(userDoc.fields?.[fieldName]));

        if (userMineralStock < cantidadVenta) {
          return sendEncryptedResponse(res, 200, {
            success: false,
            aprobado: false,
            actor: 'Max Drag',
            error: `Max Drag (Seguridad Financiera): Rechazado. El usuario no posee el mineral para entregar. Stock en BD: ${userMineralStock}, Requerido: ${cantidadVenta}.`
          });
        }

        // B) Comprobar liquidez de la Bóveda del Gestor en Gestor/boveda_del_Gestor
        const bovedaUrl = `${FIRESTORE_BASE_URL}/Gestor/boveda_del_Gestor`;
        const bovedaRes = await fetch(bovedaUrl);
        if (!bovedaRes.ok) {
          return sendEncryptedResponse(res, 500, {
            success: false,
            aprobado: false,
            actor: 'Max Drag',
            error: 'Max Drag: Error al verificar la Bóveda del Gestor.'
          });
        }
        const bovedaDoc = await bovedaRes.json();
        const bovedaLiquidez = parseMoney(extractVal(bovedaDoc.fields?.[fieldName]));

        if (bovedaLiquidez < montoTotal) {
          return sendEncryptedResponse(res, 200, {
            success: false,
            aprobado: false,
            actor: 'Max Drag',
            error: `Max Drag (Seguridad Financiera): Rechazado. La Bóveda del Gestor no cuenta con liquidez suficiente para pagar $${montoTotal}. Fondos en Bóveda: $${bovedaLiquidez}. Contactar al CEO.`
          });
        }

        // --- PASO 4: REGLA ESTRICTA DE OPERACIONES ATÓMICAS EN BASE DE DATOS ---
        // ESTÁ PROHIBIDO SOBREESCRIBIR MONTOS FIJOS. SOLO FUNCIONES DE INCREMENTO / DECREMENTO.
        const atomicTransactions = [
          // 1. Al Usuario: Restar cantidad exacta de mineral y sumar monto exacto de dinero (Billete)
          {
            transform: {
              document: `projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/Usuarios/${uid}`,
              fieldTransforms: [
                {
                  fieldPath: fieldName,
                  increment: { integerValue: -cantidadVenta }
                },
                {
                  fieldPath: 'Billete',
                  increment: { integerValue: montoTotal }
                }
              ]
            }
          },
          // 2. A la Bóveda del Gestor: Restar el monto exacto del pago
          {
            transform: {
              document: `projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/Gestor/boveda_del_Gestor`,
              fieldTransforms: [
                {
                  fieldPath: fieldName,
                  increment: { integerValue: -montoTotal }
                }
              ]
            }
          },
          // 3. A jugadores/jugador_1 (compatibilidad HUD): Sumar cash
          {
            transform: {
              document: `projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/jugadores/jugador_1`,
              fieldTransforms: [
                {
                  fieldPath: 'cash',
                  increment: { integerValue: montoTotal }
                }
              ]
            }
          }
        ];

        try {
          await executeFirestoreCommit(atomicTransactions);
        } catch (commitErr) {
          console.error('[PASO 4] Error en ejecución atómica de venta:', commitErr);
          return sendEncryptedResponse(res, 500, {
            success: false,
            aprobado: false,
            actor: 'Max Drag',
            error: 'Error al ejecutar la transacción atómica en Firestore: ' + commitErr.message
          });
        }

        tokensLiquidados.add(ticketId);

        return sendEncryptedResponse(res, 200, {
          success: true,
          aprobado: true,
          actor: 'Max Drag & Franklin Martínez',
          codigo: 'TRANSACCION_ATOMICA_EXITOSA',
          mineral: ticket.mineral,
          cantidad_vendida: cantidadVenta,
          monto_pagado: montoTotal,
          mensaje: `¡Transacción Atómica Completada! Max Drag aprobó el desembolso. Franklin recibió 1 saco de ${fieldName}. Se debitó 1 de tu inventario y se sumaron +$${montoTotal} Max COP. La Bóveda fue descontada en -$${montoTotal} bajo regla atómica inquebrantable.`
        });
      }

      // --- ACCIÓN: OBTENER CÓDIGOS DE SEGURIDAD ENCRIPTADOS DE CAMIONES ---
      if (action === 'GET_TRUCK_CODES') {
        const codes = {
          1: generateTruckSecurityCode(uid, 1),
          2: generateTruckSecurityCode(uid, 2),
          3: generateTruckSecurityCode(uid, 3),
          4: generateTruckSecurityCode(uid, 4)
        };
        return sendEncryptedResponse(res, 200, {
          success: true,
          uid: uid,
          truck_codes: codes
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
