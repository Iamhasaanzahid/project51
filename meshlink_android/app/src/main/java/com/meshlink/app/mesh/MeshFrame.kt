package com.meshlink.app.mesh

import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.MessageDigest

/**
 * Binary mesh frame — byte-for-byte compatible with the Python backend
 * (meshlink_app/mesh.py → MeshFrame.serialize()).
 *
 * Layout:
 *   [0..3]   magic "MESH"
 *   [4]      version (1)
 *   [5]      frame type
 *   [6..7]   source node id (16-bit, big endian)
 *   [8..9]   destination node id (16-bit, big endian)
 *   [10]     ttl
 *   [11]     payload length (0..96)
 *   [12..]   payload
 */
object MeshFrame {

    val MAGIC = byteArrayOf('M'.code.toByte(), 'E'.code.toByte(), 'S'.code.toByte(), 'H'.code.toByte())
    const val VERSION: Byte = 1
    const val HEADER_SIZE = 12
    const val MAX_PAYLOAD = 96

    const val TYPE_MESSAGE: Byte = 0x01
    const val TYPE_PING: Byte = 0x02
    const val TYPE_DISCOVERY: Byte = 0x03
    const val TYPE_ACK: Byte = 0x04

    const val DEFAULT_TTL = 5

    data class Frame(
        val type: Byte,
        val sourceNodeId: Int,
        val destNodeId: Int,
        val ttl: Int,
        val payload: ByteArray,
    ) {
        fun serialize(): ByteArray {
            require(payload.size <= MeshFrame.MAX_PAYLOAD) { "Payload too large: ${payload.size}" }
            val buf = ByteBuffer.allocate(MeshFrame.HEADER_SIZE + payload.size).order(ByteOrder.BIG_ENDIAN)
            buf.put(MeshFrame.MAGIC)
            buf.put(MeshFrame.VERSION)
            buf.put(type)
            buf.putShort((sourceNodeId and 0xFFFF).toShort())
            buf.putShort((destNodeId and 0xFFFF).toShort())
            buf.put(ttl.toByte())
            buf.put(payload.size.toByte())
            buf.put(payload)
            return buf.array()
        }
    }

    fun deserialize(data: ByteArray): Frame? {
        if (data.size < HEADER_SIZE) return null
        for (i in MAGIC.indices) if (data[i] != MAGIC[i]) return null
        val buf = ByteBuffer.wrap(data).order(ByteOrder.BIG_ENDIAN)
        buf.position(4)
        val version = buf.get()
        if (version.toInt() != VERSION.toInt()) return null
        val type = buf.get()
        val src = buf.short.toInt() and 0xFFFF
        val dst = buf.short.toInt() and 0xFFFF
        val ttl = buf.get().toInt() and 0xFF
        val len = buf.get().toInt() and 0xFF
        if (len > MAX_PAYLOAD || data.size < HEADER_SIZE + len) return null
        val payload = ByteArray(len)
        buf.get(payload)
        return Frame(type, src, dst, ttl, payload)
    }

    /** Stable 16-bit node id derived from any string id (UIN, key fingerprint, etc.). */
    fun nodeId16(id: String): Int {
        val digest = MessageDigest.getInstance("SHA-256").digest(id.toByteArray(Charsets.UTF_8))
        return ((digest[0].toInt() and 0xFF) shl 8) or (digest[1].toInt() and 0xFF)
    }
}
