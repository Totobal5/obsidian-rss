import type { FeedProvider } from "../FeedProvider";
import type { Feed } from "../Feed";
import type { Folder } from "../Folder";
import type { Item } from "../Item";
import type { RssFeed } from "../../settings/settings";

import RssReaderPlugin from "../../main";
import { SettingsSection } from "../../settings/SettingsSection";
import { LocalFeedSettings } from "./LocalFeedSettings";
import { LocalFeed } from "./LocalFeed";
import { LocalFolder } from "./LocalFolder";
import { getFeedItems } from "../../parser/rssParser";
import { get } from "svelte/store";

import { itemsStore } from "../../stores";

/**
 * Provides RSS feed data from local sources, with caching and background update capabilities.
 * 
 * The `LocalFeedProvider` implements the `FeedProvider` interface, allowing feeds to be loaded from local storage
 * (such as a data.json file) and updated in the background. It supports cache invalidation, parallel feed loading,
 * and grouping feeds into folders. This provider is intended for use within the RssReaderPlugin ecosystem.
 * 
 * @remarks
 * - Uses a cache to avoid frequent reloads, with a configurable cache duration.
 * - Loads feeds from local storage on startup for instant access, then updates them in the background.
 * - Filters out feeds with errors when grouping or listing items.
 * - Notifies the workspace when feeds are updated in the background.
 * 
 * @example
 * ```typescript
 * const provider = new LocalFeedProvider(plugin);
 * const feeds = await provider.feeds();
 * ```
 * 
 * @see FeedProvider
 * @see LocalFeed
 * @see LocalFolder
 * @see LocalFeedSettings
 */
export class LocalFeedProvider implements FeedProvider {

    private readonly plugin: RssReaderPlugin;

    private feedsCache: Feed[] | null = null;

    private cacheTimestamp: number = 0;
    
    // 30 segundos
    private readonly CACHE_DURATION = 30000;

    private backgroundUpdateRunning: boolean = false;

    constructor(plugin: RssReaderPlugin) {
        this.plugin = plugin;
    }

    async isValid(): Promise<boolean> {
        return true;
    }

    public id(): string {
        return "local";
    }

    public name(): string {
        return "Local";
    }

    public async feeds(): Promise<Feed[]> {
        const now = Date.now();

        if (this.feedsCache && (now - this.cacheTimestamp) < this.CACHE_DURATION) {
            console.log(`Using cached feeds (age: ${((now - this.cacheTimestamp) / 1000).toFixed(1)}s)`);
            return this.feedsCache;
        }

        if (!this.feedsCache) {
            const savedFeeds = await this.loadFromDataJson();

            if (savedFeeds.length > 0) {
                console.log(`Instant startup: ${savedFeeds.length} feeds from data.json`);
                this.feedsCache = savedFeeds;
                this.cacheTimestamp = now;
                this.updateFeedsInBackground();
                return savedFeeds;
            }
        }

        const freshFeeds = await this.fetchFreshFeeds();
        return freshFeeds;
    }

    private async loadFromDataJson(): Promise<Feed[]> {
        try {
            const savedFeedContents = get(itemsStore);
            if (!savedFeedContents || savedFeedContents.length === 0) {
                console.log(`No saved feeds found in data.json`);
                
                return [];
            }

            console.log(`Converting ${savedFeedContents.length} saved feeds from data.json...`);
            const result: Feed[] = [];
            
            for (const feedContent of savedFeedContents) {
                if (feedContent) {
                    // Ensure feedContent has required properties (adjusted for RssFeed type)
                    if (typeof feedContent.name === "string") {
                        result.push(new LocalFeed(feedContent, feedContent.name));
                    }

                    continue;
                }
            }
            
            return result;
        } catch (error) {
            console.error(`Error loading from data.json:`, error);
            return [];
        }
    }

    private async fetchFreshFeeds(): Promise<Feed[]> {
        const cacheStart = performance.now();

        const { feeds } = this.plugin.settings;
        console.log(`🔄 Loading ${feeds.length} feeds in parallel...`);

        // Load all feeds in parallel and filter out any failures
        const results = await Promise.all( feeds.map(async feed => {
            const feedStart = performance.now();
            try {
                const content = await getFeedItems(feed);
                console.log(`"${feed.name}" loaded in ${(performance.now() - feedStart).toFixed(2)}ms`);
                return new LocalFeed(content, feed.name);
            } catch (error) {
                console.error(`Failed to load "${feed.name}":`, error);
                return null;
            }
        }) );

        const validFeeds = results.filter(Boolean) as Feed[];

        // Update cache
        this.feedsCache = validFeeds;
        this.cacheTimestamp = Date.now();
        console.log(`${validFeeds.length} feeds cached in ${(performance.now() - cacheStart).toFixed(2)}ms`);

        return validFeeds;
    }

    private async updateFeedsInBackground(): Promise<void> {
        if (this.backgroundUpdateRunning) {
            console.log("Background update already running, skipping...");
            return;
        }

        this.backgroundUpdateRunning = true;
        console.log("Starting background feed update...");

        try {
            // Short delay to avoid blocking UI thread at startup
            await new Promise(resolve => setTimeout(resolve, 100));
            const freshFeeds = await this.fetchFreshFeeds();
            console.log(`Background update completed: ${freshFeeds.length} feeds updated`);
            this.plugin.app.workspace.trigger('rss-feeds-updated');

        } catch (error) {
            console.error("Background update failed:", error);

        } finally {
            this.backgroundUpdateRunning = false;
        }
    }

    public invalidateCache(): void {
        console.log(`Feed cache invalidated`);
        this.feedsCache = null;
        this.cacheTimestamp = 0;
    }

    async feedFromUrl(url: string): Promise<Feed> {
        const feed: RssFeed = {
            name: '',
            url,
            folder: '',
        };
        const content = await getFeedItems(feed);
        return new LocalFeed(content, feed.name);
    }

    async filteredFolders(): Promise<Folder[]> {
        return [];
    }

    async folders(): Promise<Folder[]> {
        const result: Folder[] = [];
        // Filter feeds with errors
        const feeds = (await this.feeds()).filter(f => !(f as any).error);
        // Efficiently group feeds by folder name
        const grouped: Record<string, Feed[]> = {};
        for (const feed of feeds) {
            const folderName = feed.folderName();
            if (!grouped[folderName]) { grouped[folderName] = []; }
            
            grouped[folderName].push(feed);
        }

        for (const key in grouped) {
            result.push(new LocalFolder(key, grouped[key]));
        }

        return result;
    }

    async items(): Promise<Item[]> {
        // Collect items from all valid feeds
        const feeds = (await this.feeds()).filter(f => !(f as any).error);
        return feeds.flatMap(feed => feed.items());
    }

    warnings(): string[] {
        return [];
    }

    settings(containerEl: HTMLDivElement): SettingsSection {
        return new LocalFeedSettings(this.plugin, containerEl);
    }
}
