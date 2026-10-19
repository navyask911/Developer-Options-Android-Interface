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
import com.android.billingclient.api.QueryProductDetailsResult
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
        private const val KEY_ADS_REMOVAL_ENTITLEMENT_KNOWN = "key_ads_removal_entitlement_known"
    }

    private val prefs: SharedPreferences by lazy {
        initSecurePreferences()
    }

    private val _isAdsRemoved = MutableStateFlow(false)
    val isAdsRemoved: StateFlow<Boolean> = _isAdsRemoved.asStateFlow()

    // A missing Play response must not be represented as a confirmed ad-removal purchase.
    private val _adsRemovalEntitlementKnown = MutableStateFlow(false)
    val adsRemovalEntitlementKnown: StateFlow<Boolean> = _adsRemovalEntitlementKnown.asStateFlow()

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
        val billingPreferences = prefs
        val cachedAdsRemoved = billingPreferences.getBoolean(KEY_ADS_REMOVED, false)
        _isAdsRemoved.value = cachedAdsRemoved
        _adsRemovalEntitlementKnown.value = billingPreferences.getBoolean(KEY_ADS_REMOVAL_ENTITLEMENT_KNOWN, cachedAdsRemoved)
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

        billingClient.queryProductDetailsAsync(params) { billingResult, queryProductDetailsResult ->
            if (billingResult.responseCode == BillingClient.BillingResponseCode.OK) {
                val details = queryProductDetailsResult.productDetailsList.firstOrNull { it.productId == PRODUCT_ID_REMOVE_ADS }
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
            _adsRemovalEntitlementKnown.value = true
            prefs.edit()
                .putBoolean(KEY_ADS_REMOVED, removed)
                .putBoolean(KEY_ADS_REMOVAL_ENTITLEMENT_KNOWN, true)
                .apply()
            Log.i(TAG, "Ad removal state saved to secure storage: isAdsRemoved=\$removed")
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
`
  },
  {
    path: 'app/src/main/java/com/utility/devoptions/util/IntentHelper.kt',
    name: 'IntentHelper.kt',
    category: 'kotlin',
    language: 'kotlin',
    description: 'Synchronized from native Android and CI validation sources.',
    content: `package com.utility.devoptions.util

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.provider.Settings
import com.utility.devoptions.R

/** Public Android Settings intent routing. This helper never changes protected system settings. */
object IntentHelper {
    sealed class OpenResult {
        data object Success : OpenResult()
        data class SuccessWithMessage(val message: String) : OpenResult()
        data class FallbackToDeviceInfo(val reason: String) : OpenResult()
        data class GuideRequired(val reason: String) : OpenResult()
        data class Error(val exception: Throwable, val message: String = exception.localizedMessage ?: "") : OpenResult()
    }

    /** Launch Developer Options only when the system reports it enabled or its state is unknown. */
    fun openDeveloperOptions(context: Context): OpenResult {
        if (developmentSettingsEnabled(context) == false) {
            return OpenResult.GuideRequired(context.getString(R.string.developer_options_disabled_guide))
        }
        return if (tryStart(context, Intent(Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS)) == null) {
            OpenResult.Success
        } else {
            OpenResult.GuideRequired(context.getString(R.string.developer_options_unavailable_guide))
        }
    }

    fun openUsbDebugging(context: Context): OpenResult =
        when (val result = openDeveloperOptions(context)) {
            OpenResult.Success -> OpenResult.SuccessWithMessage(context.getString(R.string.usb_debugging_guidance))
            is OpenResult.GuideRequired -> result
            is OpenResult.Error -> result
            is OpenResult.FallbackToDeviceInfo -> result
            is OpenResult.SuccessWithMessage -> result
        }

    /** There is no verified public Wireless Debugging intent; use the standard Settings destinations. */
    fun openWirelessDebugging(context: Context): OpenResult {
        if (developmentSettingsEnabled(context) == false) {
            return OpenResult.GuideRequired(context.getString(R.string.developer_options_disabled_guide))
        }
        val developmentFailure = tryStart(context, Intent(Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS))
        if (developmentFailure == null) {
            val messageRes = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
                R.string.wireless_debugging_guidance
            } else {
                R.string.wireless_debugging_unavailable
            }
            return OpenResult.SuccessWithMessage(context.getString(messageRes))
        }
        val settingsFailure = tryStart(context, Intent(Settings.ACTION_SETTINGS))
        if (settingsFailure == null) {
            return OpenResult.SuccessWithMessage(context.getString(R.string.wireless_debugging_fallback_guidance))
        }
        return OpenResult.Error(settingsFailure, context.getString(R.string.settings_open_failed))
    }

    fun openAboutPhone(context: Context): OpenResult {
        val aboutFailure = tryStart(context, Intent(Settings.ACTION_DEVICE_INFO_SETTINGS))
        if (aboutFailure == null) return OpenResult.Success
        val settingsFailure = tryStart(context, Intent(Settings.ACTION_SETTINGS))
        if (settingsFailure == null) {
            return OpenResult.SuccessWithMessage(context.getString(R.string.about_phone_fallback_settings))
        }
        return OpenResult.Error(settingsFailure, context.getString(R.string.settings_open_failed))
    }

    fun shareApplication(context: Context): OpenResult {
        val shareIntent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_SUBJECT, context.getString(R.string.share_subject))
            putExtra(Intent.EXTRA_TEXT, context.getString(R.string.share_message, "com.utility.devoptions"))
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        val chooser = Intent.createChooser(shareIntent, context.getString(R.string.share_app)).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        return try {
            context.startActivity(chooser)
            OpenResult.Success
        } catch (e: ActivityNotFoundException) {
            OpenResult.Error(e, context.getString(R.string.share_unavailable))
        } catch (e: SecurityException) {
            OpenResult.Error(e, context.getString(R.string.share_unavailable))
        } catch (e: IllegalArgumentException) {
            OpenResult.Error(e, context.getString(R.string.share_unavailable))
        }
    }

    private fun developmentSettingsEnabled(context: Context): Boolean? = try {
        Settings.Global.getInt(context.contentResolver, Settings.Global.DEVELOPMENT_SETTINGS_ENABLED) == 1
    } catch (_: Settings.SettingNotFoundException) {
        null
    } catch (_: SecurityException) {
        null
    } catch (_: IllegalArgumentException) {
        null
    }

    /** Returns null only when Android accepted the intent. */
    private fun tryStart(context: Context, intent: Intent): Throwable? = try {
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
        null
    } catch (e: ActivityNotFoundException) {
        e
    } catch (e: SecurityException) {
        e
    } catch (e: IllegalArgumentException) {
        e
    }
}
