package com.meshlink.app.mesh

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.util.Log

/**
 * Receives incoming SMS on the cellular radio and hands MeshLink frames to
 * [RadioTransport]. Non-MeshLink SMS are ignored (the system still shows them
 * in the normal messaging app).
 *
 * Registered in AndroidManifest with android.permission.BROADCAST_SMS and
 * android:permission="android.permission.BROADCAST_SMS" protection.
 */
class SmsReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

        val messages = try {
            Telephony.Sms.Intents.getMessagesFromIntent(intent)
        } catch (t: Throwable) {
            Log.w(TAG, "Could not parse SMS", t)
            null
        } ?: return

        val body = StringBuilder()
        var from = ""
        for (m in messages) {
            from = m.originatingAddress ?: from
            body.append(m.messageBody ?: "")
        }
        if (from.isNotEmpty()) {
            RadioTransport.onSmsReceived(from, body.toString())
        }
    }

    companion object {
        private const val TAG = "MeshLinkSms"
    }
}
