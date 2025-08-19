import type RssReaderPlugin from '../main';
import {getFeedItems} from '../parser/rssParser';
import type {RssFeedContent, RssFeedItem} from '../parser/rssParser';

import {LocalFeedProvider} from '../providers/local/LocalFeedProvider';
import t from '../l10n/locale';
import {Notice} from 'obsidian';
import { feedsStore, itemsStore } from 'src/stores';

/**
 * Service responsible for updating RSS feeds, sorting RSS feed content, preserving user state, 
 * counting unread items and folder, and returning the favorites items marked by the user.
 *
 * @remarks
 * - Uses an `AbortController` to allow cancellation of ongoing feed updates.
 * - Merges new feed items with existing ones, preserving user-specific metadata such as read status, favorites, tags, and highlights.
 * - Notifies the user upon completion and writes updated feed content to settings.
 * - Invalidates local cache after updating feeds.
 *
 * @example
 * ```typescript
 * const service = new FeedService(plugin);
 * await service.updateFeeds();
 * ```
 *
 * @public
 */
export class FeedManager {
    private abort?: AbortController;
    private updating = false;

    // Map of folder name to array of RssFeedItem
    public itemByFolder = new Map<string, RssFeedItem[]>();

    // Map of feed items by their unique hash
    public itemByHash = new Map<string, RssFeedItem>();

    // Map of unread count by feed
    public unreadCountByFeed = new Map<string, number>();

    // Map of unread count by folder
    public unreadCountByFolder = new Map<string, number>();

    constructor(private plugin: RssReaderPlugin) {
        this.itemByFolder.clear();
        this.itemByHash.clear();

        // Register callback
        // This should make that everytime that the Rss items change the itemByHash and itemByFolder maps are updated
        itemsStore.subscribe((feeds: RssFeedContent[]) => {
            // Check for items not added in itemByHash
            for (const feed of feeds) {
                // Get the folder name and create the new array if it doesn't exist
                const folder = feed.folder || 'Uncategorized';
                if (!this.itemByFolder.has(folder)) {
                    this.itemByFolder.set(folder, []);
                }

                // For every RSS Feed Content
                for (const item of feed.items) {
                    // Check if it not exists in the Hash
                    if (!this.itemByHash.has(item.hash) ) {
                        this.itemByHash.set(item.hash, item);
                        this.itemByFolder.get(folder)!.unshift(item);
                    }
                }
            }
        });
    }
    
    public isUpdating() {
        return this.updating; 
    }

    public cancel() { 
        this.abort?.abort(); 
    }

    private timeout<T>(p: Promise<T>, ms: number): Promise<T> {
        return new Promise( (res, rej) => {
            const to = setTimeout(() => { rej(new Error('timeout')); }, ms);
            p.then(
                v => { clearTimeout(to); res(v); },
                e => { clearTimeout(to); rej(e); }
            );
        });
    }

    public updateFeeds(): Promise<void> {
        // Cancel any ongoing updates
        this.cancel();

        // Create a new AbortController for this update
        this.abort = new AbortController();
        const signal = this.abort.signal;


        
    }

    public rebuildAllIndexes(): void {
        // Clear existing indexes
        this.itemByHash.clear();
        this.unreadCountByFeed.clear();
        this.unreadCountByFolder.clear();

        // Loop for every items obtained in settings
        for (const feedContent of (this.plugin.settings.items || [])) {
            if (!feedContent || !Array.isArray(feedContent.items) ) continue;

            // Index by hash
            for (const it of feedContent.items) {
                if (it && it.link) this.itemByHash.set(it.link, it as any);
            }

            // Count unread items by feed
            const unread = feedContent.items.filter(it => !it.read).length;
            this.unreadCountByFeed.set(feedContent.name, unread);

            // Count unread items by folder
            const folder = feedContent.folder?.toLowerCase() || '';
            const currentCount = this.unreadCountByFolder.get(folder) || 0;
            this.unreadCountByFolder.set(folder, currentCount + unread);
        }
    }

    public rebuildCountByFolder(): void {
        this.unreadCountByFolder.clear();

        for (const feedContent of (this.plugin.settings.items || [])) {
            if (!feedContent || !Array.isArray(feedContent.items) ) continue;

            // Count unread items by folder
            const folder = feedContent.folder?.toLowerCase() || '';
            const currentCount = this.unreadCountByFolder.get(folder) || 0;
            this.unreadCountByFolder.set(folder, currentCount + feedContent.items.filter(it => !it.read).length);
        }
    }

    public rebuildCountByFeed(): void {
        this.unreadCountByFeed.clear();

        for (const feedContent of (this.plugin.settings.items || [])) {
            if (!feedContent || !Array.isArray(feedContent.items) ) continue;

            // Count unread items by feed
            const unread = feedContent.items.filter(it => !it.read).length;
            this.unreadCountByFeed.set(feedContent.name, unread);
        }
    }

    public sortByDate(): void {
        for (const [folder, items] of this.itemByFolder) {
            items.sort((a, b) => {
                const dateA = Date.parse(a.pubDate ?? '');
                const dateB = Date.parse(b.pubDate ?? '');
                
                return (dateA > dateB ? -1 : 1);
            });
        }
    }
}