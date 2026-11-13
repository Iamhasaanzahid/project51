package com.meshlink.app.mesh

import android.content.Context
import android.os.Build
import android.telephony.SmsManager
import android.telephony.TelephonyManager
import android.util.Base64
import android.util.Log
import java.security.SecureRandom

/**
 * RADIO TRANSPORT — real radio, no internet.
 *
 * Uses the phone's **cellular modem (GSM/CDMA/LTE/5G radio)** via SMS as the
 * physical layer. This is the radio that every phone has. It needs no Wi-Fi,
 * no mobile data, no internet — only a SIM with SMS capability (or any
 * operator signal). Works when everything else is down.
 *
 * Payloads are already E2EE-encrypted by the caller (AES-256-GCM), then
 * URL-safe Base64 encoded and split into SMS-sized chunks. The receiver
 * reassembles and hands the decrypted-ready frame back to the mesh router.
 *
 * Wire format (one SMS per chunk):
 *
 *     ML1|<kind>|<msgId>|<index>|<total>|<base64 data>
 *
 *   kind  : F = binary mesh frame, T = UTF-8 text
 *   msgId : 8 hex chars, random per message
 *   index : 1-based chunk number
 *   total : total chunk count
 *
 * Note: a plain FM radio receiver cannot transmit data. The cellular modem is
 * the phone radio that can both send and receive, so that is what we use.
 */
object RadioTransport {

    private const val TAG = "MeshLinkRadio"
    private const val PREFIX = "ML1"
    private const val SMS_MAX_CHARS = 150
    private const val REASSEMBLY_TIMEOUT_MS = 5 * 60 * 1000L

    var onFrame: ((from: String, bytes: ByteArray) -> Unit)? = null
    var onText: ((from: String, text: String) -> Unit)? = null

    private val random = SecureRandom()
    private val assemblers = HashMap<String, Assembler>()

    private class Assembler(val total: Int) {
        val parts = arrayOfNulls<String>(total)
        var received = 0
        var updatedAt = System.currentTimeMillis()

        fun put(index: Int, data: String): Boolean {
            if (index < 1 || index > total) return false
            if (parts[index - 1] == null) {
                parts[index - 1] = data
                received++
            }
            updatedAt = System.currentTimeMillis()
            return received == total
        }

        fun join(): String = parts.joinToString(separator = "") { it ?: "" }
    }

    // ---------------------------------------------------------------- status

    fun isAvailable(context: Context): Boolean {
        val tm = context.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager
            ?: return false
        return tm.phoneType != TelephonyManager.PHONE_TYPE_NONE
    }

    fun hasSmsCapability(context: Context): Boolean {
        val tm = context.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager
            ?: return false
        return tm.phoneType != TelephonyManager.PHONE_TYPE_NONE
    }

    // ------------------------------------------------------------------ send

    /** Send one binary mesh frame over the cellular radio. */
    fun sendFrame(context: Context, destination: String, frame: ByteArray): Boolean {
        val encoded = Base64.encodeToString(
            frame,
            Base64.NO_WRAP or Base64.URL_SAFE or Base64.NO_PADDING
        )
        return sendChunked(context, destination, "F", encoded)
    }

    /** Send a UTF-8 text payload over the cellular radio. */
    fun sendText(context: Context, destination: String, text: String): Boolean {
        val encoded = Base64.encodeToString(
            text.toByteArray(Charsets.UTF_8),
            Base64.NO_WRAP or Base64.URL_SAFE or Base64.NO_PADDING
        )
        return sendChunked(context, destination, "T", encoded)
    }

    private fun sendChunked(
        context: Context,
        destination: String,
        kind: String,
        encoded: String,
    ): Boolean {
        if (destination.isBlank()) return false
        val smsManager = smsManager(context) ?: return false

        val msgId = randomHex(4) // 8 hex chars
        // Header worst case: "ML1|F|a1b2c3d4|999|999|" = 24 chars
        val headerReserve = PREFIX.length + 1 + kind.length + 1 + msgId.length + 1 + 3 + 1 + 3 + 1
        val chunkSize = (SMS_MAX_CHARS - headerReserve).coerceAtLeast(16)

        val chunks = if (encoded.isEmpty()) listOf("")
        else encoded.chunked(chunkSize)

        var ok = true
        chunks.forEachIndexed { i, data ->
            val body = "$PREFIX|$kind|$msgId|${i + 1}|${chunks.size}|$data"
            ok = ok && sendOne(smsManager, destination, body)
        }
        return ok
    }

    private fun sendOne(smsManager: SmsManager, destination: String, body: String): Boolean {
        return try {
            val parts = smsManager.divideMessage(body)
            if (parts.size <= 1) {
                smsManager.sendTextMessage(destination, null, body, null, null)
            } else {
                smsManager.sendMultipartTextMessage(destination, null, parts, null, null)
            }
            true
        } catch (t: Throwable) {
            Log.w(TAG, "SMS send failed to $destination", t)
            false
        }
    }

    // --------------------------------------------------------------- receive

    /**
     * Called by [SmsReceiver]. Returns true if the SMS belonged to MeshLink.
     */
    fun onSmsReceived(from: String, body: String): Boolean {
        if (!body.startsWith("$PREFIX|")) return false
        purgeExpired()

        val fields = body.split("|", limit = 6)
        if (fields.size < 5) return false
        val kind = fields[1]
        val msgId = fields[2]
        val index = fields[3].toIntOrNull() ?: return false
        val total = fields[4].toIntOrNull() ?: return false
        if (total <= 0 || total > 512) return false
        val data = if (fields.size >= 6) fields[5] else ""

        val key = "$from|$kind|$msgId"
        val assembler: Assembler
        synchronized(assemblers) {
            assembler = assemblers.getOrPut(key) { Assembler(total) }
        }

        val complete = synchronized(assembler) { assembler.put(index, data) }
        if (!complete) return true

        synchronized(assemblers) { assemblers.remove(key) }
        val joined = assembler.join()

        try {
            val bytes = Base64.decode(
                joined,
                Base64.NO_WRAP or Base64.URL_SAFE or Base64.NO_PADDING
            )
            when (kind) {
                "F" -> onFrame?.invoke(from, bytes)
                "T" -> onText?.invoke(from, String(bytes, Charsets.UTF_8))
            }
        } catch (t: Throwable) {
            Log.w(TAG, "Failed to decode radio payload from $from", t)
        }
        return true
    }

    private fun purgeExpired() {
        val now = System.currentTimeMillis()
        synchronized(assemblers) {
            val it = assemblers.entries.iterator()
            while (it.hasNext()) {
                if (now - it.next().value.updatedAt > REASSEMBLY_TIMEOUT_MS) it.remove()
            }
        }
    }

    // ---------------------------------------------------------------- utils

    private fun smsManager(context: Context): SmsManager? = try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            context.getSystemService(SmsManager::class.java)
        } else {
            @Suppress("DEPRECATION")
            SmsManager.getDefault()
        }
    } catch (t: Throwable) {
        Log.w(TAG, "SmsManager unavailable", t)
        null
    }

    private fun randomHex(lenBytes: Int): String {
        val b = ByteArray(lenBytes)
        random.nextBytes(b)
        val sb = StringBuilder()
        for (x in b) sb.append(String.format("%02x", x.toInt() and 0xFF))
        return sb.toString()
    }
}
