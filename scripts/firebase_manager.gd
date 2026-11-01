extends Node

## FirebaseManager & Middleware Gateway Seguro (Render)
## 1. Puente de Seguridad Obligatorio: Ninguna petición del juego va directa a Firestore.
## 2. Encriptación Total Militar: Todo viaja encriptado en AES-256-CBC con HMAC-SHA256.
## 3. Validación Anti-Hackers: Valida tiempos y probabilidades físicas de las camionetas.
## 4. Gobernanza Estricta: Franklin Martínez y Max Drag controlan la tesorería.

signal connection_status_changed(is_online: bool)
signal market_prices_updated(precios: Dictionary, boveda: Dictionary)
signal taller_updated(taller_data: Dictionary)
signal player_data_loaded(data: Dictionary)
signal player_data_saved()

const GestorJuego = preload("res://scripts/gestor_juego.gd")
const EncriptacionManager = preload("res://scripts/encriptacion_manager.gd")

static var instance: Node = null

const RENDER_GATEWAY_URL: String = "https://max-gold-black-api.onrender.com"
const SAVE_PATH_USER_ID: String = "user://firebase_user_id.dat"
var player_id: String = "jugador_1"

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
	if FileAccess.file_exists(SAVE_PATH_USER_ID):
		var file = FileAccess.open(SAVE_PATH_USER_ID, FileAccess.READ)
		if file:
			var saved_id = file.get_as_text().strip_edges()
			if saved_id.length() > 0:
				player_id = saved_id
				return
	var uname = get_user_display_name().to_lower().replace(" ", "_")
	var rng = RandomNumberGenerator.new()
	rng.randomize()
	player_id = "%s_%d" % [uname, rng.randi_range(1000, 9999)]
	var file_write = FileAccess.open(SAVE_PATH_USER_ID, FileAccess.WRITE)
	if file_write:
		file_write.store_string(player_id)
		file_write.close()

static func get_user_display_name() -> String:
	var name: String = OS.get_environment("USERNAME")
	if name.is_empty():
		name = OS.get_environment("USER")
	if name.is_empty():
		name = "Minero"
	return name.capitalize()

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

	# 1. Consultar Mercado encriptado
	post_encrypted_gateway({ "action": "GET_MERCADO", "player_id": player_id }, func(res: Dictionary):
		if res.get("success", false) and res.has("precios") and res.has("boveda"):
			var p_in = res["precios"]
			var b_in = res["boveda"]
			for k in ["COAL", "GOLD", "EMERALD"]:
				if p_in.has(k): precios_mercado[k] = int(p_in[k])
				if b_in.has(k): boveda_liquidez[k] = int(b_in[k])
			market_prices_updated.emit(precios_mercado, boveda_liquidez)
	)

	# 2. Consultar Taller encriptado
	post_encrypted_gateway({ "action": "GET_TALLER", "player_id": player_id }, func(res: Dictionary):
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

# ----------------- VALIDACIÓN ANTI-HACKERS DE HALLAZGOS -----------------
func reportar_hallazgo_seguro(camioneta_tier: int, tipo_hallazgo: String, callback: Callable) -> void:
	var payload = {
		"action": "REPORTAR_HALLAZGO",
		"player_id": player_id,
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
		"player_id": player_id,
		"username": get_user_display_name()
	}
	post_encrypted_gateway(payload, callback)

func liquidar_transaccion_render(token: String, callback: Callable) -> void:
	var payload = {
		"action": "LIQUIDAR_TRANSACCION",
		"token": token,
		"player_id": player_id
	}
	post_encrypted_gateway(payload, callback)

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
