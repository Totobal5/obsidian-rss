import {Notice, Plugin, WorkspaceLeaf} from 'obsidian';
import {DEFAULT_SETTINGS, RssFeed, RssReaderSettings} from "./settings/settings";
import ViewLoader from "./view/ViewLoader";
import {
    configuredFeedsStore,
    feedsStore,
    FilteredFolderContent,
    filteredItemsStore,
    filteredStore,
    foldedState,
    folderStore,
    settingsStore,
    sortedFeedsStore,
    tagsStore
} from "./stores";
import {VIEW_ID} from "./consts";
import {getFeedItems, RssFeedContent, RssFeedItem} from "./parser/rssParser";
import groupBy from "lodash.groupby";
import mergeWith from "lodash.mergewith";
import keyBy from "lodash.keyby";
import values from "lodash.values";
import {FilteredFolder, SortOrder} from "./modals/FilteredFolderModal";
import {Md5} from "ts-md5";
import t from "./l10n/locale";
import {RSSReaderSettingsTab} from "./settings/SettingsTab";
import {CleanupModal} from "./modals/CleanupModal";
import {TextInputPrompt} from "./modals/TextInputPrompt";
import {ArticleSuggestModal} from "./modals/ArticleSuggestModal";
import {Providers} from "./providers/Providers";
import {LocalFeedProvider} from "./providers/local/LocalFeedProvider";
import {RSS_EVENTS} from './events';
// Type-only imports for service properties (avoid circular eagerly loaded deps)
import type {SettingsManager} from './services/SettingsManager';
import type {FeedUpdater} from './services/FeedUpdater';
import type {ItemStateService} from './services/ItemStateService';
import type {CountersService} from './services/CountersService';
import type {MigrationService} from './services/MigrationService';

export default class RssReaderPlugin extends Plugin {
    settings: RssReaderSettings;
    providers: Providers;
    private updating = false;
    private updateAbort?: AbortController;
    // Performance indexes
    private itemByLink: Map<string, RssFeedItem> = new Map();
    private unreadCountByFeed: Map<string, number> = new Map();
    private feedContentSaveTimer: number | undefined;
    // Services (initialized lazily in onload)
    settingsManager!: SettingsManager;
    feedUpdater!: FeedUpdater;
    itemStateService!: ItemStateService;
    counters!: CountersService;
    migrations!: MigrationService;

    async onload(): Promise<void> {
        const startTime = performance.now();
        console.log('🚀 RSS Reader: Starting plugin load...');
        //update settings object whenever store contents change.
        this.register(
            settingsStore.subscribe((value: RssReaderSettings) => {
                this.settings = value;
            })
        );
        
        const settingsStart = performance.now();
        await this.loadSettings();
        console.log(`⚙️  Settings loaded in ${(performance.now() - settingsStart).toFixed(2)}ms`);
        
        const providersStart = performance.now();
    this.providers = new Providers(this);
    // Initialize services (lazy import style to avoid circular)
    const {SettingsManager} = await import('./services/SettingsManager');
    const {FeedUpdater} = await import('./services/FeedUpdater');
    const {ItemStateService} = await import('./services/ItemStateService');
    const {CountersService} = await import('./services/CountersService');
    const {MigrationService} = await import('./services/MigrationService');
    this.settingsManager = new SettingsManager(this);
    this.feedUpdater = new FeedUpdater(this);
    this.itemStateService = new ItemStateService(this);
    this.counters = new CountersService(this);
    this.migrations = new MigrationService(this);
        this.providers.register(new LocalFeedProvider(this));
        console.log(`🔌 Providers initialized in ${(performance.now() - providersStart).toFixed(2)}ms`);

        this.addCommand({
            id: "rss-open",
            name: t("open"),
            checkCallback: (checking: boolean) => {
                if (checking) {
                    return (this.app.workspace.getLeavesOfType(VIEW_ID).length === 0);
                }
                this.initLeaf();
            }
        });


        this.addCommand({
            id: 'rss-refresh',
            name: t("refresh_feeds"),
            callback: async () => {
                await this.updateFeeds();
            }
        });

        this.addCommand({
            id: 'rss-cleanup',
            name: t("cleanup"),
            callback: async () => {
                new CleanupModal(this).open();
            }
        });

        this.addCommand({
            id: 'rss-open-feed',
            name: "Open Feed from URL",
            callback: async () => {
                const input = new TextInputPrompt(this.app, "URL", "URL", "", "", t("open"));
                await input.openAndGetValue(async (text) => {
                    const provider = await this.providers.getById('local') as LocalFeedProvider;
                    const feed = await provider.feedFromUrl(text.getValue());
                    const items = feed.items();
                    if (!items || items.length === 0) {
                        input.setValidationError(text, t("invalid_feed"));
                        return;
                    }

                    input.close();
                    new ArticleSuggestModal(this, items).open();
                });
            }
        });

        // Comando para abrir el RSS reader en la pestaña principal
        this.addCommand({
            id: "open-rss-main-tab",
            name: "Abrir RSS Reader en pestaña principal",
            callback: () => {
                this.activateRSSView();
            }
        });

        // Comando adicional para abrir en nueva pestaña
        this.addCommand({
            id: "open-rss-new-tab",
            name: "Abrir RSS Reader en nueva pestaña",
            callback: () => {
                const leaf = this.app.workspace.getLeaf("tab");
                leaf.setViewState({
                    type: VIEW_ID,
                    active: true
                });
                this.app.workspace.revealLeaf(leaf);
            }
        });

        // Comando para regenerar todas las entradas (resetear items y volver a cargar)
        this.addCommand({
            id: 'rss-regenerate-items',
            name: 'Regenerar todas las entradas (reset)',
            callback: async () => {
                try {
                    console.log('🧨 Regenerating all feed items: clearing existing items and refetching...');
                    new Notice('Regenerando entradas de RSS…');
                    // 1. Vaciar items actuales
                    await this.writeFeedContent(() => []);
                    // 2. Invalidar cache del provider local (si existe)
                    const localProvider = await this.providers.getById('local') as LocalFeedProvider;
                    if (localProvider && localProvider.invalidateCache) {
                        localProvider.invalidateCache();
                    }
                    // 3. Volver a cargar feeds desde cero
                    await this.updateFeeds();
                    // 4. Despachar evento para refrescar contadores en la UI
                    window.dispatchEvent(new CustomEvent(RSS_EVENTS.UNREAD_COUNTS_CHANGED));
                    new Notice('Entradas regeneradas');
                    console.log('✅ Regeneración completada correctamente');
                } catch (e) {
                    console.error('❌ Error regenerating feed items', e);
                    new Notice('Error al regenerar entradas (ver consola)');
                }
            }
        });

        const commandsStart = performance.now();
        this.registerView(VIEW_ID, (leaf: WorkspaceLeaf) => new ViewLoader(leaf, this));
        this.addSettingTab(new RSSReaderSettingsTab(this.app, this));
        console.log(`📋 Commands and views registered in ${(performance.now() - commandsStart).toFixed(2)}ms`);

        const intervalStart = performance.now();
        let interval: number;
        if (this.settings.updateTime !== 0) {
            interval = window.setInterval(async () => {
                await this.updateFeeds();
            }, this.settings.updateTime * 60 * 1000);
            this.registerInterval(interval);
        }

        if (this.settings.autoSync) {
            this.registerInterval(window.setInterval(async () => {
                await this.loadSettings();
            }, 1000 * 60));
        }
        console.log(`⏰ Intervals setup in ${(performance.now() - intervalStart).toFixed(2)}ms`);

        const storeStart = performance.now();
        //reset update timer on settings change.
        settingsStore.subscribe((settings: RssReaderSettings) => {
            if (interval !== undefined)
                clearInterval(interval);
            if (settings.updateTime != 0) {
                interval = window.setInterval(async () => {
                    await this.updateFeeds();
                }, settings.updateTime * 60 * 1000);
                this.registerInterval(interval);
            }

            this.settings = settings;
            this.saveSettings();
        });
        console.log(`📦 Store subscriptions setup in ${(performance.now() - storeStart).toFixed(2)}ms`);

        console.log(`✅ RSS Reader loaded successfully in ${(performance.now() - startTime).toFixed(2)}ms total`);

        this.app.workspace.onLayoutReady(async () => {
            await this.migrateData();
            await this.initLeaf();
            await this.updateFeeds();


            feedsStore.subscribe((feeds: RssFeedContent[]) => {
                // Ensure feeds is always an array
                if (!Array.isArray(feeds)) {
                    console.warn('🔍 feeds is not an array:', typeof feeds, feeds);
                    return;
                }

                //keep sorted store sorted when the items change.
                const sorted = groupBy(feeds, "folder");
                sortedFeedsStore.update(() => sorted);

                // Flatten all items more efficiently
                const items: RssFeedItem[] = [];
                feeds.forEach((feed: RssFeedContent) => {
                    if (feed && feed.items) {
                        items.push(...feed.items);
                    }
                });

                //collect tags for auto completion more efficiently
                const tags: string[] = [];
                items.forEach((item: RssFeedItem) => {
                    if (item && item.tags && Array.isArray(item.tags)) {
                        item.tags.forEach((tag: string) => {
                            if (tag && tag.length > 0) {
                                tags.push(tag);
                            }
                        });
                    }
                });

                const metadataCache = this.app.metadataCache as any;
                const fileTags = metadataCache.getTags?.() || {};
                for (const tag of Object.keys(fileTags)) {
                    tags.push(tag.replace('#', ''));
                }
                tagsStore.update(() => new Set<string>(tags.filter(tag => tag.length > 0)));

                //collect all folders for auto-completion
                const folders: string[] = [];
                for (const item of items) {
                    if (item !== undefined)
                        folders.push(item.folder);
                }
                folderStore.update(() => new Set<string>(folders.filter(folder => folder !== undefined && folder.length > 0)));

                this.filterItems(items);
            });
        });
    }

    filterItems(items: RssFeedItem[]): void {
        const filtered = new Array<FilteredFolderContent>();
        for (const filter of this.settings.filtered) {
            const sortOrder = (SortOrder as any)[filter.sortOrder] || SortOrder.DATE_NEWEST;
            let filteredItems: RssFeedItem[];

            if (filter.read && filter.unread) {
                filteredItems = items.filter((item) => {
                    return item.read === filter.read || item.read !== filter.unread;
                });
            } else if (filter.read) {
                filteredItems = items.filter((item) => {
                    return item.read;
                });
            } else if (filter.unread) {
                filteredItems = items.filter((item) => {
                    return !item.read;
                });
            }


            if (filter.favorites) {
                filteredItems = filteredItems.filter((item) => {
                    return item.favorite === filter.favorites;
                });
            }

            if (filter.filterFolders.length > 0) {
                filteredItems = filteredItems.filter((item) => {
                    return filter.filterFolders.includes(item.folder);
                });
            }
            if (filter.ignoreFolders.length > 0) {
                filteredItems = filteredItems.filter((item) => {
                    return !filter.ignoreFolders.includes(item.folder);
                });
            }

            if (filter.filterFeeds.length > 0) {
                filteredItems = filteredItems.filter((item) => {
                    return filter.filterFeeds.includes(item.feed);
                });
            }
            if (filter.ignoreFeeds.length > 0) {
                filteredItems = filteredItems.filter((item) => {
                    return !filter.ignoreFeeds.includes(item.feed);
                });
            }

            if (filter.filterTags.length > 0) {
                filteredItems = filteredItems.filter((item) => {
                    for (const tag of filter.filterTags) {
                        if (!item.tags.contains(tag)) return false;
                    }
                    return true;
                });
            }
            if (filter.ignoreTags.length > 0) {
                filteredItems = filteredItems.filter((item) => {
                    for (const tag of filter.ignoreTags) {
                        if (item.tags.contains(tag)) return false;
                    }
                    return true;
                });
            }

            const sortedItems = this.sortItems(filteredItems, sortOrder);
            filtered.push({filter: filter, items: {items: sortedItems}});
        }
        filteredItemsStore.update(() => filtered);
    }

    sortItems(items: RssFeedItem[], sortOrder: SortOrder): RssFeedItem[] {
        if (!items) return items;
        if (sortOrder === SortOrder.ALPHABET_NORMAL) {
            return items.sort((a, b) => a.title.localeCompare(b.title));
        }
        if (sortOrder === SortOrder.ALPHABET_INVERTED) {
            return items.sort((a, b) => b.title.localeCompare(a.title))
        }
        if (sortOrder === SortOrder.DATE_NEWEST) {
            //@ts-ignore
            return items.sort((a, b) => window.moment(b.pubDate) - window.moment(a.pubDate));
        }
        if (sortOrder === SortOrder.DATE_OLDEST) {
            //@ts-ignore
            return items.sort((a, b) => window.moment(a.pubDate) - window.moment(b.pubDate));
        }
        return items;
    }

    async updateFeeds(): Promise<void> { await this.feedUpdater.updateFeeds(); }

    onunload(): void {
        console.log('unloading plugin rss reader');
        this.app.workspace
            .getLeavesOfType(VIEW_ID)
            .forEach((leaf) => leaf.detach());
    }

    async initLeaf(): Promise<void> {
        if (this.app.workspace.getLeavesOfType(VIEW_ID).length > 0) {
            return;
        }
        await this.app.workspace.getRightLeaf(false).setViewState({
            type: VIEW_ID,
        });
    }

    async activateRSSView(): Promise<void> {
        // Buscar si ya existe una vista RSS abierta
        const existing = this.app.workspace.getLeavesOfType(VIEW_ID);
        
        if (existing.length > 0) {
            // Si existe, activarla
            this.app.workspace.revealLeaf(existing[0]);
        } else {
            // Si no existe, crear una nueva en la pestaña actual o nueva
            const leaf = this.app.workspace.getLeaf(false);
            await leaf.setViewState({
                type: VIEW_ID,
                active: true
            });
            this.app.workspace.revealLeaf(leaf);
        }
    }

    async migrateData(): Promise<void> {
        const configPath = this.app.vault.configDir + "/plugins/rss-reader/data.json";
        const config = JSON.parse(await this.app.vault.adapter.read(configPath));

        for(const feed of config.feeds) {
            if(feed.folder === undefined) {
                feed.folder = "";
            }
        }
        for(const feed of config.items) {
            if(feed.folder === undefined) {
                feed.folder = "";
            }
        }
        await this.app.vault.adapter.write(configPath, JSON.stringify(config));

        if (config.filtered.length === 0) return;

        if (config.filtered[0].ignoreFolders === undefined) {
            new Notice("RSS Reader: migrating data");
            console.log("RSS Reader: adding ignored fields to filters");

            for (const filter of config.filtered) {
                filter.ignoreTags = [];
                filter.ignoreFolders = [];
                filter.ignoreFeeds = [];

            }
            await this.app.vault.adapter.write(configPath, JSON.stringify(config));
            await this.loadSettings();
            new Notice("RSS Reader: data has been migrated");
        }

        if (config.filtered[0].filterType === undefined) return;


        new Notice("RSS Reader: migrating data");

        for (const filter of config.filtered) {
            const newFilter: FilteredFolder = {
                filterFolders: [],
                filterTags: [],
                filterFeeds: [],
                favorites: false,
                read: false,
                unread: false,
                sortOrder: filter.sortOrder,
                name: filter.name,
                ignoreFolders: [],
                ignoreFeeds: [],
                ignoreTags: [],
            };

            if (filter.filterType === "FAVORITES") newFilter.favorites = true;
            if (filter.filterType === "READ") newFilter.read = true;
            if (filter.filterType === "UNREAD") newFilter.unread = true;
            if (filter.filterType === "TAGS") {
                if (filter.filterContent !== "") {
                    newFilter.filterTags = filter.filterContent.split(",");
                }
            } else {
                if (filter.filterContent !== "") {
                    newFilter.filterFolders = filter.filterContent.split(",");
                }
            }
            newFilter.read = true;
            newFilter.unread = true;
            config.filtered = config.filtered.filter((item: any) => item.name !== filter.name);
            config.filtered.push(newFilter);
        }

        await this.app.vault.adapter.write(configPath, JSON.stringify(config));
        await this.loadSettings();

        new Notice("RSS Reader: data has been migrated");


        //migrate from old settings pre 0.6.0
        if (config.read === undefined) return;

        new Notice("RSS Reader: migrating data");

        for (const content of Object.values(config.items)) {
            // @ts-ignore
            for (const item of content.items) {
                if (config.read.items.some((readItem: RssFeedItem) => {
                    return item.title == readItem.title && item.link == readItem.link && item.content == readItem.content
                })) {
                    item.read = true;
                }
            }
            // @ts-ignore
            for (const item of content.items) {
                if (config.favorites.items.some((favItem: RssFeedItem) => {
                    return item.title == favItem.title && item.link == favItem.link && item.content == favItem.content
                })) {
                    item.favorite = true;
                }
            }
        }
        delete config.read;
        delete config.favorites;

        await this.app.vault.adapter.write(configPath, JSON.stringify(config));
        await this.loadSettings();

        new Notice("RSS Reader: data has been migrated");

    }

    async loadSettings(): Promise<void> {
        const configPath = this.app.vault.configDir + "/plugins/rss-reader/data.json";
        let file: string;
        try {
            file = await this.app.vault.adapter.read(configPath);
        } catch (e) {
            console.error(e);
        }

        if (file !== undefined) {
            try {
                JSON.parse(file);
            } catch (e) {
                console.error('❌ Invalid data.json, loading defaults.', e);
                new Notice(t("RSS_Reader") + ': data.json invalid, loading defaults');
                this.settings = {...DEFAULT_SETTINGS};
                settingsStore.set(this.settings);
                configuredFeedsStore.set(this.settings.feeds);
                feedsStore.set(this.settings.items);
                foldedState.set(this.settings.folded);
                return;
            }
        }

        const data = await this.loadData();
        this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
        if (data !== undefined && data !== null) {
            this.settings.hotkeys = Object.assign({}, DEFAULT_SETTINGS.hotkeys, data.hotkeys);
        }
        settingsStore.set(this.settings);
        configuredFeedsStore.set(this.settings.feeds);
        feedsStore.set(this.settings.items);
        foldedState.set(this.settings.folded);
    this.rebuildIndexes();
    }

    async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    }

    async writeFeeds(changeOpts: (feeds: RssFeed[]) => Partial<RssFeed[]>): Promise<void> {
        await configuredFeedsStore.update((old) => ({...old, ...changeOpts(old)}));
        await this.writeSettings((old) => ({
            feeds: changeOpts(old.feeds)
        }));
        await this.updateFeeds();
    }

    // Deprecated: feed content writes delegated to settingsManager (kept for backward compatibility)
    async writeFeedContent(changeOpts: (items: RssFeedContent[]) => RssFeedContent[]): Promise<void> { return this.settingsManager.writeFeedContent(changeOpts); }

    // Debounced variant for frequent small mutations (read/favorite toggles)
    async writeFeedContentDebounced(mutator: (items: RssFeedContent[]) => void, delay = 250): Promise<void> {
        try {
            const items = this.settings.items || [];
            mutator(items);
            await feedsStore.update(() => items);
            this.rebuildIndexes();
            // Schedule single consolidated save
            if (this.feedContentSaveTimer) window.clearTimeout(this.feedContentSaveTimer);
            this.feedContentSaveTimer = window.setTimeout(async () => {
                await this.writeSettings(old => ({ items }));
                this.feedContentSaveTimer = undefined;
            }, delay);
        } catch (e) { console.warn('Debounced write failed', e); }
    }

    rebuildIndexes(): void {
        this.itemByLink.clear();
        this.unreadCountByFeed.clear();
        for (const feedContent of (this.settings.items || [])) {
            if (!feedContent || !Array.isArray(feedContent.items)) continue;
            let unread = 0;
            for (const it of feedContent.items) {
                if (it && it.link) this.itemByLink.set(it.link, it as any);
                if (!it.read) unread++;
                // Cache parsed timestamp once
                if (it.pubDate && (it as any).pubDateMs === undefined) {
                    (it as any).pubDateMs = Date.parse(it.pubDate) || 0;
                }
            }
            this.unreadCountByFeed.set(feedContent.name, unread);
        }
    }

    getItemByLink(link: string): RssFeedItem | undefined { return this.itemByLink.get(link); }
    getUnreadCountForFeed(feedName: string): number { return this.unreadCountByFeed.get(feedName) || 0; }

    // Internal write helper for services
    async writeSettingsInternal(mut: (s: RssReaderSettings) => Partial<RssReaderSettings>): Promise<void> {
        await this.writeSettings(old => ({...mut(old)}));
    }

    async writeFiltered(changeOpts: (folders: FilteredFolder[]) => Partial<FilteredFolder[]>): Promise<void> {
        await filteredStore.update((old) => ({...old, ...changeOpts(old)}));
        await this.writeSettings((old) => ({
            filtered: changeOpts(old.filtered)
        }));
        await this.updateFeeds();
    }

    async writeFolded(folded: string[]): Promise<void> {
        await foldedState.update(() => (folded));
        await this.writeSettings(() => ({
            folded: folded
        }));
    }

    async writeSettings(changeOpts: (settings: RssReaderSettings) => Partial<RssReaderSettings>): Promise<void> {
        await settingsStore.update((old) => ({...old, ...changeOpts(old)}));
    }
}
