import type RssReaderPlugin from '../main';
import {RSS_EVENTS} from '../events';
import t from '../l10n/locale';
import {Notice} from 'obsidian';

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

    async toggleRead(wrapperOrRaw: any): Promise<boolean> {
        const raw = (wrapperOrRaw && wrapperOrRaw.item) ? wrapperOrRaw.item : wrapperOrRaw;
        const newState = !raw.read;
        raw.read = newState;

        // Update wrapper if it exists
        if (wrapperOrRaw?.markRead) wrapperOrRaw.markRead(newState);

        // Use the unified write method with proper mutator
        await this.plugin.writeFeedContentDebounced((items) => {
            this.syncRawInItems(items, raw, {read: newState});
        }, 250);

        // Dispatch events
        try { 
            document.dispatchEvent(new CustomEvent(RSS_EVENTS.UNREAD_COUNTS_CHANGED)); 
            document.dispatchEvent(new CustomEvent(RSS_EVENTS.ITEM_READ_UPDATED, {
            detail: { link: raw.link, read: newState }
            })); 
        } catch (e) {
            console.warn('Failed to dispatch read events:', e);
        }

        return newState;
    }

    async toggleFavorite(wrapperOrRaw: any): Promise<boolean> {
        const raw = (wrapperOrRaw && wrapperOrRaw.item) ? wrapperOrRaw.item : wrapperOrRaw;
        const newFav = !raw.favorite;
        raw.favorite = newFav;

        // Use the unified write method with proper mutator
        await this.plugin.writeFeedContentDebounced((items) => {
            this.syncRawInItems(items, raw, {favorite: newFav});
        }, 250);

        // Show notice
        new Notice(newFav ? t('added_to_favorites') : t('removed_from_favorites'));

        // Dispatch events
        try { 
            document.dispatchEvent(new CustomEvent(RSS_EVENTS.FAVORITE_UPDATED, {
            detail: { link: raw.link, favorite: newFav }
            })); 
        } catch (e) {
            console.warn('Failed to dispatch favorite events:', e);
        }

        return newFav;
    }

    /**
     * Updates the raw item fields in the items array
     * @private
     */
    private syncRawInItems(items: any[], raw: any, fields: Record<string, any>): void {
        for (const feedContent of items) {
            if (!feedContent || !Array.isArray(feedContent.items)) continue;
            const match = feedContent.items.find((i: any) => i.link === raw.link);
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
