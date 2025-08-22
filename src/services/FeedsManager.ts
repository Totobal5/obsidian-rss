import type RssReaderPlugin from '../main';
import {getFeedItems} from '../parser/rssParser';
import type { RssFeedContent, RssFeedItem } from '../parser/rssParser';
import type { RssFeed } from '../settings/settings';

import {LocalFeedProvider} from '../providers/local/LocalFeedProvider';
import t from '../l10n/locale';
import {Notice} from 'obsidian';

import { 
    feedsStore, 
    itemsStore, 
    filteredStore, 
    filteredItemsStore,
    sortedFeedsStore,
    tagsStore,
    folderStore
} from '../stores';

import { SortOrder, type FilteredFolder } from '../modals/FilteredFolderModal';
import type { FilteredFolderContent } from '../stores';
import { get } from 'svelte/store';

/**
 * Service responsible for updating RSS feeds, sorting RSS feed content, preserving user state, 
 * counting unread items and folder, and returning the favorites items marked by the user.
 * It uses the stores like feedsStore and itemsStore
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
export class FeedsManager {
    private abort?: AbortController;
    private updating = false;

    // Map of feed URLs to their configured RSS feeds
    private configuredFeeds: RssFeed[] = [];

    // Map of folder name to array of RssFeedItem
    private itemByFolder = new Map<string, RssFeedItem[]>();

    // Map of feed items by their unique link (corregido)
    private itemByLink = new Map<string, RssFeedItem>();

    // Map of feed items by their unique hash
    private itemByHash = new Map<string, RssFeedItem>();

    // Map of unread count global
    private unreadCount = new Map<string, number>();

    // Map of unread count by feed
    private unreadCountByFeed = new Map<string, number>();

    // Map of unread count by folder
    private unreadCountByFolder = new Map<string, number>();

    constructor(private plugin: RssReaderPlugin) {
        // ✅ CORRECTED: Handle all item processing here
        itemsStore.subscribe((feeds) => { 
            this.rebuildIndexes(feeds);
            this.updateDerivedStores(feeds);
        });
        
        filteredStore.subscribe(() => { 
            this.processFilters(); 
        });
    }

    /** Indica si hay una actualización en curso */
    public isUpdating() {
        return this.updating;
    }

    /** Cancela la actualización en curso */
    public cancel() {
        this.abort?.abort();
    }

    /**
     * Actualiza todos los feeds RSS, fusiona los items nuevos con los existentes,
     * preserva el estado del usuario y actualiza los stores reactivos.
     */
    async updateFeeds(): Promise<void> {
        if (this.updating) {
            console.log('updateFeeds skipped (already running)');
            return;
        }

        this.updating = true;
        this.abort = new AbortController();
        const updateStartTime = performance.now();
        console.log('RSS Reader: Starting feed update...');

        try {
            // Leer feeds configurados desde el store
            let feeds: RssFeed[] = get(feedsStore);
            // Si el store está vacío, usar settings del plugin como fallback
            if (!feeds.length && this.plugin.settings?.feeds) {
                feeds = this.plugin.settings.feeds;
            }

            // Descargar todos los feeds en paralelo con timeout
            const feedPromises = feeds.map((feed: RssFeed) =>
                this.fetchFeedWithTimeout(feed, 15000).then(result => {
                    if (!result) {
                        // Mark the feed as failed with error property
                        return { ...feed, error: 'Failed to fetch or returned error', items: [] as RssFeedItem[] };
                    }
                    return result;
                })
            );
            const results = await Promise.all(feedPromises);
            // Filter out feeds with error before updating itemsStore
            const newFeeds = results.filter((result: any) => !result.error) as RssFeedContent[];

            // Leer feeds existentes desde el store
            let existingFeeds: RssFeedContent[] = get(itemsStore);

            // Fusionar feeds nuevos con los existentes
            const finalFeeds = this.mergeFeeds(newFeeds, existingFeeds);

            // Actualizar el store reactivo (esto actualiza la UI y otros servicios)
            itemsStore.set(finalFeeds);

            // Invalidar cache local
            const localProvider = this.plugin.providers.getById?.('local') as LocalFeedProvider | undefined;
            if (localProvider) {
                localProvider.invalidateCache();
            }

            await this.plugin.writeFeedContent(() => finalFeeds);

            // Procesar filtros
            this.processFilters();

            new Notice(t('refreshed_feeds'));
            console.log(`Feed update completed in ${(performance.now() - updateStartTime).toFixed(2)}ms total`);
        } catch (error: unknown) {
            console.error('Error updating feeds:', error);
        } finally {
            this.updating = false;
            this.abort = undefined;
        }
    }

    /** Descarga un feed con timeout y abort */
    private async fetchFeedWithTimeout(feed: RssFeed, ms: number): Promise<RssFeedContent | null> {
        const feedStart = performance.now();
        try {
            const items = await this.timeout(getFeedItems(feed, { signal: this.abort!.signal }), ms);
            console.log(`Feed "${feed.name}" loaded in ${(performance.now() - feedStart).toFixed(2)}ms`);
            return items;
        } catch (error: any) {
            if (error?.name === 'AbortError') {
                console.warn(`Feed fetch aborted: ${feed.name}`);
            } else if (error?.message === 'timeout') {
                console.warn(`Feed timed out: ${feed.name}`);
            } else {
                console.error(`Failed to load feed "${feed.name}":`, error);
            }
            return null;
        }
    }

    /** Fusiona feeds nuevos con los existentes, preservando flags de usuario */
    private mergeFeeds(newFeeds: RssFeedContent[], existingFeeds: RssFeedContent[]): RssFeedContent[] {
        const finalFeeds: RssFeedContent[] = [...existingFeeds];

        for (const newFeed of newFeeds) {
            const existingFeed = finalFeeds.find(f => f.name === newFeed.name && f.folder === newFeed.folder);
            if (!existingFeed) {
                finalFeeds.push(newFeed);
            } else {
                const existingByLink = new Map(existingFeed.items.map(i => [i.link, i]));
                const seen = new Set<string>();
                const merged: RssFeedItem[] = [];
                for (const fresh of newFeed.items) {
                    const old = existingByLink.get(fresh.link);
                    if (old) {
                        merged.push({
                            ...fresh,
                            read: old.read !== undefined ? old.read : fresh.read,
                            favorite: old.favorite !== undefined ? old.favorite : fresh.favorite,
                            created: old.created !== undefined ? old.created : fresh.created,
                            visited: old.visited !== undefined ? old.visited : fresh.visited,
                            tags: Array.isArray(old.tags) && old.tags.length ? old.tags : fresh.tags,
                            highlights: Array.isArray(old.highlights) && old.highlights.length ? old.highlights : fresh.highlights,
                        });
                    } else {
                        merged.push(fresh);
                    }
                    seen.add(fresh.link);
                }
                // Mantener items antiguos que ya no vienen en el feed (histórico)
                for (const old of existingFeed.items) {
                    if (!seen.has(old.link)) merged.push(old);
                }
                existingFeed.items = merged;
                // Actualizar metadatos de feed
                existingFeed.title = newFeed.title;
                existingFeed.description = newFeed.description;
                existingFeed.image = newFeed.image;
                existingFeed.link = newFeed.link;
            }
        }
        return finalFeeds;
    }

    /** Utilidad para timeout en promesas */
    private timeout<T>(promise: Promise<T>, ms: number): Promise<T> {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('timeout')), ms);
            promise.then(
                (value) => { clearTimeout(timer); resolve(value); },
                (error) => { clearTimeout(timer); reject(error); }
            );
        });
    }

    /** Reconstruye los índices internos a partir del array de feeds */
    private rebuildIndexes(feeds: RssFeedContent[]): void {
        // Limpiar todos los mapas
        this.itemByLink.clear();
        this.itemByHash.clear();
        this.itemByFolder.clear();
        this.unreadCountByFeed.clear();
        this.unreadCountByFolder.clear();

        // Reconstruir índices
        for (const feedContent of feeds) {
            if (!feedContent || !Array.isArray(feedContent.items)) continue;
            
            let unreadCount = 0;
            const folderItems: RssFeedItem[] = [];

            for (const item of feedContent.items) {
                if (!item) continue;

                // Índice por link
                if (item.link) {
                    this.itemByLink.set(item.link, item);
                }

                // Índice por hash (si existe)
                if (item.hash) {
                    this.itemByHash.set(item.hash, item);
                }

                // Contar no leídos
                if (!item.read) {
                    unreadCount++;
                }

                // Agregar a folder
                folderItems.push(item);

                // Asegurar que pubDateMs existe para ordenamiento
                if (item.pubDate && !(item as any).pubDateMs) {
                    (item as any).pubDateMs = Date.parse(item.pubDate) || 0;
                }
            }

            // Guardar conteo de no leídos por feed
            this.unreadCountByFeed.set(feedContent.name, unreadCount);

            // Guardar items por folder
            if (feedContent.folder) {
                const existing = this.itemByFolder.get(feedContent.folder) || [];
                this.itemByFolder.set(feedContent.folder, [...existing, ...folderItems]);
            }
        }

        // Calcular conteos por folder
        for (const [folder, items] of this.itemByFolder.entries()) {
            const unreadCount = items.filter(item => !item.read).length;
            this.unreadCountByFolder.set(folder, unreadCount);
        }
    }

    /**
     * Procesa todos los filtros y actualiza el store de items filtrados
     * @public
     */
    public processFilters(): void {
        try {
            // Obtener todos los items
            const allItems = this.getAllItems();
            
            if (allItems.length === 0) return;

            // Obtener filtros actuales
            let currentFilters: FilteredFolder[] = [];
            const unsubFiltered = filteredStore.subscribe(v => currentFilters = v);
            unsubFiltered();

            // Aplicar cada filtro
            const filtered: FilteredFolderContent[] = [];
            for (const filter of currentFilters) {
                const filteredItems = this.applyFilter(allItems, filter);
                if (filteredItems.length > 0) {
                    filtered.push({
                        filter: filter,
                        items: { items: filteredItems }
                    });
                }
            }

            // Actualizar el store de items filtrados
            filteredItemsStore.set(filtered);
            
        } catch (error) {
            console.warn('Error processing filters:', error);
        }
    }

    /**
     * Obtiene todos los items de todos los feeds
     * @private
     */
    private getAllItems(): RssFeedItem[] {
        const items: RssFeedItem[] = [];
        
        // Usar el índice interno si está disponible
        for (const item of this.itemByLink.values()) {
            items.push(item);
        }
        // Si el índice está vacío, leer desde el store
        if (items.length === 0) {
            const feeds: RssFeedContent[] = get(itemsStore);
            feeds.forEach((feed: RssFeedContent) => {
                if (feed && feed.items) {
                    items.push(...feed.items);
                }
            });
        }
        return items;
    }

    /**
     * Aplica un filtro específico a los items
     * @private
     */
    private applyFilter(items: RssFeedItem[], filter: FilteredFolder): RssFeedItem[] {
        let filtered = [...items];

        // Apply favorites filter
        if (filter.favorites) {
            filtered = filtered.filter(item => item.favorite);
        }

        // Apply read/unread filters
        if (filter.read && !filter.unread) {
            filtered = filtered.filter(item => item.read);
        } else if (filter.unread && !filter.read) {
            filtered = filtered.filter(item => !item.read);
        }

        // Apply folder filters
        if (filter.filterFolders && filter.filterFolders.length > 0) {
            filtered = filtered.filter(item => filter.filterFolders.includes(item.folder));
        }

        // Apply feed filters
        if (filter.filterFeeds && filter.filterFeeds.length > 0) {
            filtered = filtered.filter(item => filter.filterFeeds.includes((item as any).feed || ''));
        }

        // Apply tag filters
        if (filter.filterTags && filter.filterTags.length > 0) {
            filtered = filtered.filter(item => {
                if (!item.tags || !Array.isArray(item.tags)) return false;
                return filter.filterTags.some(tag => item.tags.includes(tag));
            });
        }

        // Apply ignore filters
        if (filter.ignoreFolders && filter.ignoreFolders.length > 0) {
            filtered = filtered.filter(item => !filter.ignoreFolders.includes(item.folder));
        }

        if (filter.ignoreFeeds && filter.ignoreFeeds.length > 0) {
            filtered = filtered.filter(item => !filter.ignoreFeeds.includes((item as any).feed || ''));
        }

        if (filter.ignoreTags && filter.ignoreTags.length > 0) {
            filtered = filtered.filter(item => {
                if (!item.tags || !Array.isArray(item.tags)) return true;
                return !filter.ignoreTags.some(tag => item.tags.includes(tag));
            });
        }

        // Apply sorting
        if (filter.sortOrder) {
            filtered = this.sortItems(filtered, filter.sortOrder as unknown as SortOrder);
        }

        return filtered;
    }

    /**
     * Ordena items basado en el criterio especificado
     * @private
     */
    private sortItems(items: RssFeedItem[], sortOrder: SortOrder): RssFeedItem[] {
        const sorted = [...items];

        switch (sortOrder) {
            default:
            case SortOrder.DATE_NEWEST:
                return sorted.sort((a, b) => {
                    const aTime = a.pubDate ? Date.parse(a.pubDate) : 0;
                    const bTime = b.pubDate ? Date.parse(b.pubDate) : 0;
                    return bTime - aTime;
                });
                
            case SortOrder.DATE_OLDEST:
                return sorted.sort((a, b) => {
                    const aTime = a.pubDate ? Date.parse(a.pubDate) : 0;
                    const bTime = b.pubDate ? Date.parse(b.pubDate) : 0;
                    return aTime - bTime;
                });
                
            case SortOrder.ALPHABET_NORMAL:
                return sorted.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
            
            case SortOrder.ALPHABET_INVERTED:
                return sorted.sort((a, b) => (b.title || '').localeCompare(a.title || ''));
        }
    }

    /** Obtiene un item por su link */
    public getItemByLink(link: string): RssFeedItem | undefined {
        return this.itemByLink.get(link);
    }

    /** Obtiene un item por su hash */
    public getItemByHash(hash: string): RssFeedItem | undefined {
        return this.itemByHash.get(hash);
    }

    /** Obtiene items por folder */
    public getItemsByFolder(folder: string): RssFeedItem[] {
        return this.itemByFolder.get(folder) || [];
    }

    /** Obtiene el número de no leídos para un feed */
    public getUnreadCountForFeed(feedName: string): number {
        return this.unreadCountByFeed.get(feedName) || 0;
    }

    /** Obtiene el número de no leídos para un folder */
    public getUnreadCountForFolder(folder: string): number {
        return this.unreadCountByFolder.get(folder) || 0;
    }

    /** Obtiene todos los folders con items */
    public getFolders(): string[] {
        return Array.from(this.itemByFolder.keys());
    }

    /**
     * Groups array by property (utility method)
     * @private
     */
    private groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
        return array.reduce((groups, item) => {
            const groupKey = String(item[key] || '');
            if (!groups[groupKey]) {
                groups[groupKey] = [];
            }
            groups[groupKey].push(item);
            return groups;
        }, {} as Record<string, T[]>);
    }

    /**
     * Updates all derived stores when items change
     * @private
     */
    private updateDerivedStores(feeds: RssFeedContent[]): void {
        if (!Array.isArray(feeds)) {
            console.warn('🔍 feeds is not an array:', typeof feeds, feeds);
            return;
        }

        // Update sorted feeds store
        const sorted = this.groupBy(feeds, "folder");
        sortedFeedsStore.update(() => sorted);

        // Flatten all items for processing
        const allItems: RssFeedItem[] = [];
        feeds.forEach((feed: RssFeedContent) => {
            if (feed && feed.items) {
                allItems.push(...feed.items);
            }
        });

        // Update tags store
        this.updateTagsStore(allItems);

        // Update folders store
        this.updateFoldersStore(allItems);

        // Process filters
        this.processFilters();
    }

    /**
     * Updates tags store from all items
     * @private
     */
    private updateTagsStore(items: RssFeedItem[]): void {
        const tags: string[] = [];
        
        // Collect tags from items
        items.forEach((item: RssFeedItem) => {
            if (item && item.tags && Array.isArray(item.tags)) {
                item.tags.forEach((tag: string) => {
                    if (tag && tag.length > 0) {
                        tags.push(tag);
                    }
                });
            }
        });

        // Add Obsidian vault tags
        try {
            const metadataCache = (this.plugin as any).app?.metadataCache;
            const fileTags = metadataCache?.getTags?.() || {};
            for (const tag of Object.keys(fileTags)) {
                tags.push(tag.replace('#', ''));
            }
        } catch { /* optional in tests */ }

        // Update store
        tagsStore.update(() => new Set<string>(tags.filter(tag => tag.length > 0)));
    }

    /**
     * Updates folders store from all items
     * @private
     */
    private updateFoldersStore(items: RssFeedItem[]): void {
        const foldersSet = new Set<string>();
        for (const item of items) {
            if (item && item.folder) foldersSet.add(item.folder);
        }
        // Include configured feeds folders even if no items fetched yet
        try {
            let configured: RssFeed[] = get(feedsStore);
            if (!configured || configured.length === 0) configured = this.plugin.settings?.feeds || [];
            configured.forEach(f => { if (f && (f as any).folder) foldersSet.add((f as any).folder); });
        } catch {}
        folderStore.update(() => new Set<string>(Array.from(foldersSet).filter(f => f && f.length > 0)));
    }    
}