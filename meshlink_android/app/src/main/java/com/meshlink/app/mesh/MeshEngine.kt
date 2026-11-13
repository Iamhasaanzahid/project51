package com.meshlink.app.mesh

import android.content.Context
import android.util.Log
import java.security.MessageDigest

enum class TransportType {
    /** Cellular radio via SMS — works with only a SIM, no internet. */
    RADIO_SMS,

    /** Bluetooth LE — local 2.4 GHz mesh, no SIM needed. */
    BLUETOOTH_LE,

    /** Wi-Fi Direct — higher throughput local mesh (images, voice). */
    WIFI_DIRECT,

    /** Try every available transport. */
    AUTO,
}

/**
 * MeshEngine — orchestrates all three radios and performs multi-hop routing.
 *
 * Incoming frames are deduplicated, and when they are not addressed to this
 * node they are re-broadcast with a decremented TTL (mesh relay). This is what
 * lets a message travel phone → phone → phone when no tower or hotspot exists.
 */
class MeshEngine(private val context: Context) {

    companion object {
        private const val TAG = "MeshLinkMesh"
        private const val DEDUPE_CACHE = 512
        private const val MAX_FRAME_PAYLOAD_TEXT = 80
    }

    /** Our mesh node id, derived from our UIN. */
    @Volatile
    var localNodeId: Int = 0
        private set

    /** Called when a frame addressed to us arrives. */
    var onFrameForMe: ((fromAddress: String, transport: TransportType, bytes: ByteArray) -> Unit)? = null

    /** Called when a text payload addressed to us arrives over radio. */
    var onTextForMe: ((fromAddress: String, text: String) -> Unit)? = null

    private val ble = BleTransport(context)
    private val wifi = WifiDirectTransport(context)

    private val seen = LinkedHashMap<String, Long>()
    private val seenLock = Any()

    var bleActive: Boolean = false
        private set
    var wifiActive: Boolean = false
        private set

    // ------------------------------------------------------------------ setup

    fun configure(localUin: String) {
        localNodeId = MeshFrame.nodeId16(localUin)
    }

    fun start() {
        RadioTransport.onFrame = { from, bytes -> handleIncoming(from, TransportType.RADIO_SMS, bytes) }
        RadioTransport.onText = { from, text -> onTextForMe?.invoke(from, text) }

        if (ble.isSupported) {
            runCatching { ble.start() }
                .onSuccess { bleActive = true }
                .onFailure { Log.w(TAG, "BLE start failed", it) }
        }
        ble.onFrame = { addr, bytes -> handleIncoming(addr, TransportType.BLUETOOTH_LE, bytes) }

        if (wifi.isSupported) {
            runCatching { wifi.start() }
                .onSuccess { wifiActive = true }
                .onFailure { Log.w(TAG, "Wi-Fi Direct start failed", it) }
        }
        wifi.onFrame = { addr, bytes -> handleIncoming(addr, TransportType.WIFI_DIRECT, bytes) }

        Log.i(TAG, "Mesh started (BLE=$bleActive, Wi-FiDirect=$wifiActive, Radio=available)")
    }

    fun stop() {
        ble.stop()
        wifi.stop()
        bleActive = false
        wifiActive = false
    }

    // ---------------------------------------------------------------- sending

    /**
     * Send an already-encrypted text payload. Prefers the requested transport,
     * falls back to any available radio when AUTO or unavailable.
     */
    fun sendText(destination: String, encryptedText: String, transport: TransportType = TransportType.AUTO): Boolean {
        val bytes = encryptedText.toByteArray(Charsets.UTF_8)
        // A destination that looks like a phone number goes over the cellular
        // radio. A UIN goes over BLE / Wi-Fi Direct / internet relay.
        val effective = if (transport == TransportType.AUTO && isRadioNumber(destination)) {
            TransportType.RADIO_SMS
        } else {
            transport
        }
        if (bytes.size <= MAX_FRAME_PAYLOAD_TEXT) {
            val frame = MeshFrame.Frame(
                type = MeshFrame.TYPE_MESSAGE,
                sourceNodeId = localNodeId,
                destNodeId = MeshFrame.nodeId16(destination),
                ttl = MeshFrame.DEFAULT_TTL,
                payload = bytes,
            ).serialize()
            return sendFrame(destination, frame, effective)
        }
        // Large payloads cannot fit in a BLE frame; radio SMS and Wi-Fi Direct
        // can carry them directly.
        return when (effective) {
            TransportType.RADIO_SMS -> RadioTransport.sendText(context, destination, encryptedText)
            TransportType.WIFI_DIRECT -> wifi.send(bytes)
            else -> RadioTransport.sendText(context, destination, encryptedText) || wifi.send(bytes)
        }
    }

    /** True when [destination] can be dialled/SMSed over the cellular radio. */
    fun isRadioNumber(destination: String): Boolean =
        destination.matches(Regex("^\\+?[0-9]{7,15}$"))

    fun sendFrame(destination: String, frame: ByteArray, transport: TransportType): Boolean {
        return when (transport) {
            TransportType.RADIO_SMS -> RadioTransport.sendFrame(context, destination, frame)
            TransportType.BLUETOOTH_LE -> ble.send(null, frame) > 0
            TransportType.WIFI_DIRECT -> wifi.send(frame)
            TransportType.AUTO -> {
                var sent = false
                if (RadioTransport.isAvailable(context)) {
                    sent = RadioTransport.sendFrame(context, destination, frame) || sent
                }
                if (bleActive) sent = ble.send(null, frame) > 0 || sent
                if (wifiActive) sent = wifi.send(frame) || sent
                sent
            }
        }
    }

    // --------------------------------------------------------------- receiving

    private fun handleIncoming(fromAddress: String, transport: TransportType, bytes: ByteArray) {
        val frame = MeshFrame.deserialize(bytes) ?: return
        val hash = MessageDigest.getInstance("SHA-256").digest(bytes)
            .joinToString("") { "%02x".format(it) }

        synchronized(seenLock) {
            if (seen.containsKey(hash)) return
            seen[hash] = System.currentTimeMillis()
            if (seen.size > DEDUPE_CACHE) {
                val it = seen.entries.iterator()
                if (it.hasNext()) { it.next(); it.remove() }
            }
        }

        when {
            frame.destNodeId == localNodeId -> {
                onFrameForMe?.invoke(fromAddress, transport, frame.payload)
            }
            frame.ttl > 1 -> {
                val relayed = MeshFrame.Frame(
                    type = frame.type,
                    sourceNodeId = frame.sourceNodeId,
                    destNodeId = frame.destNodeId,
                    ttl = frame.ttl - 1,
                    payload = frame.payload,
                ).serialize()
                // Flood relay to neighbours on the same radio family.
                when (transport) {
                    TransportType.BLUETOOTH_LE -> ble.send(null, relayed)
                    TransportType.WIFI_DIRECT -> wifi.send(relayed)
                    TransportType.RADIO_SMS -> { /* SMS is already point-to-point */ }
                    TransportType.AUTO -> { }
                }
            }
        }
    }

    // ------------------------------------------------------------------ status

    fun status(): Map<String, Any> = mapOf(
        "radioSmsAvailable" to RadioTransport.isAvailable(context),
        "bluetoothLeActive" to bleActive,
        "wifiDirectActive" to wifiActive,
        "blePeers" to ble.connectedPeerCount,
        "localNodeId" to localNodeId,
    )
}
