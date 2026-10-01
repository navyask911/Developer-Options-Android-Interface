import React, { useState } from 'react';
import {
  Smartphone,
  Code2,
  ShieldCheck,
  Download,
  RefreshCw,
  Share2,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  ChevronRight,
  Info,
  ExternalLink,
  Layers,
  Cpu,
  Terminal,
  Sparkles,
  ArrowLeft,
  X
} from 'lucide-react';
import { ANDROID_FILES, AndroidFile } from './data/androidProjectFiles';
import { downloadAndroidProjectZip } from './utils/zipExporter';

interface DeviceProfile {
  name: string;
  brand: string;
  model: string;
  androidVersion: string;
  apiLevel: number;
  securityPatch: string;
  buildNumber: string;
  cpuAbi: string;
  hardware: string;
  oemSkin: string;
}

const DEVICE_PROFILES: DeviceProfile[] = [
  {
    name: 'Google Pixel 9 Pro',
    brand: 'Google',
    model: 'Pixel 9 Pro',
    androidVersion: '15',
    apiLevel: 35,
    securityPatch: '2026-09-05',
    buildNumber: 'AP4A.260905.001',
    cpuAbi: 'arm64-v8a',
    hardware: 'tensor_g4',
    oemSkin: 'Stock Android (AOSP Intent)'
  },
  {
    name: 'Samsung Galaxy S24 Ultra',
    brand: 'Samsung',
    model: 'SM-S928B',
    androidVersion: '14',
    apiLevel: 34,
    securityPatch: '2026-08-01',
    buildNumber: 'UP1A.231005.007.S928BXXU2AXD3',
    cpuAbi: 'arm64-v8a, armeabi-v7a',
    hardware: 'qcom_sm8650',
    oemSkin: 'One UI 6.1 (Samsung Intent Fallback)'
  },
  {
    name: 'Xiaomi 14 Pro',
    brand: 'Xiaomi',
    model: '23116PN5BC',
    androidVersion: '14',
    apiLevel: 34,
    securityPatch: '2026-07-01',
    buildNumber: 'OS1.0.32.0.UNBCNXM',
    cpuAbi: 'arm64-v8a',
    hardware: 'qualcomm_snapdragon',
    oemSkin: 'HyperOS / MIUI (Xiaomi Intent Fallback)'
  },
  {
    name: 'Legacy Android 5.0 Phone',
    brand: 'LGE',
    model: 'Nexus 5',
    androidVersion: '5.0.1',
    apiLevel: 21,
    securityPatch: 'Not available (< API 23)',
    buildNumber: 'LRX22C',
    cpuAbi: 'armeabi-v7a',
    hardware: 'hammerhead',
    oemSkin: 'AOSP Lollipop (API 21 Base Reach)'
  }
];

export default function App() {
  const [activeTab, setActiveTab] = useState<'simulator' | 'code' | 'policy' | 'gradle'>('simulator');
  const [selectedFile, setSelectedFile] = useState<AndroidFile>(ANDROID_FILES[6]); // MainActivity.kt by default
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [isZipping, setIsZipping] = useState(false);

  // Simulator State
  const [selectedProfile, setSelectedProfile] = useState<DeviceProfile>(DEVICE_PROFILES[0]);
  const [devOptionsOn, setDevOptionsOn] = useState(true);
  const [usbDebuggingOn, setUsbDebuggingOn] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [clickCount, setClickCount] = useState(0);
  const [phoneScreen, setPhoneScreen] = useState<'app' | 'settings_dev' | 'settings_about'>('app');
  const [showInterstitial, setShowInterstitial] = useState(false);
  const [interstitialCountdown, setInterstitialCountdown] = useState(3);
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);
  const [buildTapCounter, setBuildTapCounter] = useState(0);
  const [intentLog, setIntentLog] = useState<string[]>(['App launched. ContentResolver queried development settings.']);

  const copyCode = (text: string, path: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPath(path);
    setTimeout(() => setCopiedPath(null), 2000);
  };

  const handleDownloadZip = async () => {
    try {
      setIsZipping(true);
      await downloadAndroidProjectZip();
    } finally {
      setIsZipping(false);
    }
  };

  const showSnackbar = (msg: string) => {
    setSnackbarMessage(msg);
    setTimeout(() => {
      setSnackbarMessage((prev) => (prev === msg ? null : prev));
    }, 3800);
  };

  const handleMainActionClick = () => {
    const nextCount = clickCount + 1;
    setClickCount(nextCount);

    const logEntry = `User tapped 'Open Developer Options' (Total taps: ${nextCount})`;
    setIntentLog((prev) => [logEntry, ...prev.slice(0, 19)]);

    // Check 3-tap frequency cap
    const triggerAd = nextCount % 3 === 0;

    if (triggerAd) {
      setShowInterstitial(true);
      setInterstitialCountdown(3);
      const timer = setInterval(() => {
        setInterstitialCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      dispatchSettingsNavigation();
    }
  };

  const closeInterstitialAndProceed = () => {
    setShowInterstitial(false);
    dispatchSettingsNavigation();
  };

  const dispatchSettingsNavigation = () => {
    if (isLocked) {
      setIntentLog((prev) => [
        `[Fallback] ActivityNotFoundException: Developer settings unavailable or locked.`,
        `[Intent] Dispatched Settings.ACTION_DEVICE_INFO_SETTINGS ('About Phone')`,
        ...prev.slice(0, 18)
      ]);
      showSnackbar("Developer Options is locked. Opening About Phone: tap 'Build Number' 7 times to enable.");
      setPhoneScreen('settings_about');
    } else {
      setIntentLog((prev) => [
        `[Intent Success] Dispatched ${selectedProfile.oemSkin} intent directly to Settings > Developer Options.`,
        ...prev.slice(0, 19)
      ]);
      setPhoneScreen('settings_dev');
    }
  };

  const handleBuildNumberTap = () => {
    const next = buildTapCounter + 1;
    setBuildTapCounter(next);
    if (next < 7) {
      const remaining = 7 - next;
      showSnackbar(`You are now ${remaining} step${remaining > 1 ? 's' : ''} away from being a developer.`);
    } else {
      showSnackbar('You are now a developer! Developer Options unlocked.');
      setIsLocked(false);
      setDevOptionsOn(true);
      setBuildTapCounter(0);
      setIntentLog((prev) => [
        `[Unlocked] User tapped Build Number 7 times. Settings.Global.DEVELOPMENT_SETTINGS_ENABLED = 1`,
        ...prev.slice(0, 19)
      ]);
    }
  };

  const handleBackToApp = () => {
    setPhoneScreen('app');
    // Simulate dynamic onResume() refresh!
    showSnackbar('onResume(): Developer Options status synchronized in real time.');
    setIntentLog((prev) => [
      `[Lifecycle] Activity.onResume() fired -> DeveloperOptionsViewModel.refreshStatusOnly() updated state without reload.`,
      ...prev.slice(0, 19)
    ]);
  };

  const handleShareApp = () => {
    const text = `Quick Developer Options Shortcut for Android: https://play.google.com/store/apps/details?id=com.utility.devoptions`;
    if (navigator.share) {
      navigator.share({ title: 'Dev Options Shortcut', text }).catch(() => {});
    } else {
      navigator.clipboard.writeText(text);
      showSnackbar('Share text and Play Store link copied to clipboard.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Bar Contract */}
      <header className="h-16 border-b border-slate-800 bg-slate-900/90 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between sticky top-0 z-40 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-600 flex items-center justify-center shadow-lg shadow-purple-600/30">
            <Smartphone className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="font-bold text-base text-white tracking-tight">Developer Options Android Interface</span>
            <div className="text-[11px] text-slate-400 font-medium">Native Jetpack Compose (API 21 - API 35)</div>
          </div>
        </div>

        {/* Clean nav items */}
        <nav className="hidden md:flex items-center gap-1 bg-slate-800/80 p-1 rounded-lg border border-slate-700/60">
          <button
            onClick={() => setActiveTab('simulator')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
              activeTab === 'simulator'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            Live M3 Simulator
          </button>
          <button
            onClick={() => setActiveTab('code')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
              activeTab === 'code'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            Android Project Files ({ANDROID_FILES.length})
          </button>
          <button
            onClick={() => setActiveTab('policy')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
              activeTab === 'policy'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            Play Store & AdMob Policy
          </button>
          <button
            onClick={() => setActiveTab('gradle')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
              activeTab === 'gradle'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            Gradle Commands
          </button>
        </nav>

        {/* Primary Action Button */}
        <button
          onClick={handleDownloadZip}
          disabled={isZipping}
          className="px-4 py-2 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-500 active:scale-95 transition-all rounded-lg shadow-md shadow-purple-900/40 flex items-center gap-2 whitespace-nowrap cursor-pointer disabled:opacity-50"
        >
          <Download className="w-4 h-4" />
          <span>{isZipping ? 'Bundling ZIP...' : 'Download Project (.zip)'}</span>
        </button>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-auto">
        {activeTab === 'simulator' && (
          <div className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left: Device Simulator Canvas */}
            <div className="lg:col-span-5 flex flex-col items-center">
              <div className="text-xs text-slate-400 mb-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>Interactive Jetpack Compose Material 3 Runtime Simulation</span>
              </div>

              {/* Phone Frame */}
              <div className="w-[360px] h-[720px] bg-slate-900 rounded-[44px] p-3 border-[6px] border-slate-700 shadow-2xl relative flex flex-col overflow-hidden">
                {/* Speaker Ear Piece & Front Camera */}
                <div className="absolute top-4 left-1/2 -translate-x-1/2 w-28 h-5 bg-slate-950 rounded-full z-30 flex items-center justify-center">
                  <div className="w-3 h-3 rounded-full bg-slate-900 border border-slate-700"></div>
                </div>

                {/* Inner Screen Surface */}
                <div className="flex-1 bg-slate-950 rounded-[34px] overflow-hidden flex flex-col relative text-slate-100 select-none">
                  {/* Android Status Bar */}
                  <div className="h-9 px-6 pt-2 flex items-center justify-between text-[11px] text-slate-400 font-medium z-20 shrink-0">
                    <span>9:41</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px]">5G</span>
                      <div className="w-3.5 h-2 border border-slate-400 rounded-sm p-[1px] flex items-center">
                        <div className="w-2 h-full bg-emerald-400 rounded-2xs"></div>
                      </div>
                    </div>
                  </div>

                  {/* Interstitial Ad Simulation Modal */}
                  {showInterstitial && (
                    <div className="absolute inset-0 bg-black/95 z-50 flex flex-col justify-between p-4 animate-in fade-in duration-200">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="bg-amber-400 text-black text-[9px] font-bold px-1.5 py-0.5 rounded">AdMob Test</span>
                          <span className="text-xs text-slate-300">Interstitial Ad (Tap 3 of 3)</span>
                        </div>
                        <button
                          onClick={closeInterstitialAndProceed}
                          className="bg-slate-800 text-slate-200 hover:text-white px-2.5 py-1 rounded text-xs flex items-center gap-1 cursor-pointer"
                        >
                          <span>{interstitialCountdown > 0 ? `Skip in ${interstitialCountdown}s` : 'Close'}</span>
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
                        <div className="w-16 h-16 rounded-2xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center mb-3">
                          <Sparkles className="w-8 h-8 text-purple-400" />
                        </div>
                        <h4 className="font-bold text-base text-white">Google Mobile Ads SDK 23.+</h4>
                        <p className="text-xs text-slate-400 mt-1 max-w-[240px]">
                          Production interstitial unit ID: <br />
                          <code className="text-purple-300 font-mono text-[10px]">ca-app-pub-4783826505860771/6316609796</code>
                        </p>
                        <div className="mt-4 text-[11px] text-slate-500 bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800">
                          Enforced 3-tap frequency cap & fail-open routing.
                        </div>
                      </div>

                      <button
                        onClick={closeInterstitialAndProceed}
                        className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-lg shadow-purple-900/30"
                      >
                        Dismiss Ad & Continue to Settings
                      </button>
                    </div>
                  )}

                  {/* Phone Screen View: Native App vs Simulated Settings */}
                  {phoneScreen === 'app' && (
                    <div className="flex-1 flex flex-col overflow-y-auto">
                      {/* Material 3 CenterAlignedTopAppBar */}
                      <div className="px-4 py-3 border-b border-slate-800/80 bg-slate-900/40 flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-2">
                          <Smartphone className="w-4 h-4 text-purple-400" />
                          <span className="font-bold text-sm text-white">Dev Options Shortcut</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              showSnackbar('Developer status and device diagnostics updated.');
                            }}
                            className="p-1.5 text-slate-400 hover:text-white rounded-full hover:bg-slate-800 cursor-pointer"
                            title="Refresh Status"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={handleShareApp}
                            className="p-1.5 text-slate-400 hover:text-white rounded-full hover:bg-slate-800 cursor-pointer"
                            title="Share App"
                          >
                            <Share2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* App Body Content */}
                      <div className="p-4 space-y-3.5 flex-1 pb-16">
                        {/* Section Header */}
                        <div className="text-[10px] font-bold text-purple-400 tracking-wider">
                          REAL-TIME SETTINGS INSPECTOR
                        </div>

                        {/* Developer Options Status Card */}
                        <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800/90 flex items-center justify-between shadow-sm">
                          <div>
                            <div className="text-xs font-semibold text-white">Developer Options</div>
                            <div className="text-[10px] text-slate-400 font-mono">DEVELOPMENT_SETTINGS_ENABLED</div>
                          </div>
                          {devOptionsOn ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800/50">
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                              ACTIVE (ON)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                              <XCircle className="w-3 h-3 text-slate-400" />
                              DISABLED (OFF)
                            </span>
                          )}
                        </div>

                        {/* USB Debugging Status Card */}
                        <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800/90 flex items-center justify-between shadow-sm">
                          <div>
                            <div className="text-xs font-semibold text-white">USB Debugging</div>
                            <div className="text-[10px] text-slate-400 font-mono">Settings.Global.ADB_ENABLED</div>
                          </div>
                          {usbDebuggingOn ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800/50">
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                              ACTIVE (ON)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                              <XCircle className="w-3 h-3 text-slate-400" />
                              DISABLED (OFF)
                            </span>
                          )}
                        </div>

                        {/* Primary Launch Action Button */}
                        <button
                          onClick={handleMainActionClick}
                          className="w-full py-3.5 bg-purple-600 hover:bg-purple-500 active:scale-[0.98] transition-all rounded-xl font-bold text-xs text-white flex items-center justify-center gap-2 shadow-lg shadow-purple-600/25 cursor-pointer"
                        >
                          <ExternalLink className="w-4 h-4" />
                          <span>Open Developer Options</span>
                        </button>

                        <div className="text-[10px] text-center text-slate-500">
                          Action Taps: <span className="text-purple-400 font-semibold">{clickCount}</span> · Next ad on tap{' '}
                          <span className="text-purple-400 font-semibold">{Math.ceil((clickCount + 1) / 3) * 3}</span> (3-tap cap)
                        </div>

                        {/* Secondary Actions */}
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => showSnackbar('Refreshed hardware diagnostics.')}
                            className="py-2 px-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-[11px] font-medium text-slate-300 flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <RefreshCw className="w-3 h-3" />
                            <span>Refresh</span>
                          </button>
                          <button
                            onClick={handleShareApp}
                            className="py-2 px-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-[11px] font-medium text-slate-300 flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <Share2 className="w-3 h-3" />
                            <span>Share App</span>
                          </button>
                        </div>

                        {/* How to Unlock Developer Options Card */}
                        <div className="p-3.5 rounded-2xl bg-purple-950/20 border border-purple-800/30 text-left">
                          <div className="text-[11px] font-semibold text-purple-300 flex items-center gap-1.5 mb-1">
                            <Info className="w-3.5 h-3.5 text-purple-400" />
                            <span>How to Unlock Developer Options</span>
                          </div>
                          <p className="text-[10px] text-slate-400 leading-relaxed">
                            Go to About Phone &gt; tap <strong className="text-slate-200">Build Number</strong> 7 times consecutively.
                          </p>
                        </div>

                        {/* Device Info Card (Google Play Minimum Functionality compliance) */}
                        <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800/90 text-left">
                          <div className="text-xs font-semibold text-white mb-0.5">Device Hardware & OS Details</div>
                          <div className="text-[10px] text-slate-400 mb-2">Inspected directly via android.os.Build</div>
                          <div className="border-t border-slate-800 pt-2 space-y-1 text-[11px]">
                            <div className="flex justify-between py-0.5">
                              <span className="text-slate-400">Android Version</span>
                              <span className="font-semibold text-white">Android {selectedProfile.androidVersion} (API {selectedProfile.apiLevel})</span>
                            </div>
                            <div className="flex justify-between py-0.5">
                              <span className="text-slate-400">Device Model</span>
                              <span className="text-slate-200">{selectedProfile.brand} {selectedProfile.model}</span>
                            </div>
                            <div className="flex justify-between py-0.5">
                              <span className="text-slate-400">Security Patch</span>
                              <span className="text-slate-200">{selectedProfile.securityPatch}</span>
                            </div>
                            <div className="flex justify-between py-0.5">
                              <span className="text-slate-400">Build Number</span>
                              <span className="text-slate-300 font-mono text-[10px] truncate max-w-[140px]">{selectedProfile.buildNumber}</span>
                            </div>
                            <div className="flex justify-between py-0.5">
                              <span className="text-slate-400">CPU Architecture</span>
                              <span className="text-slate-300 font-mono text-[10px]">{selectedProfile.cpuAbi}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Anchored Adaptive Banner Ad at Bottom */}
                      <div className="h-12 bg-slate-900 border-t border-slate-800 flex items-center justify-between px-3 text-[10px] shrink-0 mt-auto">
                        <div className="flex items-center gap-1.5">
                          <span className="bg-emerald-500 text-black text-[8px] font-bold px-1 rounded">Ad</span>
                          <span className="text-slate-300 font-medium">Production Banner (4624168456)</span>
                        </div>
                        <span className="text-[9px] text-slate-500 font-mono text-[9px]">ca-app-pub-4783826505860771</span>
                      </div>
                    </div>
                  )}

                  {/* Simulated Screen: System Developer Options */}
                  {phoneScreen === 'settings_dev' && (
                    <div className="flex-1 flex flex-col bg-slate-900 overflow-y-auto">
                      <div className="px-3 py-3 border-b border-slate-800 flex items-center gap-2 bg-slate-950">
                        <button
                          onClick={handleBackToApp}
                          className="p-1 text-slate-300 hover:text-white rounded cursor-pointer"
                        >
                          <ArrowLeft className="w-4 h-4" />
                        </button>
                        <span className="font-semibold text-xs text-white">System Settings &gt; Developer options</span>
                      </div>
                      <div className="p-4 space-y-3 text-xs">
                        <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700/60 flex items-center justify-between">
                          <div>
                            <div className="font-semibold text-white">Use developer options</div>
                            <div className="text-[10px] text-slate-400">Master development switch</div>
                          </div>
                          <input
                            type="checkbox"
                            checked={devOptionsOn}
                            onChange={(e) => setDevOptionsOn(e.target.checked)}
                            className="w-4 h-4 accent-purple-600 cursor-pointer"
                          />
                        </div>
                        <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700/60 flex items-center justify-between">
                          <div>
                            <div className="font-semibold text-white">USB debugging</div>
                            <div className="text-[10px] text-slate-400">Debug mode when USB is connected</div>
                          </div>
                          <input
                            type="checkbox"
                            checked={usbDebuggingOn}
                            onChange={(e) => setUsbDebuggingOn(e.target.checked)}
                            className="w-4 h-4 accent-purple-600 cursor-pointer"
                          />
                        </div>
                        <div className="p-3 bg-slate-800/40 rounded-xl border border-slate-800 text-[11px] text-slate-400 space-y-2">
                          <p>Simulating phone system settings. Toggle any switch above, then tap &quot;Back to App&quot; to test the real-time onResume() lifecycle update!</p>
                          <button
                            onClick={handleBackToApp}
                            className="w-full py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold cursor-pointer"
                          >
                            Return to Dev Options Shortcut (onResume)
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Simulated Screen: About Phone (Build Number 7-Tap Flow) */}
                  {phoneScreen === 'settings_about' && (
                    <div className="flex-1 flex flex-col bg-slate-900 overflow-y-auto">
                      <div className="px-3 py-3 border-b border-slate-800 flex items-center gap-2 bg-slate-950">
                        <button
                          onClick={handleBackToApp}
                          className="p-1 text-slate-300 hover:text-white rounded cursor-pointer"
                        >
                          <ArrowLeft className="w-4 h-4" />
                        </button>
                        <span className="font-semibold text-xs text-white">Settings &gt; About Phone</span>
                      </div>
                      <div className="p-4 space-y-2 text-xs">
                        <div className="p-3 bg-amber-950/30 border border-amber-800/40 rounded-xl text-amber-300 text-[11px]">
                          <strong>Developer Options Locked</strong>: Tap the Build Number below 7 times to unlock it.
                        </div>

                        <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700/60">
                          <div className="text-[10px] text-slate-400">Device Name</div>
                          <div className="font-semibold text-white">{selectedProfile.brand} {selectedProfile.model}</div>
                        </div>

                        <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700/60">
                          <div className="text-[10px] text-slate-400">Android Version</div>
                          <div className="font-semibold text-white">Android {selectedProfile.androidVersion}</div>
                        </div>

                        <button
                          onClick={handleBuildNumberTap}
                          className="w-full p-3 bg-purple-950/40 hover:bg-purple-900/50 border-2 border-purple-500/50 active:scale-[0.98] transition-all rounded-xl text-left cursor-pointer"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-purple-300 font-bold uppercase">Tap me 7 times</span>
                            <span className="text-[10px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full font-bold">
                              {buildTapCounter}/7
                            </span>
                          </div>
                          <div className="text-[11px] font-semibold text-white mt-1">Build Number</div>
                          <div className="text-[10px] font-mono text-slate-300">{selectedProfile.buildNumber}</div>
                        </button>

                        <button
                          onClick={handleBackToApp}
                          className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium cursor-pointer mt-2"
                        >
                          Cancel & Return to App
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Material 3 Snackbar Host in Simulator */}
                  {snackbarMessage && (
                    <div className="absolute bottom-14 left-3 right-3 bg-slate-800 border border-slate-700 text-white text-[11px] p-2.5 rounded-xl shadow-xl z-40 animate-in slide-in-from-bottom duration-150">
                      {snackbarMessage}
                    </div>
                  )}

                  {/* Android Navigation Pill Bar */}
                  <div className="h-4 flex items-center justify-center shrink-0">
                    <div className="w-24 h-1 bg-slate-600 rounded-full"></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Interactive Workbench & OEM Switchers */}
            <div className="lg:col-span-7 space-y-6">
              {/* Profile & Compatibility Switcher */}
              <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-bold text-sm text-white flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-purple-400" />
                      Universal Android Version & Device Switcher
                    </h3>
                    <p className="text-xs text-slate-400">
                      Test multi-tier intent fallbacks across API 21 (Android 5.0) to API 35 (Android 15)
                    </p>
                  </div>
                  <span className="text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                    99.8% Global Reach
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {DEVICE_PROFILES.map((profile) => (
                    <button
                      key={profile.name}
                      onClick={() => {
                        setSelectedProfile(profile);
                        setPhoneScreen('app');
                        showSnackbar(`Switched device profile to ${profile.name}`);
                      }}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        selectedProfile.name === profile.name
                          ? 'bg-purple-950/40 border-purple-500 shadow-sm'
                          : 'bg-slate-950/50 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-white">{profile.name}</span>
                        <span className="text-[10px] font-bold text-purple-400">API {profile.apiLevel}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">{profile.oemSkin}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Real-time State & Fallback Injection Controls */}
              <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
                <h3 className="font-bold text-sm text-white flex items-center gap-2 mb-1">
                  <Layers className="w-4 h-4 text-purple-400" />
                  Live State Simulator & Fallback Injections
                </h3>
                <p className="text-xs text-slate-400 mb-4">
                  Manipulate system settings or simulate locked states to verify graceful error recovery
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                    <div className="text-xs font-medium text-white mb-2">Developer Options</div>
                    <button
                      onClick={() => {
                        setDevOptionsOn(!devOptionsOn);
                        showSnackbar(`Settings.Global.DEVELOPMENT_SETTINGS_ENABLED = ${!devOptionsOn ? '1' : '0'}`);
                      }}
                      className={`w-full py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        devOptionsOn ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {devOptionsOn ? 'Toggle OFF' : 'Toggle ON'}
                    </button>
                  </div>

                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                    <div className="text-xs font-medium text-white mb-2">USB Debugging</div>
                    <button
                      onClick={() => {
                        setUsbDebuggingOn(!usbDebuggingOn);
                        showSnackbar(`Settings.Global.ADB_ENABLED = ${!usbDebuggingOn ? '1' : '0'}`);
                      }}
                      className={`w-full py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        usbDebuggingOn ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {usbDebuggingOn ? 'Toggle OFF' : 'Toggle ON'}
                    </button>
                  </div>

                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                    <div className="text-xs font-medium text-white mb-2">Locked State Test</div>
                    <button
                      onClick={() => {
                        setIsLocked(!isLocked);
                        if (!isLocked) {
                          setDevOptionsOn(false);
                          showSnackbar('Simulated locked device: ActivityNotFoundException will be triggered.');
                        } else {
                          showSnackbar('Developer options unlocked.');
                        }
                      }}
                      className={`w-full py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        isLocked ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {isLocked ? 'Unlocked Mode' : 'Lock Dev Options'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Android Intent & AdMob Dispatch Telemetry Console */}
              <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-bold text-sm text-white flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-purple-400" />
                    Android Intent & Ad Lifecycle Log
                  </h3>
                  <button
                    onClick={() => setIntentLog(['Log cleared.'])}
                    className="text-[11px] text-slate-400 hover:text-slate-200 cursor-pointer"
                  >
                    Clear Log
                  </button>
                </div>
                <div className="h-40 bg-slate-950 rounded-xl p-3 font-mono text-[11px] text-slate-300 overflow-y-auto space-y-1 border border-slate-800/80">
                  {intentLog.map((log, idx) => (
                    <div key={idx} className="flex gap-2">
                      <span className="text-slate-600 select-none">&gt;</span>
                      <span className={log.includes('[Fallback]') ? 'text-amber-400' : log.includes('[Intent Success]') ? 'text-emerald-400' : 'text-slate-300'}>
                        {log}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Android Project Source Explorer */}
        {activeTab === 'code' && (
          <div className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* File List Sidebar */}
            <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm text-white flex items-center gap-2">
                  <Code2 className="w-4 h-4 text-purple-400" />
                  Project Files ({ANDROID_FILES.length})
                </h3>
                <button
                  onClick={handleDownloadZip}
                  className="text-xs text-purple-400 hover:text-purple-300 font-semibold cursor-pointer"
                >
                  Download .zip
                </button>
              </div>

              <div className="space-y-1 max-h-[640px] overflow-y-auto pr-1">
                {ANDROID_FILES.map((file) => (
                  <button
                    key={file.path}
                    onClick={() => setSelectedFile(file)}
                    className={`w-full p-2.5 rounded-xl text-left text-xs transition-colors flex items-center justify-between cursor-pointer ${
                      selectedFile.path === file.path
                        ? 'bg-purple-600 text-white font-semibold'
                        : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <div className="truncate pr-2">
                      <div className="truncate">{file.name}</div>
                      <div className={`text-[10px] truncate ${selectedFile.path === file.path ? 'text-purple-200' : 'text-slate-500'}`}>
                        {file.path}
                      </div>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 shrink-0 opacity-60" />
                  </button>
                ))}
              </div>
            </div>

            {/* Code Viewer */}
            <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex flex-col">
              <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
                <div>
                  <div className="font-bold text-sm text-white">{selectedFile.name}</div>
                  <div className="text-[11px] text-slate-400">{selectedFile.description}</div>
                </div>
                <button
                  onClick={() => copyCode(selectedFile.content, selectedFile.path)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  {copiedPath === selectedFile.path ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy File</span>
                    </>
                  )}
                </button>
              </div>

              <div className="p-4 bg-slate-950 overflow-x-auto max-h-[640px]">
                <pre className="font-mono text-xs leading-relaxed text-slate-200">
                  <code>{selectedFile.content}</code>
                </pre>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Google Play & AdMob Policy Compliance */}
        {activeTab === 'policy' && (
          <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
            <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <h2 className="font-bold text-lg text-white">Google Play Policy & AdMob Compliance Architecture</h2>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Utility shortcut apps frequently risk automated review rejections unless they strictly adhere to Google Play&apos;s
                <strong> Minimum Functionality policy</strong> and AdMob&apos;s <strong>Disallowed Implementation policy</strong>.
                This project has been engineered specifically to eliminate these hazards.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div className="p-4 bg-slate-950 rounded-xl border border-slate-800">
                  <h4 className="font-bold text-sm text-purple-300 mb-2">1. Play Store &quot;Minimum Functionality&quot; Policy</h4>
                  <ul className="text-xs text-slate-400 space-y-2 list-disc list-inside">
                    <li>Single-button shortcut apps without standalone utility get flagged as low-value wrappers.</li>
                    <li><strong>Solution</strong>: Embedded full <code className="text-purple-300">DeviceInfoCard</code> reporting Android release, API level, SoC, Security patch, Model, and Build fingerprint.</li>
                    <li>Provides live real-time detection of both <code className="text-purple-300">DEVELOPMENT_SETTINGS_ENABLED</code> and <code className="text-purple-300">ADB_ENABLED</code>.</li>
                  </ul>
                </div>

                <div className="p-4 bg-slate-950 rounded-xl border border-slate-800">
                  <h4 className="font-bold text-sm text-purple-300 mb-2">2. AdMob Interstitial Frequency Policy</h4>
                  <ul className="text-xs text-slate-400 space-y-2 list-disc list-inside">
                    <li>Showing an interstitial ad every time a user taps a shortcut button breaches AdMob Disallowed Implementation rules.</li>
                    <li><strong>Solution</strong>: Implemented a strict <strong>3-tap frequency cap</strong> (<code className="text-purple-300">clickCount % 3 == 0</code>).</li>
                    <li>Guaranteed <strong>Fail-Open</strong> execution: user is never blocked if an ad is loading or fails.</li>
                  </ul>
                </div>

                <div className="p-4 bg-slate-950 rounded-xl border border-slate-800">
                  <h4 className="font-bold text-sm text-purple-300 mb-2">3. Universal API 21 - API 35 Support</h4>
                  <ul className="text-xs text-slate-400 space-y-2 list-disc list-inside">
                    <li><code className="text-purple-300">compileSdk = 35</code>, <code className="text-purple-300">targetSdk = 35</code>, <code className="text-purple-300">minSdk = 21</code>.</li>
                    <li>Dynamic Color (Material You) guarded with <code className="text-purple-300">Build.VERSION.SDK_INT &gt;= 31</code>.</li>
                    <li>Security Patch guarded with <code className="text-purple-300">Build.VERSION.SDK_INT &gt;= 23</code>.</li>
                  </ul>
                </div>

                <div className="p-4 bg-slate-950 rounded-xl border border-slate-800">
                  <h4 className="font-bold text-sm text-purple-300 mb-2">4. Multi-Tier OEM Intent Routing</h4>
                  <ul className="text-xs text-slate-400 space-y-2 list-disc list-inside">
                    <li>Standard AOSP Intent <code className="text-purple-300">Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS</code>.</li>
                    <li>OEM fallbacks for Xiaomi (MIUI/HyperOS), Samsung (One UI), Huawei (EMUI).</li>
                    <li>Catch <code className="text-purple-300">ActivityNotFoundException</code> and open &quot;About Phone&quot; with unlock guidance.</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Gradle Build & Android Studio Guide */}
        {activeTab === 'gradle' && (
          <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
            <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
              <div className="flex items-center gap-2">
                <Terminal className="w-5 h-5 text-purple-400" />
                <h2 className="font-bold text-lg text-white">Android Studio Import & CLI Commands</h2>
              </div>

              <div className="space-y-4 text-xs">
                <div>
                  <h4 className="font-semibold text-white mb-1.5">1. Import into Android Studio</h4>
                  <p className="text-slate-400 leading-relaxed">
                    Download the project zip using the button in the header, extract the archive, and open the folder in
                    <strong> Android Studio Ladybug (2024.2+)</strong> or newer.
                  </p>
                </div>

                <div>
                  <h4 className="font-semibold text-white mb-1.5">2. Build Debug APK via Command Line</h4>
                  <pre className="p-3 bg-slate-950 rounded-xl font-mono text-purple-300 border border-slate-800">
                    ./gradlew assembleDebug
                  </pre>
                  <p className="text-slate-400 mt-1">Output: <code className="text-slate-300">app/build/outputs/apk/debug/app-debug.apk</code></p>
                </div>

                <div>
                  <h4 className="font-semibold text-white mb-1.5">3. Build Signed Release Bundle (.aab) for Google Play</h4>
                  <pre className="p-3 bg-slate-950 rounded-xl font-mono text-purple-300 border border-slate-800">
                    ./gradlew bundleRelease
                  </pre>
                  <p className="text-slate-400 mt-1">Output: <code className="text-slate-300">app/build/outputs/bundle/release/app-release.aab</code></p>
                </div>

                <div>
                  <h4 className="font-semibold text-white mb-1.5">4. Active Production AdMob Configuration</h4>
                  <p className="text-slate-400 leading-relaxed">
                    The project files (<code className="text-purple-300">AndroidManifest.xml</code>, <code className="text-purple-300">strings.xml</code>, and <code className="text-purple-300">AdManager.kt</code>) are now configured with your live AdMob credentials:
                  </p>
                  <ul className="text-slate-300 font-mono text-[11px] mt-2 space-y-1 list-disc list-inside">
                    <li>App ID: <code className="text-purple-300">ca-app-pub-4783826505860771~9544574215</code></li>
                    <li>Banner Unit ID: <code className="text-purple-300">ca-app-pub-4783826505860771/4624168456</code></li>
                    <li>Interstitial Unit ID: <code className="text-purple-300">ca-app-pub-4783826505860771/6316609796</code></li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
