package com.meshlink.app.api

import com.meshlink.app.BuildConfig
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class BackendApi {

    companion object {
        /**
         * Configurable at build time:
         *   ./gradlew assembleRelease -PmeshlinkApiUrl="https://your-free-host.onrender.com"
         *
         * Defaults:
         *   - debug/emulator : http://10.0.2.2:8000  (host machine from Android emulator)
         *   - release        : https://meshlink-api.onrender.com
         */
        val BASE_URL: String = BuildConfig.MESHLINK_API_URL
    }

    private fun post(path: String, body: JSONObject): String? {
        val url = URL("$BASE_URL$path")
        val connection = url.openConnection() as HttpURLConnection
        connection.requestMethod = "POST"
        connection.setRequestProperty("Content-Type", "application/json")
        connection.connectTimeout = 15000
        connection.readTimeout = 15000
        connection.doOutput = true

        connection.outputStream.use { it.write(body.toString().toByteArray()) }

        return if (connection.responseCode in 200..299) {
            connection.inputStream.bufferedReader().readText()
        } else {
            connection.errorStream?.bufferedReader()?.readText()
        }
    }

    /** Returns the raw signup JSON (contains `uin` and `pubkey_fingerprint`), or null on failure. */
    fun signup(email: String, displayName: String): String? {
        val payload = JSONObject()
            .put("email", email)
            .put("display_name", displayName)
        val response = post("/api/v1/signup", payload) ?: return null
        return try {
            if (JSONObject(response).optString("status") == "ok") response else null
        } catch (_: Exception) {
            null
        }
    }

    /** Extracts the UIN from a signup JSON response. */
    fun signupUin(email: String, displayName: String): String? =
        signup(email, displayName)?.let {
            try { JSONObject(it).optString("uin").ifBlank { null } } catch (_: Exception) { null }
        }

    fun sendEncryptedMessage(recipientUin: String, encryptedContent: String): Boolean {
        val payload = JSONObject()
            .put("recipient_uin", recipientUin)
            .put("msg_type", "text")
            .put("content_plain", encryptedContent)
        val response = post("/api/v1/message/send") ?: return false
        return try {
            JSONObject(response).optString("status") == "sent"
        } catch (_: Exception) {
            false
        }
    }
}
