/**
 * OPFS (Origin Private File System) access.
 *
 * OPFS gives each origin a file-backed store on the user's device that
 * persists independent of regular browser storage eviction, without
 * requiring a permission prompt. We keep generic JSON blobs here, one
 * file per key.
 */

let rootPromise: Promise<FileSystemDirectoryHandle> | null = null;

function root(): Promise<FileSystemDirectoryHandle> {
  if (!rootPromise) {
    rootPromise = navigator.storage
      .getDirectory()
      .then((dir) => dir.getDirectoryHandle('litheum', { create: true }));
  }
  return rootPromise;
}

export async function getBrowserCaches(
  _name: string
): Promise<FileSystemDirectoryHandle> {
  return root();
}
