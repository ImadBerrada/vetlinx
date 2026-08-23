import { Module } from '@nestjs/common';
import { LocalPrivateFileStorage } from './local-private-file.storage';
import { PRIVATE_FILE_STORAGE } from './private-file-storage.port';

@Module({
  providers: [
    LocalPrivateFileStorage,
    { provide: PRIVATE_FILE_STORAGE, useExisting: LocalPrivateFileStorage },
  ],
  exports: [PRIVATE_FILE_STORAGE],
})
export class PrivateFilesModule {}
