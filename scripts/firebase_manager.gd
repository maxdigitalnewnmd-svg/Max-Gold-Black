extends Node

## FirebaseManager: Sincronización en vivo con Firestore y Web SDK
## Administra en tiempo real:
## 1. Precios dinámicos de minerales desde la colección 'Gestor'
## 2. Bóveda de liquidez de Franklin Martínez ('boveda_del_Gestor')
## 3. Flota de Camionetas desde la colección 'Taller'
## 4. Progreso económico del jugador ('jugadores')

signal connection_status_changed(is_online: bool)
signal market_prices_updated(precios: Dictionary, boveda: Dictionary)
signal taller_updated(taller_data: Dictionary)
signal player_data_loaded(data: Dictionary)
signal player_data_saved()

const GestorJuego = preload("res://scripts/gestor_juego.gd")

static var instance: Node = null

# Configuración del proyecto Firebase
const FIREBASE_CONFIG = {
	"apiKey": "AIzaSyBUzF2MSfzmBPxPC2ILBlXhuT4k-4rmh9A",
	"authDomain": "maxcoldblack.firebaseapp.com",
	"projectId": "maxcoldblack",
	"storageBucket": "maxcoldblack.firebasestorage.app",
	"messagingSenderId": "755049366986",
	"appId": "1:755049366986:web:9d28edae0707fa6423bb33",
	"measurementId": "G-H8LS6D0P3K"
}

const SAVE_PATH_USER_ID = "user://firebase_user_id.dat"
var player_id: String = "jugador_1"
var firestore_base_url: String = ""

# Precios leídos en vivo desde Firestore (Gestor)
var precios_mercado: Dictionary = {
	"COAL": 30,
	"GOLD": 50,
	"EMERALD": 100
}

# Bóveda del Gestor leída en vivo desde Firestore
var boveda_liquidez: Dictionary = {
	"COAL": 1000000,
	"GOLD": 1000000,
	"EMERALD": 1000000
}

# Camionetas del Taller leídas en vivo desde Firestore
var taller_data: Dictionary = {
	1: { "doc_id": "Camioneta Basica", "titulo": "Camioneta Basica", "costo": 0, "combustible": 15, "reparacion": 10, "descripcion": "" },
	2: { "doc_id": "Camioneta normal", "titulo": "Camioneta normal", "costo": 50, "combustible": 20, "reparacion": 15, "descripcion": "" },
	3: { "doc_id": "Camioneta Media", "titulo": "Camioneta Media", "costo": 120, "combustible": 28, "reparacion": 25, "descripcion": "" },
	4: { "doc_id": "Camioneta Alta", "titulo": "Camioneta Alta", "costo": 300, "combustible": 40, "reparacion": 45, "descripcion": "" }
}

# Mapeo de documentos de Firestore
var doc_ids: Dictionary = {
	"boveda": "boveda_del_Gestor"
}

# Nodos de red
var http_market: HTTPRequest
var http_taller: HTTPRequest
var http_boveda_update: HTTPRequest
var http_player_load: HTTPRequest
var http_player_save: HTTPRequest

var market_poll_timer: Timer
var auto_sync_timer: Timer
var pending_save: bool = false
var is_online: bool = false

func _enter_tree() -> void:
	instance = self

func _ready() -> void:
	instance = self
	firestore_base_url = "https://firestore.googleapis.com/v1/projects/%s/databases/(default)/documents" % FIREBASE_CONFIG["projectId"]
	_init_player_id()
	_setup_network_nodes()
	
	if GestorJuego.instance != null:
		GestorJuego.instance.economy_changed.connect(_on_economy_changed)
	
	# Consultar inmediatamente Firestore (Gestor y Taller)
	consultar_todo_en_vivo()
	
	# Cargar datos del jugador
	load_player_data()

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

func _setup_network_nodes() -> void:
	http_market = HTTPRequest.new()
	http_market.timeout = 5.0
	add_child(http_market)
	http_market.request_completed.connect(_on_market_request_completed)

	http_taller = HTTPRequest.new()
	http_taller.timeout = 5.0
	add_child(http_taller)
	http_taller.request_completed.connect(_on_taller_request_completed)

	http_boveda_update = HTTPRequest.new()
	http_boveda_update.timeout = 5.0
	add_child(http_boveda_update)
	http_boveda_update.request_completed.connect(_on_boveda_update_completed)

	http_player_load = HTTPRequest.new()
	http_player_load.timeout = 6.0
	add_child(http_player_load)
	http_player_load.request_completed.connect(_on_player_load_completed)

	http_player_save = HTTPRequest.new()
	http_player_save.timeout = 6.0
	add_child(http_player_save)
	http_player_save.request_completed.connect(_on_player_save_completed)

	# Consulta periódica en tiempo real (cada 3.5s)
	market_poll_timer = Timer.new()
	market_poll_timer.wait_time = 3.5
	market_poll_timer.autostart = true
	add_child(market_poll_timer)
	market_poll_timer.timeout.connect(consultar_todo_en_vivo)

	auto_sync_timer = Timer.new()
	auto_sync_timer.wait_time = 1.5
	auto_sync_timer.one_shot = true
	add_child(auto_sync_timer)
	auto_sync_timer.timeout.connect(_execute_save)

func consultar_todo_en_vivo() -> void:
	consultar_precios_y_boveda()
	consultar_taller()

func consultar_precios_y_boveda() -> void:
	if http_market.get_http_client_status() != HTTPClient.STATUS_DISCONNECTED:
		return
	var url = "%s/Gestor" % firestore_base_url
	var headers = ["Content-Type: application/json"]
	http_market.request(url, headers, HTTPClient.METHOD_GET)

func consultar_taller() -> void:
	if http_taller.get_http_client_status() != HTTPClient.STATUS_DISCONNECTED:
		return
	var url = "%s/Taller" % firestore_base_url
	var headers = ["Content-Type: application/json"]
	http_taller.request(url, headers, HTTPClient.METHOD_GET)

func _on_market_request_completed(result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	if result != HTTPRequest.RESULT_SUCCESS or response_code != 200:
		return

	var json = JSON.new()
	if json.parse(body.get_string_from_utf8()) != OK or not (json.data is Dictionary):
		return

	var data: Dictionary = json.data
	if not data.has("documents") or not (data["documents"] is Array):
		return

	var changed: bool = false
	for doc in data["documents"]:
		var doc_path: String = doc.get("name", "")
		var doc_id: String = doc_path.get_file()
		var fields: Dictionary = doc.get("fields", {})

		# Bóveda
		if doc_id == "boveda_del_Gestor" or (fields.has("Carbon") and fields.has("Oro") and fields.has("Esmeralda")):
			doc_ids["boveda"] = doc_id
			for key in ["Carbon", "Oro", "Esmeralda"]:
				if fields.has(key):
					var parsed_num = _parse_money_number(_extract_val(fields[key]))
					var res_key = "COAL" if key == "Carbon" else ("GOLD" if key == "Oro" else "EMERALD")
					if boveda_liquidez[res_key] != parsed_num:
						boveda_liquidez[res_key] = parsed_num
						changed = true
			continue

		# Precios de minerales
		if fields.has("Costo_Carbon") or _contains_string_in_array(fields.get("Gestor carbon", {}), "Carbon"):
			if fields.has("Costo_Carbon"):
				var price = _parse_money_number(_extract_val(fields["Costo_Carbon"]))
				if price > 0 and precios_mercado["COAL"] != price:
					precios_mercado["COAL"] = price
					changed = true

		if fields.has("Costo_oro") or fields.has("Costo_Oro") or _contains_string_in_array(fields.get("Gestor_Oro", {}), "Oro"):
			var oro_field = fields.get("Costo_oro", fields.get("Costo_Oro", {}))
			if not oro_field.is_empty():
				var price = _parse_money_number(_extract_val(oro_field))
				if price > 0 and precios_mercado["GOLD"] != price:
					precios_mercado["GOLD"] = price
					changed = true

		if fields.has("Costo_esmeralda") or fields.has("Costo_Esmeralda") or _contains_string_in_array(fields.get("Gestor_Esmeralda", {}), "Esmeralda"):
			var esm_field = fields.get("Costo_esmeralda", fields.get("Costo_Esmeralda", {}))
			if not esm_field.is_empty():
				var price = _parse_money_number(_extract_val(esm_field))
				if price > 0 and precios_mercado["EMERALD"] != price:
					precios_mercado["EMERALD"] = price
					changed = true

	market_prices_updated.emit(precios_mercado, boveda_liquidez)

## Procesa los documentos de la colección 'Taller'
func _on_taller_request_completed(result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	if result != HTTPRequest.RESULT_SUCCESS or response_code != 200:
		return

	var json = JSON.new()
	if json.parse(body.get_string_from_utf8()) != OK or not (json.data is Dictionary):
		return

	var data: Dictionary = json.data
	if not data.has("documents") or not (data["documents"] is Array):
		return

	var changed: bool = false
	for doc in data["documents"]:
		var doc_path: String = doc.get("name", "")
		var doc_id: String = doc_path.get_file()
		var fields: Dictionary = doc.get("fields", {})

		var tier: int = 1
		var lower_id = doc_id.to_lower()
		if "normal" in lower_id or "t2" in lower_id:
			tier = 2
		elif "media" in lower_id or "t3" in lower_id:
			tier = 3
		elif "alta" in lower_id or "t4" in lower_id:
			tier = 4
		else:
			tier = 1

		var costo = _parse_money_number(_extract_val(fields.get("Costo", fields.get("costo", {}))))
		var comb = _parse_money_number(_extract_val(fields.get("combustible_por_kilometro", {})))
		var rep = _parse_money_number(_extract_val(fields.get("costo de reparacion", {})))
		var raw_titulo = _extract_val(fields.get("titulo", {}))
		var titulo_str = str(raw_titulo).strip_edges() if raw_titulo != null else ""
		if titulo_str.is_empty():
			titulo_str = doc_id
		var desc_str = str(_extract_val(fields.get("descripcion", "")))

		taller_data[tier] = {
			"doc_id": doc_id,
			"titulo": titulo_str,
			"costo": costo,
			"combustible": comb if comb > 0 else 15,
			"reparacion": rep if rep > 0 else 10,
			"descripcion": desc_str
		}
		changed = true

	if changed:
		taller_updated.emit(taller_data)
		print("[FirebaseManager] Datos de flota Taller actualizados en tiempo real.")

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
	var field_name = "Carbon"
	if key == "GOLD":
		field_name = "Oro"
	elif key == "EMERALD":
		field_name = "Esmeralda"

	var doc_id = doc_ids.get("boveda", "boveda_del_Gestor")
	var url = "%s/Gestor/%s?updateMask.fieldPaths=%s" % [firestore_base_url, doc_id, field_name]
	var body_dict = {
		"fields": {
			field_name: { "stringValue": "$%d" % boveda_liquidez[key] }
		}
	}
	var headers = ["Content-Type: application/json"]
	http_boveda_update.request(url, headers, HTTPClient.METHOD_PATCH, JSON.stringify(body_dict))
	return true

func _on_boveda_update_completed(result: int, response_code: int, _headers: PackedStringArray, _body: PackedByteArray) -> void:
	pass

func _extract_val(field_dict: Variant) -> Variant:
	if not (field_dict is Dictionary):
		return field_dict
	if field_dict.has("stringValue"):
		return field_dict["stringValue"]
	elif field_dict.has("integerValue"):
		return int(field_dict["integerValue"])
	elif field_dict.has("doubleValue"):
		return float(field_dict["doubleValue"])
	return null

func _parse_money_number(raw: Variant) -> int:
	if raw is int:
		return raw
	elif raw is float:
		return int(raw)
	elif raw is String:
		var clean = ""
		for i in range(raw.length()):
			var c = raw[i]
			if c >= '0' and c <= '9':
				clean += c
		if clean.length() > 0:
			return clean.to_int()
	return 0

func _contains_string_in_array(array_field: Dictionary, target_str: String) -> bool:
	if not array_field.has("arrayValue"):
		return false
	var arr = array_field.get("arrayValue", {}).get("values", [])
	for item in arr:
		if item.get("stringValue", "") == target_str:
			return true
	return false

# ----------------- PROGRESO DEL JUGADOR -----------------
func _on_economy_changed(_coins: int, _cash: int) -> void:
	pending_save = true
	if auto_sync_timer.is_stopped():
		auto_sync_timer.start()

func load_player_data() -> void:
	var url = "%s/jugadores/%s" % [firestore_base_url, player_id]
	var headers = ["Content-Type: application/json"]
	http_player_load.request(url, headers, HTTPClient.METHOD_GET)

func _execute_save() -> void:
	if not pending_save:
		return
	pending_save = false

	var firestore_body = {
		"fields": {
			"coins": { "integerValue": str(GestorJuego.coins) },
			"cash": { "integerValue": str(GestorJuego.cash) },
			"player_id": { "stringValue": player_id },
			"last_updated": { "stringValue": Time.get_datetime_string_from_system(true, true) }
		}
	}
	var url = "%s/jugadores/%s" % [firestore_base_url, player_id]
	var headers = ["Content-Type: application/json"]
	http_player_save.request(url, headers, HTTPClient.METHOD_PATCH, JSON.stringify(firestore_body))

func _on_player_load_completed(result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	if result == HTTPRequest.RESULT_SUCCESS and response_code == 200:
		var json = JSON.new()
		if json.parse(body.get_string_from_utf8()) == OK and json.data is Dictionary:
			var fields = json.data.get("fields", {})
			var loaded_coins = int(fields.get("coins", {}).get("integerValue", "0"))
			var loaded_cash = int(fields.get("cash", {}).get("integerValue", "0"))
			if loaded_coins > 0 or loaded_cash > 0:
				GestorJuego.coins = loaded_coins
				GestorJuego.cash = loaded_cash
				if GestorJuego.instance != null:
					GestorJuego.instance.economy_changed.emit(GestorJuego.coins, GestorJuego.cash)

func _on_player_save_completed(result: int, response_code: int, _headers: PackedStringArray, _body: PackedByteArray) -> void:
	pass
