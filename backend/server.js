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

// Generación criptográfica oficial para Camiones Comprados en Taller (con fecha/hora/minuto)
function generatePurchasedTruckCode(uid, tier, dateStr) {
  const hmac = crypto.createHmac('sha256', ENCRYPTION_KEY_BUF)
    .update(`PURCHASED_TRUCK:${uid}:T${tier}:${dateStr}:${ENCRYPTION_KEY_STR}`)
    .digest('hex')
    .substring(0, 12)
    .toUpperCase();
  return `MGB-TRK-${dateStr}-T${tier}-${hmac}`;
}

function verifyTruckSecurityCode(uid, tier, code, ownedCode = null) {
  if (!code) return false;
  const c = code.trim().toUpperCase();
  if (ownedCode && ownedCode.trim().toUpperCase() === c) return true;
  const defaultCode = generateTruckSecurityCode(uid, tier);
  return c === defaultCode;
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
      camiones_adquiridos: {},
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

  // 2.1 Latido y Sesión Activa para Minería Offline
  if (!fields.ultimo_latido_ms) {
    fieldsToFix['ultimo_latido_ms'] = { integerValue: Date.now() };
    needsPatch = true;
  }
  if (!fields.session_activa) {
    fieldsToFix['session_activa'] = { booleanValue: true };
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

  // 6. Consultar camiones adquiridos por el usuario en el Taller
  const camionesAdquiridos = {};
  for (let t = 1; t <= 4; t++) {
    const code = extractVal(fields[`camion_tier_${t}_codigo`]);
    const titulo = extractVal(fields[`camion_tier_${t}_titulo`]);
    const fecha = extractVal(fields[`camion_tier_${t}_fecha`]);
    const costo = parseMoney(extractVal(fields[`camion_tier_${t}_costo`]));
    if (code && code.trim().length > 0) {
      camionesAdquiridos[t] = {
        tier: t,
        titulo: titulo || `Camioneta Tier ${t}`,
        codigo: code,
        fecha: fecha || '',
        costo: costo || 0
      };
    }
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
    camiones_adquiridos: camionesAdquiridos,
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
    1: syncData.camiones_adquiridos?.[1]?.codigo || generateTruckSecurityCode(uid, 1),
    2: syncData.camiones_adquiridos?.[2]?.codigo || generateTruckSecurityCode(uid, 2),
    3: syncData.camiones_adquiridos?.[3]?.codigo || generateTruckSecurityCode(uid, 3),
    4: syncData.camiones_adquiridos?.[4]?.codigo || generateTruckSecurityCode(uid, 4)
  };

  return {
    ...syncData,
    truck_security_codes: truckCodes,
    inmutable: true
  };
}

// Helper para generar hash criptográfico seguro de contraseña por usuario
function hashUserPassword(uid, password) {
  const salt = `MGB_SALT_${uid}_2026`;
  return crypto.createHmac('sha256', ENCRYPTION_KEY_BUF).update(`${password}:${salt}`).digest('hex');
}

// ----------------- AUTENTICACIÓN FIREBASE AUTH & GESTOR DE IDENTIDADES VÍA RENDER -----------------
async function handleFirebaseAuthLogin(email, password) {
  const normalizedEmail = (email || '').trim().toLowerCase();

  // 1. Buscar usuario en Firestore
  const existingUser = await findUserByEmail(normalizedEmail);

  if (!existingUser) {
    // Si no está en Firestore, comprobar en Firebase Auth
    try {
      const url = `${FIREBASE_AUTH_BASE}:signInWithPassword?key=${FIREBASE_API_KEY}`;
      const fbRes = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail, password, returnSecureToken: true })
      });
      const fbData = await fbRes.json();
      if (!fbRes.ok) {
        const err = fbData.error?.message || '';
        if (err === 'EMAIL_NOT_FOUND' || err === 'INVALID_LOGIN_CREDENTIALS') {
          return { success: false, code: 'EMAIL_NOT_FOUND', error: 'El usuario no existe. Debe crear una cuenta para ingresar.' };
        }
        return { success: false, code: 'AUTH_FAILED', error: 'Credenciales inválidas o usuario no registrado.' };
      }
      const uid = fbData.localId;
      const userProfile = await getOrSyncUser(uid, { correo: normalizedEmail });
      return {
        success: true,
        token: fbData.idToken,
        usuario: userProfile,
        mensaje: `¡Bienvenido de nuevo, ${userProfile.username}! Sesión iniciada con éxito.`
      };
    } catch (e) {
      return { success: false, code: 'EMAIL_NOT_FOUND', error: 'El usuario no existe. Debe crear una cuenta para ingresar.' };
    }
  }

  // 2. Si el usuario existe en Firestore:
  const fields = existingUser.fields || {};
  const hasPassword = fields.has_password?.booleanValue === true || (fields.password_hash && fields.password_hash.stringValue);

  // REGLA ESTRICTA: Si se creó solo con Google y no se ha registrado con contraseña
  if (!hasPassword) {
    console.warn(`[AUTH_LOGIN] Login con contraseña denegado: Usuario ${existingUser.uid} creado solo con Google sin contraseña.`);
    return {
      success: false,
      code: 'USER_REGISTERED_ONLY_WITH_GOOGLE',
      error: 'El usuario no se ha registrado con contraseña (esta cuenta fue creada únicamente mediante Google). Por favor regístrese en la opción "Registrarse" con este correo y una contraseña para vincularla, o inicie sesión con Google.'
    };
  }

  // 3. Si tiene contraseña registrada, verificar hash seguro
  const passHash = hashUserPassword(existingUser.uid, password);
  const storedHash = fields.password_hash?.stringValue;

  if (storedHash && passHash === storedHash) {
    const userProfile = await getOrSyncUser(existingUser.uid, { correo: normalizedEmail });
    return {
      success: true,
      token: `SESSION_${existingUser.uid}_${Date.now()}`,
      usuario: userProfile,
      mensaje: userProfile.es_ceo
        ? '¡Bienvenido de nuevo, Señor CEO Dramax! Sesión corporativa iniciada.'
        : `¡Bienvenido de nuevo, ${userProfile.username}! Sesión iniciada con éxito.`
    };
  }

  // Verificar alternativamente con Firebase Auth por compatibilidad
  try {
    const url = `${FIREBASE_AUTH_BASE}:signInWithPassword?key=${FIREBASE_API_KEY}`;
    const fbRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: normalizedEmail, password, returnSecureToken: true })
    });
    if (fbRes.ok) {
      const fbData = await fbRes.json();
      const userProfile = await getOrSyncUser(existingUser.uid, { correo: normalizedEmail });
      return {
        success: true,
        token: fbData.idToken,
        usuario: userProfile,
        mensaje: userProfile.es_ceo
          ? '¡Bienvenido de nuevo, Señor CEO Dramax! Sesión corporativa iniciada.'
          : `¡Bienvenido de nuevo, ${userProfile.username}! Sesión iniciada con éxito.`
      };
    }
  } catch (e) {}

  return {
    success: false,
    code: 'INVALID_PASSWORD',
    error: 'Contraseña incorrecta. Por favor verifique sus datos o inicie sesión con Google si vinculó su cuenta.'
  };
}

async function handleFirebaseAuthRegister(email, password, username) {
  const normalizedEmail = (email || '').trim().toLowerCase();

  // Prohibición estricta de suplantación del CEO
  if (normalizedEmail === CEO_CONFIG.correo.toLowerCase()) {
    // Si es el CEO registrando su contraseña por primera vez, vincularla al UID del CEO
    const ceoDoc = await findUserByEmail(CEO_CONFIG.correo);
    if (ceoDoc && (!ceoDoc.fields?.password_hash || ceoDoc.fields?.has_password?.booleanValue === false)) {
      const passHash = hashUserPassword(CEO_CONFIG.uid, password);
      await fetch(`${FIRESTORE_BASE_URL}/Usuarios/${CEO_CONFIG.uid}?updateMask.fieldPaths=password_hash&updateMask.fieldPaths=has_password&updateMask.fieldPaths=auth_provider`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            password_hash: { stringValue: passHash },
            has_password: { booleanValue: true },
            auth_provider: { stringValue: 'GOOGLE_AND_PASSWORD' }
          }
        })
      });
      const userProfile = await getOrSyncUser(CEO_CONFIG.uid);
      return {
        success: true,
        fused: true,
        token: `CEO_SESSION_${CEO_CONFIG.uid}_${Date.now()}`,
        usuario: userProfile,
        mensaje: '¡Contraseña asignada con éxito a la cuenta del Señor CEO Dramax!'
      };
    }
    return {
      success: false,
      code: 'CEO_EMAIL_RESERVED',
      error: 'Este correo institucional está reservado exclusivamente para la cuenta fundacional del CEO.'
    };
  }

  // 1. Verificar si el usuario ya existe en Firestore (por ejemplo, creado previamente con Google)
  const existingUser = await findUserByEmail(normalizedEmail);

  if (existingUser) {
    const fields = existingUser.fields || {};
    const hasPassword = fields.has_password?.booleanValue === true || (fields.password_hash && fields.password_hash.stringValue);

    // Si ya tiene contraseña registrada, no permitir crear multicuenta
    if (hasPassword) {
      return {
        success: false,
        code: 'EMAIL_EXISTS',
        error: 'Este correo ya está registrado con contraseña en la empresa. Inicie sesión directamente; las multicuentas están estrictamente prohibidas.'
      };
    }

    // SI FUE CREADO CON GOOGLE Y AHORA SE REGISTRA CON CORREO Y CONTRASEÑA:
    // Render NO lo rechaza. Une la contraseña al UID existente manteniendo 100% de los recursos.
    const passHash = hashUserPassword(existingUser.uid, password);
    const patchFields = {
      password_hash: { stringValue: passHash },
      has_password: { booleanValue: true },
      auth_provider: { stringValue: 'GOOGLE_AND_PASSWORD' }
    };
    if (username && username.trim().length > 0 && !fields.Username) {
      patchFields.Username = { stringValue: username.trim() };
    }

    const mask = Object.keys(patchFields).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
    await fetch(`${FIRESTORE_BASE_URL}/Usuarios/${existingUser.uid}?${mask}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: patchFields })
    });

    const userProfile = await getOrSyncUser(existingUser.uid);
    console.log(`[AUTH_REGISTER] FUSIÓN GOOGLE->PASSWORD: Correo ${normalizedEmail} vinculado bajo UID existente ${existingUser.uid} sin perder recursos.`);

    return {
      success: true,
      fused: true,
      token: `SESSION_${existingUser.uid}_${Date.now()}`,
      usuario: userProfile,
      mensaje: `¡Cuenta unificada con éxito! Tu cuenta creada previamente con Google ahora cuenta con contraseña vinculada bajo tu mismo UID (${existingUser.uid}) conservando todos tus recursos.`
    };
  }

  // 2. Si no existe en Firestore, intentar registrar en Firebase Auth o crear nuevo usuario
  let uid = null;
  let idToken = null;

  try {
    const url = `${FIREBASE_AUTH_BASE}:signUp?key=${FIREBASE_API_KEY}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: normalizedEmail, password, returnSecureToken: true })
    });
    const data = await response.json();
    if (response.ok) {
      uid = data.localId;
      idToken = data.idToken;
    } else {
      const errorMsg = data.error?.message || 'ERROR_REGISTER';
      if (errorMsg.includes('EMAIL_EXISTS')) {
        uid = `minero_${crypto.randomBytes(8).toString('hex')}`;
      } else if (errorMsg.includes('WEAK_PASSWORD')) {
        return { success: false, code: 'WEAK_PASSWORD', error: 'La contraseña debe tener al menos 6 caracteres.' };
      } else if (errorMsg.includes('INVALID_EMAIL')) {
        return { success: false, code: 'INVALID_EMAIL', error: 'El formato de correo electrónico es inválido.' };
      } else {
        return { success: false, code: errorMsg, error: 'No se pudo crear la cuenta: verifique los datos ingresados.' };
      }
    }
  } catch (err) {
    uid = `minero_${crypto.randomBytes(8).toString('hex')}`;
  }

  const safeUsername = username && username.trim().length > 0 ? username.trim() : normalizedEmail.split('@')[0];
  const passHash = hashUserPassword(uid, password);

  // Auto-aprovisionar usuario completo en Firestore
  const userProfile = await getOrSyncUser(uid, {
    correo: normalizedEmail,
    username: safeUsername
  });

  // Guardar hash de contraseña y bandera de contraseña en Firestore
  await fetch(`${FIRESTORE_BASE_URL}/Usuarios/${uid}?updateMask.fieldPaths=password_hash&updateMask.fieldPaths=has_password&updateMask.fieldPaths=auth_provider`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        password_hash: { stringValue: passHash },
        has_password: { booleanValue: true },
        auth_provider: { stringValue: 'EMAIL_PASSWORD' }
      }
    })
  });

  return {
    success: true,
    token: idToken || `SESSION_${uid}_${Date.now()}`,
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

  // REGLA ESTRICTA DE CEO
  if (targetEmail === CEO_CONFIG.correo.toLowerCase()) {
    const ceoProfile = await getOrSyncUser(CEO_CONFIG.uid);
    return {
      success: true,
      fused: true,
      uid: CEO_CONFIG.uid,
      usuario: ceoProfile,
      token: `GOOGLE_CEO_SESSION_${Date.now()}`,
      mensaje: '¡Bienvenido de nuevo, Señor CEO Dramax! Sesión corporativa autenticada con Google.'
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
    // Asegurar que auth_google esté marcado en la base de datos
    await fetch(`${FIRESTORE_BASE_URL}/Usuarios/${finalUid}?updateMask.fieldPaths=auth_google`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { auth_google: { booleanValue: true } } })
    });
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
      ? `¡Bienvenido de nuevo, ${userProfile.username}! Tu cuenta de Google fue fusionada automáticamente con tu progreso existente (mismo UID: ${finalUid}) sin perder ningún recurso.`
      : `¡Bienvenido a Max Gold Black, ${userProfile.username}! Tu cuenta de Google ha sido registrada con éxito.`
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

// ----------------- MOTOR DE EXTRACCIÓN OFFLINE VIGILADO POR RENDER -----------------
async function processOfflineExtraction(uid) {
  const userUrl = `${FIRESTORE_BASE_URL}/Usuarios/${uid}`;
  const res = await fetch(userUrl);
  if (!res.ok) return { hay_extraccion: false, error: 'Usuario no encontrado' };

  const doc = await res.json();
  const fields = doc.fields || {};

  // 1. REGLA ESTRICTA: Si el usuario cerró sesión voluntariamente, la extracción offline NO funciona
  const sessionActiva = fields.session_activa ? (fields.session_activa.booleanValue !== false) : true;
  if (!sessionActiva) {
    return {
      hay_extraccion: false,
      motivo: 'SESSION_CERRADA',
      mensaje: 'La sesión se encuentra cerrada voluntariamente. La minería offline está inactiva.'
    };
  }

  // 2. Reloj del Servidor Render (Máxima Autoridad Absoluta, Anti-Hack)
  const serverNow = Date.now();
  const lastHeartbeat = parseMoney(extractVal(fields.ultimo_latido_ms)) || serverNow;
  const elapsedMs = Math.max(0, serverNow - lastHeartbeat);

  const tier = parseInt(extractVal(fields.camioneta_tier) || '1', 10);
  const rule = FLEET_EXPLORATION_RULES[tier] || FLEET_EXPLORATION_RULES[1];
  const nominalMs = rule.frecuencia_nominal_ms || 3200;

  // Si no ha pasado al menos un ciclo completo de escaneo
  if (elapsedMs < nominalMs) {
    return {
      hay_extraccion: false,
      segundos_offline: Math.floor(elapsedMs / 1000),
      mensaje: 'El tiempo transcurrido es menor a un ciclo de exploración.'
    };
  }

  // Máximo 1000 ciclos (~53 minutos por bloque) para optimización masiva de 10,000 usuarios
  const cycles = Math.min(Math.floor(elapsedMs / nominalMs), 1000);

  // 3. Consultar precios y rangos al azar de Gestor
  const gestor = await fetchGestorData();
  const extraccionAzar = gestor.extraccionAzar;

  // 4. Código y segmento de terreno inmutable (2 primeras + 2 del medio + 2 últimas)
  const landCode = extractVal(fields.Tierra_de_extraccion) || generateLandSecurityCode(uid);
  const landSegment = extractLandSegments(landCode);
  const uidPart = uid.substring(0, 8);
  const vehDatePart = '20261101';

  let totalCarbon = 0;
  let totalOro = 0;
  let totalEsmeralda = 0;
  let totalRecolecciones = 0;
  const sampleLots = [];

  let nextRecoleccion = parseMoney(extractVal(fields.numero_de_recoleccion || fields['Numero de recoleccion']));

  for (let i = 0; i < cycles; i++) {
    const r = Math.random();
    let mineral = null;

    if (r < rule.probabilidades_max.EMERALD) {
      mineral = 'EMERALD';
    } else if (r < rule.probabilidades_max.EMERALD + rule.probabilidades_max.GOLD) {
      mineral = 'GOLD';
    } else if (r < rule.probabilidades_max.EMERALD + rule.probabilidades_max.GOLD + rule.probabilidades_max.COAL) {
      mineral = 'COAL';
    }

    if (mineral) {
      const pool = extraccionAzar[mineral] || [1, 2, 3, 4, 5];
      const cantidad = pool[Math.floor(Math.random() * pool.length)] || 1;
      nextRecoleccion++;
      totalRecolecciones++;

      if (mineral === 'COAL') totalCarbon += cantidad;
      else if (mineral === 'GOLD') totalOro += cantidad;
      else if (mineral === 'EMERALD') totalEsmeralda += cantidad;

      if (sampleLots.length < 5) {
        const rawLot = `LOT|${uidPart}|${vehDatePart}|${serverNow}|${nextRecoleccion}|${mineral}|T${tier}|${landSegment}`;
        const hash = crypto.createHmac('sha256', ENCRYPTION_KEY_BUF).update(rawLot).digest('hex').substring(0, 8).toUpperCase();
        sampleLots.push(`MGB-LOT-${mineral}-${landSegment}-N${nextRecoleccion}-${hash}`);
      }
    }
  }

  // 5. Si hubo extracción, aplicar operaciones atómicas inmediatamente a Firestore
  if (totalCarbon > 0 || totalOro > 0 || totalEsmeralda > 0) {
    const fieldTransforms = [
      { fieldPath: 'numero_de_recoleccion', increment: { integerValue: totalRecolecciones } }
    ];
    if (totalCarbon > 0) fieldTransforms.push({ fieldPath: 'Carbon', increment: { integerValue: totalCarbon } });
    if (totalOro > 0) fieldTransforms.push({ fieldPath: 'Oro', increment: { integerValue: totalOro } });
    if (totalEsmeralda > 0) fieldTransforms.push({ fieldPath: 'Esmeralda', increment: { integerValue: totalEsmeralda } });

    const atomicWrites = [
      {
        transform: {
          document: `projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/Usuarios/${uid}`,
          fieldTransforms
        }
      }
    ];

    try {
      await executeFirestoreCommit(atomicWrites);
    } catch (err) {
      console.error('[OFFLINE] Error en commit atómico de extracción offline:', err.message);
    }
  }

  // Actualizar último latido al tiempo actual del servidor
  await fetch(`${userUrl}?updateMask.fieldPaths=ultimo_latido_ms`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { ultimo_latido_ms: { integerValue: serverNow } } })
  });

  // 6. Generar Ticket Criptográfico firmado para Franklin General (Compra Total al precio actual)
  const precioCarbon = gestor.precios.COAL || 30;
  const precioOro = gestor.precios.GOLD || 50;
  const precioEsmeralda = gestor.precios.EMERALD || 100;
  const totalPago = (totalCarbon * precioCarbon) + (totalOro * precioOro) + (totalEsmeralda * precioEsmeralda);

  const payloadFranklinGeneral = {
    tipo: 'TICKET_FRANKLIN_GENERAL',
    tokenId: `FRK_GEN_${serverNow}_${crypto.randomBytes(6).toString('hex')}`,
    uid: uid,
    carbon_qty: totalCarbon,
    oro_qty: totalOro,
    esmeralda_qty: totalEsmeralda,
    precios: { COAL: precioCarbon, GOLD: precioOro, EMERALD: precioEsmeralda },
    total_pago: totalPago,
    timestamp: serverNow,
    exp: serverNow + 600000 // 10 minutos de vigencia
  };

  const ticketFranklinGeneral = signAuthorizationPayload(payloadFranklinGeneral);

  return {
    success: true,
    hay_extraccion: (totalCarbon > 0 || totalOro > 0 || totalEsmeralda > 0),
    segundos_offline: Math.floor(elapsedMs / 1000),
    ciclos_simulados: cycles,
    minerales: {
      carbon: totalCarbon,
      oro: totalOro,
      esmeralda: totalEsmeralda
    },
    precios: gestor.precios,
    total_cotizado: totalPago,
    ticket_franklin_general: ticketFranklinGeneral,
    tierra_segmento: landSegment,
    codigos_lote: sampleLots,
    mensaje: `¡Extracción offline auditada por Render! Flota extrajo ${totalCarbon} Carbón, ${totalOro} Oro, ${totalEsmeralda} Esmeraldas.`
  };
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

      // --- ACCIÓN: CIERRE DE SESIÓN MANUAL (AUTH_LOGOUT) ---
      if (action === 'AUTH_LOGOUT') {
        const logoutUid = requestData.uid || uid;
        if (logoutUid) {
          const userUrl = `${FIRESTORE_BASE_URL}/Usuarios/${logoutUid}`;
          fetch(`${userUrl}?updateMask.fieldPaths=session_activa`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields: { session_activa: { booleanValue: false } } })
          }).catch(e => console.error('[AUTH_LOGOUT] Error actualizando session_activa:', e.message));
        }
        return sendEncryptedResponse(res, 200, {
          success: true,
          mensaje: 'Sesión finalizada. Minería offline deshabilitada hasta el próximo inicio de sesión.'
        });
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
          // Mantener latido de presencia actualizado con hora del servidor
          fetch(`${userUrl}?updateMask.fieldPaths=ultimo_latido_ms`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields: { ultimo_latido_ms: { integerValue: Date.now() } } })
          }).catch(() => {});

          return sendEncryptedResponse(res, 200, {
            valida: true,
            uid: sessionUid,
            server_time: Date.now(),
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
      // ACCIÓN: COMPRAR CAMIONETA EN TALLER CON BILLETES (RENDER CEO BACKEND)
      // =========================================================================
      if (action === 'COMPRAR_CAMIONETA' || action === 'ADQUIRIR_CAMIONETA') {
        const tier = parseInt(requestData.tier || requestData.camioneta_tier || 1, 10);
        if (tier < 1 || tier > 4) {
          return sendEncryptedResponse(res, 400, {
            success: false,
            error: 'Tier de camioneta inválido. Válidos: 1, 2, 3, 4.'
          });
        }

        // 1. Obtener datos y costo oficial desde Firestore Taller
        const tallerData = await fetchTallerData();
        const truckInfo = tallerData[tier];
        if (!truckInfo) {
          return sendEncryptedResponse(res, 404, {
            success: false,
            error: `La camioneta Tier ${tier} no existe en el catálogo de Taller.`
          });
        }

        const costoBilletes = truckInfo.costo;
        const truckTitulo = truckInfo.titulo || `Camioneta Tier ${tier}`;

        // 2. Verificar usuario y saldo actual de Billetes
        await ensureUserCompleteFields(uid);
        const userUrl = `${FIRESTORE_BASE_URL}/Usuarios/${uid}`;
        const uRes = await fetch(userUrl);
        if (!uRes.ok) {
          return sendEncryptedResponse(res, 404, {
            success: false,
            error: 'Usuario no encontrado en la base de datos central.'
          });
        }
        const uDoc = await uRes.json();
        const currentBillete = parseMoney(extractVal(uDoc.fields?.Billete));
        const existingCode = extractVal(uDoc.fields?.[`camion_tier_${tier}_codigo`]);

        if (existingCode && existingCode.trim().length > 0) {
          return sendEncryptedResponse(res, 200, {
            success: true,
            ya_adquirido: true,
            tier: tier,
            titulo: truckTitulo,
            codigo_camion: existingCode,
            mensaje: `El vehículo ${truckTitulo} ya fue adquirido previamente por este usuario.`
          });
        }

        if (currentBillete < costoBilletes) {
          return sendEncryptedResponse(res, 200, {
            success: false,
            error: `Fondos insuficientes: La ${truckTitulo} cuesta ${costoBilletes} billetes y posees ${currentBillete} billetes. Vende minerales para obtener liquidez.`,
            fondos_actuales: currentBillete,
            costo_requerido: costoBilletes
          });
        }

        // 3. Generar código encriptado único para la camioneta con fecha/hora/min de compra
        // Formato: YYYYMMDDHHmm
        const nowObj = new Date();
        const yyyy = nowObj.getFullYear();
        const mm = String(nowObj.getMonth() + 1).padStart(2, '0');
        const dd = String(nowObj.getDate()).padStart(2, '0');
        const hh = String(nowObj.getHours()).padStart(2, '0');
        const min = String(nowObj.getMinutes()).padStart(2, '0');
        const datePrefix = `${yyyy}${mm}${dd}${hh}${min}`;

        const truckSecurityCode = generatePurchasedTruckCode(uid, tier, datePrefix);
        const fechaCompraIso = nowObj.toISOString();

        // 4. Operación Atómica: Descontar Billetes y Guardar campos del camión
        const atomicPurchaseWrites = [
          {
            update: {
              name: `projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/Usuarios/${uid}`,
              fields: {
                [`camion_tier_${tier}_titulo`]: { stringValue: truckTitulo },
                [`camion_tier_${tier}_codigo`]: { stringValue: truckSecurityCode },
                [`camion_tier_${tier}_fecha`]: { stringValue: fechaCompraIso },
                [`camion_tier_${tier}_costo`]: { integerValue: costoBilletes }
              }
            },
            updateMask: {
              fieldPaths: [
                `camion_tier_${tier}_titulo`,
                `camion_tier_${tier}_codigo`,
                `camion_tier_${tier}_fecha`,
                `camion_tier_${tier}_costo`
              ]
            }
          },
          {
            transform: {
              document: `projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/Usuarios/${uid}`,
              fieldTransforms: [
                {
                  fieldPath: 'Billete',
                  increment: { integerValue: -costoBilletes }
                }
              ]
            }
          },
          {
            transform: {
              document: `projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/jugadores/jugador_1`,
              fieldTransforms: [
                {
                  fieldPath: 'cash',
                  increment: { integerValue: -costoBilletes }
                }
              ]
            }
          }
        ];

        try {
          await executeFirestoreCommit(atomicPurchaseWrites);
        } catch (pErr) {
          console.error('[TALLER] Error en commit atómico de compra de camioneta:', pErr);
          return sendEncryptedResponse(res, 500, {
            success: false,
            error: 'Error al procesar la compra en la base de datos central: ' + pErr.message
          });
        }

        const nuevoSaldo = currentBillete - costoBilletes;
        return sendEncryptedResponse(res, 200, {
          success: true,
          aprobado: true,
          tier: tier,
          titulo: truckTitulo,
          codigo_camion: truckSecurityCode,
          fecha_compra: fechaCompraIso,
          costo_pagado: costoBilletes,
          nuevo_saldo_billetes: nuevoSaldo,
          mensaje: `¡Adquisición autorizada por Render! ${truckTitulo} comprada por ${costoBilletes} Billetes. Código encriptado asignado: ${truckSecurityCode}`
        });
      }

      // --- ACCIÓN: RECARGAR BILLETES DESDE LÍNEA DE CRÉDITO / CEO ---
      if (action === 'RECARGAR_BILLETES' || action === 'CANJEAR_RECARGA') {
        const monto = parseInt(requestData.monto || 100, 10);
        if (monto <= 0 || monto > 50000) {
          return sendEncryptedResponse(res, 400, { success: false, error: 'Monto de recarga inválido (1-50000).' });
        }
        await ensureUserCompleteFields(uid);
        const atomicRecarga = [
          {
            transform: {
              document: `projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/Usuarios/${uid}`,
              fieldTransforms: [
                { fieldPath: 'Billete', increment: { integerValue: monto } }
              ]
            }
          },
          {
            transform: {
              document: `projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/jugadores/jugador_1`,
              fieldTransforms: [
                { fieldPath: 'cash', increment: { integerValue: monto } }
              ]
            }
          }
        ];
        await executeFirestoreCommit(atomicRecarga);
        return sendEncryptedResponse(res, 200, {
          success: true,
          monto_recargado: monto,
          mensaje: `¡Recarga de ${monto} Billetes acreditada con éxito!`
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

        // Consultar el perfil de usuario y verificar posesión de camioneta
        const userSync = await ensureUserCompleteFields(uid);
        const userUrl = `${FIRESTORE_BASE_URL}/Usuarios/${uid}`;
        const uDoc = await (await fetch(userUrl)).json();

        const ownedTruckCode = extractVal(uDoc.fields?.[`camion_tier_${tier}_codigo`]);
        let truckCodeToken = `T${tier}`;

        // 1.1 VALIDACIÓN DEL CÓDIGO ENCRIPTADO INDIVIDUAL DEL CAMIÓN
        if (ownedTruckCode && ownedTruckCode.trim().length > 0) {
          if (!verifyTruckSecurityCode(uid, tier, truckSecurityCode, ownedTruckCode)) {
            console.warn(`[SEGURIDAD] Código de camión no coincide con el adquirido: recibido=${truckSecurityCode}, oficial=${ownedTruckCode}`);
          }
          const match = ownedTruckCode.match(/MGB-TRK-(\d{12}-T\d)/i);
          truckCodeToken = match ? match[1] : `T${tier}`;
        } else {
          // Si no tiene código de compra en BD, verificar código determinístico por compatibilidad
          if (!verifyTruckSecurityCode(uid, tier, truckSecurityCode)) {
            console.warn(`[SEGURIDAD] Intento de extracción con código de camión inválido: uid=${uid}, tier=${tier}, code=${truckSecurityCode}`);
            return sendEncryptedResponse(res, 403, {
              validado: false,
              error: 'VIOLACIÓN DE SEGURIDAD: El camión utilizado no posee un código encriptado corporativo autorizado para este usuario.',
              codigo: 'INVALID_TRUCK_ENCRYPTED_CODE'
            });
          }
          truckCodeToken = `T${tier}-STD`;
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

        const currentRecoleccion = parseMoney(extractVal(uDoc.fields?.numero_de_recoleccion || uDoc.fields?.['Numero de recoleccion']));
        const nextRecoleccion = currentRecoleccion + 1;

        // Código de terreno y fragmento de seguridad (2 primeras, 2 del medio, 2 últimas)
        const landCode = extractVal(uDoc.fields?.Tierra_de_extraccion) || userSync.tierra_de_extraccion || generateLandSecurityCode(uid);
        const landSegment = extractLandSegments(landCode);

        // Obtener cantidad aleatoria desde Gestor (extraccion_al_azar)
        const gestor = await fetchGestorData();
        const pool = gestor.extraccionAzar[resourceType] || [1, 2, 3, 4, 5];
        const cantidadExtraida = pool[Math.floor(Math.random() * pool.length)] || 1;

        // CONSTRUCCIÓN DEL CÓDIGO MAESTRO DE VERIFICACIÓN UNIFICADO (Render Gateway)
        // Combina: Terreno (2 prim, 2 med, 2 ult) + Camioneta (fecha/hora compra + tier) + Mineral + Recolección + HMAC
        const rawMasterData = `MASTER_VFY|${uid}|${landSegment}|${truckCodeToken}|${resourceType}|${nextRecoleccion}|${now}`;
        const masterHmac = crypto.createHmac('sha256', ENCRYPTION_KEY_BUF)
          .update(rawMasterData)
          .digest('hex')
          .substring(0, 8)
          .toUpperCase();

        const codigoVerificacionMaestro = `MGB-VFY-TR[${landSegment}]-TK[${truckCodeToken}]-${resourceType}-N${nextRecoleccion}-${masterHmac}`;

        const fieldMap = { COAL: 'Carbon', GOLD: 'Oro', EMERALD: 'Esmeralda' };
        const mineralField = fieldMap[resourceType] || 'Carbon';

        // 1.5 OPERACIÓN ATÓMICA: SUMAR MINERAL, SUMAR CONTADOR (+1), OTORGAR MONEDAS (+5) Y REGISTRAR CÓDIGO MAESTRO
        const atomicMineralWrite = [
          {
            update: {
              name: `projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/Usuarios/${uid}`,
              fields: {
                ultimo_codigo_maestro: { stringValue: codigoVerificacionMaestro }
              }
            },
            updateMask: {
              fieldPaths: ['ultimo_codigo_maestro']
            }
          },
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
                },
                {
                  fieldPath: 'Moneda',
                  increment: { integerValue: 5 }
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
          truck_token: truckCodeToken,
          codigo_lote: codigoVerificacionMaestro,
          codigo_verificacion_maestro: codigoVerificacionMaestro,
          numero_de_recoleccion: nextRecoleccion,
          monedas_bono: 5,
          trazabilidad_confirmada: {
            uid_parte: uidPart,
            veh_fecha: vehDatePart,
            timestamp_exacto: timestampExacto,
            numero_recoleccion: nextRecoleccion,
            tierra_segmento: landSegment,
            truck_token: truckCodeToken,
            cantidad_extraida: cantidadExtraida,
            codigo_maestro: codigoVerificacionMaestro,
            propietario: uid
          },
          mensaje: `¡Extracción validada con Código Maestro Unificado! ${codigoVerificacionMaestro} (+${cantidadExtraida} ${mineralField}, +5 Dragcoins, +1 Recolección).`
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

        let recargaSoberanaAplicada = false;
        let montoInyeccionSoberana = 0;

        if (bovedaLiquidez < montoTotal) {
          console.warn(`[MAX DRAG] Falta de fondos detectada en ${fieldName}: Bóveda=$${bovedaLiquidez}, Requerido=$${montoTotal}. Notificando encriptadamente al CEO Render...`);

          // Max Drag notifica al CEO Render. Render verifica la reserva soberana en 'Recargar' (Valor: "1000000")
          const ceoDocRes = await fetch(`${FIRESTORE_BASE_URL}/Usuarios/${CEO_CONFIG.uid}`);
          const ceoDoc = ceoDocRes.ok ? await ceoDocRes.json() : null;
          const reservaRecargar = extractVal(ceoDoc?.fields?.Recargar) || '1000000';

          if (reservaRecargar && parseMoney(reservaRecargar) > 0) {
            // REGLA FUNDAMENTAL SOLICITADA POR EL USUARIO:
            // Render aprueba y recarga la Bóveda del Gestor SIN DISMINUIR el campo 'Recargar'.
            // Ese monto siempre se mantendrá intacto en 1,000,000 como garantía soberana inagotable.
            montoInyeccionSoberana = Math.max(montoTotal * 5, 50000);
            const inyeccionWrites = [
              {
                transform: {
                  document: `projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/Gestor/boveda_del_Gestor`,
                  fieldTransforms: [
                    {
                      fieldPath: fieldName,
                      increment: { integerValue: montoInyeccionSoberana }
                    }
                  ]
                }
              }
            ];
            await executeFirestoreCommit(inyeccionWrites);
            recargaSoberanaAplicada = true;
            console.log(`[CEO RENDER] Inyección de liquidez soberana aprobada: +$${montoInyeccionSoberana} en ${fieldName} de la Bóveda. Campo 'Recargar' intacto en ${reservaRecargar}.`);
          } else {
            // Cero pérdida de recursos para el usuario si ambas partes no han pactado
            return sendEncryptedResponse(res, 200, {
              success: false,
              aprobado: false,
              actor: 'Max Drag & CEO Render',
              error: `Max Drag: En ${fieldName} Franklin no tiene fondos disponibles ($${bovedaLiquidez}) y no se pudo autorizar la inyección soberana. Tus recursos están 100% seguros y no fueron descontados.`
            });
          }
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
          recarga_soberana_aplicada: recargaSoberanaAplicada,
          monto_inyectado_soberano: montoInyeccionSoberana,
          mensaje: recargaSoberanaAplicada
            ? `¡Transacción Aprobada! Max Drag notificó fondos insuficientes en Franklin; el CEO Render verificó y aprobó inyección soberana de +$${montoInyeccionSoberana} a la Bóveda del Gestor manteniendo intacto el campo 'Recargar' (1,000,000). Has recibido +$${montoTotal} Max COP.`
            : `¡Transacción Atómica Completada! Max Drag aprobó el desembolso. Franklin recibió 1 saco de ${fieldName}. Se debitó 1 de tu inventario y se sumaron +$${montoTotal} Max COP. La Bóveda fue descontada en -$${montoTotal} bajo regla atómica inquebrantable.`
        });
      }

      // =========================================================================
      // ACCIÓN: NOTIFICACIÓN ENCRIPTADA DE MAX DRAG AL CEO RENDER (FALTA DE FONDOS)
      // Max Drag notifica al CEO Render cuando en algún mineral Franklin no tiene fondos.
      // Render verifica la Bóveda y la reserva 'Recargar' (Valor: 1,000,000).
      // Si es válido, Render inyecta la liquidez requerida SIN DISMINUIR 'Recargar'.
      // =========================================================================
      if (action === 'MAX_DRAG_NOTIFICAR_FALTA_FONDOS' || action === 'NOTIFICAR_FALTA_FONDOS_BOVEDA') {
        const rawMineral = (requestData.mineral || requestData.recurso || 'COAL').toUpperCase();
        const fieldMap = { COAL: 'Carbon', GOLD: 'Oro', EMERALD: 'Esmeralda', CARBON: 'Carbon', ORO: 'Oro', ESMERALDA: 'Esmeralda' };
        const mineralField = fieldMap[rawMineral] || 'Carbon';
        const montoRequerido = parseInt(requestData.monto_requerido || 5000, 10);

        // 1. Render verifica el estado actual de la Bóveda del Gestor en Firestore
        const bovedaUrl = `${FIRESTORE_BASE_URL}/Gestor/boveda_del_Gestor`;
        const bovedaRes = await fetch(bovedaUrl);
        if (!bovedaRes.ok) {
          return sendEncryptedResponse(res, 500, {
            success: false,
            error: 'No se pudo consultar la Bóveda del Gestor en Firestore.'
          });
        }
        const bovedaDoc = await bovedaRes.json();
        const saldoBoveda = parseMoney(extractVal(bovedaDoc.fields?.[mineralField]));

        // 2. Render verifica la reserva soberana del CEO en Usuarios/{CEO_CONFIG.uid}
        const ceoUrl = `${FIRESTORE_BASE_URL}/Usuarios/${CEO_CONFIG.uid}`;
        const ceoRes = await fetch(ceoUrl);
        const ceoDoc = ceoRes.ok ? await ceoRes.json() : null;
        const reservaRecargar = extractVal(ceoDoc?.fields?.Recargar) || '1000000';

        // 3. Render verifica y aprueba: inyecta liquidez SIN DISMINUIR el campo 'Recargar'
        const inyeccion = Math.max(montoRequerido * 5, 50000);
        const commitWrites = [
          {
            transform: {
              document: `projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/Gestor/boveda_del_Gestor`,
              fieldTransforms: [
                {
                  fieldPath: mineralField,
                  increment: { integerValue: inyeccion }
                }
              ]
            }
          }
        ];

        await executeFirestoreCommit(commitWrites);
        const nuevoSaldoBoveda = saldoBoveda + inyeccion;

        console.log(`[CEO RENDER] Notificación de Max Drag atendida: Inyectados $${inyeccion} en ${mineralField} de la Bóveda. Campo 'Recargar' permanece intacto en ${reservaRecargar}.`);

        return sendEncryptedResponse(res, 200, {
          success: true,
          aprobado: true,
          actor: 'CEO Render & Max Drag',
          mineral: mineralField,
          saldo_previo: saldoBoveda,
          monto_inyectado: inyeccion,
          nuevo_saldo_boveda: nuevoSaldoBoveda,
          campo_recargar_inmutable: reservaRecargar,
          mensaje: `Notificación de Max Drag atendida: Render verificó y aprobó inyección de $${inyeccion} a la Bóveda del Gestor en ${mineralField}. El campo 'Recargar' permanece intacto en ${reservaRecargar}.`
        });
      }

      // =========================================================================
      // EXTRACCIÓN OFFLINE: SINCRONIZACIÓN Y LIQUIDACIÓN POR FRANKLIN GENERAL
      // =========================================================================
      if (action === 'CALCULAR_EXTRACCION_OFFLINE' || action === 'SINCRONIZAR_OFFLINE') {
        const offlineData = await processOfflineExtraction(uid);
        return sendEncryptedResponse(res, 200, offlineData);
      }

      // VENTA MASIVA DE LOS 3 MINERALES OFFLINE (FRANKLIN GENERAL + MAX DRAG)
      if (action === 'FRANKLIN_VENDER_TODO_OFFLINE') {
        const ticketStr = requestData.ticket || requestData.ticket_franklin_general || '';
        const ticketAuth = verifyAuthorizationToken(ticketStr);

        if (!ticketAuth.valid) {
          return sendEncryptedResponse(res, 403, {
            success: false,
            aprobado: false,
            actor: 'Franklin General',
            error: `Franklin General: Ticket inválido o manipulado (${ticketAuth.error}).`
          });
        }

        const ticket = ticketAuth.payload;
        if (ticket.tipo !== 'TICKET_FRANKLIN_GENERAL' || ticket.uid !== uid) {
          return sendEncryptedResponse(res, 403, {
            success: false,
            aprobado: false,
            actor: 'Franklin General',
            error: 'Franklin General: El ticket presentado no corresponde a este usuario.'
          });
        }

        const ticketId = ticket.tokenId || ticket.ticketId;
        if (tokensLiquidados.has(ticketId)) {
          return sendEncryptedResponse(res, 403, {
            success: false,
            aprobado: false,
            actor: 'Franklin General',
            error: 'Franklin General: Este lote offline ya fue vendido y liquidado previamente.'
          });
        }

        const carbonQty = ticket.carbon_qty || 0;
        const oroQty = ticket.oro_qty || 0;
        const esmeraldaQty = ticket.esmeralda_qty || 0;
        const totalPago = ticket.total_pago || 0;

        if (totalPago <= 0 || (carbonQty === 0 && oroQty === 0 && esmeraldaQty === 0)) {
          return sendEncryptedResponse(res, 400, {
            success: false,
            aprobado: false,
            actor: 'Franklin General',
            error: 'Franklin General: No hay minerales para vender en este lote offline.'
          });
        }

        // Visto bueno simultáneo de Max Drag:
        // 1. Verificar inventario del usuario en Usuarios/{uid}
        await ensureUserCompleteFields(uid);
        const userUrl = `${FIRESTORE_BASE_URL}/Usuarios/${uid}`;
        const userDoc = await (await fetch(userUrl)).json();
        const userCarbon = parseMoney(extractVal(userDoc.fields?.Carbon));
        const userOro = parseMoney(extractVal(userDoc.fields?.Oro));
        const userEsmeralda = parseMoney(extractVal(userDoc.fields?.Esmeralda));

        if (userCarbon < carbonQty || userOro < oroQty || userEsmeralda < esmeraldaQty) {
          return sendEncryptedResponse(res, 400, {
            success: false,
            aprobado: false,
            actor: 'Max Drag',
            error: 'Max Drag: Rechazado. El inventario de minerales en la base de datos es inferior a lo reportado.'
          });
        }

        // 2. Verificar liquidez en la Bóveda del Gestor
        const bovedaUrl = `${FIRESTORE_BASE_URL}/Gestor/boveda_del_Gestor`;
        const bovedaDoc = await (await fetch(bovedaUrl)).json();
        const bovedaCarbonLiquidez = parseMoney(extractVal(bovedaDoc.fields?.Carbon));
        if (bovedaCarbonLiquidez < totalPago) {
          console.warn(`[OFFLINE SALE] Liquidez insuficiente en Bóveda para liquidar todo: $${bovedaCarbonLiquidez} < $${totalPago}. Notificando encriptadamente al CEO Render...`);
          const ceoDocRes = await fetch(`${FIRESTORE_BASE_URL}/Usuarios/${CEO_CONFIG.uid}`);
          const ceoDoc = ceoDocRes.ok ? await ceoDocRes.json() : null;
          const reservaRecargar = extractVal(ceoDoc?.fields?.Recargar) || '1000000';
          if (reservaRecargar && parseMoney(reservaRecargar) > 0) {
            const inyeccionOffline = Math.max(totalPago * 2, 100000);
            await executeFirestoreCommit([
              {
                transform: {
                  document: `projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/Gestor/boveda_del_Gestor`,
                  fieldTransforms: [
                    { fieldPath: 'Carbon', increment: { integerValue: inyeccionOffline } }
                  ]
                }
              }
            ]);
            console.log(`[CEO RENDER] Inyección soberana offline ejecutada: +$${inyeccionOffline} en Bóveda. Campo 'Recargar' intacto en ${reservaRecargar}.`);
          } else {
            return sendEncryptedResponse(res, 200, {
              success: false,
              aprobado: false,
              actor: 'Max Drag & CEO Render',
              error: 'Max Drag: Sin liquidez suficiente en la Bóveda del Gestor para liquidar todo el cargamento. Minerales del usuario preservados intactos.'
            });
          }
        }

        // 3. OPERACIÓN ATÓMICA DEFINITIVA: Descontar los 3 minerales, pagar billetes al usuario y descontar de la Bóveda
        const userTransforms = [
          { fieldPath: 'Billete', increment: { integerValue: totalPago } }
        ];
        if (carbonQty > 0) userTransforms.push({ fieldPath: 'Carbon', increment: { integerValue: -carbonQty } });
        if (oroQty > 0) userTransforms.push({ fieldPath: 'Oro', increment: { integerValue: -oroQty } });
        if (esmeraldaQty > 0) userTransforms.push({ fieldPath: 'Esmeralda', increment: { integerValue: -esmeraldaQty } });

        const atomicCommit = [
          {
            transform: {
              document: `projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/Usuarios/${uid}`,
              fieldTransforms: userTransforms
            }
          },
          {
            transform: {
              document: `projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/Gestor/boveda_del_Gestor`,
              fieldTransforms: [
                { fieldPath: 'Carbon', increment: { integerValue: -totalPago } }
              ]
            }
          },
          {
            transform: {
              document: `projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/jugadores/jugador_1`,
              fieldTransforms: [
                { fieldPath: 'cash', increment: { integerValue: totalPago } }
              ]
            }
          }
        ];

        try {
          await executeFirestoreCommit(atomicCommit);
        } catch (commitErr) {
          console.error('[FRANKLIN GENERAL] Error en commit atómico:', commitErr);
          return sendEncryptedResponse(res, 500, {
            success: false,
            aprobado: false,
            error: 'Error al ejecutar la venta en la base de datos central: ' + commitErr.message
          });
        }

        tokensLiquidados.add(ticketId);

        return sendEncryptedResponse(res, 200, {
          success: true,
          aprobado: true,
          actor: 'Franklin General & Max Drag',
          monto_pagado: totalPago,
          minerales_vendidos: {
            carbon: carbonQty,
            oro: oroQty,
            esmeralda: esmeraldaQty
          },
          mensaje: `¡Liquidación Total Offline Exitosa! Franklin General compró todo el cargamento (${carbonQty} Carbón, ${oroQty} Oro, ${esmeraldaQty} Esmeralda) por $${totalPago} Max COP, certificado y aprobado por Render.`
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
