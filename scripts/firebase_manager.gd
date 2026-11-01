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

const GestorJuego = preload("res://scripts/gestor_juego.gd")
const EncriptacionManager = preload("res://scripts/encriptacion_manager.gd")

static var instance: Node = null

const RENDER_GATEWAY_URL: String = "https://max-gold-black-api.onrender.com"
const SAVE_PATH_USER_ID: String = "user://firebase_user_id.dat"
const SAVE_PATH_SESSION: String = "user://session_auth.json"

var has_session: bool = false

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

	# Consulta inicial encriptada inmediata
	consultar_todo_en_vivo()

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

func clear_session() -> void:
	has_session = false
	if FileAccess.file_exists(SAVE_PATH_SESSION):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(SAVE_PATH_SESSION))

func iniciar_sesion_render(email: String, pass: String, callback: Callable) -> void:
	var payload = {
		"action": "AUTH_LOGIN",
		"email": email,
		"password": pass
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

func registrarse_render(email: String, pass: String, confirm_pass: String, username: String, callback: Callable) -> void:
	var payload = {
		"action": "AUTH_REGISTER",
		"email": email,
		"password": pass,
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
			
			var coins_val = int(user_profile.get("moneda", 0))
			var cash_val = int(user_profile.get("billete", 0))
			GestorJuego.coins = coins_val
			GestorJuego.cash = cash_val
			
			user_profile_updated.emit(user_profile)
	)

# ----------------- VALIDACIÓN ANTI-HACKERS DE HALLAZGOS -----------------
func reportar_hallazgo_seguro(camioneta_tier: int, tipo_hallazgo: String, callback: Callable) -> void:
	var payload = {
		"action": "REPORTAR_HALLAZGO",
		"uid": current_user_uid,
		"camioneta_tier": camioneta_tier,
		"tipo_hallazgo": tipo_hallazgo,
		"timestamp_muestra": int(Time.get_unix_time_from_system() * 1000)
	}
	post_encrypted_gateway(payload, callback)

# ----------------- GOBERNANZA FRANKLIN Y MAX DRAG ENCRIPTADA -----------------
func solicitar_visto_bueno_render(mineral_key: String, cantidad: int, callback: Callable) -> void:
	var payload = {
		"action": "SOLICITAR_TRANSACCION",
		"mineral": mineral_key,
		"cantidad": cantidad,
		"uid": current_user_uid,
		"username": current_username,
		"correo": current_email,
		"tipo": current_role
	}
	post_encrypted_gateway(payload, callback)

func liquidar_transaccion_render(token: String, callback: Callable) -> void:
	var payload = {
		"action": "LIQUIDAR_TRANSACCION",
		"token": token,
		"uid": current_user_uid
	}
	post_encrypted_gateway(payload, func(res: Dictionary):
		if res.get("success", false):
			consultar_usuario_en_vivo()
		callback.call(res)
	)

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
