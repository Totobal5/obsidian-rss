import type RssReaderPlugin from '../main';
import type {RssFeed} from '../settings/settings';
import type {RssFeedContent} from '../parser/rssParser';
import {feedsStore, configuredFeedsStore, filteredStore, foldedState} from '../stores';

export class SettingsManager {
  private saveTimer?: number;
  
  constructor(private plugin: RssReaderPlugin) {

  }

  async writeFeedContent(change: (items: RssFeedContent[]) => RssFeedContent[]): Promise<void> {
    const current = this.plugin.settings.items || [];
    const updated = change(current);
    await feedsStore.update(()=> updated);
    await this.plugin.writeSettingsInternal(o => ({items: updated}));
    this.plugin.rebuildIndexes();
  }

  async writeFeedContentDebounced(mutator: (items: RssFeedContent[]) => void, delay = 250): Promise<void> {
    const items = this.plugin.settings.items || [];
    mutator(items);
    await feedsStore.update(()=> items);
    this.plugin.rebuildIndexes();
    if (this.saveTimer) window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(async () => {
      await this.plugin.writeSettingsInternal(o => ({items}));
      this.saveTimer = undefined;
    }, delay);
  }

  async writeFeeds(change: (feeds: RssFeed[]) => Partial<RssFeed[]>): Promise<void> {
    await configuredFeedsStore.update(old => ({...old, ...change(old)}));
    await this.plugin.writeSettingsInternal(o => ({feeds: change(o.feeds)}));
  }

  async writeFiltered(change: (folders: any[]) => Partial<any[]>): Promise<void> {
    await filteredStore.update(old => ({...old, ...change(old)}));
    await this.plugin.writeSettingsInternal(o => ({filtered: change(o.filtered)}));
  }

  async writeFolded(folded: string[]): Promise<void> {
    await foldedState.update(()=> folded);
    await this.plugin.writeSettingsInternal(()=> ({folded}));
  }
}
