import type RssReaderPlugin from '../main';
import {getFeedItems, RssFeedContent} from '../parser/rssParser';
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
        finalFeeds.push(newFeed);
      } else {
        const existingLinks = new Set(existingFeed.items.map(i=> i.link));
        const newItems = newFeed.items.filter(i=> !existingLinks.has(i.link));
        if (newItems.length) existingFeed.items.push(...newItems);
        existingFeed.title = newFeed.title; existingFeed.description = newFeed.description; existingFeed.image = newFeed.image; existingFeed.link = newFeed.link;
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
