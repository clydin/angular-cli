/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import { normalize, virtualFs } from '../virtual-fs';

export interface WorkspaceHost {
  readFile(path: string): Promise<string>;
  writeFile(path: string, data: string): Promise<void>;

  isDirectory(path: string): Promise<boolean>;
  isFile(path: string): Promise<boolean>;

  // Potential future additions
  // readDirectory?(path: string): Promise<string[]>;
}

/**
 * Minimal file system interface that is compatible with Node.js fs/promises
 * for use with the workspaces {@link createWorkspaceHost} utility function.
 */
export interface WorkspacePromisesFileSystem {
  readdir(path: string): Promise<string[]>;
  stat(path: string): Promise<{ isFile(): boolean; isDirectory(): boolean }>;
  readFile(path: string, encoding: 'utf8'): Promise<string>;
  writeFile(path: string, data: string, encoding: 'utf8'): Promise<void>;
}

export function createWorkspaceHost(host: virtualFs.Host): WorkspaceHost;
export function createWorkspaceHost(fileSystem: WorkspacePromisesFileSystem): WorkspaceHost;

export function createWorkspaceHost(
  hostOrFileSystem: virtualFs.Host | WorkspacePromisesFileSystem,
): WorkspaceHost {
  if ('isDirectory' in hostOrFileSystem && 'isFile' in hostOrFileSystem) {
    // Create using an `@angular/core` virtualFs Host
    const workspaceHost: WorkspaceHost = {
      async readFile(path: string): Promise<string> {
        const data = await hostOrFileSystem.read(normalize(path)).toPromise();

        return virtualFs.fileBufferToString(data);
      },
      async writeFile(path: string, data: string): Promise<void> {
        return hostOrFileSystem
          .write(normalize(path), virtualFs.stringToFileBuffer(data))
          .toPromise();
      },
      async isDirectory(path: string): Promise<boolean> {
        try {
          return await hostOrFileSystem.isDirectory(normalize(path)).toPromise();
        } catch {
          // some hosts throw if path does not exist
          return false;
        }
      },
      async isFile(path: string): Promise<boolean> {
        try {
          return await hostOrFileSystem.isFile(normalize(path)).toPromise();
        } catch {
          // some hosts throw if path does not exist
          return false;
        }
      },
    };

    return workspaceHost;
  } else {
    // Setup using Node.js fs/promises
    const workspaceHost: WorkspaceHost = {
      async readFile(path: string): Promise<string> {
        return hostOrFileSystem.readFile(path, 'utf8');
      },
      async writeFile(path: string, data: string): Promise<void> {
        return hostOrFileSystem.writeFile(path, data, 'utf8');
      },
      async isDirectory(path: string): Promise<boolean> {
        try {
          return (await hostOrFileSystem.stat(path)).isDirectory();
        } catch {
          return false;
        }
      },
      async isFile(path: string): Promise<boolean> {
        try {
          return (await hostOrFileSystem.stat(path)).isFile();
        } catch {
          return false;
        }
      },
    };

    return workspaceHost;
  }
}
