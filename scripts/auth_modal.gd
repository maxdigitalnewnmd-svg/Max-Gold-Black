extends Control

## AuthModal: Ventana de Autenticación Corporativa Max Gold Black
## Muestra fondo semitransparente dejando visible el desierto de la Tatacoa de fondo.
## La camioneta no sale ni avanza hasta que el usuario inicie sesión o se registre exitosamente.

signal auth_success(usuario: Dictionary)

enum AuthState {
	WELCOME,
	LOGIN,
	REGISTER,
	GOOGLE
}

const FirebaseManager = preload("res://scripts/firebase_manager.gd")

@onready var view_welcome: VBoxContainer = $AuthCard/Margin/VBox/ViewWelcome
@onready var view_login: VBoxContainer = $AuthCard/Margin/VBox/ViewLogin
@onready var view_register: VBoxContainer = $AuthCard/Margin/VBox/ViewRegister
@onready var view_google: VBoxContainer = $AuthCard/Margin/VBox/ViewGoogle

# Botones Welcome
@onready var btn_goto_login: Button = $AuthCard/Margin/VBox/ViewWelcome/BtnGoToLogin
@onready var btn_goto_register: Button = $AuthCard/Margin/VBox/ViewWelcome/BtnGoToRegister
@onready var btn_google_login: Button = $AuthCard/Margin/VBox/ViewWelcome/BtnGoogleLogin
@onready var lbl_session_alert: Label = $AuthCard/Margin/VBox/ViewWelcome/LblSessionAlert

# Campos Login
@onready var btn_back_login: Button = $AuthCard/Margin/VBox/ViewLogin/Header/BtnBackLogin
@onready var txt_login_email: LineEdit = $AuthCard/Margin/VBox/ViewLogin/TxtLoginEmail
@onready var txt_login_pass: LineEdit = $AuthCard/Margin/VBox/ViewLogin/TxtLoginPass
@onready var btn_do_login: Button = $AuthCard/Margin/VBox/ViewLogin/BtnDoLogin
@onready var lbl_status_login: Label = $AuthCard/Margin/VBox/ViewLogin/LblStatusLogin

# Campos Registro
@onready var btn_back_register: Button = $AuthCard/Margin/VBox/ViewRegister/Header/BtnBackRegister
@onready var txt_reg_user: LineEdit = $AuthCard/Margin/VBox/ViewRegister/TxtRegUser
@onready var txt_reg_email: LineEdit = $AuthCard/Margin/VBox/ViewRegister/TxtRegEmail
@onready var txt_reg_pass: LineEdit = $AuthCard/Margin/VBox/ViewRegister/TxtRegPass
@onready var txt_reg_confirm: LineEdit = $AuthCard/Margin/VBox/ViewRegister/TxtRegConfirm
@onready var btn_do_register: Button = $AuthCard/Margin/VBox/ViewRegister/BtnDoRegister
@onready var lbl_status_register: Label = $AuthCard/Margin/VBox/ViewRegister/LblStatusRegister

# Campos Google Sign-In & Fusión
@onready var btn_back_google: Button = $AuthCard/Margin/VBox/ViewGoogle/Header/BtnBackGoogle
@onready var txt_google_email: LineEdit = $AuthCard/Margin/VBox/ViewGoogle/TxtGoogleEmail
@onready var btn_do_google: Button = $AuthCard/Margin/VBox/ViewGoogle/BtnDoGoogle
@onready var lbl_status_google: Label = $AuthCard/Margin/VBox/ViewGoogle/LblStatusGoogle

var is_processing: bool = false

func _ready() -> void:
	# Conexiones Welcome
	btn_goto_login.pressed.connect(func(): _set_view(AuthState.LOGIN))
	btn_goto_register.pressed.connect(func(): _set_view(AuthState.REGISTER))
	btn_google_login.pressed.connect(func(): _set_view(AuthState.GOOGLE))

	# Conexiones Login
	btn_back_login.pressed.connect(func(): _set_view(AuthState.WELCOME))
	btn_do_login.pressed.connect(_on_btn_do_login_pressed)

	# Conexiones Registro
	btn_back_register.pressed.connect(func(): _set_view(AuthState.WELCOME))
	btn_do_register.pressed.connect(_on_btn_do_register_pressed)

	# Conexiones Google
	btn_back_google.pressed.connect(func(): _set_view(AuthState.WELCOME))
	btn_do_google.pressed.connect(_on_btn_do_google_pressed)

	_set_view(AuthState.WELCOME)

func mostrar_alerta_sesion(mensaje: String) -> void:
	if is_instance_valid(lbl_session_alert):
		lbl_session_alert.visible = true
		lbl_session_alert.text = "⚠️ " + mensaje

func _set_view(state: AuthState) -> void:
	lbl_status_login.text = ""
	lbl_status_register.text = ""
	lbl_status_google.text = ""
	is_processing = false

	view_welcome.visible = (state == AuthState.WELCOME)
	view_login.visible = (state == AuthState.LOGIN)
	view_register.visible = (state == AuthState.REGISTER)
	view_google.visible = (state == AuthState.GOOGLE)

	if state == AuthState.LOGIN:
		txt_login_pass.text = ""
		txt_login_email.grab_focus()
	elif state == AuthState.REGISTER:
		txt_reg_pass.text = ""
		txt_reg_confirm.text = ""
		txt_reg_user.grab_focus()
	elif state == AuthState.GOOGLE:
		txt_google_email.text = ""
		txt_google_email.grab_focus()
		txt_reg_pass.text = ""
		txt_reg_confirm.text = ""
		txt_reg_user.grab_focus()

func _on_btn_do_login_pressed() -> void:
	if is_processing:
		return

	var email = txt_login_email.text.strip_edges()
	var pwd = txt_login_pass.text

	if email.is_empty() or pwd.is_empty():
		_show_error(lbl_status_login, "Por favor ingrese su correo y contraseña.")
		return

	is_processing = true
	btn_do_login.disabled = true
	btn_do_login.text = "Iniciando sesión..."
	lbl_status_login.text = ""

	if FirebaseManager.instance != null:
		FirebaseManager.instance.iniciar_sesion_render(email, pwd, func(res: Dictionary):
			is_processing = false
			btn_do_login.disabled = false
			btn_do_login.text = "▶ INICIAR"

			if res.get("success", false):
				lbl_status_login.add_theme_color_override("font_color", Color(0.2, 0.95, 0.45, 1))
				lbl_status_login.text = res.get("mensaje", "¡Bienvenido!")
				var user_data = res.get("usuario", {})
				auth_success.emit(user_data)
				visible = false
			else:
				var err_msg = res.get("error", "Error al iniciar sesión.")
				_show_error(lbl_status_login, err_msg)
		)

func _on_btn_do_register_pressed() -> void:
	if is_processing:
		return

	var username = txt_reg_user.text.strip_edges()
	var email = txt_reg_email.text.strip_edges()
	var pwd = txt_reg_pass.text
	var confirm = txt_reg_confirm.text

	if email.is_empty() or pwd.is_empty() or confirm.is_empty():
		_show_error(lbl_status_register, "Todos los campos marcados son obligatorios.")
		return

	if pwd.length() < 6:
		_show_error(lbl_status_register, "La contraseña debe tener al menos 6 caracteres.")
		return

	if pwd != confirm:
		_show_error(lbl_status_register, "Las contraseñas no coinciden.")
		return

	is_processing = true
	btn_do_register.disabled = true
	btn_do_register.text = "Creando cuenta..."
	lbl_status_register.text = ""

	if FirebaseManager.instance != null:
		FirebaseManager.instance.registrarse_render(email, pwd, confirm, username, func(res: Dictionary):
			is_processing = false
			btn_do_register.disabled = false
			btn_do_register.text = "✨ REGISTRARSE"

			if res.get("success", false):
				lbl_status_register.add_theme_color_override("font_color", Color(0.2, 0.95, 0.45, 1))
				lbl_status_register.text = res.get("mensaje", "¡Cuenta creada exitosamente!")
				var user_data = res.get("usuario", {})
				auth_success.emit(user_data)
				visible = false
			else:
				var err_msg = res.get("error", "Error al crear la cuenta.")
				_show_error(lbl_status_register, err_msg)
		)

func _on_btn_do_google_pressed() -> void:
	if is_processing:
		return

	var email = txt_google_email.text.strip_edges()
	if email.is_empty() or not ("@" in email):
		_show_error(lbl_status_google, "Por favor ingrese un correo de Google válido.")
		return

	is_processing = true
	btn_do_google.disabled = true
	btn_do_google.text = "Iniciando con Google..."
	lbl_status_google.text = ""

	if FirebaseManager.instance != null:
		FirebaseManager.instance.iniciar_sesion_google(email, "", email.split("@")[0], func(res: Dictionary):
			is_processing = false
			btn_do_google.disabled = false
			btn_do_google.text = "🌐 Vincular / Acceder con Google"

			if res.get("success", false):
				lbl_status_google.add_theme_color_override("font_color", Color(0.2, 0.95, 0.45, 1))
				var msg = res.get("mensaje", "¡Acceso concedido!")
				lbl_status_google.text = msg
				var user_data = res.get("usuario", {})
				auth_success.emit(user_data)
				visible = false
			else:
				var err_msg = res.get("error", "Error al procesar el acceso con Google.")
				_show_error(lbl_status_google, err_msg)
		)

func _show_error(label: Label, text: String) -> void:
	if is_instance_valid(label):
		label.add_theme_color_override("font_color", Color(0.98, 0.35, 0.35, 1))
		label.text = "⚠️ " + text
