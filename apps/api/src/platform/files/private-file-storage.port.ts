export const PRIVATE_FILE_STORAGE = Symbol('PRIVATE_FILE_STORAGE');

export interface StoredPrivateFile {
  objectKey: string;
  checksumSha256: string;
  byteSize: number;
  mediaType: string;
}

export interface PrivateFileStorage {
  store(file: Express.Multer.File): Promise<StoredPrivateFile>;
  read(objectKey: string): Promise<Buffer>;
  remove(objectKey: string): Promise<void>;
}
