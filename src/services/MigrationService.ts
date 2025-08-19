import type RssReaderPlugin from '../main';

export class MigrationService {
  constructor(private plugin: RssReaderPlugin) {}
  async migrateData(): Promise<void> {
    console.log('ℹ️ MigrationService: migrateData placeholder');
  }
}