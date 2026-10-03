package com.utility.devoptions.data.billing

import android.app.Activity
import android.content.Context
import android.content.SharedPreferences
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
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * BillingManager handles Google Play Billing (com.android.billingclient:billing-ktx:8.0.0).
 * Provides one-time in-app purchase to permanently remove all banner & interstitial ads.
 * State is encrypted and persisted locally via EncryptedSharedPreferences (AES256).
 */
class BillingManager(
    private val context: Context,
    private val coroutineScope: CoroutineScope = CoroutineScope(Dispatchers.IO)
) : PurchasesUpdatedListener {

    companion object {
        private const val TAG = "BillingManager"
        const val PRODUCT_ID_REMOVE_ADS = "remove_ads_permanent"
        private const val PREFS_FILE = "secure_devoptions_billing_prefs"
        private const val KEY_ADS_REMOVED = "key_ads_removed_permanently"
    }

    private val prefs: SharedPreferences by lazy {
        initSecurePreferences()
    }

    private val _isAdsRemoved = MutableStateFlow(false)
    val isAdsRemoved: StateFlow<Boolean> = _isAdsRemoved.asStateFlow()

    private val _productDetails = MutableStateFlow<ProductDetails?>(null)
    val productDetails: StateFlow<ProductDetails?> = _productDetails.asStateFlow()

    private var billingClient: BillingClient = BillingClient.newBuilder(context)
        .setListener(this)
        .enablePendingPurchases(
            PendingPurchasesParams.newBuilder()
                .enableOneTimeProducts()
                .build()
        )
        .build()

    init {
        // Load persisted state immediately from secure storage
        _isAdsRemoved.value = prefs.getBoolean(KEY_ADS_REMOVED, false)
        startBillingConnection()
    }

    private fun initSecurePreferences(): SharedPreferences {
        return try {
            val masterKey = MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()

            EncryptedSharedPreferences.create(
                context,
                PREFS_FILE,
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        } catch (e: Exception) {
            Log.w(TAG, "EncryptedSharedPreferences fallback to standard prefs: ${e.message}")
            context.getSharedPreferences(PREFS_FILE, Context.MODE_PRIVATE)
        }
    }

    fun startBillingConnection(onConnected: () -> Unit = {}) {
        if (billingClient.isReady) {
            queryExistingPurchases()
            queryProductDetails()
            onConnected()
            return
        }

        billingClient.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(billingResult: BillingResult) {
                if (billingResult.responseCode == BillingClient.BillingResponseCode.OK) {
                    Log.d(TAG, "Google Play Billing setup successful.")
                    queryExistingPurchases()
                    queryProductDetails()
                    onConnected()
                } else {
                    Log.w(TAG, "Billing setup finished with code: ${billingResult.responseCode} - ${billingResult.debugMessage}")
                }
            }

            override fun onBillingServiceDisconnected() {
                Log.w(TAG, "Billing service disconnected. Will retry upon next interaction.")
            }
        })
    }

    private fun queryProductDetails() {
        val productList = listOf(
            QueryProductDetailsParams.Product.newBuilder()
                .setProductId(PRODUCT_ID_REMOVE_ADS)
                .setProductType(BillingClient.ProductType.INAPP)
                .build()
        )

        val params = QueryProductDetailsParams.newBuilder()
            .setProductList(productList)
            .build()

        billingClient.queryProductDetailsAsync(params) { billingResult, productDetailsList ->
            if (billingResult.responseCode == BillingClient.BillingResponseCode.OK) {
                val details = productDetailsList.firstOrNull { it.productId == PRODUCT_ID_REMOVE_ADS }
                _productDetails.value = details
                Log.d(TAG, "Queried product details: ${details?.name} (${details?.oneTimePurchaseOfferDetails?.formattedPrice})")
            } else {
                Log.w(TAG, "Failed to query product details: ${billingResult.debugMessage}")
            }
        }
    }

    /**
     * Checks if user already purchased "Remove Ads" on this Google account.
     */
    fun queryExistingPurchases() {
        val params = QueryPurchasesParams.newBuilder()
            .setProductType(BillingClient.ProductType.INAPP)
            .build()

        billingClient.queryPurchasesAsync(params) { billingResult, purchases ->
            if (billingResult.responseCode == BillingClient.BillingResponseCode.OK) {
                var foundRemoveAds = false
                for (purchase in purchases) {
                    if (purchase.products.contains(PRODUCT_ID_REMOVE_ADS)) {
                        if (purchase.purchaseState == Purchase.PurchaseState.PURCHASED) {
                            foundRemoveAds = true
                            if (!purchase.isAcknowledged) {
                                acknowledgePurchase(purchase)
                            }
                        }
                    }
                }
                setAdsRemovedState(foundRemoveAds)
            }
        }
    }

    /**
     * Launches the Google Play 1-tap purchase sheet for the user.
     */
    fun launchPurchaseFlow(activity: Activity, onComplete: (Boolean, String?) -> Unit) {
        val details = _productDetails.value
        if (details == null) {
            startBillingConnection {
                launchPurchaseFlow(activity, onComplete)
            }
            return
        }

        val productDetailsParamsList = listOf(
            BillingFlowParams.ProductDetailsParams.newBuilder()
                .setProductDetails(details)
                .build()
        )

        val billingFlowParams = BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(productDetailsParamsList)
            .build()

        val billingResult = billingClient.launchBillingFlow(activity, billingFlowParams)
        if (billingResult.responseCode != BillingClient.BillingResponseCode.OK) {
            onComplete(false, billingResult.debugMessage)
        }
    }

    override fun onPurchasesUpdated(billingResult: BillingResult, purchases: List<Purchase>?) {
        if (billingResult.responseCode == BillingClient.BillingResponseCode.OK && purchases != null) {
            for (purchase in purchases) {
                handlePurchase(purchase)
            }
        } else if (billingResult.responseCode == BillingClient.BillingResponseCode.USER_CANCELED) {
            Log.d(TAG, "User canceled the purchase flow.")
        } else {
            Log.w(TAG, "Purchases updated error: ${billingResult.responseCode} - ${billingResult.debugMessage}")
        }
    }

    private fun handlePurchase(purchase: Purchase) {
        if (purchase.products.contains(PRODUCT_ID_REMOVE_ADS) &&
            purchase.purchaseState == Purchase.PurchaseState.PURCHASED
        ) {
            if (!purchase.isAcknowledged) {
                acknowledgePurchase(purchase)
            } else {
                setAdsRemovedState(true)
            }
        }
    }

    private fun acknowledgePurchase(purchase: Purchase) {
        val acknowledgeParams = AcknowledgePurchaseParams.newBuilder()
            .setPurchaseToken(purchase.purchaseToken)
            .build()

        billingClient.acknowledgePurchase(acknowledgeParams) { billingResult ->
            if (billingResult.responseCode == BillingClient.BillingResponseCode.OK) {
                Log.d(TAG, "Purchase acknowledged successfully. Ads permanently removed.")
                setAdsRemovedState(true)
            } else {
                Log.w(TAG, "Failed to acknowledge purchase: ${billingResult.debugMessage}")
            }
        }
    }

    private fun setAdsRemovedState(removed: Boolean) {
        coroutineScope.launch {
            _isAdsRemoved.value = removed
            prefs.edit().putBoolean(KEY_ADS_REMOVED, removed).apply()
            Log.i(TAG, "Ad removal state saved to secure storage: isAdsRemoved=$removed")
        }
    }

    /**
     * Restore purchases on user request.
     */
    fun restorePurchases(onResult: (Boolean) -> Unit) {
        startBillingConnection {
            queryExistingPurchases()
            onResult(_isAdsRemoved.value)
        }
    }
}
