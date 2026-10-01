import JSZip from 'jszip';
import { ANDROID_FILES } from '../data/androidProjectFiles';

export async function downloadAndroidProjectZip(): Promise<void> {
  const zip = new JSZip();

  // Root project folder
  const root = zip.folder('DevOptionsShortcut');
  if (!root) return;

  // Add all project files into their relative paths
  for (const file of ANDROID_FILES) {
    root.file(file.path, file.content);
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
