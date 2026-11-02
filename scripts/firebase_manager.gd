extends Node

## FirebaseManager & Middleware Gateway Seguro (Render)
## 1. Puente de Seguridad Obligatorio: Ninguna petición del juego va directa a Firestore.
## 2. Encriptación Total Militar: Todo viaja encriptado en AES-256-CBC con HMAC-SHA256.
## 3. Validación Anti-Hackers: Valida tiempos y probabilidades físicas de las camionetas.
## 4. Gobernanza Estricta: Franklin Martínez y Max Drag controlan la tesorería.
## 5. Datos de Usuario & Blindaje del CEO: Gestión inmutable de UID, Username, Correo y Fecha de Creación.

signal connection_status_changed(is_online: bool)
signal market_prices_updated(precios: Dictionary, boveda: Dictionary)
signal taller_updated(taller_data: Dictionary)
signal user_profile_updated(user_data: Dictionary)
signal player_data_loaded(data: Dictionary)
signal player_data_saved()
signal session_state_changed(is_logged_in: bool)
signal offline_extraction_available(offline_data: Dictionary)

const GestorJuego = preload("res://scripts/gestor_juego.gd")
const EncriptacionManager = preload("res://scripts/encriptacion_manager.gd")

static var instance: Node = null

const RENDER_GATEWAY_URL: String = "https://max-gold-black-api.onrender.com"
const SAVE_PATH_USER_ID: String = "user://firebase_user_id.dat"
const SAVE_PATH_SESSION: String = "user://session_auth.json"

var has_session: bool = false
var truck_security_codes: Dictionary = {}

# Identidad Oficial del CEO Fundador (Colección 'Usuarios' en Firestore)
var current_user_uid: String = "QEMLQtpeFYgfXmZL8eXQSzlMypg2"
var current_username: String = "Dramax"
var current_email: String = "maxdigitalnewnmd@gmail.com"
var current_role: String = "CEO"

var user_profile: Dictionary = {
	"uid": "QEMLQtpeFYgfXmZL8eXQSzlMypg2",
	"username": "Dramax",
	"correo": "maxdigitalnewnmd@gmail.com",
	"tipo": "CEO",
	"fecha_creacion": "2026-11-01 15:37:24 (Cuenta Fundacional CEO)",
	"moneda": 0,
	"billete": 0,
	"carbon": 0,
	"oro": 0,
	"esmeralda": 0,
	"es_ceo": true
}

# Precios oficiales sincronizados desde Render API Gateway
var precios_mercado: Dictionary = {
	"COAL": 30,
	"GOLD": 50,
	"EMERALD": 100
}

# Bóveda corporativa leída desde Render
var boveda_liquidez: Dictionary = {
	"COAL": 1000000,
	"GOLD": 1000000,
	"EMERALD": 1000000
}

# Camionetas sincronizadas desde el Taller
var taller_data: Dictionary = {
	1: { "doc_id": "Camioneta Basica", "titulo": "Camioneta Basica", "costo": 0, "combustible": 15, "reparacion": 10, "descripcion": "" },
	2: { "doc_id": "Camioneta normal", "titulo": "Camioneta normal", "costo": 50, "combustible": 20, "reparacion": 15, "descripcion": "" },
	3: { "doc_id": "Camioneta Media", "titulo": "Camioneta Media", "costo": 120, "combustible": 28, "reparacion": 25, "descripcion": "" },
	4: { "doc_id": "Camioneta Alta", "titulo": "Camioneta Alta", "costo": 300, "combustible": 40, "reparacion": 45, "descripcion": "" }
}

var market_poll_timer: Timer
var session_heartbeat_timer: Timer
var is_online: bool = false
var is_polling: bool = false

func _enter_tree() -> void:
	instance = self

func _ready() -> void:
	instance = self
	_init_player_id()
	
	market_poll_timer = Timer.new()
	market_poll_timer.wait_time = 3.5
	market_poll_timer.autostart = true
	add_child(market_poll_timer)
	market_poll_timer.timeout.connect(consultar_todo_en_vivo)

	# Validador de sesión obligatoria cada 12 segundos
	session_heartbeat_timer = Timer.new()
	session_heartbeat_timer.wait_time = 12.0
	session_heartbeat_timer.autostart = true
	add_child(session_heartbeat_timer)
	session_heartbeat_timer.timeout.connect(_check_session_heartbeat)

	# Consulta inicial encriptada inmediata
	consultar_todo_en_vivo()
	_check_session_heartbeat()

func _init_player_id() -> void:
	# Cargar sesión persistente si existe
	if FileAccess.file_exists(SAVE_PATH_SESSION):
		var s_file = FileAccess.open(SAVE_PATH_SESSION, FileAccess.READ)
		if s_file:
			var txt = s_file.get_as_text().strip_edges()
			s_file.close()
			var json = JSON.new()
			if json.parse(txt) == OK and json.data is Dictionary:
				var s_data: Dictionary = json.data
				current_user_uid = s_data.get("uid", current_user_uid)
				current_username = s_data.get("username", current_username)
				current_email = s_data.get("correo", current_email)
				current_role = s_data.get("tipo", current_role)
				has_session = true
				return

	has_session = false

func has_active_session() -> bool:
	return has_session

func save_session(user_dict: Dictionary) -> void:
	has_session = true
	var file = FileAccess.open(SAVE_PATH_SESSION, FileAccess.WRITE)
	if file:
		file.store_string(JSON.stringify(user_dict))
		file.close()
	session_state_changed.emit(true)

func clear_session() -> void:
	has_session = false
	if FileAccess.file_exists(SAVE_PATH_SESSION):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(SAVE_PATH_SESSION))
	session_state_changed.emit(false)

func _check_session_heartbeat() -> void:
	if not has_session:
		session_state_changed.emit(false)
		return
	
	post_encrypted_gateway({
		"action": "CHECK_SESSION",
		"uid": current_user_uid
	}, func(res: Dictionary):
		if res.get("valida", false):
			if not has_session:
				has_session = true
				session_state_changed.emit(true)
		elif res.has("valida") and res["valida"] == false:
			print("[FirebaseManager] Sesión explícitamente rechazada por Render Gateway.")
			clear_session()
	)

func iniciar_sesion_render(email: String, password_input: String, callback: Callable) -> void:
	var payload = {
		"action": "AUTH_LOGIN",
		"email": email,
		"password": password_input
	}
	post_encrypted_gateway(payload, func(res: Dictionary):
		if res.get("success", false) and res.has("usuario"):
			var u: Dictionary = res["usuario"]
			current_user_uid = u.get("uid", current_user_uid)
			current_username = u.get("username", current_username)
			current_email = u.get("correo", current_email)
			current_role = u.get("tipo", current_role)
			user_profile = u
			save_session({
				"uid": current_user_uid,
				"username": current_username,
				"correo": current_email,
				"tipo": current_role,
				"token": res.get("token", "")
			})
			user_profile_updated.emit(user_profile)
		callback.call(res)
	)

func registrarse_render(email: String, password_input: String, confirm_pass: String, username: String, callback: Callable) -> void:
	var payload = {
		"action": "AUTH_REGISTER",
		"email": email,
		"password": password_input,
		"confirm_password": confirm_pass,
		"username": username
	}
	post_encrypted_gateway(payload, func(res: Dictionary):
		if res.get("success", false) and res.has("usuario"):
			var u: Dictionary = res["usuario"]
			current_user_uid = u.get("uid", current_user_uid)
			current_username = u.get("username", current_username)
			current_email = u.get("correo", current_email)
			current_role = u.get("tipo", current_role)
			user_profile = u
			save_session({
				"uid": current_user_uid,
				"username": current_username,
				"correo": current_email,
				"tipo": current_role,
				"token": res.get("token", "")
			})
			user_profile_updated.emit(user_profile)
		callback.call(res)
	)

func iniciar_sesion_google(email: String, id_token: String, display_name: String, callback: Callable) -> void:
	var payload = {
		"action": "AUTH_GOOGLE",
		"email": email,
		"id_token": id_token,
		"display_name": display_name
	}
	post_encrypted_gateway(payload, func(res: Dictionary):
		if res.get("success", false) and res.has("usuario"):
			var u: Dictionary = res["usuario"]
			current_user_uid = u.get("uid", current_user_uid)
			current_username = u.get("username", current_username)
			current_email = u.get("correo", current_email)
			current_role = u.get("tipo", current_role)
			user_profile = u
			save_session({
				"uid": current_user_uid,
				"username": current_username,
				"correo": current_email,
				"tipo": current_role,
				"token": res.get("token", "")
			})
			user_profile_updated.emit(user_profile)
		callback.call(res)
	)

# ----------------- PUENTE DE SEGURIDAD ENCRIPTADO (RENDER GATEWAY) -----------------
func post_encrypted_gateway(action_payload: Dictionary, callback: Callable) -> void:
	var envelope = EncriptacionManager.encrypt_payload(action_payload)
	var http = HTTPRequest.new()
	http.timeout = 7.0
	add_child(http)

	http.request_completed.connect(func(res: int, code: int, _h: PackedStringArray, body: PackedByteArray):
		var decrypted_response: Dictionary = {}
		if res == HTTPRequest.RESULT_SUCCESS:
			var json = JSON.new()
			if json.parse(body.get_string_from_utf8()) == OK and json.data is Dictionary:
				var res_dict = json.data
				if res_dict.has("payload") and res_dict.has("iv") and res_dict.has("hmac"):
					decrypted_response = EncriptacionManager.decrypt_payload(res_dict)
				else:
					decrypted_response = res_dict
		if not is_online and not decrypted_response.is_empty():
			is_online = true
			connection_status_changed.emit(true)
		callback.call(decrypted_response)
		http.queue_free()
	)

	var url = RENDER_GATEWAY_URL + "/api/gateway/secure"
	var headers = ["Content-Type: application/json", "X-Encrypted: true"]
	http.request(url, headers, HTTPClient.METHOD_POST, JSON.stringify(envelope))

# ----------------- CONSULTAS ENCRIPTADAS PERIÓDICAS -----------------
func consultar_todo_en_vivo() -> void:
	if is_polling:
		return
	is_polling = true

	# 1. Consultar Perfil de Usuario auditado (Usuarios)
	consultar_usuario_en_vivo()

	# 2. Consultar Mercado encriptado (Gestor)
	post_encrypted_gateway({ "action": "GET_MERCADO", "uid": current_user_uid }, func(res: Dictionary):
		if res.get("success", false) and res.has("precios") and res.has("boveda"):
			var p_in = res["precios"]
			var b_in = res["boveda"]
			for k in ["COAL", "GOLD", "EMERALD"]:
				if p_in.has(k): precios_mercado[k] = int(p_in[k])
				if b_in.has(k): boveda_liquidez[k] = int(b_in[k])
			market_prices_updated.emit(precios_mercado, boveda_liquidez)
	)

	# 3. Consultar Taller encriptado (Taller)
	post_encrypted_gateway({ "action": "GET_TALLER", "uid": current_user_uid }, func(res: Dictionary):
		is_polling = false
		if res.get("success", false) and res.has("taller"):
			var t_in = res["taller"]
			for str_tier in t_in.keys():
				var tier_num = int(str_tier)
				var item = t_in[str_tier]
				taller_data[tier_num] = {
					"doc_id": item.get("doc_id", "Camioneta"),
					"titulo": item.get("titulo", ""),
					"costo": int(item.get("costo", 0)),
					"combustible": int(item.get("combustible", 15)),
					"reparacion": int(item.get("reparacion", 10)),
					"descripcion": item.get("descripcion", "")
				}
			taller_updated.emit(taller_data)
	)

func consultar_usuario_en_vivo() -> void:
	post_encrypted_gateway({
		"action": "GET_USUARIO",
		"uid": current_user_uid,
		"username": current_username,
		"correo": current_email
	}, func(res: Dictionary):
		if res.get("success", false) and res.has("usuario"):
			user_profile = res["usuario"]
			current_username = user_profile.get("username", current_username)
			current_email = user_profile.get("correo", current_email)
			current_role = user_profile.get("tipo", current_role)
			
			if user_profile.has("truck_security_codes"):
				var tc = user_profile["truck_security_codes"]
				if tc is Dictionary:
					truck_security_codes = tc

			var coins_val = int(user_profile.get("moneda", 0))
			var cash_val = int(user_profile.get("billete", 0))
			GestorJuego.coins = coins_val
			GestorJuego.cash = cash_val
			
			user_profile_updated.emit(user_profile)
	)

## Verifica si el usuario ha adquirido una camioneta específica en el Taller
func is_truck_acquired(tier: int) -> bool:
	var field_code = str(user_profile.get("camion_tier_" + str(tier) + "_codigo", ""))
	if not field_code.is_empty():
		return true
	if user_profile.has("camiones_adquiridos"):
		var ca = user_profile["camiones_adquiridos"]
		if ca is Dictionary and (ca.has(tier) or ca.has(str(tier))):
			return true
	return false

## Obtiene el código encriptado individual de seguridad del camión según su Tier
func get_truck_security_code(tier: int) -> String:
	# 1. Si el usuario ya adquirió la camioneta en Firestore, usar su código oficial con fecha de compra
	var field_code = str(user_profile.get("camion_tier_" + str(tier) + "_codigo", ""))
	if not field_code.is_empty():
		return field_code
	if user_profile.has("camiones_adquiridos"):
		var ca = user_profile["camiones_adquiridos"]
		if ca is Dictionary:
			var t_obj = ca.get(tier, ca.get(str(tier), {}))
			if t_obj is Dictionary and t_obj.has("codigo") and not str(t_obj["codigo"]).is_empty():
				return str(t_obj["codigo"])

	if truck_security_codes.has(tier) and not str(truck_security_codes[tier]).is_empty():
		return str(truck_security_codes[tier])
	if truck_security_codes.has(str(tier)) and not str(truck_security_codes[str(tier)]).is_empty():
		return str(truck_security_codes[str(tier)])
	
	# Cálculo local HMAC-SHA256 idéntico al del Gateway de Render
	var key_bytes = EncriptacionManager.get_key_bytes()
	var raw_msg = "TRUCK_SECURITY_AUTH:" + current_user_uid + ":TIER_" + str(tier) + ":MAX_GOLD_BLACK_2026"
	var hmac_bytes = EncriptacionManager.compute_hmac_sha256(key_bytes, raw_msg.to_utf8_buffer())
	var full_hex = hmac_bytes.hex_encode().to_upper()
	var code = "MGB-TRK-T" + str(tier) + "-" + full_hex.substr(0, 16)
	truck_security_codes[tier] = code
	return code

## Compra una camioneta en el Taller mediante transacción atómica encriptada con Render
func comprar_camioneta(tier: int, callback: Callable) -> void:
	var payload = {
		"action": "COMPRAR_CAMIONETA",
		"uid": current_user_uid,
		"tier": tier
	}
	print("[FirebaseManager] Solicitando compra encriptada de Camioneta T%d a Render..." % tier)
	post_encrypted_gateway(payload, func(res: Dictionary):
		if res.get("success", false) and res.get("aprobado", false):
			var code = res.get("codigo_camion", "")
			var titulo = res.get("titulo", "")
			user_profile["camion_tier_" + str(tier) + "_codigo"] = code
			user_profile["camion_tier_" + str(tier) + "_titulo"] = titulo
			if res.has("nuevo_saldo_billetes"):
				user_profile["billete"] = res["nuevo_saldo_billetes"]
				GestorJuego.cash = int(res["nuevo_saldo_billetes"])
			truck_security_codes[tier] = code
			if not user_profile.has("camiones_adquiridos"):
				user_profile["camiones_adquiridos"] = {}
			user_profile["camiones_adquiridos"][tier] = {
				"tier": tier,
				"titulo": titulo,
				"codigo": code,
				"fecha": res.get("fecha_compra", "")
			}
			user_profile_updated.emit(user_profile)
			taller_updated.emit(taller_data)
		callback.call(res)
	)

## Obtiene el código encriptado individual de seguridad del terreno del usuario
func get_land_security_code() -> String:
	var code = str(user_profile.get("tierra_de_extraccion", user_profile.get("Tierra_de_extraccion", "")))
	if not code.is_empty():
		return code
	var key_bytes = EncriptacionManager.get_key_bytes()
	var raw_msg = "TERRENO_EXTRACCION_V1:" + current_user_uid + ":M4xG0ldBl4ckTatacoaDesert2026Key"
	var hmac_bytes = EncriptacionManager.compute_hmac_sha256(key_bytes, raw_msg.to_utf8_buffer())
	var full_hex = hmac_bytes.hex_encode().to_upper()
	return "MGB-TR-" + full_hex.substr(0, 16)

## Extrae las 2 primeras, 2 del medio y 2 últimas cifras del código de terreno
func extract_land_segment(land_code: String) -> String:
	if land_code.length() < 6:
		return "TR0000"
	var first2 = land_code.substr(0, 2)
	var mid_idx = int((land_code.length() - 2) / 2)
	var mid2 = land_code.substr(mid_idx, 2)
	var last2 = land_code.substr(land_code.length() - 2, 2)
	return first2 + mid2 + last2

# ----------------- PASO 1: EXTRACCIÓN Y TRAZABILIDAD CRIPTOGRÁFICA (CAMIONES ➔ RENDER) -----------------
## Genera firma única de lote con UID, fecha del vehículo, timestamp exacto, contador y token de terreno (2 primeras, 2 medio, 2 últimas).
## Render verifica los datos y ejecuta el incremento atómico del mineral (según extraccion_al_azar de Gestor) y del contador de recolección en Firestore.
func reportar_hallazgo_seguro(camioneta_tier: int, tipo_hallazgo: String, callback: Callable) -> void:
	var truck_code = get_truck_security_code(camioneta_tier)
	var land_code = get_land_security_code()
	var land_segment = extract_land_segment(land_code)
	var uid_part = current_user_uid.substr(0, 8)
	var raw_date = str(user_profile.get("fecha_creacion", "20261101")).replace("-", "").replace(":", "").replace(" ", "")
	var veh_date_part = raw_date.substr(0, 8)
	var timestamp_exacto = Time.get_datetime_string_from_system(false, false)
	var recoleccion_num = int(user_profile.get("numero_de_recoleccion", 0)) + 1

	var raw_lot = "LOT|" + uid_part + "|" + veh_date_part + "|" + timestamp_exacto + "|" + str(recoleccion_num) + "|" + tipo_hallazgo + "|T" + str(camioneta_tier) + "|" + land_segment
	var key_bytes = EncriptacionManager.get_key_bytes()
	var lot_hash = EncriptacionManager.compute_hmac_sha256(key_bytes, raw_lot.to_utf8_buffer()).hex_encode().substr(0, 16).to_upper()
	var codigo_lote = "MGB-LOT-" + tipo_hallazgo + "-" + land_segment + "-N" + str(recoleccion_num) + "-" + lot_hash.substr(0, 8)

	var payload = {
		"action": "REPORTAR_HALLAZGO",
		"uid": current_user_uid,
		"camioneta_tier": camioneta_tier,
		"tipo_hallazgo": tipo_hallazgo,
		"truck_security_code": truck_code,
		"codigo_lote": codigo_lote,
		"trazabilidad": {
			"uid_part": uid_part,
			"veh_date_part": veh_date_part,
			"timestamp_exacto": timestamp_exacto,
			"numero_recoleccion": recoleccion_num,
			"tierra_codigo": land_code,
			"tierra_segmento": land_segment,
			"firma_lote": lot_hash
		},
		"timestamp_muestra": int(Time.get_unix_time_from_system() * 1000)
	}
	post_encrypted_gateway(payload, func(res: Dictionary):
		if res.get("validado", false):
			consultar_usuario_en_vivo()
		callback.call(res)
	)

# ----------------- PASO 2: DOBLE VERIFICACIÓN DE FRANKLIN (RENDER ➔ CLIENTE) -----------------
## Franklin pregunta a Render: '¿Es cierto que este usuario tiene este mineral en su inventario?'.
## Si Render confirma, Franklin ofrece la compra con el precio oficial y ticket firmado.
func franklin_verificar_mineral(mineral_key: String, callback: Callable) -> void:
	var payload = {
		"action": "FRANKLIN_VERIFICAR_MINERAL",
		"uid": current_user_uid,
		"mineral": mineral_key
	}
	post_encrypted_gateway(payload, callback)

# ----------------- PASOS 3 Y 4: VISTO BUENO MAX DRAG Y REGLA ATÓMICA DE BD -----------------
## Max Drag comprueba simultáneamente que el usuario tenga el mineral y que la Bóveda tenga liquidez.
## Render ejecuta la transacción bajo la REGLA ATÓMICA (increment/decrement sin sobrescribir montos fijos).
func max_drag_cerrar_venta(mineral_key: String, ticket_franklin: String, callback: Callable) -> void:
	var payload = {
		"action": "MAX_DRAG_CIERRE_VENTA",
		"uid": current_user_uid,
		"mineral": mineral_key,
		"ticket_franklin": ticket_franklin
	}
	post_encrypted_gateway(payload, func(res: Dictionary):
		if res.get("success", false):
			consultar_usuario_en_vivo()
		callback.call(res)
	)

## Max Drag notifica encriptadamente al CEO Render la falta de liquidez en un mineral.
## Render verifica y aprueba la inyección a la Bóveda del Gestor SIN disminuir el campo 'Recargar'.
func max_drag_notificar_falta_fondos(mineral_key: String, monto_requerido: int, callback: Callable) -> void:
	var payload = {
		"action": "MAX_DRAG_NOTIFICAR_FALTA_FONDOS",
		"uid": current_user_uid,
		"mineral": mineral_key,
		"monto_requerido": monto_requerido
	}
	print("[MaxDrag] Notificando encriptadamente al CEO Render falta de liquidez en %s ($%d)..." % [mineral_key, monto_requerido])
	post_encrypted_gateway(payload, callback)

# ----------------- MINERÍA OFFLINE Y FRANKLIN GENERAL (VENTA MASIVA) -----------------
## Consulta a Render el cálculo de minerales extraídos mientras el jugador estuvo ausente
## Utiliza el reloj oficial del servidor Render (independiente de la hora del cliente)
func sincronizar_extraccion_offline(callback: Callable = Callable()) -> void:
	if not has_session:
		return
	post_encrypted_gateway({
		"action": "CALCULAR_EXTRACCION_OFFLINE",
		"uid": current_user_uid
	}, func(res: Dictionary):
		if res.get("hay_extraccion", false):
			consultar_usuario_en_vivo()
			offline_extraction_available.emit(res)
		if callback.is_valid():
			callback.call(res)
	)

## Vende masivamente todos los minerales acumulados en offline a través de Franklin General
func franklin_vender_todo_offline(ticket_franklin_general: String, callback: Callable) -> void:
	post_encrypted_gateway({
		"action": "FRANKLIN_VENDER_TODO_OFFLINE",
		"uid": current_user_uid,
		"ticket_franklin_general": ticket_franklin_general
	}, func(res: Dictionary):
		if res.get("success", false) and res.get("aprobado", false):
			consultar_usuario_en_vivo()
		callback.call(res)
	)

## Cierre de sesión voluntario (desactiva la minería offline en Render)
func cerrar_sesion_render(callback: Callable = Callable()) -> void:
	post_encrypted_gateway({
		"action": "AUTH_LOGOUT",
		"uid": current_user_uid
	}, func(res: Dictionary):
		clear_session()
		if callback.is_valid():
			callback.call(res)
	)

# Métodos legacy para retrocompatibilidad
func solicitar_visto_bueno_render(mineral_key: String, _cantidad: int, callback: Callable) -> void:
	franklin_verificar_mineral(mineral_key, callback)

func liquidar_transaccion_render(token: String, callback: Callable) -> void:
	max_drag_cerrar_venta("COAL", token, callback)

func tiene_liquidez(res_key: String, monto: int) -> bool:
	var key = res_key.to_upper()
	if not boveda_liquidez.has(key):
		return true
	return boveda_liquidez[key] >= monto

func get_liquidez(res_key: String) -> int:
	return boveda_liquidez.get(res_key.to_upper(), 0)

func get_precio_actual(res_key: String) -> int:
	return precios_mercado.get(res_key.to_upper(), 25)

func get_taller_info(tier: int) -> Dictionary:
	return taller_data.get(tier, {})

func descontar_de_boveda(res_key: String, monto: int) -> bool:
	var key = res_key.to_upper()
	if not tiene_liquidez(key, monto):
		return false
	boveda_liquidez[key] = maxi(0, boveda_liquidez[key] - monto)
	return true
