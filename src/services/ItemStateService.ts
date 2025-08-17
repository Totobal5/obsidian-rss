import type RssReaderPlugin from '../main';
import {RSS_EVENTS} from '../events';
import t from '../l10n/locale';
import {Notice} from 'obsidian';

export class ItemStateService {
  constructor(private plugin: RssReaderPlugin) {}

  async toggleRead(wrapperOrRaw: any): Promise<boolean> {
    const raw = (wrapperOrRaw && wrapperOrRaw.item) ? wrapperOrRaw.item : wrapperOrRaw;
    const newState = !raw.read;
    raw.read = newState;
    if (wrapperOrRaw?.markRead) wrapperOrRaw.markRead(newState);
    this.syncRaw(raw, {read: newState});
    await this.plugin.settingsManager.writeFeedContentDebounced(()=>{},250);
    try { document.dispatchEvent(new CustomEvent(RSS_EVENTS.UNREAD_COUNTS_CHANGED)); } catch {}
    try { document.dispatchEvent(new CustomEvent(RSS_EVENTS.ITEM_READ_UPDATED, {detail:{link: raw.link, read: newState}})); } catch {}
    return newState;
  }

  async toggleFavorite(wrapperOrRaw: any): Promise<boolean> {
    const raw = (wrapperOrRaw && wrapperOrRaw.item) ? wrapperOrRaw.item : wrapperOrRaw;
    const newFav = !raw.favorite;
    raw.favorite = newFav;
    this.syncRaw(raw, {favorite: newFav});
    await this.plugin.settingsManager.writeFeedContentDebounced(()=>{},250);
    new Notice(newFav ? t('added_to_favorites') : t('removed_from_favorites'));
    try { document.dispatchEvent(new CustomEvent(RSS_EVENTS.FAVORITE_UPDATED, {detail:{link: raw.link, favorite: newFav}})); } catch {}
    return newFav;
  }

  private syncRaw(raw: any, fields: Record<string, any>): void {
    for (const feedContent of (this.plugin.settings.items || [])) {
      if (!feedContent || !Array.isArray(feedContent.items)) continue;
      const match = feedContent.items.find((i:any)=> i.link === raw.link);
      if (match) { Object.assign(match, fields); break; }
    }
  }
}
