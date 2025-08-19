import {Notice, Plugin, WorkspaceLeaf} from 'obsidian';
import {DEFAULT_SETTINGS} from "./settings/settings";
import type {RssFeed, RssReaderSettings} from "./settings/settings";
import ViewLoader from "./view/ViewLoader";
import {
    feedsStore,
    itemsStore,
    filteredStore,
    foldedState,
    folderStore,
    settingsStore,
    tagsStore
} from "./stores";

import {VIEW_ID} from "./consts";
import type { RssFeedContent, RssFeedItem } from "./parser/rssParser";
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
import type {FeedsManager} from './services/FeedsManager';
import type {ItemStateService} from './services/ItemStateService';
import type {MigrationService} from './services/MigrationService';

export default class RssReaderPlugin extends Plugin {
    settings: RssReaderSettings;
    providers: Providers;

    // Add missing properties
    private feedContentSaveTimer: number | undefined;

    // Services (initialized lazily in onload)
    feedsManager!: FeedsManager;
    itemStateService!: ItemStateService;
    migrations!: MigrationService;

    async onload(): Promise<void> {
        const startTime = performance.now();
        console.log('RSS Reader: Starting plugin load...');
        //update settings object whenever store contents change.
        this.register(
            settingsStore.subscribe((value: RssReaderSettings) => {
                this.settings = value;
            })
        );
        
        const settingsStart = performance.now();
        await this.loadSettings();
        console.log(`Settings loaded in ${(performance.now() - settingsStart).toFixed(2)}ms`);
        
        const providersStart = performance.now();
        this.providers = new Providers(this);
        // Initialize services (lazy import style to avoid circular)
        const {FeedsManager} = await import('./services/FeedsManager');
        const {ItemStateService} = await import('./services/ItemStateService');
        const {MigrationService} = await import('./services/MigrationService');
        this.feedsManager = new FeedsManager(this);
        this.itemStateService = new ItemStateService(this);
        this.migrations = new MigrationService(this);
        this.providers.register(new LocalFeedProvider(this));
        console.log(`Providers initialized in ${(performance.now() - providersStart).toFixed(2)}ms`);

        const commandsStart = performance.now();

        this.initCommands()
        this.registerView(VIEW_ID, (leaf: WorkspaceLeaf) => new ViewLoader(leaf, this));
        this.addSettingTab(new RSSReaderSettingsTab(this.app, this));
        
        console.log(`Commands and views registered in ${(performance.now() - commandsStart).toFixed(2)}ms`);

        // Refactor this to use FeedsManager
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
        console.log(`Intervals setup in ${(performance.now() - intervalStart).toFixed(2)}ms`);

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
        console.log(`Store subscriptions setup in ${(performance.now() - storeStart).toFixed(2)}ms`);

        console.log(`RSS Reader loaded successfully in ${(performance.now() - startTime).toFixed(2)}ms total`);

        // Refactor this to use FeedManager
        this.app.workspace.onLayoutReady(async () => {
            await this.migrateData();
            await this.initLeaf();
            await this.updateFeeds();
        });

        console.log(`RSS Reader loaded successfully in ${(performance.now() - startTime).toFixed(2)}ms total`);
    }

    async updateFeeds(): Promise<void> { 
        await this.feedsManager.updateFeeds(); 
    }

    async onunload(): Promise<void> {
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
                console.error('Invalid data.json, loading defaults.', e);
                new Notice(t("RSS_Reader") + ': data.json invalid, loading defaults');
                this.settings = {...DEFAULT_SETTINGS};
                settingsStore.set(this.settings);
                feedsStore.set(this.settings.feeds);
                itemsStore.set(this.settings.items);
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
        feedsStore.set(this.settings.feeds);
        itemsStore.set(this.settings.items);
        foldedState.set(this.settings.folded);
    }

    async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    }

    // Unified writeFeedContent method
        async writeFeedContent(change: (items: RssFeedContent[]) => RssFeedContent[]): Promise<void> {
        const current = this.settings.items || [];
        const updated = change(current);
        await itemsStore.update(() => updated);
        await this.writeSettingsInternal(o => ({items: updated}));
    }

    // Unified writeFeedContentDebounced method
    async writeFeedContentDebounced(mutator: (items: RssFeedContent[]) => void, delay = 250): Promise<void> {
        try {
            const items = this.settings.items || [];
            mutator(items);
            await itemsStore.update(() => items);
            
            if (this.feedContentSaveTimer) window.clearTimeout(this.feedContentSaveTimer);
            this.feedContentSaveTimer = window.setTimeout(async () => {
                await this.writeSettings(old => ({ items }));
                this.feedContentSaveTimer = undefined;
            }, delay);

        } catch (e) { 
            console.warn('Debounced write failed', e); 
        }
    }

    // Keep only one writeFeeds method
    async writeFeeds(changeOpts: (feeds: RssFeed[]) => Partial<RssFeed[]>): Promise<void> {
        await feedsStore.update((old) => ({...old, ...changeOpts(old)}));
        await this.writeSettings((old) => ({
            feeds: changeOpts(old.feeds)
        }));
        await this.updateFeeds();
    }

    // Keep only one writeFiltered method
    async writeFiltered(changeOpts: (folders: FilteredFolder[]) => Partial<FilteredFolder[]>): Promise<void> {
        await filteredStore.update((old) => ({...old, ...changeOpts(old)}));
        await this.writeSettings((old) => ({
            filtered: changeOpts(old.filtered)
        }));
        await this.updateFeeds();
    }

    // Keep only one writeFolded method
    async writeFolded(folded: string[]): Promise<void> {
        await foldedState.update(() => folded);
        await this.writeSettings(() => ({
            folded: folded
        }));
    }

    // Internal write helper for services
    async writeSettingsInternal(mut: (s: RssReaderSettings) => Partial<RssReaderSettings>): Promise<void> {
        await this.writeSettings(old => ({...mut(old)}));
    }

    async writeSettings(changeOpts: (settings: RssReaderSettings) => Partial<RssReaderSettings>): Promise<void> {
        await settingsStore.update((old) => ({...old, ...changeOpts(old)}));
    }

    private initCommands(): void {
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
            // Refactor to use FeedsManager
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

        // Command to regenerate all items (reset)
        this.addCommand({
            id: 'rss-regenerate-items',
            name: t("regenerate_items"),
            // Refactor to use FeedsManager
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

    public processFilters(): void {
        if (this.feedsManager) {
            this.feedsManager.processFilters();
        }
    }    
}