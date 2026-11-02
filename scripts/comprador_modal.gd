extends Control

const GestorJuego = preload("res://scripts/gestor_juego.gd")
const FirebaseManager = preload("res://scripts/firebase_manager.gd")
const IAEmpresarial = preload("res://scripts/ia_empresarial.gd")

## Modal de Transacciones: Franklin Martínez & Max Drag (CFO)
## Diálogos 100% inmersivos y naturales para el jugador sin tecnicismos
signal sold_and_resumed(resource_type: String, earned_coins: int)

enum FaseModal {
	FRANKLIN_COTIZACION,
	MAX_DRAG_APROBADO,
	MAX_DRAG_RECHAZADO,
	CERRANDO_SIN_ACUERDO
}

const RESOURCE_BUYER_CONFIG: Dictionary = {
	"COAL": {
		"mineral_name": "carbón",
		"image": "res://assets/comprador_carbon.png",
		"bonus_cash": 0
	},
	"GOLD": {
		"mineral_name": "oro",
		"image": "res://assets/comprador_oro.png",
		"bonus_cash": 0
	},
	"EMERALD": {
		"mineral_name": "esmeraldas",
		"image": "res://assets/comprador_esmeralda.png",
		"bonus_cash": 0
	}
}

# Referencias de UI
@onready var img_buyer: TextureRect = $MainCard/Margin/VBox/BuyerFrame/ImgBuyer
@onready var personaje_anim: Control = $MainCard/Margin/VBox/BuyerFrame/PersonajeAnim
@onready var img_max_drag: TextureRect = $MainCard/Margin/VBox/BuyerFrame/ImgMaxDrag
@onready var max_drag_anim: Control = $MainCard/Margin/VBox/BuyerFrame/MaxDragAnim
@onready var lbl_stamp: Label = $MainCard/Margin/VBox/BuyerFrame/StampContainer/LblStamp

@onready var speaker_tag: Label = $MainCard/Margin/VBox/DialogueBox/Margin/VBox/SpeakerTag
@onready var lbl_dialogo: Label = $MainCard/Margin/VBox/DialogueBox/Margin/VBox/LblDialogo
@onready var btn_vender: Button = $MainCard/Margin/VBox/ActionsContainer/BtnVender
@onready var btn_cancelar: Button = $MainCard/Margin/VBox/ActionsContainer/BtnCancelar

var current_res_key: String = "COAL"
var mineral_name: String = "carbón"
var current_price: int = 30
var bonus_cash: int = 0
var fase_actual: FaseModal = FaseModal.FRANKLIN_COTIZACION
var solicitud_actual: Dictionary = {}
var dictamen_actual: Dictionary = {}
var token_visto_bueno: String = ""

# Minería Offline y Franklin General
var is_offline_mode: bool = false
var offline_ticket: String = ""
var offline_total_pago: int = 0

# Variables del Efecto Máquina de Escribir (Typewriter)
var target_dialogue_text: String = ""
var typewriter_chars: float = 0.0
var typewriter_speed: float = 38.0
var is_typing: bool = false
var close_timer: float = 0.0

func _ready() -> void:
	visible = false
	btn_vender.pressed.connect(_on_btn_principal_pressed)
	btn_cancelar.pressed.connect(_on_btn_cancelar_pressed)
	
	if FirebaseManager.instance != null:
		FirebaseManager.instance.market_prices_updated.connect(_on_market_prices_updated_from_firebase)

func open_for_resource(resource_key: String) -> void:
	var key: String = resource_key.to_upper()
	if not RESOURCE_BUYER_CONFIG.has(key):
		if "CARB" in key:
			key = "COAL"
		elif "ORO" in key:
			key = "GOLD"
		elif "ESMERALDA" in key:
			key = "EMERALD"
		else:
			key = "COAL"

	current_res_key = key
	var cfg: Dictionary = RESOURCE_BUYER_CONFIG[current_res_key]
	mineral_name = cfg["mineral_name"]
	bonus_cash = cfg.get("bonus_cash", 0)

	# 1. Consultar cotización actual
	if FirebaseManager.instance != null:
		FirebaseManager.instance.consultar_precios_y_boveda()
		current_price = FirebaseManager.instance.get_precio_actual(current_res_key)

	# 2. Cargar textura de Franklin
	if ResourceLoader.exists(cfg["image"]):
		img_buyer.texture = load(cfg["image"])

	# 3. Iniciar con Franklin: Doble Verificación con Render
	fase_actual = FaseModal.FRANKLIN_COTIZACION
	close_timer = 0.0
	_mostrar_vista_franklin()

	btn_vender.disabled = true
	btn_vender.text = "Consultando..."
	target_dialogue_text = "Franklin Martínez: Un momento por favor... Verificando tu cargamento de %s..." % mineral_name
	_iniciar_escritura_dialogo()
	visible = true

	# PASO 2: DOBLE VERIFICACIÓN DE FRANKLIN
	if FirebaseManager.instance != null:
		FirebaseManager.instance.franklin_verificar_mineral(current_res_key, _on_franklin_verificacion_recibida)
	else:
		_evaluar_auditoria_fallback()

func _on_franklin_verificacion_recibida(res: Dictionary) -> void:
	if res.get("verificado", false):
		token_visto_bueno = res.get("ticket_franklin", "")
		current_price = int(res.get("precio_unitario", current_price))
		var stock = res.get("stock_en_bd", 1)
		var m_nom = res.get("mineral_nombre", mineral_name)
		
		target_dialogue_text = "Franklin Martínez: ¡Excelente! Tienes %d saco(s) de %s en tu inventario. Te ofrezco $%d Dragcoins por el cargamento." % [stock, m_nom, current_price]
		btn_vender.disabled = false
		btn_vender.text = "✔ Vender ($%d)" % current_price
	else:
		token_visto_bueno = ""
		target_dialogue_text = res.get("error", "Franklin Martínez: Veo que no tienes este mineral disponible en este momento.")
		btn_vender.disabled = true
		btn_vender.text = "✖ Mineral No Poseído"
		lbl_stamp.visible = true
		lbl_stamp.text = "✖ INVENTARIO EN CERO"
		lbl_stamp.add_theme_color_override("font_color", Color(0.95, 0.3, 0.3, 1))

	_iniciar_escritura_dialogo()
	_actualizar_botones()

func _mostrar_vista_franklin() -> void:
	img_buyer.visible = true
	personaje_anim.visible = true
	img_max_drag.visible = false
	max_drag_anim.visible = false
	lbl_stamp.visible = false
	speaker_tag.text = "🗣️ Franklin Martínez (Distribuidor)"

func _mostrar_vista_max_drag() -> void:
	img_buyer.visible = false
	personaje_anim.visible = false
	img_max_drag.visible = true
	max_drag_anim.visible = true
	speaker_tag.text = "📋 Max Drag (Directora Financiera - CFO)"

func _iniciar_escritura_dialogo() -> void:
	typewriter_chars = 0.0
	is_typing = true
	lbl_dialogo.text = ""

	if fase_actual == FaseModal.FRANKLIN_COTIZACION or fase_actual == FaseModal.CERRANDO_SIN_ACUERDO:
		if is_instance_valid(personaje_anim):
			personaje_anim.set_speaking(true)
		if is_instance_valid(max_drag_anim):
			max_drag_anim.set_speaking(false)
	else:
		if is_instance_valid(personaje_anim):
			personaje_anim.set_speaking(false)
		if is_instance_valid(max_drag_anim):
			max_drag_anim.set_speaking(true)

func _process(delta: float) -> void:
	if not visible:
		return

	# Control de cierre con mensaje de despedida
	if fase_actual == FaseModal.CERRANDO_SIN_ACUERDO:
		if close_timer > 0.0:
			close_timer -= delta
			if close_timer <= 0.0:
				_cerrar_definitivamente(0)
				return

	# Efecto máquina de escribir
	if is_typing:
		typewriter_chars += typewriter_speed * delta
		var char_count: int = mini(int(typewriter_chars), target_dialogue_text.length())
		lbl_dialogo.text = target_dialogue_text.substr(0, char_count)

		if char_count >= target_dialogue_text.length():
			is_typing = false
			if is_instance_valid(personaje_anim):
				personaje_anim.set_speaking(false)
			if is_instance_valid(max_drag_anim):
				max_drag_anim.set_speaking(false)

## Modal Especial: Franklin General para liquidación masiva de minería offline
func open_for_offline_general(offline_data: Dictionary) -> void:
	is_offline_mode = true
	offline_ticket = str(offline_data.get("ticket_franklin_general", ""))
	offline_total_pago = int(offline_data.get("total_cotizado", 0))

	var minerales = offline_data.get("minerales", {})
	var c_qty = int(minerales.get("carbon", 0))
	var o_qty = int(minerales.get("oro", 0))
	var e_qty = int(minerales.get("esmeralda", 0))
	var seg = str(offline_data.get("tierra_segmento", "TR0000"))

	close_timer = 0.0
	_mostrar_vista_franklin()

	speaker_tag.text = "🏛️ Franklin General (Comprador de Minerales)"
	target_dialogue_text = "Franklin General: ¡Bienvenido de vuelta! Durante tu ausencia tu flota de exploración extrajo:\n• %d Carbón | • %d Oro | • %d Esmeraldas\n\nTotal a pagar por todo el cargamento: %d Dragcoins.\n¿Deseas vender los 3 minerales juntos ahora?" % [c_qty, o_qty, e_qty, offline_total_pago]

	btn_vender.disabled = false
	btn_vender.text = "💰 Vender Todo (%d Dragcoins)" % offline_total_pago
	if is_instance_valid(btn_cancelar):
		btn_cancelar.text = "Guardar en Inventario"

	fase_actual = FaseModal.FRANKLIN_COTIZACION
	_iniciar_escritura_dialogo()
	visible = true

func _ejecutar_cierre_offline_max_drag() -> void:
	_mostrar_vista_max_drag()
	btn_vender.disabled = true
	btn_vender.text = "Procesando venta..."
	target_dialogue_text = "Max Drag (CFO): Revisando la liquidación del cargamento..."
	_iniciar_escritura_dialogo()

	if FirebaseManager.instance != null:
		FirebaseManager.instance.franklin_vender_todo_offline(offline_ticket, func(res: Dictionary):
			if res.get("success", false) and res.get("aprobado", false):
				fase_actual = FaseModal.MAX_DRAG_APROBADO
				lbl_stamp.visible = true
				lbl_stamp.text = "✔ VISTO BUENO: VENTA TOTAL"
				lbl_stamp.add_theme_color_override("font_color", Color(0.2, 0.95, 0.45, 1))
				if is_instance_valid(max_drag_anim):
					max_drag_anim.trigger_approval_nod()
				var pagado = int(res.get("monto_pagado", offline_total_pago))
				target_dialogue_text = "Max Drag (CFO): ¡Venta aprobada! Has recibido +%d Dragcoins. Al acumular 100 monedas, las convertiremos en 1 Billete." % pagado
				GestorJuego.add_coins(pagado)
				btn_vender.disabled = false
				btn_vender.text = "✔ Finalizar y Continuar"
			else:
				fase_actual = FaseModal.MAX_DRAG_RECHAZADO
				lbl_stamp.visible = true
				lbl_stamp.text = "✖ OPERACIÓN NO DISPONIBLE"
				lbl_stamp.add_theme_color_override("font_color", Color(0.95, 0.3, 0.3, 1))
				target_dialogue_text = res.get("error", "Max Drag: La liquidación no pudo ser completada en este momento.")
				btn_vender.disabled = false
				btn_vender.text = "✖ Entendido"
			_iniciar_escritura_dialogo()
		)

func _on_btn_principal_pressed() -> void:
	if is_offline_mode:
		if fase_actual == FaseModal.FRANKLIN_COTIZACION:
			_ejecutar_cierre_offline_max_drag()
		elif fase_actual == FaseModal.MAX_DRAG_APROBADO or fase_actual == FaseModal.MAX_DRAG_RECHAZADO:
			is_offline_mode = false
			_cerrar_definitivamente(offline_total_pago if fase_actual == FaseModal.MAX_DRAG_APROBADO else 0)
		return

	if fase_actual == FaseModal.FRANKLIN_COTIZACION:
		_ejecutar_cierre_venta_max_drag()
	elif fase_actual == FaseModal.MAX_DRAG_APROBADO or fase_actual == FaseModal.MAX_DRAG_RECHAZADO:
		_cerrar_definitivamente(current_price if fase_actual == FaseModal.MAX_DRAG_APROBADO else 0)

## PASO 3 Y 4: VISTO BUENO DE MAX DRAG Y REGLA ESTRICTA DE OPERACIONES ATÓMICAS
func _ejecutar_cierre_venta_max_drag() -> void:
	_mostrar_vista_max_drag()
	btn_vender.disabled = true
	btn_vender.text = "Verificando venta..."
	target_dialogue_text = "Max Drag (CFO): Revisando la disponibilidad para la compra..."
	_iniciar_escritura_dialogo()

	if FirebaseManager.instance != null:
		FirebaseManager.instance.max_drag_cerrar_venta(current_res_key, token_visto_bueno, _on_max_drag_cierre_recibido)
	else:
		_evaluar_auditoria_fallback()

func _on_max_drag_cierre_recibido(res: Dictionary) -> void:
	if res.get("success", false) and res.get("aprobado", false):
		var monto_ganado = int(res.get("monto_pagado", current_price))
		fase_actual = FaseModal.MAX_DRAG_APROBADO
		lbl_stamp.visible = true
		lbl_stamp.text = "✔ VISTO BUENO: MAX DRAG"
		lbl_stamp.add_theme_color_override("font_color", Color(0.2, 0.95, 0.45, 1))

		if is_instance_valid(max_drag_anim):
			max_drag_anim.trigger_approval_nod()

		target_dialogue_text = res.get("mensaje", "¡Venta completada con éxito! Has recibido +%d Dragcoins. Al acumular 100, se convertirán en 1 Billete." % monto_ganado)
		GestorJuego.add_coins(monto_ganado)
		btn_vender.disabled = false
		btn_vender.text = "✔ Finalizar y Continuar"
	else:
		token_visto_bueno = ""
		fase_actual = FaseModal.MAX_DRAG_RECHAZADO
		lbl_stamp.visible = true
		lbl_stamp.text = "✖ FONDOS NO DISPONIBLES"
		lbl_stamp.add_theme_color_override("font_color", Color(0.95, 0.3, 0.3, 1))
		target_dialogue_text = res.get("error", "Max Drag: La bóveda se encuentra en proceso de recarga. Tus recursos están intactos y no se ha descontado nada.")
		btn_vender.disabled = false
		btn_vender.text = "✖ Entendido"

	_iniciar_escritura_dialogo()

func _evaluar_auditoria_fallback() -> void:
	dictamen_actual = IAEmpresarial.max_drag_auditar_y_dictaminar(solicitud_actual)
	if dictamen_actual.get("aprobado", false):
		fase_actual = FaseModal.MAX_DRAG_APROBADO
		lbl_stamp.visible = true
		lbl_stamp.text = "✔ VISTO BUENO: MAX DRAG"
		lbl_stamp.add_theme_color_override("font_color", Color(0.2, 0.95, 0.45, 1))
		if is_instance_valid(max_drag_anim):
			max_drag_anim.trigger_approval_nod()
		target_dialogue_text = "He revisado tu cargamento y las cuentas de la empresa. Todo está en orden. Tienes mi visto bueno para recibir tus $%d monedas." % current_price
	else:
		fase_actual = FaseModal.MAX_DRAG_RECHAZADO
		lbl_stamp.visible = true
		lbl_stamp.text = "✖ SIN LIQUIDEZ: CONTACTAR AL CEO"
		lbl_stamp.add_theme_color_override("font_color", Color(0.95, 0.3, 0.3, 1))
		target_dialogue_text = dictamen_actual.get("mensaje_dialogo", "Lo siento, la operación no puede realizarse en este momento.")

	_iniciar_escritura_dialogo()
	_actualizar_botones()

## Desembolsa las monedas y liquida criptográficamente con Render
func _completar_cobro_liquidacion() -> void:
	if is_instance_valid(max_drag_anim):
		max_drag_anim.set_speaking(false)

	btn_vender.disabled = true
	btn_vender.text = "Liquidando en Bóveda..."

	if not token_visto_bueno.is_empty() and FirebaseManager.instance != null:
		FirebaseManager.instance.liquidar_transaccion_render(token_visto_bueno, func(res: Dictionary):
			if res.get("success", false):
				var monto_ganado = int(res.get("monto_liquidado", current_price))
				GestorJuego.add_coins(monto_ganado)
				if bonus_cash > 0:
					GestorJuego.add_cash(bonus_cash)
				_cerrar_definitivamente(monto_ganado)
			else:
				_completar_cobro_fallback()
		)
	else:
		_completar_cobro_fallback()

func _completar_cobro_fallback() -> void:
	var exito_boveda: bool = true
	if FirebaseManager.instance != null:
		exito_boveda = FirebaseManager.instance.descontar_de_boveda(current_res_key, current_price)

	if not exito_boveda:
		fase_actual = FaseModal.MAX_DRAG_RECHAZADO
		var username = FirebaseManager.get_user_display_name() if FirebaseManager != null else "Minero"
		target_dialogue_text = "Lo siento %s, no tenemos suficiente liquidez en la empresa. Esperemos que el CEO invierta." % username
		_iniciar_escritura_dialogo()
		_actualizar_botones()
		return

	GestorJuego.add_coins(current_price)
	if bonus_cash > 0:
		GestorJuego.add_cash(bonus_cash)

	_cerrar_definitivamente(current_price)

func _actualizar_botones() -> void:
	if not is_instance_valid(btn_vender):
		return

	match fase_actual:
		FaseModal.FRANKLIN_COTIZACION:
			btn_vender.disabled = false
			btn_vender.text = "📋 Solicitar Visto Bueno ($%d)" % current_price
			btn_cancelar.disabled = false
		FaseModal.MAX_DRAG_APROBADO:
			btn_vender.disabled = false
			btn_vender.text = "✔ Cobrar Liquidación ($%d)" % current_price
			btn_cancelar.disabled = false
		FaseModal.MAX_DRAG_RECHAZADO:
			btn_vender.disabled = true
			btn_vender.text = "🚫 Sin Liquidez - Esperando al CEO"
			btn_cancelar.disabled = false
		FaseModal.CERRANDO_SIN_ACUERDO:
			btn_vender.disabled = true
			btn_cancelar.disabled = true

	if is_instance_valid(btn_cancelar):
		btn_cancelar.text = "✖ Cancelar"

## Notificación en vivo si el precio cambia mientras la ventana está abierta
func _on_market_prices_updated_from_firebase(precios: Dictionary, _boveda: Dictionary) -> void:
	if not visible or fase_actual == FaseModal.CERRANDO_SIN_ACUERDO:
		return
	
	var nuevo_precio: int = precios.get(current_res_key, current_price)
	if nuevo_precio != current_price:
		current_price = nuevo_precio
		if fase_actual == FaseModal.FRANKLIN_COTIZACION:
			var player_id = FirebaseManager.instance.player_id if FirebaseManager.instance != null else "jugador_1"
			solicitud_actual = IAEmpresarial.franklin_generar_solicitud(current_res_key, current_price, player_id)
			target_dialogue_text = "Atención: el costo de %s se ha ajustado a $%d por saco. Procederé con la solicitud formal." % [mineral_name, current_price]
			if not is_typing:
				lbl_dialogo.text = target_dialogue_text
			_actualizar_botones()

## Si el usuario cancela o no hay acuerdo: "Disculpe, no podemos llegar a un acuerdo" y se cierra
func _on_btn_cancelar_pressed() -> void:
	if is_offline_mode:
		is_offline_mode = false
		target_dialogue_text = "Franklin General: De acuerdo. Los minerales extraídos han quedado registrados y guardados en tu inventario."
		_iniciar_escritura_dialogo()
		fase_actual = FaseModal.CERRANDO_SIN_ACUERDO
		close_timer = 1.3
		return

	if fase_actual == FaseModal.CERRANDO_SIN_ACUERDO:
		return

	fase_actual = FaseModal.CERRANDO_SIN_ACUERDO
	_mostrar_vista_franklin()
	target_dialogue_text = "Disculpe, no podemos llegar a un acuerdo."
	_iniciar_escritura_dialogo()
	_actualizar_botones()
	
	# Esperar 1.3 segundos para que el usuario lea el mensaje y cerrar automáticamente
	close_timer = 1.3

func _cerrar_definitivamente(earned_coins: int) -> void:
	if is_instance_valid(personaje_anim):
		personaje_anim.set_speaking(false)
	if is_instance_valid(max_drag_anim):
		max_drag_anim.set_speaking(false)

	visible = false
	sold_and_resumed.emit(current_res_key, earned_coins)
