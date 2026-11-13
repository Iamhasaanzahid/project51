package com.meshlink.app.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.meshlink.app.MainActivity
import com.meshlink.app.R
import com.meshlink.app.mesh.MeshEngine
import com.meshlink.app.mesh.TransportType

/**
 * Foreground service that keeps every radio alive while the app is in the
 * background: cellular radio (SMS), Bluetooth LE, and Wi-Fi Direct.
 */
class MeshService : Service() {

    companion object {
        private const val CHANNEL_ID = "meshlink_mesh"
        private const val NOTIFICATION_ID = 1001

        const val ACTION_START = "com.meshlink.app.START_MESH"
        const val ACTION_STOP = "com.meshlink.app.STOP_MESH"
        const val ACTION_SEND_RADIO = "com.meshlink.app.SEND_RADIO"
        const val EXTRA_UIN = "uin"
        const val EXTRA_DESTINATION = "destination"
        const val EXTRA_TEXT = "text"

        @Volatile
        var engine: MeshEngine? = null
            private set
    }

    override fun onCreate() {
        super.onCreate()
        createChannel()
        val mesh = MeshEngine(applicationContext)
        engine = mesh
        mesh.start()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                engine?.stop()
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
                return START_NOT_STICKY
            }
            ACTION_SEND_RADIO -> {
                val destination = intent.getStringExtra(EXTRA_DESTINATION)
                val text = intent.getStringExtra(EXTRA_TEXT)
                if (!destination.isNullOrBlank() && text != null) {
                    engine?.sendText(destination, text, TransportType.RADIO_SMS)
                }
            }
            else -> {
                intent?.getStringExtra(EXTRA_UIN)?.let { engine?.configure(it) }
            }
        }

        startForeground(NOTIFICATION_ID, buildNotification())
        return START_STICKY
    }

    override fun onDestroy() {
        engine?.stop()
        engine = null
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                getString(R.string.mesh_channel_name),
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = getString(R.string.mesh_channel_description)
                setShowBadge(false)
            }
            getSystemService(NotificationManager::class.java)?.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(): Notification {
        val openApp = android.app.PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            android.app.PendingIntent.FLAG_IMMUTABLE or android.app.PendingIntent.FLAG_UPDATE_CURRENT,
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(getString(R.string.mesh_notification_title))
            .setContentText(getString(R.string.mesh_notification_text))
            .setSmallIcon(R.drawable.ic_meshlink_notification)
            .setOngoing(true)
            .setContentIntent(openApp)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }
}

/** Convenience starter used by the UI. */
fun startMeshService(context: Context, uin: String?) {
    val intent = Intent(context, MeshService::class.java).apply {
        action = MeshService.ACTION_START
        putExtra(MeshService.EXTRA_UIN, uin)
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
    } else {
        context.startService(intent)
    }
}
