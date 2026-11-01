extends Node

## GestorJuego: Administrador global de economía y estado
signal economy_changed(new_coins: int, new_cash: int)

static var instance: Node = null

# Contadores estrictamente en 0 al iniciar
static var coins: int = 0
static var cash: int = 0

func _enter_tree() -> void:
	instance = self

func _ready() -> void:
	coins = 0
	cash = 0
	instance = self
	economy_changed.emit(coins, cash)

static func add_coins(amount: int) -> void:
	coins = maxi(0, coins + amount)
	print("[GestorJuego] Monedas: +%d -> Total: %d" % [amount, coins])
	if instance != null and instance.has_signal("economy_changed"):
		instance.economy_changed.emit(coins, cash)

static func add_cash(amount: int) -> void:
	cash = maxi(0, cash + amount)
	print("[GestorJuego] Billetes: +%d -> Total: %d" % [amount, cash])
	if instance != null and instance.has_signal("economy_changed"):
		instance.economy_changed.emit(coins, cash)

static func spend_coins(amount: int) -> bool:
	if coins >= amount:
		coins -= amount
		if instance != null and instance.has_signal("economy_changed"):
			instance.economy_changed.emit(coins, cash)
		return true
	return false

static func spend_cash(amount: int) -> bool:
	if cash >= amount:
		cash -= amount
		if instance != null and instance.has_signal("economy_changed"):
			instance.economy_changed.emit(coins, cash)
		return true
	return false

static func reset_economy() -> void:
	coins = 0
	cash = 0
	if instance != null and instance.has_signal("economy_changed"):
		instance.economy_changed.emit(coins, cash)
