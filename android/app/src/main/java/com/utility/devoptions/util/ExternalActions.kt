package com.utility.devoptions.util
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
object ExternalActions {
 const val MARKET_URI="market://details?id=com.utility.devoptions"
 const val HTTPS_URI="https://play.google.com/store/apps/details?id=com.utility.devoptions"
 fun openPlayListing(context:Context):Boolean {
  val market=Intent(Intent.ACTION_VIEW,Uri.parse(MARKET_URI)).setPackage("com.android.vending")
  return launchWithFallback({ tryStart(context, market) }, { tryStart(context, Intent(Intent.ACTION_VIEW, Uri.parse(HTTPS_URI))) })
 }
 fun openNetworkSettings(context:Context):Boolean {
  return launchWithFallback({ tryStart(context, Intent(Settings.ACTION_WIRELESS_SETTINGS)) }, { tryStart(context, Intent(Settings.ACTION_SETTINGS)) })
 }
 internal fun launchWithFallback(primary: () -> Boolean, fallback: () -> Boolean): Boolean = if (primary()) true else fallback()
 private fun tryStart(context:Context,intent:Intent):Boolean=try { intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); context.startActivity(intent); true } catch(_:ActivityNotFoundException){false} catch(_:SecurityException){false} catch(_:IllegalArgumentException){false}
}
