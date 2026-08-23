import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import type {
  PrivateFileStorage,
  StoredPrivateFile,
} from './private-file-storage.port';

const MAX_BYTES = 10 * 1024 * 1024;
const allowedTypes = new Map([
  ['application/pdf', { extension: '.pdf', signature: Buffer.from('%PDF-') }],
  [
    'image/png',
    { extension: '.png', signature: Buffer.from([0x89, 0x50, 0x4e, 0x47]) },
  ],
  [
    'image/jpeg',
    { extension: '.jpg', signature: Buffer.from([0xff, 0xd8, 0xff]) },
  ],
]);

@Injectable()
export class LocalPrivateFileStorage implements PrivateFileStorage {
  private readonly root: string;

  constructor(config: ConfigService) {
    this.root = resolve(config.getOrThrow<string>('EVIDENCE_STORAGE_PATH'));
  }

  async store(file: Express.Multer.File): Promise<StoredPrivateFile> {
    if (!file?.buffer?.length)
      throw new BadRequestException('A file is required');
    if (file.size > MAX_BYTES)
      throw new BadRequestException('File must be 10 MB or smaller');
    const definition = allowedTypes.get(file.mimetype);
    if (
      !definition ||
      !file.buffer
        .subarray(0, definition.signature.length)
        .equals(definition.signature)
    ) {
      throw new BadRequestException(
        'Only valid PDF, PNG, and JPEG files are accepted',
      );
    }
    const now = new Date();
    const objectKey = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}${definition.extension}`;
    const target = this.safeTarget(objectKey);
    await mkdir(resolve(target, '..'), { recursive: true, mode: 0o700 });
    await writeFile(target, file.buffer, { flag: 'wx', mode: 0o600 });
    return {
      objectKey,
      checksumSha256: createHash('sha256').update(file.buffer).digest('hex'),
      byteSize: file.size,
      mediaType: file.mimetype,
    };
  }

  read(objectKey: string) {
    return readFile(this.safeTarget(objectKey));
  }

  async remove(objectKey: string): Promise<void> {
    await rm(this.safeTarget(objectKey), { force: true });
  }

  private safeTarget(objectKey: string): string {
    const target = resolve(this.root, objectKey);
    if (!target.startsWith(`${this.root}${sep}`))
      throw new BadRequestException('Invalid private file path');
    return target;
  }
}
