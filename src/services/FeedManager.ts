import type RssReaderPlugin from '../main';
import {getFeedItems} from '../parser/rssParser';
import type { RssFeedContent, RssFeedItem } from '../parser/rssParser';
import type { RssFeed } from "./settings/settings";

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

    // Map of feed URLs to their configured RSS feeds
    private configuredFeeds: RssFeed[] = [];

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

        // Store every configured feed.
        feedsStore.subscribe((feeds: RssFeed[]) => { this.configuredFeeds = feeds; }  );

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

    /**
     * Wraps a promise with a timeout. If the promise does not resolve or reject within the specified time,
     * the returned promise is rejected with a 'timeout' error.
     *
     * @param p - The promise to wrap.
     * @param ms - Timeout in milliseconds.
     * @returns A promise that resolves or rejects with the original promise, or rejects with a timeout error.
     *
     * @example
     * await timeout(fetchData(), 5000); // Throws if fetchData does not complete in 5 seconds.
     */
    private timeout<T>(p: Promise<T>, ms: number): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('timeout')), ms);
            p.then(
                value => {
                    clearTimeout(timer);
                    resolve(value);
                },
                error => {
                    clearTimeout(timer);
                    reject(error);
                }
            );
        });
    }

    public async updateFeeds(): Promise<void> {
        if (this.updating) { console.log("Feed update already in progress."); return; }
        this.updating = true;
        this.abort = new AbortController();
        // For debugging purposes
        const updateStartTime = performance.now();
        console.log(`Starting feed update...`);
        
        // Add new feeds to the store itemsStore usin rssParser.getFeedItem
        // For every Feed
        try {
            const feedPromises = this.configuredFeeds.map(async (cfeed) => {
                const feedStart = performance.now();
                try {
                    const items = await this.timeout(getFeedItems(cfeed, { signal: this.abort!.signal } ), 15000);
                    if (!items) return null;
                    console.log(`Feed "${cfeed.name || cfeed.url}" loaded in ${(performance.now() - feedStart).toFixed(2)}ms`);
                    
                    return items;
                } catch (error: any) {
                    if (error?.name === 'AbortError') console.warn(`Feed fetch aborted: ${cfeed.name || cfeed.url}`);
                    else if (error?.message === 'timeout') console.warn(`Feed timed out: ${cfeed.name || cfeed.url}`);
                    else console.error(`Failed to load feed "${cfeed.name || cfeed.url}":`, error);
                    
                    return null;
                }
            });

            const results = await Promise.all(feedPromises);
            const newFeeds = results.filter(Boolean) as RssFeedContent[];

            // Update the itemsStore
            itemsStore.update((currentItems) => {
                const updatedItems = [...currentItems];
                for (const feed of newFeeds) {
                    const existingFeedIndex = updatedItems.findIndex(item => item.hash === feed.hash);
                    if (existingFeedIndex !== -1) {
                        updatedItems[existingFeedIndex] = feed;
                    } else {
                        updatedItems.unshift(feed);
                    }
                }
                
                return updatedItems;
            });
        }


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