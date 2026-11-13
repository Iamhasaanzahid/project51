package com.meshlink.app.mesh

import android.annotation.SuppressLint
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.wifi.p2p.WifiP2pConfig
import android.net.wifi.p2p.WifiP2pDevice
import android.net.wifi.p2p.WifiP2pInfo
import android.net.wifi.p2p.WifiP2pManager
import android.os.Looper
import android.util.Log
import java.io.DataInputStream
import java.io.DataOutputStream
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import kotlin.concurrent.thread

/**
 * WI-FI DIRECT TRANSPORT — 2.4/5 GHz radio, no internet, no router.
 *
 * Uses Wi-Fi Direct (P2P) to form an ad-hoc group between phones and exchanges
 * encrypted mesh frames over a TCP socket on the group. Works completely
 * offline and has longer range + higher throughput than BLE (good for images
 * and voice notes).
 */
@SuppressLint("MissingPermission")
class WifiDirectTransport(private val context: Context) {

    companion object {
        private const val TAG = "MeshLinkWifiDirect"
        const val PORT = 8988
    }

    var onFrame: ((peerAddress: String, bytes: ByteArray) -> Unit)? = null
    var onPeersChanged: ((List<String>) -> Unit)? = null

    private val manager: WifiP2pManager? =
        context.getSystemService(Context.WIFI_P2P_SERVICE) as? WifiP2pManager

    private var channel: WifiP2pManager.Channel? = null
    private var receiver: BroadcastReceiver? = null
    private var serverSocket: ServerSocket? = null
    private val peers = LinkedHashMap<String, WifiP2pDevice>()

    val isSupported: Boolean get() = manager != null

    fun start() {
        val m = manager ?: return
        channel = m.initialize(context, Looper.getMainLooper()) { }
        registerReceiver()
        startServer()
        discover()
    }

    fun stop() {
        runCatching { receiver?.let { context.unregisterReceiver(it) } }
        receiver = null
        runCatching { serverSocket?.close() }
        serverSocket = null
        runCatching { channel?.let { manager?.stopPeerDiscovery(it, null) } }
    }

    // -------------------------------------------------------------- discovery

    fun discover() {
        val m = manager ?: return
        val c = channel ?: return
        m.discoverPeers(c, object : WifiP2pManager.ActionListener {
            override fun onSuccess() { Log.i(TAG, "peer discovery started") }
            override fun onFailure(reason: Int) { Log.w(TAG, "peer discovery failed: $reason") }
        })
    }

    fun connect(device: WifiP2pDevice) {
        val m = manager ?: return
        val c = channel ?: return
        val config = WifiP2pConfig().apply {
            deviceAddress = device.deviceAddress
        }
        m.connect(c, config, object : WifiP2pManager.ActionListener {
            override fun onSuccess() { Log.i(TAG, "connecting to ${device.deviceAddress}") }
            override fun onFailure(reason: Int) { Log.w(TAG, "connect failed: $reason") }
        })
    }

    // -------------------------------------------------------------- broadcast

    private fun registerReceiver() {
        if (receiver != null) return
        val filter = IntentFilter().apply {
            addAction(WifiP2pManager.WIFI_P2P_STATE_CHANGED_ACTION)
            addAction(WifiP2pManager.WIFI_P2P_PEERS_CHANGED_ACTION)
            addAction(WifiP2pManager.WIFI_P2P_CONNECTION_CHANGED_ACTION)
            addAction(WifiP2pManager.WIFI_P2P_THIS_DEVICE_CHANGED_ACTION)
        }
        receiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context, intent: Intent) {
                when (intent.action) {
                    WifiP2pManager.WIFI_P2P_PEERS_CHANGED_ACTION -> requestPeers()
                    WifiP2pManager.WIFI_P2P_CONNECTION_CHANGED_ACTION -> {
                        @Suppress("DEPRECATION")
                        val info = intent.getParcelableExtra<WifiP2pInfo>(WifiP2pManager.EXTRA_WIFI_P2P_INFO)
                        updateGroupInfo(info)
                        if (info?.groupFormed == true && info.groupOwnerAddress != null) {
                            connectToOwner(info)
                        }
                    }
                }
            }
        }
        context.registerReceiver(receiver, filter)
    }

    private fun requestPeers() {
        val m = manager ?: return
        val c = channel ?: return
        m.requestPeers(c) { list ->
            peers.clear()
            list?.deviceList?.forEach { peers[it.deviceAddress] = it }
            onPeersChanged?.invoke(peers.keys.toList())
        }
    }

    // ------------------------------------------------------------------ socket

    private fun startServer() {
        if (serverSocket != null) return
        thread(name = "meshlink-wifidirect-server", isDaemon = true) {
            try {
                val ss = ServerSocket(PORT)
                serverSocket = ss
                while (!ss.isClosed) {
                    val socket = ss.accept()
                    handleSocket(socket)
                }
            } catch (t: Throwable) {
                Log.w(TAG, "server socket stopped", t)
            }
        }
    }

    private fun connectToOwner(info: WifiP2pInfo) {
        // The group owner already listens on PORT. Clients connect to it.
        if (info.isGroupOwner) return
        val owner = info.groupOwnerAddress ?: return
        thread(name = "meshlink-wifidirect-client", isDaemon = true) {
            try {
                val socket = Socket()
                socket.connect(InetSocketAddress(owner, PORT), 5000)
                handleSocket(socket)
            } catch (t: Throwable) {
                Log.w(TAG, "client socket failed", t)
            }
        }
    }

    private fun handleSocket(socket: Socket) {
        thread(name = "meshlink-wifidirect-conn-${socket.port}", isDaemon = true) {
            try {
                val input = DataInputStream(socket.getInputStream())
                val address = socket.inetAddress?.hostAddress ?: "unknown"
                while (!socket.isClosed) {
                    val len = input.readUnsignedShort()
                    if (len <= 0) break
                    if (len > 65535) break
                    val buffer = ByteArray(len)
                    input.readFully(buffer, 0, len)
                    onFrame?.invoke(address, buffer)
                }
            } catch (t: Throwable) {
                Log.w(TAG, "socket read ended", t)
            } finally {
                runCatching { socket.close() }
            }
        }
    }

    /**
     * Sends a frame to the group owner. Returns true if the write succeeded.
     */
    fun send(frame: ByteArray): Boolean {
        // Reuse the last accepted socket is complex; open a short-lived one.
        val info = lastKnownInfo ?: return false
        val host = info.groupOwnerAddress?.hostAddress ?: return false
        return try {
            Socket().use { socket ->
                socket.connect(InetSocketAddress(host, PORT), 3000)
                val out = DataOutputStream(socket.getOutputStream())
                out.writeShort(frame.size)
                out.write(frame)
                out.flush()
            }
            true
        } catch (t: Throwable) {
            Log.w(TAG, "send failed", t)
            false
        }
    }

    @Volatile
    private var lastKnownInfo: WifiP2pInfo? = null

    /** Call this from the connection-changed receiver to remember the group info. */
    fun updateGroupInfo(info: WifiP2pInfo?) {
        lastKnownInfo = info
    }
}
