# Proguard rules for Dev Options Shortcut
# Keep Google Mobile Ads SDK
-keep public class com.google.android.gms.ads.** {
   public *;
}
-keep class com.google.ads.** {
   public *;
}

# Keep Compose & Kotlin reflection helpers
-dontwarn java.lang.invoke.**
