#!/usr/bin/env python3
"""Validate Android locale wiring, string coverage, and format placeholders.

This is a build-time consistency check. It does not assess translation quality;
human/native-speaker review is still required before marketing release.
"""
from __future__ import annotations

import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RES = ROOT / "android" / "app" / "src" / "main" / "res"
JAVA = ROOT / "android" / "app" / "src" / "main" / "java" / "com" / "utility" / "devoptions"
EXPECTED_APP_NAME = "Developers Options Shortcut"
PLACEHOLDER_RE = re.compile(r"%(?:\\d+\\$)?[a-zA-Z]")


def parse_strings(path: Path) -> dict[str, tuple[str, str]]:
    root = ET.parse(path).getroot()
    values: dict[str, tuple[str, str]] = {}
    for item in root.findall("string"):
        name = item.get("name")
        if not name:
            raise SystemExit(f"{path}: string resource has no name")
        if name in values:
            raise SystemExit(f"{path}: duplicate string resource {name}")
        values[name] = (item.get("translatable", "true"), item.text or "")
    return values


def placeholders(value: str) -> list[str]:
    return sorted(PLACEHOLDER_RE.findall(value))


base_path = RES / "values" / "strings.xml"
base = parse_strings(base_path)
required = {name for name, (translatable, _) in base.items() if translatable.lower() != "false"}
if base.get("app_name", (None, None))[1] != EXPECTED_APP_NAME:
    raise SystemExit(f"Default app_name must be exactly {EXPECTED_APP_NAME!r}")

locale_config = ET.parse(RES / "xml" / "locale_config.xml").getroot()
config_tags = [node.get("{http://schemas.android.com/apk/res/android}name") for node in locale_config.findall("locale")]
if any(not tag for tag in config_tags) or len(config_tags) != len(set(config_tags)):
    raise SystemExit("locale_config.xml contains an empty or duplicate language tag")

policy_text = (JAVA / "AppLanguageController.kt").read_text(encoding="utf-8")
policy = re.search(r"val supportedLanguageTags\\s*:\\s*Set<String>\\s*=\\s*linkedSetOf\\((.*?)\\)", policy_text, re.S)
if not policy:
    raise SystemExit("Could not locate LanguagePolicy.supportedLanguageTags linkedSetOf(...)")
policy_tags = re.findall(r'"([^"]+)"', policy.group(1))
if set(config_tags) != set(policy_tags):
    raise SystemExit(
        "Locale tag mismatch: locale_config.xml vs LanguagePolicy. "
        f"Only in XML={sorted(set(config_tags)-set(policy_tags))}; "
        f"only in policy={sorted(set(policy_tags)-set(config_tags))}"
    )

resource_dirs = {
    "en": "values",
    "ru": "values-ru",
    "hi": "values-hi",
    "es": "values-es",
    "fr": "values-fr",
    "ar": "values-ar",
    "de": "values-de",
    "pt-BR": "values-b+pt+BR",
    "ja": "values-ja",
    "zh-CN": "values-b+zh+CN",
    "kn": "values-kn",
    "ta": "values-ta",
    "te": "values-te",
}
if set(config_tags) != set(resource_dirs) - {"en"}:
    # English intentionally uses the default unqualified values/ resources.
    expected = set(resource_dirs) - {"en"}
    raise SystemExit(
        "locale_config.xml doesn't match the validated resource map. "
        f"Expected non-default tags={sorted(expected)}, got={sorted(config_tags)}"
    )

for tag in config_tags:
    folder = resource_dirs.get(tag)
    if not folder:
        raise SystemExit(f"No resource directory mapping exists for locale {tag!r}")
    path = RES / folder / "strings.xml"
    if not path.is_file():
        raise SystemExit(f"Missing strings.xml for configured locale {tag!r}: {path}")
    localized = parse_strings(path)
    missing = sorted(required - localized.keys())
    if missing:
        raise SystemExit(f"{tag}: missing {len(missing)} translated resources: {', '.join(missing)}")
    mismatched = []
    for key in sorted(required):
        default_value = base[key][1]
        translated_value = localized[key][1]
        if placeholders(default_value) != placeholders(translated_value):
            mismatched.append(
                f"{key} (default={placeholders(default_value)}, locale={placeholders(translated_value)})"
            )
    if mismatched:
        raise SystemExit(f"{tag}: format placeholder mismatch: {', '.join(mismatched)}")
    if localized.get("app_name", (None, None))[1] != EXPECTED_APP_NAME:
        raise SystemExit(f"{tag}: app_name is not exactly {EXPECTED_APP_NAME!r}")

    print(f"PASS locale={tag}: {len(required)} translatable keys, format placeholders match, app name verified")

print(
    f"PASS locale metadata: {len(config_tags)} per-app locales, "
    "all mapped to complete Android string resources."
)
print("NOTE: translation linguistic accuracy is not tested; native-speaker review remains required.")
