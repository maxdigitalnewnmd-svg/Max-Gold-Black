extends RefCounted

## IAEmpresarial: Protocolo de Inteligencia y Gobernanza de 'Max Gold Black'
## Regula la separación estricta de funciones entre Franklin Martínez y Max Drag.
## Diálogos totalmente naturales para el jugador sin mencionar bases de datos ni tecnología interna.

const FirebaseManager = preload("res://scripts/firebase_manager.gd")

const DICTAMEN_APROBADO: String = "APROBADO"
const DICTAMEN_FALTA_LIQUIDEZ: String = "FALTA_LIQUIDEZ"
const DICTAMEN_LIMITE_EXCEDIDO: String = "LIMITE_EXCEDIDO"
const DICTAMEN_PRECIO_ALTERADO: String = "PRECIO_ALTERADO"
const DICTAMEN_ROL_NO_AUTORIZADO: String = "ROL_NO_AUTORIZADO"

const MAX_MONTO_POR_ORDEN: int = 50000

## Franklin genera la solicitud comercial internamente sin tecnicismos
static func franklin_generar_solicitud(mineral_key: String, precio_propuesto: int, jugador_id: String) -> Dictionary:
	var mineral_upper = mineral_key.to_upper()
	var timestamp = Time.get_unix_time_from_system()
	
	return {
		"solicitante": "Franklin Martínez",
		"cargo_solicitante": "Distribuidor de Campo",
		"mineral": mineral_upper,
		"precio_cotizado": precio_propuesto,
		"jugador_id": jugador_id,
		"timestamp": timestamp,
		"estado": "PENDIENTE_VISTO_BUENO",
		"id_solicitud": "REQ_%d_%s" % [timestamp, mineral_upper]
	}

## Max Drag audita internamente con IA y emite su dictamen con lenguaje corporativo natural
static func max_drag_auditar_y_dictaminar(solicitud: Dictionary) -> Dictionary:
	var mineral: String = solicitud.get("mineral", "")
	var precio_cotizado: int = solicitud.get("precio_cotizado", 0)
	var solicitante: String = solicitud.get("solicitante", "")
	var username: String = FirebaseManager.get_user_display_name() if FirebaseManager != null else "Minero"

	# Validación 1: Separación de cargos
	if solicitante != "Franklin Martínez":
		return {
			"aprobado": false,
			"codigo": DICTAMEN_ROL_NO_AUTORIZADO,
			"mensaje_dialogo": "Disculpe, esta orden no ha sido tramitada por los canales autorizados.",
			"requiere_ceo": false
		}

	# Validación 2: Límite de cargo
	if precio_cotizado <= 0 or precio_cotizado > MAX_MONTO_POR_ORDEN:
		return {
			"aprobado": false,
			"codigo": DICTAMEN_LIMITE_EXCEDIDO,
			"mensaje_dialogo": "El valor del cargamento supera el límite operativo autorizado.",
			"requiere_ceo": true
		}

	# Validación 3: Concordancia con cotización oficial
	if FirebaseManager.instance != null:
		var precio_oficial: int = FirebaseManager.instance.get_precio_actual(mineral)
		if abs(precio_cotizado - precio_oficial) > 2:
			return {
				"aprobado": false,
				"codigo": DICTAMEN_PRECIO_ALTERADO,
				"mensaje_dialogo": "Disculpe, la cotización de este mineral ha variado. Debemos recalcular.",
				"requiere_ceo": false
			}

	# Validación 4: Verificación estricta de Liquidez en Tesorería
	if FirebaseManager.instance != null:
		var hay_liquidez: bool = FirebaseManager.instance.tiene_liquidez(mineral, precio_cotizado)
		if not hay_liquidez:
			return {
				"aprobado": false,
				"codigo": DICTAMEN_FALTA_LIQUIDEZ,
				"mensaje_dialogo": "Lo siento %s, no tenemos suficiente liquidez en la empresa. Esperemos que el CEO invierta." % username,
				"requiere_ceo": true
			}

	# Aprobación: Lenguaje natural y elegante
	return {
		"aprobado": true,
		"codigo": DICTAMEN_APROBADO,
		"mensaje_dialogo": "He revisado tu cargamento y las cuentas de la empresa. Todo está en orden. Tienes mi visto bueno para recibir tus $%d monedas." % precio_cotizado,
		"requiere_ceo": false
	}
