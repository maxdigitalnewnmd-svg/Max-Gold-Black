extends Node2D

const GestorJuego = preload("res://scripts/gestor_juego.gd")

# Configuración de dimensiones de celda y terreno (Estilo Turmoil en la Tatacoa)
const TILE_SIZE: Vector2i = Vector2i(32, 32)

enum TileType {
	SAND_TATACOA = 0, # Superficie desierto rojizo
	CLAY = 1,          # Tierra/arcilla compacta
	HARD_ROCK = 2,     # Roca dura intermedia
	BEDROCK = 3,       # Roca sólida profunda
	OIL = 4,           # Petróleo crudo líquido (el más raro y caro)
	COAL = 5,          # Carbón mineral (barato/común)
	GOLD = 6,          # Veta de oro brillante (medio/valioso)
	EMERALD = 7        # Cristales de esmeralda colombiana (caras/raras)
}

# Jerarquía de valor económico y dureza
const MINERAL_DATA: Dictionary = {
	TileType.COAL: {
		"name": "Carbón Mineral",
		"value": 50,
		"hardness": 1.2,
		"svg_path": "res://assets/mineral_coal.svg",
		"base_color": Color("#1b1d20")
	},
	TileType.GOLD: {
		"name": "Veta de Oro",
		"value": 250,
		"hardness": 1.8,
		"svg_path": "res://assets/mineral_gold.svg",
		"base_color": Color("#d4ac0d")
	},
	TileType.EMERALD: {
		"name": "Esmeralda Colombiana",
		"value": 500,
		"hardness": 2.5,
		"svg_path": "res://assets/mineral_emerald.svg",
		"base_color": Color("#00a86b")
	}
}

const FOSSIL_SVG_PATHS: Array[String] = [
	"res://assets/fossil_dinosaur.svg",
	"res://assets/fossil_fish.svg",
	"res://assets/fossil_roots.svg",
	"res://assets/fossil_ammonite.svg"
]

@export_group("Dimensiones Verticales")
@export var map_height: int = 55 # Profundidad vertical para perforación
@export var surface_height: int = 10 # Filas reservadas para superficie/cielo

@export_group("Generación de Petróleo (Yacimientos Ocultos)")
@export var min_pocket_radius: int = 2
@export var max_pocket_radius: int = 4
@export var min_mineral_oil_distance: float = 3.2 # Distancia mínima con el petróleo

@onready var cielo_fondo: TextureRect = $CieloFondo
@onready var ground_layer: TileMapLayer = $GroundLayer
@onready var minerals_container: Node2D = $MineralsContainer
@onready var fossils_container: Node2D = $FossilsContainer
@onready var camera_2d: Camera2D = $Camera2D
@onready var camion_explorador: CharacterBody2D = $CamionExplorador

# HUD e Inventario
@onready var hud: CanvasLayer = $HUD
@onready var btn_almacen: Button = $HUD/TopLeftBar/BtnAlmacen
@onready var lbl_coins: Label = $HUD/TopRightBar/CoinsPanel/HBox/LblCoins
@onready var lbl_cash: Label = $HUD/TopRightBar/CashPanel/HBox/LblCash
@onready var lbl_active_truck: Label = $HUD/ActiveBadge/LblActiveTruck

# Taller Modal
@onready var taller_modal: PanelContainer = $HUD/TallerModal
@onready var btn_close_modal: Button = $HUD/TallerModal/Margin/VBox/Header/BtnCloseModal
@onready var tab_taller: Button = $HUD/TallerModal/Margin/VBox/CategoryBar/TabTaller
@onready var tab_usuario: Button = $HUD/TallerModal/Margin/VBox/CategoryBar/TabUsuario

@onready var card_t1: Control = $HUD/TallerModal/Margin/VBox/CardT1
@onready var card_t2: Control = $HUD/TallerModal/Margin/VBox/CardT2
@onready var card_t3: Control = $HUD/TallerModal/Margin/VBox/CardT3
@onready var card_t4: Control = $HUD/TallerModal/Margin/VBox/CardT4

@onready var btn_deploy_t1: Button = $HUD/TallerModal/Margin/VBox/CardT1/Margin/HBox/BtnDeployT1
@onready var btn_deploy_t2: Button = $HUD/TallerModal/Margin/VBox/CardT2/Margin/HBox/BtnDeployT2
@onready var btn_deploy_t3: Button = $HUD/TallerModal/Margin/VBox/CardT3/Margin/HBox/BtnDeployT3
@onready var btn_deploy_t4: Button = $HUD/TallerModal/Margin/VBox/CardT4/Margin/HBox/BtnDeployT4

# Usuario Profile UI
@onready var usuario_container: Control = $HUD/TallerModal/Margin/VBox/UsuarioContainer
@onready var lbl_perfil_title: Label = $HUD/TallerModal/Margin/VBox/UsuarioContainer/Margin/VBox/TitleBox/LblPerfilTitle
@onready var lbl_val_uid: Label = $HUD/TallerModal/Margin/VBox/UsuarioContainer/Margin/VBox/Grid/LblValUid
@onready var lbl_val_user: Label = $HUD/TallerModal/Margin/VBox/UsuarioContainer/Margin/VBox/Grid/LblValUser
@onready var lbl_val_mail: Label = $HUD/TallerModal/Margin/VBox/UsuarioContainer/Margin/VBox/Grid/LblValMail
@onready var lbl_val_role: Label = $HUD/TallerModal/Margin/VBox/UsuarioContainer/Margin/VBox/Grid/LblValRole
@onready var lbl_val_fecha: Label = $HUD/TallerModal/Margin/VBox/UsuarioContainer/Margin/VBox/Grid/LblValFecha
@onready var lbl_val_security: Label = $HUD/TallerModal/Margin/VBox/UsuarioContainer/Margin/VBox/Grid/LblValSecurity
@onready var lbl_boveda_personal: Label = $HUD/TallerModal/Margin/VBox/UsuarioContainer/Margin/VBox/LblBovedaPersonal

# Modal Comprador de Recursos (Precio dinámico fluctuante)
@onready var comprador_modal: Control = $HUD/CompradorModal

# Economía sincronizada estrictamente en 0 con GestorJuego
var coins: int:
	get:
		return GestorJuego.coins
var cash: int:
	get:
		return GestorJuego.cash

# Variables del Treadmill Infinito
var min_generated_col: int = -35
var max_generated_col: int = 55

# Regla 1: Espaciado Procedural y Factor Tiempo (Espacio muerto inicial de 30-60 segundos)
# A 110 px/s (3.4375 cols/s), 140 columnas equivalen a ~41 segundos de crucero sin ningún recurso.
const INITIAL_DEAD_ZONE_COL: int = 140

# Distancias mínimas gigantescas en el eje X entre recursos (baja densidad)
const MIN_COAL_SPACING_COLS: int = 40     # ~12-15s entre vetas de carbón
const MIN_GOLD_SPACING_COLS: int = 85     # ~25-28s entre vetas de oro
const MIN_EMERALD_SPACING_COLS: int = 180 # ~55s entre esmeraldas (rarísimas)
const MIN_OIL_SPACING_COLS: int = 220     # ~65-70s entre yacimientos de petróleo

var last_coal_col: int = -9999
var last_gold_col: int = -9999
var last_emerald_col: int = -9999
var last_oil_col: int = -9999

var oil_pockets: Array[Dictionary] = []
var fossil_textures: Array[Texture2D] = []
var mineral_textures: Dictionary = {}
var _mineral_sprites: Dictionary = {} # Vector2i -> Sprite2D

# Niebla de Guerra del subsuelo (recursos ocultos hasta que son descubiertos)
var hidden_subsoil: Dictionary = {}        # Vector2i -> TileType (petróleo o mineral real)
var revealed_resources: Dictionary = {}    # Vector2i -> bool
var oil_pocket_by_tile: Dictionary = {}    # Vector2i -> index de oil_pockets

var _is_dragging: bool = false

func _ready() -> void:
	randomize()
	_load_resources()
	_setup_background()
	_setup_procedural_tileset()
	_generate_initial_world()
	_center_camera()
	_setup_hud()

func _generate_initial_world() -> void:
	min_generated_col = -35
	max_generated_col = 55
	# Pre-generar llenando toda la pantalla (izquierda y derecha) para eliminar zona gris desde frame 1
	_generate_terrain_chunk(min_generated_col, max_generated_col - min_generated_col)
	_expand_background_and_limits()

func _setup_hud() -> void:
	if not is_instance_valid(hud):
		return

	btn_almacen.pressed.connect(func():
		taller_modal.visible = not taller_modal.visible
		if taller_modal.visible:
			_set_modal_tab(0)
			_update_taller_cards()
	)
	btn_close_modal.pressed.connect(func(): taller_modal.visible = false)

	tab_taller.pressed.connect(func(): _set_modal_tab(0))
	tab_usuario.pressed.connect(func(): _set_modal_tab(1))

	btn_deploy_t1.pressed.connect(func(): deploy_truck(1))
	btn_deploy_t2.pressed.connect(func(): deploy_truck(2))
	btn_deploy_t3.pressed.connect(func(): deploy_truck(3))
	btn_deploy_t4.pressed.connect(func(): deploy_truck(4))

	if GestorJuego.instance != null and GestorJuego.instance.has_signal("economy_changed"):
		GestorJuego.instance.economy_changed.connect(_on_economy_changed)
	_on_economy_changed(GestorJuego.coins, GestorJuego.cash)

	if is_instance_valid(camion_explorador):
		camion_explorador.resource_detected.connect(_on_resource_detected)
		camion_explorador.tier_changed.connect(_on_truck_tier_changed)
		_on_truck_tier_changed(camion_explorador.current_tier, camion_explorador.TRUCK_TIERS[camion_explorador.current_tier]["name"])

	if is_instance_valid(comprador_modal):
		comprador_modal.sold_and_resumed.connect(_on_resource_sold)

	# Sincronización en tiempo real del Taller y Usuario con Firestore
	var firebase_mgr = get_node_or_null("FirebaseManager")
	if firebase_mgr != null:
		firebase_mgr.taller_updated.connect(_on_taller_updated_from_firebase)
		if firebase_mgr.has_signal("user_profile_updated"):
			firebase_mgr.user_profile_updated.connect(_on_user_profile_updated)
	_update_taller_cards()

func _set_modal_tab(tab_idx: int) -> void:
	var is_taller = (tab_idx == 0)
	if is_instance_valid(card_t1): card_t1.visible = is_taller
	if is_instance_valid(card_t2): card_t2.visible = is_taller
	if is_instance_valid(card_t3): card_t3.visible = is_taller
	if is_instance_valid(card_t4): card_t4.visible = is_taller
	if is_instance_valid(usuario_container): usuario_container.visible = not is_taller

	if is_instance_valid(tab_taller):
		tab_taller.add_theme_color_override("font_color", Color(1, 0.85, 0.25, 1) if is_taller else Color(0.6, 0.75, 0.9, 0.7))
	if is_instance_valid(tab_usuario):
		tab_usuario.add_theme_color_override("font_color", Color(0.2, 0.95, 0.45, 1) if not is_taller else Color(0.6, 0.75, 0.9, 0.7))

	if not is_taller:
		_update_user_profile_card()

func _on_user_profile_updated(_profile: Dictionary) -> void:
	_update_user_profile_card()

func _update_user_profile_card() -> void:
	var firebase_mgr = get_node_or_null("FirebaseManager")
	var profile: Dictionary = firebase_mgr.user_profile if firebase_mgr != null else {}
	if profile.is_empty():
		return

	if is_instance_valid(lbl_val_uid):
		lbl_val_uid.text = profile.get("uid", "QEMLQtpeFYgfXmZL8eXQSzlMypg2")
	if is_instance_valid(lbl_val_user):
		lbl_val_user.text = profile.get("username", "Dramax")
	if is_instance_valid(lbl_val_mail):
		lbl_val_mail.text = profile.get("correo", "maxdigitalnewnmd@gmail.com")
	if is_instance_valid(lbl_val_role):
		var tipo = profile.get("tipo", "CEO")
		lbl_val_role.text = "%s (Máxima Autoridad)" % tipo if tipo == "CEO" else tipo
	if is_instance_valid(lbl_val_fecha):
		lbl_val_fecha.text = str(profile.get("fecha_creacion", "2026-11-01 15:37:24 (Cuenta Fundacional)"))
	if is_instance_valid(lbl_boveda_personal):
		var coins_cnt = profile.get("moneda", GestorJuego.coins)
		var cash_cnt = profile.get("billete", GestorJuego.cash)
		lbl_boveda_personal.text = "🪙 Bóveda Oficial: %s Dragcoins • 💵 %s Max COP" % [_format_number(int(coins_cnt)), _format_number(int(cash_cnt))]

func _on_taller_updated_from_firebase(_taller_dict: Dictionary) -> void:
	_update_taller_cards()

func _on_economy_changed(new_coins: int, new_cash: int) -> void:
	if is_instance_valid(lbl_coins):
		lbl_coins.text = "%s Dragcoins" % _format_number(new_coins)
	if is_instance_valid(lbl_cash):
		lbl_cash.text = "%s Max COP" % _format_number(new_cash)

func _on_resource_detected(res_code: String, depth: int, column: int) -> void:
	print("[Mundo] Recurso detectado: %s a prof %d en col %d" % [res_code, depth, column])
	if res_code in ["COAL", "GOLD", "EMERALD"]:
		if is_instance_valid(camion_explorador):
			camion_explorador.pause_exploration()

		var firebase_mgr = get_node_or_null("FirebaseManager")
		var tier = camion_explorador.current_tier if is_instance_valid(camion_explorador) else 1

		# Auditoría y validación física obligatoria con Render Gateway
		if firebase_mgr != null and firebase_mgr.has_method("reportar_hallazgo_seguro"):
			firebase_mgr.reportar_hallazgo_seguro(tier, res_code, func(res: Dictionary):
				if res.get("validado", false) == true:
					if is_instance_valid(comprador_modal):
						comprador_modal.open_for_resource(res_code)
				else:
					push_warning("[Seguridad] Hallazgo bloqueado por Render Gateway: " + str(res.get("error", "")))
					if is_instance_valid(camion_explorador):
						camion_explorador.resume_exploration()
			)
		else:
			if is_instance_valid(comprador_modal):
				comprador_modal.open_for_resource(res_code)

func _on_resource_sold(res_key: String, earned_coins: int) -> void:
	print("[Mundo] Transacción finalizada: %s (+🪙%d). Reanudando camión..." % [res_key, earned_coins])
	if is_instance_valid(camion_explorador):
		camion_explorador.resume_exploration()

func deploy_truck(new_tier: int) -> void:
	taller_modal.visible = false
	if is_instance_valid(camion_explorador):
		camion_explorador.set_truck_tier(new_tier)

func _on_truck_tier_changed(new_tier: int, tier_name: String) -> void:
	if is_instance_valid(lbl_active_truck):
		lbl_active_truck.text = "CAMIÓN: %s" % tier_name
	_update_taller_cards()

func _update_taller_cards() -> void:
	var cur: int = camion_explorador.current_tier if is_instance_valid(camion_explorador) else 1
	var buttons = [btn_deploy_t1, btn_deploy_t2, btn_deploy_t3, btn_deploy_t4]
	var firebase_mgr = get_node_or_null("FirebaseManager")

	for i in range(buttons.size()):
		var tier = i + 1
		var btn = buttons[i]
		if is_instance_valid(btn):
			var is_active = (tier == cur)
			btn.text = "EN USO" if is_active else "DESPLEGAR"
			btn.disabled = is_active
			btn.modulate = Color(1.3, 1.3, 0.7) if is_active else Color(1.0, 1.0, 1.0)

		# Actualizar campos dinámicos de Firestore en tiempo real
		var card_path = "HUD/TallerModal/Margin/VBox/CardT%d/Margin/HBox/Info" % tier
		var info_node = get_node_or_null(card_path)
		if info_node != null and firebase_mgr != null:
			var t_info = firebase_mgr.get_taller_info(tier)
			if not t_info.is_empty():
				var name_lbl = info_node.get_node_or_null("Name")
				var specs_lbl = info_node.get_node_or_null("Specs")
				if name_lbl != null:
					name_lbl.text = "%s (T%d)" % [t_info.get("titulo", "Camioneta"), tier]
				if specs_lbl != null:
					var comb = t_info.get("combustible", 15)
					var rep = t_info.get("reparacion", 10)
					var costo = t_info.get("costo", 0)
					var cost_str = " • Costo: $%d" % costo if costo > 0 else " • Gratuita"
					specs_lbl.text = "Combustible: %d / km • Reparación: $%d%s" % [comb, rep, cost_str]

func _update_inventory_display() -> void:
	if is_instance_valid(lbl_coins):
		lbl_coins.text = "%s Dragcoins" % _format_number(coins)
	if is_instance_valid(lbl_cash):
		lbl_cash.text = "%s Max COP" % _format_number(cash)

func _format_number(val: int) -> String:
	var s: String = str(val)
	var result: String = ""
	var count: int = 0
	for i in range(s.length() - 1, -1, -1):
		result = s[i] + result
		count += 1
		if count % 3 == 0 and i > 0:
			result = "," + result
	return result

func _process(delta: float) -> void:
	if is_instance_valid(camion_explorador):
		var target_x: float = camion_explorador.global_position.x
		# La cámara acompaña al camión suavemente
		if not _is_dragging:
			camera_2d.position.x = lerpf(camera_2d.position.x, target_x, 10.0 * delta)

		var current_col: int = int(floor(target_x / float(TILE_SIZE.x)))

		# Treadmill: 1. Generar nuevo terreno por la derecha antes de que el camión llegue
		var ahead_threshold_col: int = max_generated_col - 25
		if current_col > ahead_threshold_col:
			_generate_terrain_chunk(max_generated_col, 25)
			max_generated_col += 25
			_expand_background_and_limits()

		# Treadmill: 2. Borrar columnas que quedan muy atrás por la izquierda (> 1200 px)
		var cleanup_threshold_col: int = current_col - 40
		if cleanup_threshold_col > min_generated_col:
			_cleanup_old_columns(min_generated_col, cleanup_threshold_col)
			min_generated_col = cleanup_threshold_col

## Borra columnas de terreno antiguas por la izquierda para optimizar memoria
func _cleanup_old_columns(from_col: int, to_col: int) -> void:
	for x in range(from_col, to_col):
		for y in range(surface_height, map_height):
			var coord := Vector2i(x, y)
			ground_layer.erase_cell(coord)
			hidden_subsoil.erase(coord)
			revealed_resources.erase(coord)
			oil_pocket_by_tile.erase(coord)
			if _mineral_sprites.has(coord):
				var spr: Sprite2D = _mineral_sprites[coord]
				if is_instance_valid(spr):
					spr.queue_free()
				_mineral_sprites.erase(coord)

	# Limpiar fósiles lejanos
	var cleanup_x_px: float = float(to_col * TILE_SIZE.x)
	for fossil in fossils_container.get_children():
		if is_instance_valid(fossil) and fossil is Node2D:
			if fossil.global_position.x < cleanup_x_px:
				fossil.queue_free()

## Determina qué tipo de roca o tierra natural corresponde a una profundidad y
func get_natural_stratum_tile(y: int) -> int:
	var depth: int = y - surface_height
	var total_underground: int = map_height - surface_height

	if depth < 4:
		return TileType.SAND_TATACOA
	elif depth < 14:
		return TileType.CLAY
	elif depth < total_underground - 10:
		return TileType.HARD_ROCK
	else:
		return TileType.BEDROCK

## Carga en memoria texturas SVG sin fondo de fósiles y minerales
func _load_resources() -> void:
	fossil_textures.clear()
	for path in FOSSIL_SVG_PATHS:
		if ResourceLoader.exists(path):
			var tex: Texture2D = load(path)
			if tex != null:
				fossil_textures.append(tex)

	mineral_textures.clear()
	for type_id in MINERAL_DATA:
		var path: String = MINERAL_DATA[type_id]["svg_path"]
		if ResourceLoader.exists(path):
			var tex: Texture2D = load(path)
			if tex != null:
				mineral_textures[type_id] = tex

## Ajusta el fondo de la Tatacoa comenzando desde muy a la izquierda para evitar fondo gris
func _setup_background() -> void:
	if cielo_fondo != null:
		cielo_fondo.offset_left = -3000.0
		cielo_fondo.offset_top = 0.0
		cielo_fondo.offset_right = 100000.0
		cielo_fondo.offset_bottom = float(surface_height * TILE_SIZE.y)
		cielo_fondo.position = Vector2(-3000.0, 0.0)
		cielo_fondo.size = Vector2(103000.0, float(surface_height * TILE_SIZE.y))

## Expande el fondo y los límites de la cámara según las columnas generadas
func _expand_background_and_limits() -> void:
	if cielo_fondo != null:
		var total_pixel_w: float = float(max_generated_col * TILE_SIZE.x) + 3000.0
		var surface_pixel_h: float = float(surface_height * TILE_SIZE.y)
		cielo_fondo.size = Vector2(total_pixel_w + 3000.0, surface_pixel_h)
	if camera_2d != null:
		camera_2d.limit_right = int(float(max_generated_col * TILE_SIZE.x) + 2000.0)

## Genera un TileSet con texturas procedurales para los estratos
func _setup_procedural_tileset() -> void:
	var tileset := TileSet.new()
	tileset.tile_size = TILE_SIZE

	var colors: Array[Color] = [
		Color("#d35400"), # 0: Arena rojiza ocre (Tatacoa)
		Color("#873600"), # 1: Arcilla / Tierra rojiza profunda
		Color("#566573"), # 2: Roca grisácea dura
		Color("#273746"), # 3: Roca profunda sólida
		Color("#0b0d10"), # 4: Petróleo crudo oscuro
		Color("#1b1d20"), # 5: Base Carbón mineral
		Color("#5c3800"), # 6: Base Veta de Oro
		Color("#122b1c")  # 7: Base Esmeralda
	]

	var tile_w: int = TILE_SIZE.x
	var tile_h: int = TILE_SIZE.y
	var atlas_img := Image.create(tile_w * colors.size(), tile_h, false, Image.FORMAT_RGBA8)

	for i in range(colors.size()):
		var base_color: Color = colors[i]
		for x in range(tile_w):
			for y in range(tile_h):
				var px_color := base_color
				if i == TileType.OIL:
					if (x == 2 and y == 2) or (x == 3 and y == 2) or (x == 2 and y == 3):
						px_color = Color("#2c3e50")
					elif x == 0 or y == 0 or x == tile_w - 1 or y == tile_h - 1:
						px_color = Color("#050608")
				else:
					if x == 0 or y == 0 or x == tile_w - 1 or y == tile_h - 1:
						px_color = base_color.darkened(0.2)

				atlas_img.set_pixel(i * tile_w + x, y, px_color)

	var texture := ImageTexture.create_from_image(atlas_img)
	var atlas_source := TileSetAtlasSource.new()
	atlas_source.texture = texture
	atlas_source.texture_region_size = TILE_SIZE

	for i in range(colors.size()):
		atlas_source.create_tile(Vector2i(i, 0))

	tileset.add_source(atlas_source, 0)
	ground_layer.tile_set = tileset

## Genera un tramo (chunk) de terreno aplicando la Regla 1 (Espaciado Procedural y Factor Tiempo)
func _generate_terrain_chunk(start_col: int, col_count: int) -> void:
	# 1. Rellenar estratos de roca y arcilla para este nuevo tramo
	for x in range(start_col, start_col + col_count):
		for y in range(surface_height, map_height):
			var tile_type: int = get_natural_stratum_tile(y)
			ground_layer.set_cell(Vector2i(x, y), 0, Vector2i(tile_type, 0))

	# 2. Fósiles decorativos en este tramo (siempre visibles desde el inicio)
	_spawn_fossils_in_range(start_col, start_col + col_count)

	# REGLA 1 (FACTOR TIEMPO): Prohibido generar recursos en el espacio muerto inicial (30 a 60 segundos de crucero)
	var end_col: int = start_col + col_count
	if end_col < INITIAL_DEAD_ZONE_COL:
		return

	var effective_start_x: int = maxi(start_col + 1, INITIAL_DEAD_ZONE_COL)
	var effective_end_x: int = end_col - 2
	if effective_start_x >= effective_end_x:
		return

	# REGLA 1 (DENSIDAD Y DISTANCIAS ENORMES EN EL EJE X):
	# A. PETRÓLEO: Separado por distancias gigantescas (mínimo 220 columnas, profundidad 28-48)
	if (effective_start_x - last_oil_col) >= MIN_OIL_SPACING_COLS and randf() < 0.40:
		var center_x: int = randi_range(effective_start_x + 3, effective_end_x - 3)
		var center_y: int = randi_range(surface_height + 18, map_height - 6) # Profundo
		_create_single_oil_pocket(center_x, center_y)
		last_oil_col = center_x
		print("[Geología] ¡Yacimiento petrolífero generado en col %d, prof %d!" % [center_x, center_y])

	# B. ESMERALDAS: Separadas por distancias enormes (mínimo 180 columnas, en lecho rocoso ultra-profundo y: 38-52)
	if (effective_start_x - last_emerald_col) >= MIN_EMERALD_SPACING_COLS and randf() < 0.45:
		var em_x: int = randi_range(effective_start_x, effective_end_x)
		var em_count: int = randi_range(1, 2)
		_spawn_mineral_veins_in_range(TileType.EMERALD, em_count, em_x - 2, em_x + 2, surface_height + 28, map_height - 3, 1, 2)
		last_emerald_col = em_x
		print("[Geología] ¡Gemas de esmeralda generadas en col %d!" % em_x)

	# C. ORO: Separado por distancias medias (mínimo 85 columnas, en roca intermedia y: 24-38)
	if (effective_start_x - last_gold_col) >= MIN_GOLD_SPACING_COLS and randf() < 0.55:
		var gold_x: int = randi_range(effective_start_x, effective_end_x)
		var gold_count: int = randi_range(2, 3)
		_spawn_mineral_veins_in_range(TileType.GOLD, gold_count, gold_x - 3, gold_x + 3, surface_height + 14, surface_height + 28, 1, 2)
		last_gold_col = gold_x
		print("[Geología] ¡Veta de oro generada en col %d!" % gold_x)

	# D. CARBÓN: Primer mineral accesible (mínimo 40 columnas, en arcilla y roca poco profunda y: 14-22)
	if (effective_start_x - last_coal_col) >= MIN_COAL_SPACING_COLS and randf() < 0.70:
		var coal_x: int = randi_range(effective_start_x, effective_end_x)
		var coal_count: int = randi_range(3, 5)
		_spawn_mineral_veins_in_range(TileType.COAL, coal_count, coal_x - 4, coal_x + 4, surface_height + 4, surface_height + 14, 2, 3)
		last_coal_col = coal_x
		print("[Geología] ¡Veta de carbón generada en col %d!" % coal_x)

func _create_single_oil_pocket(center_x: int, center_y: int) -> void:
	var radius_x: float = randf_range(float(min_pocket_radius), float(max_pocket_radius))
	var radius_y: float = randf_range(float(min_pocket_radius) * 0.7, float(max_pocket_radius) * 0.9)

	var pocket_tiles: Array[Vector2i] = []
	var scan_rx: int = int(ceil(radius_x)) + 1
	var scan_ry: int = int(ceil(radius_y)) + 1
	var p_idx: int = oil_pockets.size()

	for dx in range(-scan_rx, scan_rx + 1):
		for dy in range(-scan_ry, scan_ry + 1):
			var tx: int = center_x + dx
			var ty: int = center_y + dy

			if ty < surface_height + 2 or ty >= map_height:
				continue

			var norm_x: float = float(dx) / radius_x
			var norm_y: float = float(dy) / radius_y
			var dist_sq: float = (norm_x * norm_x) + (norm_y * norm_y)

			var threshold: float = 1.0 + randf_range(-0.15, 0.15)
			if dist_sq <= threshold:
				var tile_coord := Vector2i(tx, ty)
				hidden_subsoil[tile_coord] = TileType.OIL
				oil_pocket_by_tile[tile_coord] = p_idx
				pocket_tiles.append(tile_coord)

	if not pocket_tiles.is_empty():
		var estimated_oil: int = pocket_tiles.size() * 100
		oil_pockets.append({
			"center": Vector2i(center_x, center_y),
			"tiles": pocket_tiles,
			"radius_x": radius_x,
			"radius_y": radius_y,
			"total_oil": estimated_oil,
			"current_oil": estimated_oil,
			"revealed": false
		})

## Comprueba distancia con petróleo
func _is_too_close_to_oil(coord: Vector2i, min_dist_tiles: float) -> bool:
	for pocket in oil_pockets:
		var tiles: Array = pocket.get("tiles", [])
		for ot in tiles:
			if Vector2(coord).distance_to(Vector2(ot)) < min_dist_tiles:
				return true
	return false

func _spawn_mineral_veins_in_range(mineral_type: int, vein_count: int, min_x: int, max_x: int, min_y: int, max_y: int, min_size: int, max_size: int) -> void:
	for v in range(vein_count):
		var seed_coord := Vector2i.ZERO
		var found_valid_seed: bool = false
		for attempt in range(25):
			var sx: int = randi_range(min_x, max_x)
			var sy: int = randi_range(min_y, max_y)
			var candidate := Vector2i(sx, sy)
			if not _is_too_close_to_oil(candidate, min_mineral_oil_distance) and not hidden_subsoil.has(candidate):
				seed_coord = candidate
				found_valid_seed = true
				break

		if not found_valid_seed:
			continue

		var vein_length: int = randi_range(min_size, max_size)
		var cur_coord := seed_coord

		for step in range(vein_length):
			if cur_coord.x >= min_x and cur_coord.x <= max_x and cur_coord.y >= surface_height + 2 and cur_coord.y < map_height:
				if not hidden_subsoil.has(cur_coord) and not _is_too_close_to_oil(cur_coord, min_mineral_oil_distance):
					hidden_subsoil[cur_coord] = mineral_type
					_spawn_mineral_sprite(cur_coord, mineral_type)

			var offset: Vector2i = [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)].pick_random()
			cur_coord += offset

## Instancia el sprite SVG del mineral (inicialmente oculto bajo tierra)
func _spawn_mineral_sprite(grid_pos: Vector2i, mineral_type: int) -> void:
	if not mineral_textures.has(mineral_type):
		return

	var sprite := Sprite2D.new()
	var texture: Texture2D = mineral_textures[mineral_type]
	sprite.texture = texture

	var desired_px: float = float(TILE_SIZE.x) * randf_range(1.65, 2.15)
	var tex_w: float = float(texture.get_width())
	if tex_w > 0:
		var s: float = desired_px / tex_w
		sprite.scale = Vector2(s, s)

	var world_pos := Vector2(
		float(grid_pos.x * TILE_SIZE.x) + float(TILE_SIZE.x) * 0.5,
		float(grid_pos.y * TILE_SIZE.y) + float(TILE_SIZE.y) * 0.5
	)
	sprite.position = world_pos

	if randf() > 0.5:
		sprite.flip_h = true
	sprite.rotation_degrees = randf_range(-12.0, 12.0)
	sprite.visible = false

	minerals_container.add_child(sprite)
	_mineral_sprites[grid_pos] = sprite

## FÓSILES (Dinosaurios, Raíces, Peces): VISIBLES DESDE EL INICIO como decoración
func _spawn_fossils_in_range(start_col: int, end_col: int) -> void:
	if fossil_textures.is_empty():
		return

	var skull_texture: Texture2D = fossil_textures[0]

	# Cráneo de dinosaurio cerca de las bolsas de petróleo de este tramo
	for pocket in oil_pockets:
		var center: Vector2i = pocket["center"]
		if center.x >= start_col and center.x < end_col:
			var world_pos := Vector2(
				float(center.x + randi_range(-2, 2)) * float(TILE_SIZE.x),
				float(center.y + randi_range(-3, -1)) * float(TILE_SIZE.y)
			)
			_spawn_fossil_svg_sprite(world_pos, skull_texture)

	# Fósiles dispersos en este tramo
	for f in range(5):
		var fx: int = randi_range(start_col + 1, end_col - 2)
		var fy: int = randi_range(surface_height + 4, map_height - 2)
		var world_pos := Vector2(
			float(fx * TILE_SIZE.x) + float(TILE_SIZE.x) * 0.5,
			float(fy * TILE_SIZE.y) + float(TILE_SIZE.y) * 0.5
		)
		_spawn_fossil_svg_sprite(world_pos, null)

func _spawn_fossil_svg_sprite(world_pos: Vector2, custom_tex: Texture2D = null) -> void:
	var sprite := Sprite2D.new()
	var texture: Texture2D = custom_tex if custom_tex != null else fossil_textures.pick_random()
	sprite.texture = texture

	var desired_width_px: float = float(TILE_SIZE.x) * randf_range(2.8, 3.8)
	var tex_w: float = float(texture.get_width())
	if tex_w > 0:
		var scale_factor: float = desired_width_px / tex_w
		sprite.scale = Vector2(scale_factor, scale_factor)

	sprite.position = world_pos
	sprite.modulate = Color(1.0, 1.0, 1.0, randf_range(0.90, 0.98))

	if randf() > 0.5:
		sprite.flip_h = true
	sprite.rotation_degrees = randf_range(-15.0, 15.0)
	sprite.visible = true
	fossils_container.add_child(sprite)

## REVELACIÓN: Cuando el escaneo sísmico profundo descubre un recurso, se hace visible
func reveal_resource_at_depth(col_x: int, y: int) -> void:
	var coord := Vector2i(col_x, y)
	if not hidden_subsoil.has(coord):
		return

	var res_type: int = hidden_subsoil[coord]

	if res_type == TileType.OIL:
		var pocket_idx: int = oil_pocket_by_tile.get(coord, -1)
		if pocket_idx >= 0 and pocket_idx < oil_pockets.size():
			var pocket: Dictionary = oil_pockets[pocket_idx]
			if not pocket["revealed"]:
				pocket["revealed"] = true
				for pt in pocket["tiles"]:
					ground_layer.set_cell(pt, 0, Vector2i(TileType.OIL, 0))
					revealed_resources[pt] = true
				print("[Geología] ¡Yacimiento petrolífero revelado en pantalla!")
	elif MINERAL_DATA.has(res_type):
		if _mineral_sprites.has(coord):
			var spr: Sprite2D = _mineral_sprites[coord]
			if is_instance_valid(spr):
				spr.visible = true
		ground_layer.set_cell(coord, 0, Vector2i(res_type, 0))
		revealed_resources[coord] = true
		print("[Geología] ¡Veta de %s revelada en pantalla!" % MINERAL_DATA[res_type]["name"])

## Centra la cámara al inicio en el camión
func _center_camera() -> void:
	var total_pixel_h: float = float(map_height * TILE_SIZE.y)
	if is_instance_valid(camion_explorador):
		camera_2d.position = Vector2(camion_explorador.global_position.x, 400.0)
	else:
		camera_2d.position = Vector2(80.0, 400.0)

	camera_2d.limit_left = -100000
	camera_2d.limit_top = 0
	camera_2d.limit_right = 100000000
	camera_2d.limit_bottom = int(total_pixel_h)

## Navegación táctil para subir/bajar por el subsuelo
func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventScreenDrag:
		camera_2d.position.y -= event.relative.y / camera_2d.zoom.y
	elif event is InputEventMouseButton:
		if event.button_index == MOUSE_BUTTON_LEFT or event.button_index == MOUSE_BUTTON_MIDDLE:
			_is_dragging = event.pressed
		elif event.button_index == MOUSE_BUTTON_WHEEL_UP:
			camera_2d.zoom = (camera_2d.zoom * 1.1).clamp(Vector2(0.5, 0.5), Vector2(2.5, 2.5))
		elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			camera_2d.zoom = (camera_2d.zoom * 0.9).clamp(Vector2(0.5, 0.5), Vector2(2.5, 2.5))
	elif event is InputEventMouseMotion and _is_dragging:
		camera_2d.position.y -= event.relative.y / camera_2d.zoom.y
