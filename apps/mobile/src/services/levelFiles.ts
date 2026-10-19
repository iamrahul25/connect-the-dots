import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';

const MIME = 'application/json';

function downloadOnWeb(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: MIME }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function writeCacheFile(fileName: string, text: string): File {
  const file = new File(Paths.cache, fileName);
  if (file.exists) file.delete();
  file.create();
  file.write(text);
  return file;
}

/**
 * Saves the level as a .json file. Android asks for a folder (Downloads, Drive, ...);
 * iOS opens the share sheet, where "Save to Files" lives; web downloads it.
 */
export async function downloadLevelFile(fileName: string, text: string): Promise<'saved' | 'cancelled'> {
  if (Platform.OS === 'web') {
    downloadOnWeb(fileName, text);
    return 'saved';
  }
  if (Platform.OS === 'android') {
    let dir: Directory;
    try {
      dir = await Directory.pickDirectoryAsync();
    } catch {
      return 'cancelled';
    }
    if (!dir) return 'cancelled';
    dir.createFile(fileName, MIME).write(text);
    return 'saved';
  }
  const file = writeCacheFile(fileName, text);
  await Sharing.shareAsync(file.uri, { mimeType: MIME, UTI: 'public.json', dialogTitle: 'Save level' });
  return 'saved';
}

/** Opens the system share sheet with the level as a .json file (falls back to a download on web). */
export async function shareLevelFile(fileName: string, text: string): Promise<void> {
  if (Platform.OS === 'web') {
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;
    const blobFile = typeof globalThis.File === 'function' ? new globalThis.File([text], fileName, { type: MIME }) : null;
    if (blobFile && nav?.canShare?.({ files: [blobFile] })) {
      await nav.share({ files: [blobFile], title: fileName });
      return;
    }
    downloadOnWeb(fileName, text);
    return;
  }
  const file = writeCacheFile(fileName, text);
  await Sharing.shareAsync(file.uri, { mimeType: MIME, UTI: 'public.json', dialogTitle: 'Share level' });
}

/** Lets the player pick a level file; resolves to its text, or null if they backed out. */
export async function pickLevelFile(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({
    // Chat apps often hand .json files over as generic binaries, so accept anything on native.
    type: Platform.OS === 'web' ? ['application/json', '.json', 'text/plain'] : '*/*',
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  if (Platform.OS === 'web') {
    if (asset.file) return asset.file.text();
    return (await fetch(asset.uri)).text();
  }
  return new File(asset.uri).text();
}
