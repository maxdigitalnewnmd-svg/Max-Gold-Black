extends Control

## MaxDragAnim: Controlador de animación moderna para Max Drag (CFO)
## Utiliza capas de sprites de alta definición para parpadeo orgánico y sincronización labial.

const TEX_EYES_BLINK: Texture2D = preload("res://assets/max_drag_ojos_cerrados.png")
const TEX_MOUTH_TALK_1: Texture2D = preload("res://assets/max_drag_boca_habla_1.png")
const TEX_MOUTH_TALK_2: Texture2D = preload("res://assets/max_drag_boca_habla_2.png")

# Dimensiones base del retrato de Max Drag
const ART_SIZE := Vector2(896.0, 1200.0)
const EYE_RECT_ORIGINAL := Rect2(405.0, 255.0, 140.0, 60.0)
const MOUTH_RECT_ORIGINAL := Rect2(427.0, 355.0, 90.0, 50.0)

@onready var texture_rect: TextureRect = get_parent().get_node_or_null("ImgMaxDrag")

var is_speaking: bool = false
var anim_time: float = 0.0

# Parpadeo natural
var blink_timer: float = 3.0
var is_blinking: bool = false
var blink_duration: float = 0.14

# Fonemas de boca al hablar
var mouth_frame: int = 0
var mouth_timer: float = 0.0

# Asentimiento de aprobación al dar el visto bueno
var is_nodding: bool = false
var nodding_time: float = 0.0

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	blink_timer = randf_range(2.8, 4.5)

func set_speaking(speaking: bool) -> void:
	is_speaking = speaking
	if not speaking:
		mouth_frame = 0
	queue_redraw()

func trigger_approval_nod() -> void:
	is_nodding = true
	nodding_time = 0.0

func _process(delta: float) -> void:
	anim_time += delta

	# 1. Respiración ejecutiva y sutil inclinación de cabeza
	if is_instance_valid(texture_rect):
		var breath: float = sin(anim_time * 2.0) * 1.5
		var speech_tilt: float = 0.0
		if is_speaking:
			speech_tilt = sin(anim_time * 6.0) * 0.012

		var nod_y: float = 0.0
		if is_nodding:
			nodding_time += delta * 6.5
			nod_y = sin(nodding_time) * 4.0
			if nodding_time > PI * 2:
				is_nodding = false
				nod_y = 0.0

		texture_rect.position = Vector2(0.0, breath + nod_y)
		texture_rect.rotation = speech_tilt

	# 2. Control de Parpadeo
	blink_timer -= delta
	if is_blinking:
		if blink_timer <= 0.0:
			is_blinking = false
			blink_timer = randf_range(2.6, 4.8)
			queue_redraw()
	else:
		if blink_timer <= 0.0:
			is_blinking = true
			blink_timer = blink_duration
			queue_redraw()

	# 3. Control de Fonemas de Boca al Hablar
	if is_speaking:
		mouth_timer -= delta
		if mouth_timer <= 0.0:
			mouth_frame = randi_range(1, 2)
			mouth_timer = randf_range(0.08, 0.13)
			queue_redraw()
	else:
		if mouth_frame != 0:
			mouth_frame = 0
			queue_redraw()

## Transforma un rectángulo del arte original al espacio escalado en pantalla
func _get_scaled_rect(original_rect: Rect2) -> Rect2:
	var ctrl_size: Vector2 = size
	if is_instance_valid(texture_rect) and texture_rect.texture != null:
		ctrl_size = texture_rect.size

	var scale_f: float = minf(ctrl_size.x / ART_SIZE.x, ctrl_size.y / ART_SIZE.y)
	var draw_w: float = ART_SIZE.x * scale_f
	var draw_h: float = ART_SIZE.y * scale_f
	var offset_x: float = (ctrl_size.x - draw_w) * 0.5
	var offset_y: float = (ctrl_size.y - draw_h) * 0.5

	return Rect2(
		offset_x + original_rect.position.x * scale_f,
		offset_y + original_rect.position.y * scale_f,
		original_rect.size.x * scale_f,
		original_rect.size.y * scale_f
	)

func _draw() -> void:
	# A. Párpados elegantes al parpadear
	if is_blinking and TEX_EYES_BLINK != null:
		var eyes_rect: Rect2 = _get_scaled_rect(EYE_RECT_ORIGINAL)
		draw_texture_rect(TEX_EYES_BLINK, eyes_rect, false)

	# B. Boca articulada al hablar
	if is_speaking and mouth_frame > 0:
		var mouth_rect: Rect2 = _get_scaled_rect(MOUTH_RECT_ORIGINAL)
		var active_tex: Texture2D = TEX_MOUTH_TALK_1 if mouth_frame == 1 else TEX_MOUTH_TALK_2
		if active_tex != null:
			draw_texture_rect(active_tex, mouth_rect, false)
