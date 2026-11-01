extends CharacterBody2D

signal resource_detected(resource_name: String, depth: int, grid_x: int)
signal tier_changed(new_tier: int, tier_name: String)

enum State {
	CRUISING,        # 1. Avanza constantemente emitiendo ondas pasivas hacia abajo
	BRAKING,         # 2. Frenado inmediato tras detectar indicio pasivo en el subsuelo
	REVERSING,       # 3. Retrocede marcha atrás hasta colocarse justo sobre la columna del recurso
	LOWERING_PLATE,  # 4. Baja la placa hidráulica firmemente hasta apoyarse en tierra
	DEEP_SCAN,       # 5. Escaneo profundo concentrado con BONO de probabilidad (+15%)
	RESULT,          # 6. Muestra cartel si el escaneo descubrió el recurso
	RAISING_PLATE    # 7. Recoge la placa y reanuda el avance continuo
}

const PLATE_POS_RAISED: float = -26.0  # Posición recogida dentro del chasis
const PLATE_POS_GROUND: float = -12.0  # Posición apoyada firmemente en el suelo
const DEEP_SCAN_BONUS: float = 0.15    # +15% bono por escaneo profundo al retroceder

# 4 TIPOS DE CAMIÓN: FÍSICAS DE ONDA (LONGITUD Y FRECUENCIA) + REGLAS ESTRICTAS DE TIER
const TRUCK_TIERS: Dictionary = {
	1: {
		"name": "Camión T1 (Básico Vibroseis)",
		"body_svg": "res://assets/camion_cuerpo_vibro.svg",
		"prob_coal": 0.80,    # 80% Carbón (recurso base de superficie)
		"prob_gold": 0.30,    # 30% Oro
		"prob_oil": 0.15,     # 15% Petróleo
		"prob_emerald": 0.00, # 0% Esmeraldas (¡Incapaz de detectar esmeraldas!)
		"max_depth_y": 22,    # FÍSICA: Onda corta (solo arcilla superior, max 12 tiles bajo tierra = 384px)
		"max_wave_radius_px": 384.0,
		"passive_wave_interval": 3.2, # FRECUENCIA: Lenta (pulso cada 3.2 segundos)
		"wave_color": Color(0.85, 0.95, 1.0),
		"badge": "T1 Básico",
		"desc": "Onda corta (arcilla superior) | Frecuencia lenta | Carbón 80% | Oro 30% | Crudo 15% | Esmeralda 0%"
	},
	2: {
		"name": "Camión T2 (Doble Pistón Avanzado)",
		"body_svg": "res://assets/camion_cuerpo_t2.svg",
		"prob_coal": 1.00,    # 100% Carbón
		"prob_gold": 0.70,    # 70% Oro
		"prob_oil": 0.50,     # 50% Petróleo
		"prob_emerald": 0.20, # 20% Esmeralda
		"max_depth_y": 34,    # FÍSICA: Onda media (hasta roca intermedia = 768px)
		"max_wave_radius_px": 768.0,
		"passive_wave_interval": 2.0, # FRECUENCIA: Moderada (pulso cada 2.0 segundos)
		"wave_color": Color(0.2, 0.7, 1.0),
		"badge": "T2 Avanzado",
		"desc": "Onda media (roca intermedia) | Frecuencia moderada | Carbón 100% | Oro 70% | Crudo 50% | Esmeralda 20%"
	},
	3: {
		"name": "Camión T3 (Deep Miner Oro & Crudo)",
		"body_svg": "res://assets/camion_cuerpo_t3.svg",
		"prob_coal": 0.30,    # 30% Carbón
		"prob_gold": 1.00,    # 100% Oro (¡Especialista en oro!)
		"prob_oil": 0.80,     # 80% Petróleo
		"prob_emerald": 0.50, # 50% Esmeralda
		"max_depth_y": 45,    # FÍSICA: Onda profunda (hasta roca profunda = 1120px)
		"max_wave_radius_px": 1120.0,
		"passive_wave_interval": 1.3, # FRECUENCIA: Buena (pulso cada 1.3 segundos)
		"wave_color": Color(1.0, 0.7, 0.1),
		"badge": "T3 Oro & Crudo",
		"desc": "Onda profunda | Frecuencia buena | Oro 100% | Crudo 80% | Esmeralda 50% | Carbón 30%"
	},
	4: {
		"name": "Camión T4 (Quantum Élite Petróleo & Gemas)",
		"body_svg": "res://assets/camion_cuerpo_t4.svg",
		"prob_coal": 0.15,    # 15% Carbón
		"prob_gold": 0.60,    # 60% Oro
		"prob_oil": 0.95,     # 95% Petróleo (¡Casi infalible para crudo profundo!)
		"prob_emerald": 0.85, # 85% Esmeralda (¡Especialista en gemas profundas!)
		"max_depth_y": 55,    # FÍSICA: Onda expansiva total (llega al lecho rocoso = 1440px)
		"max_wave_radius_px": 1440.0,
		"passive_wave_interval": 0.75, # FRECUENCIA: Rápida (pulso cada 0.75 segundos)
		"wave_color": Color(0.0, 0.95, 0.95),
		"badge": "T4 Élite Petróleo & Gemas",
		"desc": "Onda expansiva total (lecho rocoso) | Frecuencia rápida | Crudo 95% | Esmeralda 85% | Oro 60% | Carbón 15%"
	}
}

@export_range(1, 4) var current_tier: int = 1: set = set_truck_tier

@export_group("Movimiento y Velocidades")
@export var speed: float = 110.0            # Velocidad ágil de crucero
@export var lower_duration: float = 0.7     # Tiempo bajando la placa hidráulica con paciencia
@export var deep_probe_duration: float = 1.8# Tiempo de escaneo profundo concentrado
@export var result_duration: float = 2.0    # Tiempo mostrando el recurso descubierto
@export var raise_duration: float = 0.7     # Tiempo recogiendo la placa hacia arriba

@onready var visuals: Node2D = $Visuals
@onready var body_sprite: Sprite2D = $Visuals/BodySprite
@onready var vibrator_plate: Sprite2D = $Visuals/VibratorPlate
@onready var wheel_rear: Sprite2D = $Visuals/WheelRear
@onready var wheel_front: Sprite2D = $Visuals/WheelFront
@onready var alert_label: Label = $AlertLabel

var current_state: State = State.CRUISING
var direction: float = 1.0
var state_timer: float = 0.0
var world_node: Node2D = null

# Lógica de detección pasiva y retroceso
var target_scan_col: int = 0
var target_scan_world_x: float = 0.0
var scanned_columns: Dictionary = {} # col -> true (evita retrocesos redundantes sobre la misma columna)
var passive_wave_anim: float = 0.0
var passive_pulse_timer: float = 0.0

# Variables de animación sísmica profunda
var scan_anim_time: float = 0.0
var scan_depth_px: float = 650.0
var has_target: bool = false
var target_local_pos: Vector2 = Vector2.ZERO
var wave_color: Color = Color(0.75, 0.9, 1.0)
var detected_cache: Dictionary = {}

func _ready() -> void:
	alert_label.visible = false
	world_node = get_parent() as Node2D
	vibrator_plate.position.y = PLATE_POS_RAISED
	current_state = State.CRUISING
	_apply_tier_visuals()

## Cambia el tipo/nivel de camión dinámicamente
func set_truck_tier(new_tier: int) -> void:
	current_tier = clampi(new_tier, 1, 4)
	if is_node_ready():
		_apply_tier_visuals()

func _apply_tier_visuals() -> void:
	if not TRUCK_TIERS.has(current_tier):
		return
	var tdata: Dictionary = TRUCK_TIERS[current_tier]
	var path: String = tdata["body_svg"]
	if ResourceLoader.exists(path) and body_sprite != null:
		body_sprite.texture = load(path)
	wave_color = tdata["wave_color"]
	tier_changed.emit(current_tier, tdata["name"])

func _unhandled_key_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_1:
			set_truck_tier(1)
		elif event.keycode == KEY_2:
			set_truck_tier(2)
		elif event.keycode == KEY_3:
			set_truck_tier(3)
		elif event.keycode == KEY_4:
			set_truck_tier(4)

var is_exploration_paused: bool = false

func pause_exploration() -> void:
	is_exploration_paused = true
	velocity = Vector2.ZERO

func resume_exploration() -> void:
	is_exploration_paused = false
	if current_state == State.RESULT:
		alert_label.visible = false
		has_target = false
		scan_anim_time = 0.0
		queue_redraw()
		current_state = State.RAISING_PLATE
		state_timer = raise_duration

func _physics_process(delta: float) -> void:
	if is_exploration_paused:
		return

	match current_state:
		State.CRUISING:
			_process_cruising(delta)
		State.BRAKING:
			_process_braking(delta)
		State.REVERSING:
			_process_reversing(delta)
		State.LOWERING_PLATE:
			_process_lowering_plate(delta)
		State.DEEP_SCAN:
			_process_deep_scan(delta)
		State.RESULT:
			_process_result(delta)
		State.RAISING_PLATE:
			_process_raising_plate(delta)

## Estado 1: Avanzar constantemente hacia la derecha emitiendo ondas pasivas con frecuencia según Tier
func _process_cruising(delta: float) -> void:
	direction = 1.0
	velocity.x = speed * direction
	velocity.y = 0.0
	move_and_slide()

	visuals.scale.x = 1.0
	vibrator_plate.position.y = PLATE_POS_RAISED

	# Giro constante de ruedas hacia adelante
	var wheel_rot_speed: float = (speed / 21.3) * delta
	wheel_rear.rotation += wheel_rot_speed
	wheel_front.rotation += wheel_rot_speed

	var tier_data: Dictionary = TRUCK_TIERS.get(current_tier, TRUCK_TIERS[1])
	var pulse_interval: float = tier_data.get("passive_wave_interval", 2.5)

	# Animación de ondas pasivas según la frecuencia del camión
	passive_wave_anim += delta * (1.0 / pulse_interval)
	queue_redraw()

	# REGLA 2 (FRECUENCIA): El camión solo pulsa e inspecciona según su intervalo físico
	passive_pulse_timer -= delta
	if passive_pulse_timer <= 0.0:
		passive_pulse_timer = pulse_interval
		_check_passive_detection()

## Sondeo pasivo en marcha: aplica el TRIPLE FILTRO DE ÉXITO (Regla 3)
## 1. El mapa debe haberlo generado (respetando zona muerta y distancias)
## 2. La onda debe tener longitud física suficiente (y <= tier_data.max_depth_y)
## 3. Tirada de probabilidad favorable
## Si falla cualquiera, pasa de largo en silencio.
func _check_passive_detection() -> void:
	if not world_node or not ("hidden_subsoil" in world_node):
		return

	var tier_data: Dictionary = TRUCK_TIERS.get(current_tier, TRUCK_TIERS[1])
	var max_scan_y: int = tier_data.get("max_depth_y", 22)

	var tile_size_x: float = float(world_node.TILE_SIZE.x)
	var current_col: int = int(floor(global_position.x / tile_size_x))

	# Comprobar la columna recién atravesada (debajo de la placa vibratoria)
	for col_to_check in [current_col, current_col - 1]:
		if scanned_columns.has(col_to_check):
			continue

		# FILTRO 2 (FÍSICA DE ONDA): Solo penetra hasta max_depth_y del camión
		for y in range(world_node.surface_height, mini(max_scan_y + 1, world_node.map_height)):
			var coord := Vector2i(col_to_check, y)

			# FILTRO 1 (GENERACIÓN): Comprobar si existe en el subsuelo
			if world_node.hidden_subsoil.has(coord) and not world_node.revealed_resources.has(coord):
				var res_type: int = world_node.hidden_subsoil[coord]
				var base_prob: float = 0.0

				if res_type == world_node.TileType.OIL:
					base_prob = tier_data.get("prob_oil", 0.15)
				elif res_type == world_node.TileType.GOLD:
					base_prob = tier_data.get("prob_gold", 0.50)
				elif res_type == world_node.TileType.COAL:
					base_prob = tier_data.get("prob_coal", 0.80)
				elif res_type == world_node.TileType.EMERALD:
					base_prob = tier_data.get("prob_emerald", 0.00)

				# FILTRO 3 (PROBABILIDAD):
				# Si el camión tiene 0% (ej: T1 frente a esmeralda), pasa de largo en silencio
				if base_prob <= 0.0:
					continue

				# Sensibilidad del sensor en movimiento pasivo (85% de su probabilidad base)
				if randf() > (base_prob * 0.85):
					# Falló la tirada pasiva: pasa de largo en silencio
					continue

				# ¡TRIPLE FILTRO CUMPLIDO CON ÉXITO! Detenerse y retroceder a esa columna
				target_scan_col = col_to_check
				target_scan_world_x = float(target_scan_col * int(tile_size_x)) + (tile_size_x * 0.5)
				scanned_columns[target_scan_col] = true

				current_state = State.BRAKING
				state_timer = 0.22 # Frenado firme y rápido
				velocity.x = speed * 0.35
				return

## Estado 2: Frenar al detectar indicio subterráneo
func _process_braking(delta: float) -> void:
	velocity.x = move_toward(velocity.x, 0.0, speed * 4.5 * delta)
	move_and_slide()
	state_timer -= delta
	if state_timer <= 0.0 or absf(velocity.x) < 3.0:
		velocity = Vector2.ZERO
		current_state = State.REVERSING

## Estado 3: Marcha atrás hasta situarse exactamente sobre la columna detectada
func _process_reversing(delta: float) -> void:
	var dist: float = global_position.x - target_scan_world_x
	if dist > 2.5:
		velocity.x = -speed * 0.70 # Marcha atrás controlada
		move_and_slide()
		visuals.scale.x = 1.0

		# Ruedas giran en reversa
		var wheel_rot_speed: float = (speed * 0.70 / 21.3) * delta
		wheel_rear.rotation -= wheel_rot_speed
		wheel_front.rotation -= wheel_rot_speed
	else:
		# Centrado exactamente sobre la columna
		global_position.x = target_scan_world_x
		velocity = Vector2.ZERO
		current_state = State.LOWERING_PLATE
		state_timer = lower_duration

## Estado 4: Animación de bajar la placa hidráulica con paciencia hasta el suelo
func _process_lowering_plate(delta: float) -> void:
	state_timer -= delta
	var progress: float = clampf(1.0 - (state_timer / lower_duration), 0.0, 1.0)
	var ease_t: float = progress * progress * (3.0 - 2.0 * progress)
	vibrator_plate.position.y = lerpf(PLATE_POS_RAISED, PLATE_POS_GROUND, ease_t)

	if state_timer <= 0.0:
		vibrator_plate.position.y = PLATE_POS_GROUND
		_start_deep_scan()

## Estado 5: Escaneo profundo concentrado con BONO de probabilidad (+15%)
func _start_deep_scan() -> void:
	current_state = State.DEEP_SCAN
	state_timer = deep_probe_duration
	scan_anim_time = 0.0
	has_target = false
	scan_depth_px = 700.0

	var tier_data: Dictionary = TRUCK_TIERS.get(current_tier, TRUCK_TIERS[1])
	wave_color = tier_data["wave_color"]

	alert_label.visible = false
	queue_redraw()

func _process_deep_scan(delta: float) -> void:
	scan_anim_time += delta
	# Vibración mecánica potente en la placa apoyada en tierra
	vibrator_plate.position.y = PLATE_POS_GROUND + sin(scan_anim_time * 42.0) * 1.5
	queue_redraw()

	state_timer -= delta
	if state_timer <= 0.0:
		vibrator_plate.position.y = PLATE_POS_GROUND
		_verify_deep_scan_results()

## Estado 6: Verifica resultados del escaneo profundo aplicando el Bono (+15%)
func _verify_deep_scan_results() -> void:
	current_state = State.RESULT
	detected_cache = _execute_deep_probing(target_scan_col)

	if not detected_cache.is_empty():
		state_timer = result_duration
		scan_depth_px = float(detected_cache["depth"] * 32) - global_position.y
		has_target = true
		target_local_pos = Vector2(0, scan_depth_px)
		wave_color = detected_cache["color"]
		alert_label.text = detected_cache["text"]
		alert_label.modulate = detected_cache["color"]
		alert_label.visible = true
		var key_code: String = detected_cache.get("res_key", detected_cache["type"])
		resource_detected.emit(key_code, detected_cache["depth"], detected_cache["column"])
	else:
		has_target = false
		alert_label.visible = false
		state_timer = 0.4

	queue_redraw()

func _process_result(delta: float) -> void:
	scan_anim_time += delta
	queue_redraw()

	state_timer -= delta
	if state_timer <= 0.0:
		alert_label.visible = false
		has_target = false
		scan_anim_time = 0.0
		queue_redraw()
		current_state = State.RAISING_PLATE
		state_timer = raise_duration

## Estado 7: Recoger la placa hidráulica con paciencia hacia arriba antes de volver a avanzar
func _process_raising_plate(delta: float) -> void:
	state_timer -= delta
	var progress: float = clampf(1.0 - (state_timer / raise_duration), 0.0, 1.0)
	var ease_t: float = progress * progress * (3.0 - 2.0 * progress)
	vibrator_plate.position.y = lerpf(PLATE_POS_GROUND, PLATE_POS_RAISED, ease_t)

	if state_timer <= 0.0:
		vibrator_plate.position.y = PLATE_POS_RAISED
		current_state = State.CRUISING

## Renderiza las ondas pasivas continuas y las ondas profundas concentradas
func _draw() -> void:
	var probe_origin := Vector2(0, vibrator_plate.position.y + 12.0)
	var tier_data: Dictionary = TRUCK_TIERS.get(current_tier, TRUCK_TIERS[1])
	var max_wave_r: float = tier_data.get("max_wave_radius_px", 384.0)

	# 1. ONDAS PASIVAS EN MARCHA (State.CRUISING)
	if current_state == State.CRUISING:
		var p_wave_count: int = 2
		for i in range(p_wave_count):
			var p_phase: float = fmod(passive_wave_anim + float(i) * 0.5, 1.0)
			var p_r: float = p_phase * max_wave_r
			var p_alpha: float = (1.0 - p_phase) * 0.35
			var arc_c := Color(wave_color.r, wave_color.g, wave_color.b, p_alpha)
			draw_arc(probe_origin, p_r, 0.2, PI - 0.2, 24, arc_c, 2.2, true)

	# 2. ESCANEO PROFUNDO CONCENTRADO (State.DEEP_SCAN y State.RESULT)
	elif current_state == State.DEEP_SCAN or current_state == State.RESULT:
		var deep_reach: float = minf(scan_depth_px, max_wave_r)
		var line_alpha: float = 0.50 if has_target else 0.22
		var line_color := Color(wave_color.r, wave_color.g, wave_color.b, line_alpha)
		draw_line(probe_origin, Vector2(0, deep_reach), line_color, 3.2)

		var wave_count: int = 4
		for i in range(wave_count):
			var phase: float = fmod(scan_anim_time * 2.2 + float(i) * (1.0 / float(wave_count)), 1.0)
			var current_radius: float = phase * deep_reach
			if current_radius > 6.0:
				var alpha: float = (1.0 - phase) * 0.95
				var arc_color := Color(wave_color.r, wave_color.g, wave_color.b, alpha)
				draw_arc(probe_origin, current_radius, 0.10, PI - 0.10, 32, arc_color, 4.0, true)

		# Ping de impacto sobre el recurso revelado
		if has_target and current_state == State.RESULT:
			var pulse: float = sin(scan_anim_time * 10.0) * 4.0
			var ping_r: float = 12.0 + pulse
			var ping_glow := Color(wave_color.r, wave_color.g, wave_color.b, 0.50)
			var ping_ring := Color(wave_color.r, wave_color.g, wave_color.b, 1.0)
			draw_circle(target_local_pos, ping_r, ping_glow)
			draw_arc(target_local_pos, ping_r + 5.0, 0.0, TAU, 24, ping_ring, 2.5, true)

## Ejecuta la comprobación sísmica profunda con el Triple Filtro de Éxito (Regla 3)
func _execute_deep_probing(col: int) -> Dictionary:
	if not world_node or not ("hidden_subsoil" in world_node):
		return {}

	var tier_data: Dictionary = TRUCK_TIERS.get(current_tier, TRUCK_TIERS[1])
	var max_scan_y: int = tier_data.get("max_depth_y", 22)

	# Cono sísmico: evaluar la columna objetivo y adyacentes según radar
	var scan_offsets: Array = [-1, 0, 1] if current_tier <= 2 else [-2, -1, 0, 1, 2]

	for offset in scan_offsets:
		var check_col: int = col + offset
		# FILTRO 2 (FÍSICA DE ONDA): Solo alcanza hasta max_depth_y del camión
		for y in range(world_node.surface_height, mini(max_scan_y + 1, world_node.map_height)):
			var coord := Vector2i(check_col, y)
			# FILTRO 1 (GENERACIÓN): Comprueba existencia en mapa
			if world_node.hidden_subsoil.has(coord) and not world_node.revealed_resources.has(coord):
				var res_type: int = world_node.hidden_subsoil[coord]
				var base_prob: float = 0.0

				if res_type == world_node.TileType.OIL:
					base_prob = tier_data.get("prob_oil", 0.15)
				elif res_type == world_node.TileType.GOLD:
					base_prob = tier_data.get("prob_gold", 0.50)
				elif res_type == world_node.TileType.COAL:
					base_prob = tier_data.get("prob_coal", 0.80)
				elif res_type == world_node.TileType.EMERALD:
					base_prob = tier_data.get("prob_emerald", 0.00)

				# FILTRO 3 (PROBABILIDAD):
				# Si el camión tiene 0% (ej: T1 frente a esmeralda), el bono NO aplica (sigue siendo 0%).
				if base_prob <= 0.0:
					print("[Camión %s] Sensor incapaz de penetrar este recurso (0%%)" % tier_data["badge"])
					continue

				# BONO DE ESCANEO PROFUNDO AL RETROCEDER (+15%)
				var final_prob: float = clampf(base_prob + DEEP_SCAN_BONUS, 0.0, 1.0)

				if randf() <= final_prob:
					# ¡DESCUBIERTO Y REVELADO!
					world_node.reveal_resource_at_depth(check_col, y)

					if res_type == world_node.TileType.OIL:
						return {
							"type": "OIL",
							"res_key": "OIL",
							"text": "¡Petróleo detectado! (%d%% +15%% Bono)" % int(final_prob * 100),
							"color": Color("#f39c12"),
							"depth": y,
							"column": check_col
						}
					elif world_node.MINERAL_DATA.has(res_type):
						var mdata: Dictionary = world_node.MINERAL_DATA[res_type]
						var is_emerald: bool = (res_type == world_node.TileType.EMERALD)
						var key_str: String = "COAL"
						if res_type == world_node.TileType.GOLD:
							key_str = "GOLD"
						elif res_type == world_node.TileType.EMERALD:
							key_str = "EMERALD"
						return {
							"type": mdata["name"],
							"res_key": key_str,
							"text": "¡%s hallado! (%d%% +15%% Bono)" % [mdata["name"], int(final_prob * 100)],
							"color": Color("#2ecc71") if is_emerald else Color("#f1c40f"),
							"depth": y,
							"column": check_col
						}
				else:
					print("[Camión %s] Escaneo profundo falló prob. (%d%%)" % [tier_data["badge"], int(final_prob * 100)])

	return {}
