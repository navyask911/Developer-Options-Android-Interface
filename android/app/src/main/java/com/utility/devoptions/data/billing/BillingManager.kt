package com.utility.devoptions.data.billing

import android.app.Activity
import android.content.Context
import android.content.SharedPreferences
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.android.billingclient.api.AcknowledgePurchaseParams
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.PendingPurchasesParams
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.PurchasesUpdatedListener
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryPurchasesParams
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Play Billing 8 single-purchase controller. All secure preferences work runs on IO.
 * Connection attempts are coalesced and purchase-flow retries are never recursive.
 */
class BillingManager(
    private val context: Context,
    private val coroutineScope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
) : PurchasesUpdatedListener {

    companion object {
        private const val TAG = "BillingManager"
        const val PRODUCT_ID_REMOVE_ADS = "remove_ads_permanent"
        private const val PREFS_FILE = "secure_devoptions_billing_prefs"
        private const val KEY_ADS_REMOVED = "key_ads_removed_permanently"
        private const val KEY_ADS_REMOVAL_ENTITLEMENT_KNOWN = "key_ads_removal_entitlement_known"
    }

    private val prefs: SharedPreferences by lazy { initSecurePreferences() }

    private val _isAdsRemoved = MutableStateFlow(false)
    val isAdsRemoved: StateFlow<Boolean> = _isAdsRemoved.asStateFlow()
    private val _adsRemovalEntitlementKnown = MutableStateFlow(false)
    val adsRemovalEntitlementKnown: StateFlow<Boolean> = _adsRemovalEntitlementKnown.asStateFlow()
    private val _cacheLoaded = MutableStateFlow(false)
    val cacheLoaded: StateFlow<Boolean> = _cacheLoaded.asStateFlow()
    private val _productDetails = MutableStateFlow<ProductDetails?>(null)
    val productDetails: StateFlow<ProductDetails?> = _productDetails.asStateFlow()

    @Volatile private var playEntitlementResolved = false
    @Volatile private var closed = false
    private var connectionInProgress = false
    private val pendingConnectionCallbacks = mutableListOf<(Boolean) -> Unit>()

    private val billingClient: BillingClient = BillingClient.newBuilder(context)
        .setListener(this)
        .enablePendingPurchases(
            PendingPurchasesParams.newBuilder().enableOneTimeProducts().build()
        )
        .build()

    init {
        // Keystore may block during device startup; never read it on Activity.onCreate.
        coroutineScope.launch {
            try {
                val cache = prefs
                val removed = cache.getBoolean(KEY_ADS_REMOVED, false)
                val known = cache.getBoolean(KEY_ADS_REMOVAL_ENTITLEMENT_KNOWN, removed)
                if (!playEntitlementResolved && !closed) {
                    _isAdsRemoved.value = removed
                    _adsRemovalEntitlementKnown.value = known
                }
            } catch (e: Exception) {
                Log.w(TAG, "Could not read secure billing preferences", e)
            } finally {
                // Render paid-user banner only after cached entitlement has been read.
                _cacheLoaded.value = true
            }
        }
        Handler(Looper.getMainLooper()).post {
            if (!closed) startBillingConnection()
        }
    }

    private fun initSecurePreferences(): SharedPreferences {
        return try {
            val key = MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()
            EncryptedSharedPreferences.create(
                context, PREFS_FILE, key,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        } catch (e: Exception) {
            Log.w(TAG, "Encrypted preferences unavailable; using local fallback", e)
            context.getSharedPreferences(PREFS_FILE, Context.MODE_PRIVATE)
        }
    }

    /**
     * The callback is invoked when connected. Connection failure does not trigger
     * recursion or a synchronous retry.
     */
    fun startBillingConnection(onConnected: () -> Unit = {}) {
        ensureConnected { ready -> if (ready) onConnected() }
    }

    private fun ensureConnected(onResult: (Boolean) -> Unit) {
        if (closed) { onResult(false); return }
        if (billingClient.isReady) { onResult(true); return }
        pendingConnectionCallbacks.add(onResult)
        if (connectionInProgress) return
        connectionInProgress = true
        try {
            billingClient.startConnection(object : BillingClientStateListener {
                override fun onBillingSetupFinished(result: BillingResult) {
                    connectionInProgress = false
                    val ready = !closed && result.responseCode == BillingClient.BillingResponseCode.OK
                    if (ready) {
                        queryExistingPurchases()
                        queryProductDetails()
                    } else {
                        Log.w(TAG, "Billing connection unavailable: " + result.responseCode)
                    }
                    finishConnection(ready)
                }
                override fun onBillingServiceDisconnected() {
                    connectionInProgress = false
                    finishConnection(false)
                    Log.w(TAG, "Billing disconnected; retry on next user interaction")
                }
            })
        } catch (e: Exception) {
            connectionInProgress = false
            Log.w(TAG, "Billing connection failed", e)
            finishConnection(false)
        }
    }

    private fun finishConnection(ready: Boolean) {
        val pending = pendingConnectionCallbacks.toList()
        pendingConnectionCallbacks.clear()
        pending.forEach { callback ->
            try { callback(ready) }
            catch (e: Exception) { Log.e(TAG, "Billing callback failed", e) }
        }
    }

    private fun queryProductDetails(onResult: ((ProductDetails?) -> Unit)? = null) {
        if (closed || !billingClient.isReady) { onResult?.invoke(null); return }
        val products = listOf(
            QueryProductDetailsParams.Product.newBuilder()
                .setProductId(PRODUCT_ID_REMOVE_ADS)
                .setProductType(BillingClient.ProductType.INAPP)
                .build()
        )
        val params = QueryProductDetailsParams.newBuilder().setProductList(products).build()
        try {
            billingClient.queryProductDetailsAsync(params) { result, response ->
                val detail = if (!closed && result.responseCode == BillingClient.BillingResponseCode.OK) {
                    response.productDetailsList.firstOrNull { it.productId == PRODUCT_ID_REMOVE_ADS }
                } else null
                if (detail != null) _productDetails.value = detail
                if (detail == null) Log.w(TAG, "Remove Ads product unavailable: " + result.responseCode)
                onResult?.invoke(detail)
            }
        } catch (e: Exception) {
            Log.w(TAG, "Product query failed", e)
            onResult?.invoke(null)
        }
    }

    /** Never revoke cached entitlement after a failed Play query. */
    fun queryExistingPurchases(onResult: ((Boolean) -> Unit)? = null) {
        if (closed || !billingClient.isReady) { onResult?.invoke(false); return }
        val params = QueryPurchasesParams.newBuilder()
            .setProductType(BillingClient.ProductType.INAPP).build()
        try {
            billingClient.queryPurchasesAsync(params) { result, purchases ->
                if (!closed && result.responseCode == BillingClient.BillingResponseCode.OK) {
                    playEntitlementResolved = true
                    val owned = purchases.any {
                        it.products.contains(PRODUCT_ID_REMOVE_ADS) &&
                            it.purchaseState == Purchase.PurchaseState.PURCHASED
                    }
                    purchases.filter {
                        it.products.contains(PRODUCT_ID_REMOVE_ADS) &&
                            it.purchaseState == Purchase.PurchaseState.PURCHASED &&
                            !it.isAcknowledged
                    }.forEach { acknowledgePurchase(it) }
                    setAdsRemovedState(owned)
                    onResult?.invoke(owned)
                } else {
                    Log.w(TAG, "Could not confirm purchases: " + result.responseCode)
                    onResult?.invoke(false)
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Purchase query failed", e)
            onResult?.invoke(false)
        }
    }

    /**
     * One connection attempt and at most one product-details query per user action.
     * The old code called launchPurchaseFlow() from its own callback indefinitely.
     */
    fun launchPurchaseFlow(activity: Activity, onComplete: (Boolean, String?) -> Unit) {
        val details = _productDetails.value
        if (billingClient.isReady && details != null) {
            launchWithDetails(activity, details, onComplete)
            return
        }
        ensureConnected { ready ->
            if (!ready) {
                onComplete(false, "Google Play Billing is unavailable. Please try again.")
            } else {
                queryProductDetails { fetched ->
                    if (fetched == null) {
                        onComplete(false, "Remove Ads is temporarily unavailable. Please try again.")
                    } else {
                        launchWithDetails(activity, fetched, onComplete)
                    }
                }
            }
        }
    }

    private fun launchWithDetails(
        activity: Activity, details: ProductDetails, onComplete: (Boolean, String?) -> Unit
    ) {
        if (closed || activity.isFinishing || activity.isDestroyed || !billingClient.isReady) {
            onComplete(false, "Purchase cannot start right now.")
            return
        }
        try {
            val flow = BillingFlowParams.newBuilder()
                .setProductDetailsParamsList(
                    listOf(BillingFlowParams.ProductDetailsParams.newBuilder()
                        .setProductDetails(details).build())
                ).build()
            val result = billingClient.launchBillingFlow(activity, flow)
            if (result.responseCode != BillingClient.BillingResponseCode.OK) {
                onComplete(false, result.debugMessage)
            }
        } catch (e: Exception) {
            Log.w(TAG, "Purchase sheet failed", e)
            onComplete(false, "Google Play Billing is unavailable.")
        }
    }

    override fun onPurchasesUpdated(result: BillingResult, purchases: List<Purchase>?) {
        if (result.responseCode == BillingClient.BillingResponseCode.OK && purchases != null) {
            purchases.forEach { handlePurchase(it) }
        } else if (result.responseCode != BillingClient.BillingResponseCode.USER_CANCELED) {
            Log.w(TAG, "Purchase callback error: " + result.responseCode)
        }
    }

    private fun handlePurchase(purchase: Purchase) {
        if (purchase.products.contains(PRODUCT_ID_REMOVE_ADS) &&
            purchase.purchaseState == Purchase.PurchaseState.PURCHASED) {
            // Ownership is valid even while a Play acknowledgement request is pending.
            setAdsRemovedState(true)
            if (!purchase.isAcknowledged) acknowledgePurchase(purchase)
        }
    }

    private fun acknowledgePurchase(purchase: Purchase) {
        val params = AcknowledgePurchaseParams.newBuilder()
            .setPurchaseToken(purchase.purchaseToken).build()
        try {
            billingClient.acknowledgePurchase(params) { result ->
                if (result.responseCode != BillingClient.BillingResponseCode.OK) {
                    Log.w(TAG, "Purchase acknowledgement failed: " + result.responseCode)
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Purchase acknowledgement failed", e)
        }
    }

    private fun setAdsRemovedState(removed: Boolean) {
        if (closed) return
        _isAdsRemoved.value = removed
        _adsRemovalEntitlementKnown.value = true
        coroutineScope.launch {
            try {
                prefs.edit()
                    .putBoolean(KEY_ADS_REMOVED, removed)
                    .putBoolean(KEY_ADS_REMOVAL_ENTITLEMENT_KNOWN, true)
                    .apply()
            } catch (e: Exception) {
                Log.w(TAG, "Could not persist Play entitlement", e)
            }
        }
    }

    fun restorePurchases(onResult: (Boolean) -> Unit) {
        ensureConnected { ready ->
            if (ready) queryExistingPurchases(onResult)
            else onResult(false)
        }
    }

    fun close() {
        closed = true
        pendingConnectionCallbacks.clear()
        try { billingClient.endConnection() }
        catch (e: Exception) { Log.w(TAG, "Billing cleanup failed", e) }
    }
}
