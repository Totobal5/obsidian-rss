import {FeedProvider} from "../FeedProvider";
import {Feed} from "../Feed";
import {Folder} from "../Folder";
import {Item} from "../Item";
import RssReaderPlugin from "../../main";
import {SettingsSection} from "../../settings/SettingsSection";
import {LocalFeedSettings} from "./LocalFeedSettings";
import {LocalFeed} from "./LocalFeed";
import groupBy from "lodash.groupby";
import {LocalFolder} from "./LocalFolder";
import {getFeedItems} from "../../parser/rssParser";

export class LocalFeedProvider implements FeedProvider {
    private readonly plugin: RssReaderPlugin;
    private feedsCache: Feed[] | null = null;
    private cacheTimestamp: number = 0;
    private readonly CACHE_DURATION = 30000; // 30 segundos

    constructor(plugin: RssReaderPlugin) {
        this.plugin = plugin;
    }

    async isValid(): Promise<boolean> {
        return true;
    }

    id(): string {
        return "local";
    }

    name(): string {
        return "Local";
    }

    async feeds(): Promise<Feed[]> {
        const now = Date.now();
        
        // Usar cache si está disponible y es reciente
        if (this.feedsCache && (now - this.cacheTimestamp) < this.CACHE_DURATION) {
            console.log(`📦 Using cached feeds (age: ${((now - this.cacheTimestamp) / 1000).toFixed(1)}s)`);
            return this.feedsCache;
        }

        const cacheStart = performance.now();
        
        // Cargar feeds en paralelo en lugar de secuencial
        const feeds = this.plugin.settings.feeds;
        console.log(`🔄 Loading ${feeds.length} feeds in parallel...`);
        
        const feedPromises = feeds.map(async (feed) => {
            try {
                const feedStart = performance.now();
                const content = await getFeedItems(feed);
                console.log(`📡 "${feed.name}" loaded in ${(performance.now() - feedStart).toFixed(2)}ms`);
                return new LocalFeed(content, feed.name);
            } catch (error) {
                console.error(`❌ Failed to load "${feed.name}":`, error);
                return null;
            }
        });
        
        const results = await Promise.all(feedPromises);
        const result = results.filter(feed => feed !== null) as Feed[];

        // Actualizar cache
        this.feedsCache = result;
        this.cacheTimestamp = now;
        console.log(`🔄 ${result.length} feeds cached in ${(performance.now() - cacheStart).toFixed(2)}ms`);
        
        return result;
    }

    async feedFromUrl(url: string): Promise<Feed> {
        const feed = {
            name: '',
            url,
            folder: '',
        }
        const content = await getFeedItems(feed);
        return new LocalFeed(content, feed.name);
    }

    async filteredFolders(): Promise<Folder[]> {
        return [];
    }


    async folders(): Promise<Folder[]> {
        const result: Folder[] = [];
        const feeds = await this.feeds();
        const grouped = groupBy(feeds, item => item.folderName());

        for (const key of Object.keys(grouped)) {
            const folderContent = grouped[key];
            result.push(new LocalFolder(key, folderContent));
        }
        return result;
    }

    async items(): Promise<Item[]> {
        const result: Item[] = [];
        const feeds = await this.feeds();
        for (const feed of feeds) {
            result.push(...feed.items());
        }
        return result;
    }

    warnings(): string[] {
        return [];
    }

    // Método para invalidar el cache cuando se actualicen los feeds
    invalidateCache(): void {
        console.log("🗑️  Feed cache invalidated");
        this.feedsCache = null;
        this.cacheTimestamp = 0;
    }

    settings(containerEl: HTMLDivElement): SettingsSection {
        return new LocalFeedSettings(this.plugin, containerEl);
    }

}
