# Localization roadmap — Developers Options Shortcut

## Delivered stage: 16 bundled Android UI locales

English, Russian, Hindi, Spanish, French, Arabic, Simplified Chinese, Bengali, German, Indonesian, Italian, Japanese, Korean, Brazilian Portuguese, Turkish and Vietnamese are present as offline Android resource folders.

**Translation quality:** all non-English text is machine-assisted draft translation. Automated checks cover XML syntax, key coverage, placeholder parity, unresolved string references, likely copied-English entries and exported-resource parity. They do not certify idiomatic wording, cultural fit or accessibility. Native-speaker review is required before calling translations professionally verified.

No translation service, API key, billing account, runtime translation SDK or translation network request is required. Translations are bundled Android resources.

Google Play listing languages and Android UI locales are separate. A translated store listing does not translate the installed application. Keep listing assets independently audited.

## Planned stage 2: target approximately 50–60 Android UI languages

This list is planning only; these languages are not advertised and must not be added to the picker or locale configuration until complete resources pass validation. Google's published ML Kit language coverage is used as a discovery reference, not as a translation engine or quality guarantee.

Afrikaans (af), Amharic (am), Azerbaijani (az), Belarusian (be), Bulgarian (bg), Bosnian (bs), Catalan (ca), Cebuano (ceb), Czech (cs), Danish (da), Dutch (nl), Estonian (et), Filipino (fil), Finnish (fi), Greek (el), Gujarati (gu), Hebrew (he), Hausa (ha), Croatian (hr), Hungarian (hu), Armenian (hy), Icelandic (is), Irish (ga), Javanese (jv), Kannada (kn), Kazakh (kk), Khmer (km), Lao (lo), Lithuanian (lt), Latvian (lv), Macedonian (mk), Malayalam (ml), Malay (ms), Marathi (mr), Burmese (my), Nepali (ne), Norwegian (no), Punjabi (pa), Persian (fa), Polish (pl), Romanian (ro), Serbian (sr), Sinhala (si), Slovak (sk), Slovenian (sl), Swahili (sw), Swedish (sv), Tamil (ta), Telugu (te), Thai (th), Ukrainian (uk), Urdu (ur), Welsh (cy), Zulu (zu), Yoruba (yo), Igbo (ig), Pashto (ps), and Albanian (sq).

Before advertising a future locale: translate every user-facing string including update/offline/review/share text; preserve placeholders and the fixed Play listing URL; check XML, resource references, regional/script fallback, persistence and RTL where applicable; inspect text clipping; record native-speaker review status; and run the same validator and Android tests.
