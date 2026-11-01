class_name EncriptacionManager
extends RefCounted

## EncriptacionManager: Módulo de Encriptación Militar End-to-End (AES-256-CBC + HMAC-SHA256)
## Protege todas las solicitudes y respuestas entre el cliente de juego (Godot/Telegram) y Render.
## Bloquea adulteraciones, inyecciones y accesos directos a la base de datos.

const SECRET_KEY_STR: String = "M4xG0ldBl4ckTatacoaDesert2026Key" # 32 bytes exactos (256 bits)

static func get_key_bytes() -> PackedByteArray:
	return SECRET_KEY_STR.to_utf8_buffer()

static func hex_to_bytes(hex: String) -> PackedByteArray:
	var bytes = PackedByteArray()
	var clean = hex.strip_edges()
	bytes.resize(clean.length() / 2)
	for i in range(0, clean.length(), 2):
		bytes[i / 2] = ("0x" + clean.substr(i, 2)).hex_to_int()
	return bytes

static func pad_pkcs7(data: PackedByteArray) -> PackedByteArray:
	var pad_len = 16 - (data.size() % 16)
	var res = data.duplicate()
	for i in range(pad_len):
		res.append(pad_len)
	return res

static func unpad_pkcs7(data: PackedByteArray) -> PackedByteArray:
	if data.size() == 0 or (data.size() % 16) != 0:
		return data
	var pad_len = data[data.size() - 1]
	if pad_len < 1 or pad_len > 16 or pad_len > data.size():
		return data
	for i in range(data.size() - pad_len, data.size()):
		if data[i] != pad_len:
			return data
	return data.slice(0, data.size() - pad_len)

static func compute_hmac_sha256(key: PackedByteArray, msg: PackedByteArray) -> PackedByteArray:
	var crypto = Crypto.new()
	if crypto.has_method("hmac_digest"):
		return crypto.hmac_digest(HashingContext.HASH_SHA256, key, msg)
	# RFC 2104 HMAC implementation
	var block_size = 64
	var key_pad = key.duplicate()
	if key_pad.size() > block_size:
		var ctx = HashingContext.new()
		ctx.start(HashingContext.HASH_SHA256)
		ctx.update(key_pad)
		key_pad = ctx.finish()
	while key_pad.size() < block_size:
		key_pad.append(0)
	var o_key_pad = PackedByteArray()
	var i_key_pad = PackedByteArray()
	o_key_pad.resize(block_size)
	i_key_pad.resize(block_size)
	for i in range(block_size):
		o_key_pad[i] = key_pad[i] ^ 0x5c
		i_key_pad[i] = key_pad[i] ^ 0x36
	var ctx_inner = HashingContext.new()
	ctx_inner.start(HashingContext.HASH_SHA256)
	ctx_inner.update(i_key_pad)
	ctx_inner.update(msg)
	var inner_hash = ctx_inner.finish()
	var ctx_outer = HashingContext.new()
	ctx_outer.start(HashingContext.HASH_SHA256)
	ctx_outer.update(o_key_pad)
	ctx_outer.update(inner_hash)
	return ctx_outer.finish()

## Encripta un diccionario a un sobre seguro { payload, iv, hmac, t }
static func encrypt_payload(data_dict: Dictionary) -> Dictionary:
	var json_str = JSON.stringify(data_dict)
	var data_bytes = json_str.to_utf8_buffer()
	var key = get_key_bytes()

	# Generar IV aleatorio de 16 bytes
	var crypto = Crypto.new()
	var iv = crypto.generate_random_bytes(16)

	var padded = pad_pkcs7(data_bytes)
	var aes = AESContext.new()
	aes.start(AESContext.MODE_CBC_ENCRYPT, key, iv)
	var cipher = aes.update(padded)
	aes.finish()

	var iv_plus_cipher = iv.duplicate()
	iv_plus_cipher.append_array(cipher)
	var hmac = compute_hmac_sha256(key, iv_plus_cipher)

	return {
		"payload": cipher.hex_encode(),
		"iv": iv.hex_encode(),
		"hmac": hmac.hex_encode(),
		"t": int(Time.get_unix_time_from_system() * 1000)
	}

## Desencripta un sobre seguro recibido desde Render y verifica su autenticidad
static func decrypt_payload(envelope: Dictionary) -> Dictionary:
	if not envelope.has("payload") or not envelope.has("iv") or not envelope.has("hmac"):
		return {}

	var key = get_key_bytes()
	var iv = hex_to_bytes(envelope["iv"])
	var cipher = hex_to_bytes(envelope["payload"])
	var received_hmac = envelope["hmac"].strip_edges().to_lower()

	# 1. Verificar firma HMAC-SHA256 (Anti-tampering)
	var iv_plus_cipher = iv.duplicate()
	iv_plus_cipher.append_array(cipher)
	var calculated_hmac = compute_hmac_sha256(key, iv_plus_cipher).hex_encode().to_lower()

	if calculated_hmac != received_hmac:
		push_error("[EncriptacionManager] ALERTA DE SEGURIDAD: HMAC no coincide. Paquete interceptado o manipulado.")
		return {}

	# 2. Desencriptar AES-256-CBC
	var aes = AESContext.new()
	aes.start(AESContext.MODE_CBC_DECRYPT, key, iv)
	var decrypted_padded = aes.update(cipher)
	aes.finish()

	var unpadded = unpad_pkcs7(decrypted_padded)
	var json_str = unpadded.get_string_from_utf8()

	var json = JSON.new()
	if json.parse(json_str) == OK and json.data is Dictionary:
		return json.data

	return {}
