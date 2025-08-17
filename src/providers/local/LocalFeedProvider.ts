import type {FeedProvider} from "../FeedProvider";
import type {Feed} from "../Feed";
import type {Folder} from "../Folder";
import type {Item} from "../Item";
import RssReaderPlugin from "../../main";
import {SettingsSection} from "../../settings/SettingsSection";
import {LocalFeedSettings} from "./LocalFeedSettings";
import {LocalFeed} from "./LocalFeed";
import groupBy from "lodash.groupby";
import {LocalFolder} from "./LocalFolder";
import {getFeedItems} from "../../parser/rssParser";
import {get} from "svelte/store";
import {feedsStore} from "../../stores";

export class LocalFeedProvider implements FeedProvider {
    private readonly plugin: RssReaderPlugin;
    private feedsCache: Feed[] | null = null;
    private cacheTimestamp: number = 0;
    private readonly CACHE_DURATION = 30000; // 30 segundos
    private backgroundUpdateRunning: boolean = false;

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

        // 🚀 ARRANQUE INSTANTÁNEO: Usar data.json primero si no hay caché
        if (!this.feedsCache) {
            const savedFeeds = await this.loadFromDataJson();
            if (savedFeeds.length > 0) {
                console.log(`⚡ Instant startup: ${savedFeeds.length} feeds from data.json`);
                this.feedsCache = savedFeeds;
                this.cacheTimestamp = now;
                
                // Actualizar en background si es necesario
                this.updateFeedsInBackground();
                
                return savedFeeds;
            }
        }

        // Si no hay datos guardados, cargar normalmente
        return await this.fetchFreshFeeds();
    }

    private async loadFromDataJson(): Promise<Feed[]> {
        try {
            const savedFeedContents = get(feedsStore);
            if (!savedFeedContents || savedFeedContents.length === 0) {
                console.log(`📭 No saved feeds found in data.json`);
                return [];
            }

            console.log(`📄 Converting ${savedFeedContents.length} saved feeds from data.json...`);
            const result: Feed[] = [];
            
            for (const feedContent of savedFeedContents) {
                if (feedContent.name && feedContent.items && feedContent.items.length > 0) {
                    result.push(new LocalFeed(feedContent, feedContent.name));
                }
            }
            
            return result;
        } catch (error) {
            console.error(`❌ Error loading from data.json:`, error);
            return [];
        }
    }

    private async fetchFreshFeeds(): Promise<Feed[]> {
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
        this.cacheTimestamp = Date.now();
        console.log(`🔄 ${result.length} feeds cached in ${(performance.now() - cacheStart).toFixed(2)}ms`);
        
        return result;
    }

    private updateFeedsInBackground(): void {
        if (this.backgroundUpdateRunning) {
            console.log(`🔄 Background update already running, skipping...`);
            return;
        }

        console.log(`🔄 Starting background feed update...`);
        this.backgroundUpdateRunning = true;

        // Usar setTimeout para no bloquear el UI
        setTimeout(async () => {
            try {
                const freshFeeds = await this.fetchFreshFeeds();
                console.log(`✅ Background update completed: ${freshFeeds.length} feeds updated`);
                
                // Notificar que hay datos frescos disponibles
                this.plugin.app.workspace.trigger('rss-feeds-updated');
            } catch (error) {
                console.error(`❌ Background update failed:`, error);
            } finally {
                this.backgroundUpdateRunning = false;
            }
        }, 100); // 100ms delay para no afectar el arranque
    }

    public invalidateCache(): void {
        console.log(`🗑️  Feed cache invalidated`);
        this.feedsCache = null;
        this.cacheTimestamp = 0;
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

    settings(containerEl: HTMLDivElement): SettingsSection {
        return new LocalFeedSettings(this.plugin, containerEl);
    }

}
