import {Notice, Plugin, WorkspaceLeaf} from 'obsidian';
import {DEFAULT_SETTINGS} from "./settings/settings";
import type {RssFeed, RssReaderSettings} from "./settings/settings";
import ViewLoader from "./view/ViewLoader";
import {
    configuredFeedsStore,
    feedsStore,
    filteredItemsStore,
    filteredStore,
    foldedState,
    folderStore,
    itemsStore,
    settingsStore,
    sortedFeedsStore,
    tagsStore
} from "./stores";
import type { FilteredFolderContent } from './stores';
import {VIEW_ID} from "./consts";
import type { RssFeedContent, RssFeedItem } from "./parser/rssParser";
import {SortOrder} from "./modals/FilteredFolderModal";
import type {FilteredFolder} from "./modals/FilteredFolderModal";
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
import type {FeedManager} from './services/FeedManager';
import type {ItemStateService} from './services/ItemStateService';
import type {CountersService} from './services/CountersService';
import type {MigrationService} from './services/MigrationService';

export default class RssReaderPlugin extends Plugin {
    settings: RssReaderSettings;
    providers: Providers;
    private updating = false;
    private updateAbort?: AbortController;

    // Services (initialized lazily in onload)
    settingsManager!: SettingsManager;
    feedManager!: FeedManager;
    itemStateService!: ItemStateService;
    counters!: CountersService;
    migrations!: MigrationService;

    async onload(): Promise<void> {
        const startTime = performance.now();
        console.log('RSS Reader: Starting plugin load...');
        
        // Update settings object whenever store contents change.
        this.register(settingsStore.subscribe((value: RssReaderSettings) => { this.settings = value; }));
        
        // Initialize services (lazy import style to avoid circular)
        const {SettingsManager} = await import('./services/SettingsManager');
        const {FeedManager} = await import('./services/FeedManager');
        const {ItemStateService} = await import('./services/ItemStateService');
        const {CountersService} = await import('./services/CountersService');
        const {MigrationService} = await import('./services/MigrationService');
        
        this.settingsManager = new SettingsManager(this);
        this.feedManager = new FeedManager(this);
        this.itemStateService = new ItemStateService(this);
        this.counters = new CountersService(this);
        this.migrations = new MigrationService(this);

        const settingsStart = performance.now();
        await this.loadSettings();
        console.log(`Settings loaded in ${(performance.now() - settingsStart).toFixed(2)}ms`);
        
        const providersStart = performance.now();
        this.providers = new Providers(this);



        this.providers.register(new LocalFeedProvider(this) );

        console.log(`Providers initialized in ${(performance.now() - providersStart).toFixed(2)}ms`);

        // Commands and views
        const commandsStart = performance.now();

        this.initCommands();
        this.registerView(VIEW_ID, (leaf: WorkspaceLeaf) => new ViewLoader(leaf, this));
        this.addSettingTab(new RSSReaderSettingsTab(this.app, this));

        console.log(`Commands and views registered in ${(performance.now() - commandsStart).toFixed(2)}ms`);

        // Manage feed update interval with a single subscription
        let interval: number | undefined;
        const storeStart = performance.now();
        settingsStore.subscribe((settings: RssReaderSettings) => {
            if (interval !== undefined) {
                clearInterval(interval);
                interval = undefined;
            }

            if (settings.updateTime !== 0) {
                interval = window.setInterval(async () => {
                    await this.feedManager.updateFeeds();
                }, settings.updateTime * 60 * 1000);

                this.registerInterval(interval);
            }

            this.settings = settings;
            this.saveSettings();
        });

        this.app.workspace.onLayoutReady(async () => {
            await this.migrateData();
            await this.initLeaf();
            await this.feedManager.updateFeeds();

            feedsStore.subscribe((feeds: RssFeedContent[]) => {
                // Ensure feeds is always an array
                if (!Array.isArray(feeds)) {
                    console.warn('feeds is not an array:', typeof feeds, feeds);
                    return;
                }

                // Efficiently process feeds in a single loop
                const sorted: Record<string, RssFeedContent[]> = {};
                // Items from every folder
                const items: RssFeedItem[] = [];
                const tags: string[] = [];
                const folders: string[] = [];

                for (const feed of feeds) {
                    // Sort feeds by folder
                    const folder = feed.folder || "";
                    if (!sorted[folder]) sorted[folder] = [];
                    sorted[folder].push(feed);

                    // Flatten items and collect tags/folders
                    if (feed && Array.isArray(feed.items)) {
                        for (const item of feed.items) {
                            items.push(item);
                            if (item && Array.isArray(item.tags)) {
                                for (const tag of item.tags) {
                                    if (tag && tag.length > 0) tags.push(tag);
                                }
                            }
                            if (item && item.folder) {
                                folders.push(item.folder);
                            }
                        }
                    }
                }

                // Collect tags from metadata cache
                const metadataCache = this.app.metadataCache as any;
                const fileTags = metadataCache.getTags?.() || {};
                for (const tag of Object.keys(fileTags)) {
                    tags.push(tag.replace('#', ''));
                }
                tagsStore.update(() => new Set<string>(tags.filter(tag => tag.length > 0)));

                // Update sorted feeds and folders
                sortedFeedsStore.update(() => sorted);
                folderStore.update(() => new Set<string>(folders.filter(folder => folder && folder.length > 0)));

                // Sort items by date, newest first
                items.sort((a, b) => {
                    const dateA = Date.parse(a.pubDate ?? '');
                    const dateB = Date.parse(b.pubDate ?? '');
                    return dateB - dateA;
                });
            });
        });
    }

    async onUnload(): Promise<void> {
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
        // Search for an existing RSS view
        const existing = this.app.workspace.getLeavesOfType(VIEW_ID);
        
        if (existing.length > 0) {
            // If it exists, activate it
            this.app.workspace.revealLeaf(existing[0]);
        } else {
            // If it doesn't exist, create a new one in the current or new tab
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
                console.error('Invalid data.json, loading defaults.', e);
                new Notice(t("RSS_Reader") + ': data.json invalid, loading defaults');

                this.settings = {...DEFAULT_SETTINGS};

                // Update stores for the defaults.
                settingsStore.set(this.settings);
                // Update the configured feeds store
                feedsStore.set(this.settings.feeds);
                itemsStore.set(this.settings.items);

                foldedState.set(this.settings.folded);
                
                return;
            }
        }

        // Generate new settings.
        const data = await this.loadData();
        this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
        
        // Define the hotkeys for this plugin.
        if (data !== undefined && data !== null) {
            this.settings.hotkeys = Object.assign({}, DEFAULT_SETTINGS.hotkeys, data.hotkeys);
        }

        // Save settings to stores
        settingsStore.set(this.settings);
        // Update the configured feeds store
        feedsStore.set(this.settings.feeds);
        itemsStore.set(this.settings.items);
        
        // Feeds that were folded?
        foldedState.set(this.settings.folded);
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
    }

    async writeFeeds(changeOpts: (feeds: RssFeed[]) => Partial<RssFeed[]>): Promise<void> {
        // Update the configured feeds store
        await configuredFeedsStore.update((old) => ({
            ...old, ...changeOpts(old)
        }));

        // Update the feeds store
        await this.writeSettings((old) => ({
            feeds: changeOpts(old.feeds)
        }));

        await this.feedManager.updateFeeds();
    }

    // Deprecated: feed content writes delegated to settingsManager (kept for backward compatibility)
    async writeFeedContent(changeOpts: (items: RssFeedContent[]) => RssFeedContent[]): Promise<void> { 
        return this.settingsManager.writeFeedContent(changeOpts); 
    }

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

    private initCommands(): void {
        // Commands
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
            callback: async () => { await this.updateFeeds(); }
        });
        
        this.addCommand({
            id: 'rss-cleanup',
            name: t("cleanup"),
            callback: async () => { new CleanupModal(this).open(); }
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

        // Comando para regenerar todas las entradas (resetear items y volver a cargar)
        this.addCommand({
            id: 'rss-regenerate-items',
            name: t("regenerate_all"),
            callback: async () => {
                try {
                    console.log('Regenerating all feed items: clearing existing items and refetching...');
                    new Notice('Regenerando entradas de RSS…');
                    // Vaciar items actuales
                    await this.writeFeedContent(() => []);
                    
                    // 2. Invalidar cache del provider local (si existe)
                    const localProvider = await this.providers.getById('local') as LocalFeedProvider;
                    if (localProvider && localProvider.invalidateCache) {
                        localProvider.invalidateCache();
                    }
                    // 3. Volver a cargar feeds desde cero
                    await this.updateFeeds();
                    // 4. Despachar evento para refrescar contadores en la UI
                    // NOTE: use document.dispatchEvent for internal RSS events so ViewLoader listeners receive them.
                    document.dispatchEvent(new CustomEvent(RSS_EVENTS.UNREAD_COUNTS_CHANGED));
                    new Notice('Entradas regeneradas');
                    console.log('✅ Regeneración completada correctamente');
                } catch (e) {
                    console.error('❌ Error regenerating feed items', e);
                    new Notice('Error al regenerar entradas (ver consola)');
                }
            }
        });
    }

}