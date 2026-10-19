#!/usr/bin/env python3
"""Validate offline Android translations, locale policy and exported-resource parity."""
import json,re,sys,xml.etree.ElementTree as ET
from pathlib import Path
ROOT=Path("."); RES=ROOT/"android/app/src/main/res"
EXPECTED={"en":"values","ru":"values-ru","hi":"values-hi","es":"values-es","fr":"values-fr","ar":"values-ar","zh-CN":"values-zh-rCN","bn":"values-bn","de":"values-de","id":"values-id","it":"values-it","ja":"values-ja","ko":"values-ko","pt-BR":"values-pt-rBR","tr":"values-tr","vi":"values-vi"}
SAME_OK={"app_name","share_subject","language_english","language_russian","language_hindi","language_spanish","language_french","language_arabic","language_chinese","language_bengali","language_german","language_indonesian","language_italian","language_japanese","language_korean","language_portuguese","language_turkish","language_vietnamese","android_version_value","play_store_error_format","admob_banner_id","admob_interstitial_id"}
PH=re.compile(r"%(?:[1-9][0-9]*\$)?[sdif]")
def fail(msg):
 print("ERROR: "+msg,file=sys.stderr); raise SystemExit(1)
def read(path):
 try: root=ET.parse(path).getroot()
 except Exception as exc: fail("Invalid XML "+str(path)+": "+str(exc))
 if root.tag!="resources": fail("Wrong resource root in "+str(path))
 out={}
 for node in root.findall("string"):
  key=node.attrib.get("name")
  if not key or key in out: fail("Missing/duplicate name in "+str(path))
  out[key]={"value":"".join(node.itertext()).strip(),"translatable":node.attrib.get("translatable","true")!="false"}
 return out
def exporter_content(ts,path):
 marker="\n  {\n    path: '"+path+"',\n"
 mode="code"; quote=None; i=0; found=False; content_start=None
 while i<len(ts):
  ch=ts[i]
  if mode=="template":
   if ch=="\\": i+=2; continue
   if ch==chr(96):
    if found and content_start is not None:
     value=ts[content_start:i]; dollar=chr(36)
     value=value.replace("\\"+dollar+"{",dollar+"{").replace("\\"+chr(96),chr(96)).replace("\\\\","\\")
     return value
    mode="code"
   i+=1; continue
  if mode in ("single","double"):
   end_quote="'" if mode=="single" else '"'
   if ch=="\\": i+=2; continue
   if ch==end_quote: mode="code"
   i+=1; continue
  if mode=="linecomment":
   if ch=="\n": mode="code"
   i+=1; continue
  if mode=="blockcomment":
   if ch=="*" and i+1<len(ts) and ts[i+1]=="/": mode="code"; i+=2
   else: i+=1
   continue
  if ch=="/" and i+1<len(ts) and ts[i+1]=="/": mode="linecomment"; i+=2; continue
  if ch=="/" and i+1<len(ts) and ts[i+1]=="*": mode="blockcomment"; i+=2; continue
  if not found and ts.startswith(marker,i): found=True
  content_marker="content: "+chr(96)
  if found and content_start is None and ts.startswith(content_marker,i):
   content_start=i+len(content_marker); mode="template"; i+=len(content_marker); continue
  if ch=="'": mode="single"; i+=1; continue
  if ch=='"': mode="double"; i+=1; continue
  if ch==chr(96): mode="template"; i+=1; continue
  i+=1
 return None
english=read(RES/"values/strings.xml"); required={k for k,v in english.items() if v["translatable"]}
ans="{http://schemas.android.com/apk/res/android}"
config=ET.parse(RES/"xml/locale_config.xml").getroot()
declared={x.attrib.get(ans+"name") for x in config.findall("locale")}
if declared!=set(EXPECTED): fail("locale_config differs from 16 advertised locales")
controller=(ROOT/"android/app/src/main/java/com/utility/devoptions/AppLanguageController.kt").read_text()
m=re.search(r"linkedSetOf\(([^)]*)\)",controller); policy=set(re.findall(r'"([^"]+)"',m.group(1))) if m else set()
if policy!=set(EXPECTED): fail("LanguagePolicy differs from 16 advertised locales")
screen=(ROOT/"android/app/src/main/java/com/utility/devoptions/ui/screens/MainScreen.kt").read_text()
picker=set(re.findall(r'"([^"]+)"\s+to\s+stringResource\(R\.string\.language_',screen))
if picker!=set(EXPECTED): fail("Language picker differs from 16 advertised locales")
manifest=ET.parse(ROOT/"android/app/src/main/AndroidManifest.xml").getroot().find("application")
if manifest is None or manifest.attrib.get(ans+"label")!="@string/app_name": fail("Manifest must use @string/app_name")
if manifest.attrib.get(ans+"supportsRtl")!="true": fail("supportsRtl must be true for Arabic")
if "heightIn(max = 240.dp).verticalScroll" not in screen or "heightIn(max = 280.dp).verticalScroll" not in screen: fail("Dialog text must scroll on small screens")
if "TextOverflow.Ellipsis" not in screen: fail("Long localized headings must protect against clipping")
if "BoxWithConstraints" not in screen or "LocalDensity.current.fontScale" not in screen: fail("Action controls must adapt to narrow widths and large system text")
if ".height(46.dp)" in screen or ".height(52.dp)" in screen: fail("Action buttons must not use fixed heights that clip wrapping labels")
if "OfflineMessagePolicy.choose" not in screen: fail("Offline prompt must use billing-aware copy selection")
activity=(ROOT/"android/app/src/main/java/com/utility/devoptions/MainActivity.kt").read_text()
if "UpdateAvailability.UPDATE_AVAILABLE" not in activity: fail("Update dialog must require official Play availability")
if "NET_CAPABILITY_VALIDATED" not in activity: fail("Offline notice must require validated connectivity")
if "consentUiResolved" not in activity: fail("Optional prompts must yield to UMP consent UI")
report={"locale_count":len(EXPECTED),"english_translatable_string_count":len(required),"locales":[],"translation_review_note":"Non-English resources are machine-assisted drafts; native-speaker review required before claiming professional verification."}
for tag,directory in EXPECTED.items():
 path=RES/directory/"strings.xml"
 if not path.is_file(): fail("Missing locale resource "+str(path))
 values=read(path); missing=sorted(required-set(values)); extra=sorted(set(values)-set(english))
 if missing or extra: fail(tag+" key mismatch; missing="+repr(missing)+" extra="+repr(extra))
 placeholders=[]; suspected=[]
 for key in sorted(required):
  a=english[key]["value"]; b=values[key]["value"]
  if sorted(PH.findall(a))!=sorted(PH.findall(b)): placeholders.append(key)
  if tag!="en" and key not in SAME_OK and a and a==b: suspected.append(key)
 if placeholders: fail(tag+" placeholder mismatch: "+repr(placeholders))
 if suspected: fail(tag+" suspected English fallbacks: "+repr(suspected))
 if values.get("app_name",{}).get("value")!="Developers Options Shortcut": fail(tag+" changed official product name")
 refs=set(re.findall(r"@string/([A-Za-z0-9_]+)","\n".join(x["value"] for x in values.values())))
 if refs-set(english): fail(tag+" unresolved string references: "+repr(sorted(refs-set(english))))
 report["locales"].append({"locale":tag,"resource_directory":directory,"string_count":len(values),"translated_translatable_string_count":len(required),"missing_keys":missing,"suspected_untranslated_entries":suspected,"placeholder_errors":placeholders,"review_status":"source language" if tag=="en" else "machine-assisted draft; native-speaker review required"})
if "--check-export" in sys.argv:
 ts=(ROOT/"src/data/androidProjectFiles.ts").read_text()
 for tag,directory in EXPECTED.items():
  path="app/src/main/res/"+directory+"/strings.xml"; content=exporter_content(ts,path)
  if content is None: fail("Exporter missing "+path)
  try: exported=ET.fromstring(content)
  except Exception as exc: fail("Exporter XML invalid for "+tag+": "+str(exc))
  if {x.attrib.get("name") for x in exported.findall("string")}!=set(read(RES/directory/"strings.xml")): fail("Exported keys differ for "+tag)
  if content!=(RES/directory/"strings.xml").read_text(encoding="utf-8"): fail("Exported string content differs for "+tag)
 for native,embedded in [
 ("android/app/src/main/java/com/utility/devoptions/AppLanguageController.kt","app/src/main/java/com/utility/devoptions/AppLanguageController.kt"),
 ("android/app/src/main/java/com/utility/devoptions/MainActivity.kt","app/src/main/java/com/utility/devoptions/MainActivity.kt"),
 ("android/app/src/main/java/com/utility/devoptions/ui/screens/MainScreen.kt","app/src/main/java/com/utility/devoptions/ui/screens/MainScreen.kt"),
 ("android/app/src/main/java/com/utility/devoptions/AppPromptPolicy.kt","app/src/main/java/com/utility/devoptions/AppPromptPolicy.kt"),
 ("android/app/src/main/java/com/utility/devoptions/data/billing/BillingManager.kt","app/src/main/java/com/utility/devoptions/data/billing/BillingManager.kt"),
 ("android/app/src/androidTest/java/com/utility/devoptions/MainScreenUiTest.kt","app/src/androidTest/java/com/utility/devoptions/MainScreenUiTest.kt"),
 ("android/app/src/test/java/com/utility/devoptions/PromptPolicyTest.kt","app/src/test/java/com/utility/devoptions/PromptPolicyTest.kt"),
 ("scripts/validate_localization.py","scripts/validate_localization.py"),
 (".github/workflows/android-validation.yml",".github/workflows/android-validation.yml"),
 ("scripts/validate_icons.py","scripts/validate_icons.py"),
 ("android/app/src/main/java/com/utility/devoptions/util/ExternalActions.kt","app/src/main/java/com/utility/devoptions/util/ExternalActions.kt"),
 ("android/app/src/main/java/com/utility/devoptions/util/IntentHelper.kt","app/src/main/java/com/utility/devoptions/util/IntentHelper.kt"),
 ("android/app/src/main/java/com/utility/devoptions/ads/AdManager.kt","app/src/main/java/com/utility/devoptions/ads/AdManager.kt"),
 ("android/app/build.gradle.kts","app/build.gradle.kts"),
 ("android/gradle/libs.versions.toml","gradle/libs.versions.toml")]:
  value=exporter_content(ts,embedded)
  if value is None: fail("Exporter missing "+embedded)
  if value!=(ROOT/native).read_text(encoding="utf-8"): fail("Exporter differs from native source "+embedded)
 report["export_sync"]="16 resource sets and prompt/policy/build sources synchronized"
report["total_localized_string_entries"]=sum(x["string_count"] for x in report["locales"])
print(json.dumps(report,ensure_ascii=False,indent=2))
outfile=next((sys.argv[i+1] for i,arg in enumerate(sys.argv[:-1]) if arg=="--report"),None)
if outfile: Path(outfile).write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
