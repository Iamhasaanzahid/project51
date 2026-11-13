package com.meshlink.app.mesh

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothGattServer
import android.bluetooth.BluetoothGattServerCallback
import android.bluetooth.BluetoothGattService
import android.bluetooth.BluetoothManager
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.os.Build
import android.os.ParcelUuid
import android.util.Log
import java.util.UUID

/**
 * BLUETOOTH LE TRANSPORT — 2.4 GHz radio, no internet, no SIM.
 *
 * Every modern Android phone has a BLE radio. This transport advertises a
 * MeshLink GATT service, scans for nearby MeshLink peers, and exchanges
 * encrypted mesh frames over a writable/notifying characteristic.
 *
 * Range: ~10–50 m per hop. Combined with multi-hop TTL forwarding this gives
 * a local mesh that works completely offline.
 */
@SuppressLint("MissingPermission")
class BleTransport(private val context: Context) {

    companion object {
        private const val TAG = "MeshLinkBle"

        val SERVICE_UUID: UUID = UUID.fromString("6d657368-6c69-6e6b-0001-000000000000")
        val FRAME_CHAR_UUID: UUID = UUID.fromString("6d657368-6c69-6e6b-0002-000000000000")
        val CCCD_UUID: UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")
    }

    /** Called with (peerAddress, frameBytes) for every received frame. */
    var onFrame: ((peerAddress: String, bytes: ByteArray) -> Unit)? = null

    private val adapter: BluetoothAdapter? =
        (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter

    private var gattServer: BluetoothGattServer? = null
    private var advertiseCallback: AdvertiseCallback? = null
    private var scanCallback: ScanCallback? = null
    private val clients = HashMap<String, BluetoothGatt>()
    private val serverSubscribers = HashSet<String>()

    val isSupported: Boolean get() = adapter != null && adapter.isEnabled

    // ------------------------------------------------------------- start/stop

    fun start() {
        val ad = adapter ?: return
        if (!ad.isEnabled) return
        startGattServer(ad)
        startAdvertising(ad)
        startScanning(ad)
    }

    fun stop() {
        try {
            advertiseCallback?.let { adapter?.bluetoothLeAdvertiser?.stopAdvertising(it) }
        } catch (t: Throwable) { Log.w(TAG, "stopAdvertising", t) }
        advertiseCallback = null

        try {
            scanCallback?.let { adapter?.bluetoothLeScanner?.stopScan(it) }
        } catch (t: Throwable) { Log.w(TAG, "stopScan", t) }
        scanCallback = null

        gattServer?.close()
        gattServer = null

        clients.values.forEach { runCatching { it.close() } }
        clients.clear()
    }

    // ------------------------------------------------------------ GATT server

    private fun startGattServer(ad: BluetoothAdapter) {
        if (gattServer != null) return
        val manager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
            ?: return

        val service = BluetoothGattService(SERVICE_UUID, BluetoothGattService.SERVICE_TYPE_PRIMARY)
        val frameChar = BluetoothGattCharacteristic(
            FRAME_CHAR_UUID,
            BluetoothGattCharacteristic.PROPERTY_WRITE or
                BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE or
                BluetoothGattCharacteristic.PROPERTY_NOTIFY,
            BluetoothGattCharacteristic.PERMISSION_WRITE,
        )
        frameChar.addDescriptor(
            BluetoothGattDescriptor(
                CCCD_UUID,
                BluetoothGattDescriptor.PERMISSION_READ or BluetoothGattDescriptor.PERMISSION_WRITE,
            )
        )
        service.addCharacteristic(frameChar)

        gattServer = manager.openGattServer(context, object : BluetoothGattServerCallback() {
            override fun onConnectionStateChange(device: BluetoothDevice, status: Int, newState: Int) {
                if (newState == android.bluetooth.BluetoothProfile.STATE_DISCONNECTED) {
                    serverSubscribers.remove(device.address)
                }
            }

            override fun onDescriptorWriteRequest(
                device: BluetoothDevice,
                requestId: Int,
                descriptor: BluetoothGattDescriptor,
                preparedWrite: Boolean,
                responseNeeded: Boolean,
                offset: Int,
                value: ByteArray,
            ) {
                if (descriptor.uuid == CCCD_UUID) {
                    if (value.isNotEmpty() && value[0].toInt() != 0) {
                        serverSubscribers.add(device.address)
                    } else {
                        serverSubscribers.remove(device.address)
                    }
                }
                if (responseNeeded) {
                    gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, null)
                }
            }

            override fun onCharacteristicWriteRequest(
                device: BluetoothDevice,
                requestId: Int,
                characteristic: BluetoothGattCharacteristic,
                preparedWrite: Boolean,
                responseNeeded: Boolean,
                offset: Int,
                value: ByteArray?,
            ) {
                val ok = value != null && characteristic.uuid == FRAME_CHAR_UUID
                if (ok) onFrame?.invoke(device.address, value!!)
                gattServer?.sendResponse(
                    device,
                    requestId,
                    if (ok) BluetoothGatt.GATT_SUCCESS else BluetoothGatt.GATT_FAILURE,
                    offset,
                    null,
                )
            }
        })

        gattServer?.addService(service)
        Log.i(TAG, "GATT server started")
    }

    // ------------------------------------------------------------- advertising

    private fun startAdvertising(ad: BluetoothAdapter) {
        val advertiser = ad.bluetoothLeAdvertiser ?: return
        if (advertiseCallback != null) return

        val settings = AdvertiseSettings.Builder()
            .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
            .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
            .setConnectable(true)
            .setTimeout(0)
            .build()

        val data = AdvertiseData.Builder()
            .addServiceUuid(ParcelUuid(SERVICE_UUID))
            .setIncludeDeviceName(false)
            .build()

        advertiseCallback = object : AdvertiseCallback() {
            override fun onStartSuccess(settingsInEffect: AdvertiseSettings?) {
                Log.i(TAG, "BLE advertising started")
            }

            override fun onStartFailure(errorCode: Int) {
                Log.w(TAG, "BLE advertising failed: $errorCode")
            }
        }
        advertiser.startAdvertising(settings, data, advertiseCallback)
    }

    // ---------------------------------------------------------------- scanning

    private fun startScanning(ad: BluetoothAdapter) {
        val scanner = ad.bluetoothLeScanner ?: return
        if (scanCallback != null) return

        val filter = ScanFilter.Builder()
            .setServiceUuid(ParcelUuid(SERVICE_UUID))
            .build()
        val settings = ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
            .build()

        scanCallback = object : ScanCallback() {
            override fun onScanResult(callbackType: Int, result: ScanResult) {
                val device = result.device ?: return
                if (clients.containsKey(device.address)) return
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    connect(device, result.device.uuids?.isNotEmpty() == true)
                } else {
                    @Suppress("DEPRECATION")
                    connect(device, true)
                }
            }

            override fun onScanFailed(errorCode: Int) {
                Log.w(TAG, "BLE scan failed: $errorCode")
            }
        }
        scanner.startScan(listOf(filter), settings, scanCallback)
        Log.i(TAG, "BLE scanning started")
    }

    // -------------------------------------------------------------- connection

    private fun connect(device: BluetoothDevice, ignored: Boolean) {
        val gatt = try {
            device.connectGatt(context, false, clientCallback, BluetoothDevice.TRANSPORT_LE)
        } catch (t: Throwable) {
            Log.w(TAG, "connectGatt failed", t)
            return
        }
        clients[device.address] = gatt
    }

    private val clientCallback = object : android.bluetooth.BluetoothGattCallback() {
        override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
            if (newState == android.bluetooth.BluetoothProfile.STATE_CONNECTED) {
                gatt.discoverServices()
            } else if (newState == android.bluetooth.BluetoothProfile.STATE_DISCONNECTED) {
                runCatching { gatt.close() }
                clients.remove(gatt.device.address)
            }
        }

        override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
            if (status != BluetoothGatt.GATT_SUCCESS) return
            val ch = gatt.getService(SERVICE_UUID)?.getCharacteristic(FRAME_CHAR_UUID) ?: return
            gatt.setCharacteristicNotification(ch, true)
            ch.getDescriptor(CCCD_UUID)?.let { d ->
                d.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                gatt.writeDescriptor(d)
            }
        }

        override fun onCharacteristicChanged(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
        ) {
            val value = characteristic.value ?: return
            onFrame?.invoke(gatt.device.address, value)
        }
    }

    // -------------------------------------------------------------------- send

    /**
     * Sends a raw frame to a connected peer, or broadcasts it to every
     * connected peer + notified subscriber (flood routing at the radio layer).
     * Returns the number of peers the frame was written to.
     */
    fun send(peerAddress: String?, frame: ByteArray): Int {
        var sent = 0
        val targets = if (peerAddress != null && clients.containsKey(peerAddress)) {
            listOfNotNull(clients[peerAddress])
        } else {
            clients.values.toList()
        }
        for (gatt in targets) {
            val ch = gatt.getService(SERVICE_UUID)?.getCharacteristic(FRAME_CHAR_UUID) ?: continue
            ch.writeType = BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
            ch.value = frame
            if (gatt.writeCharacteristic(ch)) sent++
        }
        // Also notify any peripherals subscribed to our GATT server.
        val server = gattServer
        if (server != null) {
            val ch = server.getService(SERVICE_UUID)?.getCharacteristic(FRAME_CHAR_UUID)
            if (ch != null) {
                ch.value = frame
                for (addr in serverSubscribers.toList()) {
                    val dev = try { adapter?.getRemoteDevice(addr) } catch (t: Throwable) { null }
                    if (dev != null && server.notifyCharacteristicChanged(dev, ch, false)) sent++
                }
            }
        }
        return sent
    }

    val connectedPeerCount: Int get() = clients.size + serverSubscribers.size
}
