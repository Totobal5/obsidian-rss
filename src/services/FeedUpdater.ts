import type RssReaderPlugin from '../main';
import {getFeedItems} from '../parser/rssParser';
import type {RssFeedContent} from '../parser/rssParser';
import {LocalFeedProvider} from '../providers/local/LocalFeedProvider';
import t from '../l10n/locale';
import {Notice} from 'obsidian';

export class FeedUpdater {
  private abort?: AbortController;
  private updating = false;
  constructor(private plugin: RssReaderPlugin) {}

  isUpdating(){ return this.updating; }
  cancel(){ this.abort?.abort(); }

  async updateFeeds(): Promise<void> {
    if (this.updating) { console.log('⏳ updateFeeds skipped (already running)'); return; }
    this.updating = true;
    this.abort = new AbortController();
    const updateStartTime = performance.now();
    console.log('🔄 RSS Reader: Starting feed update...');

    const timeout = (p: Promise<any>, ms: number) => new Promise((res, rej) => { const to = setTimeout(()=> {rej(new Error('timeout'));}, ms); p.then(v=>{clearTimeout(to); res(v);}, e=>{clearTimeout(to); rej(e);}); });
    const feedPromises = this.plugin.settings.feeds.map(async feed => {
      const feedStart = performance.now();
      try {
        const items = await timeout(getFeedItems(feed, {signal: this.abort!.signal}), 15000);
        if (!items) return null;
        console.log(`📡 Feed "${feed.name}" loaded in ${(performance.now() - feedStart).toFixed(2)}ms`);
        return items;
      } catch (error: any) {
        if (error?.name === 'AbortError') console.warn(`⛔ Feed fetch aborted: ${feed.name}`);
        else if (error?.message === 'timeout') console.warn(`⏱️ Feed timed out: ${feed.name}`);
        else console.error(`❌ Failed to load feed "${feed.name}":`, error);
        return null;
      }
    });

    const results = await Promise.all(feedPromises);
    const newFeeds = results.filter(Boolean) as RssFeedContent[];
    const existingFeeds = this.plugin.settings.items || [];
    const finalFeeds: RssFeedContent[] = [...existingFeeds];

    for (const newFeed of newFeeds) {
      const existingFeed = finalFeeds.find(f => f.name === newFeed.name && f.folder === newFeed.folder);
      if (!existingFeed) {
        // Nuevo feed completo: simplemente agregar
        finalFeeds.push(newFeed);
      } else {
        // Merge profundo por link preservando flags de usuario
        const existingByLink = new Map(existingFeed.items.map(i => [i.link, i]));
        const seen = new Set<string>();
        const merged: any[] = [];
        for (const fresh of newFeed.items) {
          const old = existingByLink.get(fresh.link);
          if (old) {
            // Preservar estado del usuario sobre el item antiguo
            const preserved = {
              ...fresh, // metadatos recientes (title, description, etc)
              read: old.read !== undefined ? old.read : fresh.read,
              favorite: old.favorite !== undefined ? old.favorite : fresh.favorite,
              created: old.created !== undefined ? old.created : fresh.created,
              visited: old.visited !== undefined ? old.visited : fresh.visited,
              tags: Array.isArray(old.tags) && old.tags.length ? old.tags : fresh.tags,
              highlights: Array.isArray(old.highlights) && old.highlights.length ? old.highlights : fresh.highlights,
            };
            merged.push(preserved);
          } else {
            // Item nuevo -> conservar tal cual
            merged.push(fresh);
          }
          seen.add(fresh.link);
        }
        // Mantener items antiguos que ya no vienen en el feed (para histórico)
        for (const old of existingFeed.items) {
          if (!seen.has(old.link)) merged.push(old);
        }
        existingFeed.items = merged;
        // Actualizar metadatos de feed
        existingFeed.title = newFeed.title;
        existingFeed.description = newFeed.description;
        existingFeed.image = newFeed.image;
        existingFeed.link = newFeed.link;
      }
    }

    new Notice(t('refreshed_feeds'));
  await this.plugin.settingsManager.writeFeedContent(()=> finalFeeds);

    const localProvider = await this.plugin.providers.getById('local') as LocalFeedProvider;
    localProvider?.invalidateCache && localProvider.invalidateCache();

    console.log(`✅ Feed update completed in ${(performance.now() - updateStartTime).toFixed(2)}ms total`);
    this.updating = false;
  }
}
