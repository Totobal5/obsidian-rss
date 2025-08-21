import type RssReaderPlugin from '../main';
import {RSS_EVENTS} from '../events';
import t from '../l10n/locale';
import {Notice} from 'obsidian';
import type { Item } from '../providers/Item';
import type { RssFeedContent, RssFeedItem } from '../parser/rssParser';

/**
 * Service class for managing the state of RSS feed items, such as read/unread and favorite status.
 *
 * @remarks
 * This service interacts with the plugin's settings manager to persist changes and dispatches custom events
 * to notify other parts of the application about state updates.
 *
 * @example
 * ```typescript
 * const service = new ItemStateService(plugin);
 * await service.toggleRead(item);
 * await service.toggleFavorite(item);
 * ```
 *
 * @param plugin - The instance of the RssReaderPlugin used for accessing settings and utilities.
 */
export class ItemStateService {

    constructor(private plugin: RssReaderPlugin) {}

    async toggleRead(item: Item): Promise<boolean> {
        const newState = !item.read();

        // Use the unified write method with proper mutator
        await this.plugin.writeFeedContentDebounced((items) => {
            this.syncRawInItems(items, item, {read: newState});
        }, 250);

        // Dispatch events
        try { 
            document.dispatchEvent(new CustomEvent(RSS_EVENTS.UNREAD_COUNTS_CHANGED));
            document.dispatchEvent(new CustomEvent(RSS_EVENTS.ITEM_READ_UPDATED, {
                detail: { link: item.url(), read: newState }
            }) );
            
        } catch (e) {
            console.warn('Failed to dispatch read events:', e);
        }

        return newState;
    }

    async toggleFavorite(item: Item): Promise<boolean> {
        const newFav = !item.starred();

        await this.plugin.writeFeedContentDebounced((items) => {
            this.syncRawInItems(items, item, { favorite: newFav });
        }, 250);

        new Notice(newFav ? t('added_to_favorites') : t('removed_from_favorites'));

        try {
            document.dispatchEvent(new CustomEvent(RSS_EVENTS.FAVORITE_UPDATED, {
                detail: { link: item.url(), favorite: newFav }
            }) );
            
        } catch (e) {
            console.warn('Failed to dispatch favorite events:', e);
        }

        return newFav;
    }

    /**
     * Updates the raw item fields in the items array
     * @private
     */
    private syncRawInItems(raw: RssFeedContent[], item: Item, fields: Record<string, any>): void {
        for (const feedContent of raw) {
            if (!feedContent || !Array.isArray(feedContent.items)) continue;
            const match = feedContent.items.find((i: RssFeedItem) => i.link === item.url());

            if (match) {
                Object.assign(match, fields);
                break;
            }
        }
    }

    /**
     * Gets an item by link using FeedsManager index
     */
    public getItemByLink(link: string) {
        return this.plugin.feedsManager?.getItemByLink(link);
    }

    /**
     * Gets unread count for a feed using FeedsManager
     */
    public getUnreadCountForFeed(feedName: string): number {
        return this.plugin.feedsManager?.getUnreadCountForFeed(feedName) || 0;
    }

    /**
     * Gets unread count for a folder using FeedsManager
     */
    public getUnreadCountForFolder(folder: string): number {
        return this.plugin.feedsManager?.getUnreadCountForFolder(folder) || 0;
    }
}
