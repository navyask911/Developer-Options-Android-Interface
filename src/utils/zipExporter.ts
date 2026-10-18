import JSZip from 'jszip';
import { ANDROID_FILES } from '../data/androidProjectFiles';

export async function downloadAndroidProjectZip(): Promise<void> {
  const zip = new JSZip();

  // Root project folder
  const root = zip.folder('DevOptionsShortcut');
  if (!root) return;

  // Add text templates as text and supplied launcher/store artwork as binary data.
  for (const file of ANDROID_FILES) {
    if (file.binaryAsset) {
      const assetUrl = `${import.meta.env.BASE_URL}${file.binaryAsset}`;
      const response = await fetch(assetUrl);
      if (!response.ok) {
        throw new Error(`Could not load project asset: ${file.binaryAsset}`);
      }
      root.file(file.path, await response.blob());
    } else {
      root.file(file.path, file.content);
    }
  }

  // Generate binary zip blob
  const content = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });

  // Create temporary link and trigger download
  const url = URL.createObjectURL(content);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'DevOptionsShortcut_Android_Source.zip';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
