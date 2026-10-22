# R8 rules for Developer Options Shortcut.
#
# Google Mobile Ads (AdMob) reflection and mediation compatibility.
-keep public class com.google.android.gms.ads.** { public *; }
-keep public class com.google.ads.** { public *; }
-dontwarn com.google.android.gms.ads.**

# Keep Kotlin metadata and runtime annotations used by Kotlin reflection and generated code.
# Compose libraries supply their own consumer rules; retain metadata without keeping all of Compose.
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod,Exceptions,SourceFile,LineNumberTable
-keep class kotlin.Metadata { *; }

# Kotlin Coroutines dispatcher/service-loader discovery and volatile state.
# kotlinx-coroutines also contributes its own library consumer rules.
-keepnames class kotlinx.coroutines.internal.MainDispatcherFactory
-keepnames class kotlinx.coroutines.CoroutineExceptionHandler
-keepclassmembers class kotlinx.coroutines.** {
    volatile <fields>;
}

# Manifest-declared Android components are already roots for R8. Preserve names for the
# application/activity entry points as an additional safeguard for platform/reflection lookups.
-keepnames class com.utility.devoptions.DevOptionsApplication
-keepnames class com.utility.devoptions.MainActivity
