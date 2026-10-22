# Localization inventory and review policy

The installed app's supported language set is determined by bundled Android res/values-* strings.xml files, AppLanguageController, the picker and locale_config.xml. Play Store listing translations do not provide installed-app UI translations.

CI generates a per-locale report containing string count, missing keys, suspected untranslated values, placeholder errors and review status. The 16-language stage is bundled at development time without paid translation services or runtime translation SDKs. All non-English translations remain machine-assisted drafts until native-speaker review is complete. The larger language list in LOCALIZATION_ROADMAP.md is a future plan, not current advertised support.
