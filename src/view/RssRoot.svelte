<script lang="ts">
    import { toItem, toFeed } from "../functions"
    import { onMount, onDestroy } from 'svelte';
    import FolderView from './FolderView.svelte';
    import type RssReaderPlugin from '../main';
    import { RSS_EVENTS } from '../events';
    import t from '../l10n/locale';
    import type { Feed } from '../providers/Feed';
    import type { Item } from '../providers/Item';
    import type { Folder } from "../providers/Folder";
    import { ItemModal } from '../modals/ItemModal';
    import ListItem from './ListItem.svelte';
    // Import stores
    import { feedsStore, itemsStore } from '../stores';
    import type { RssFeedContent } from "src/parser/rssParser";
    
    import VirtualList from "@sveltejs/svelte-virtual-list/VirtualList.svelte";

    export let plugin: RssReaderPlugin;

	// --- STATE VARIABLES ---

	// List of all folders (each folder contains feeds)
	let folders: Folder[] = [];

	// Flat list of all feeds across folders
	let allFeeds: Feed[] = [];

	// Currently active feeds (based on selection)
	let activeFeeds: Feed[] = [];

	// Whether "Favorites" mode is active (showing only favorite items)
	let favoritesMode = false;

	// List of favorite items (populated when favoritesMode is true)
	let favoriteItems: Item[] = [];

	// List of items to display in the main list (each with its feed reference)
	let listItems: { feed: Feed | null, item: Item }[] = [];

	// Grouped items for display (by date: today, yesterday, etc.)
	let grouped: { key: string, label: string, items: { feed: Feed | null, item: Item }[] }[] = [];

	// Raw data from the items store: array of feed objects with items
	let feedsDataRaw: RssFeedContent[] = [];
    let feedsData: Feed[] = [];

	// Store unsubscribe function for itemsStore subscription
	let unsubItems: (() => void) | undefined;

    // UI state for sidebar
    let activeFeedName: string | null = null;
    let activeFolderName: string | null = null;
    let collapsedFolders: Set<string> = new Set();
	
    // bump to force FolderView rerender
    let countsVersion = 0;

    // --- UNREAD COUNTS (now using FeedsManager and ItemStateService) ---
    let unreadFeedMap: Record<string, number> = {};
    let unreadFolderMap: Record<string, number> = {};
    let favoriteCountVal = 0;
    let globalUnreadVal = 0;
    
    let visibleGroups = 5;
    const groupsPerPage = 5;
    let sentinel: HTMLDivElement;
    let observer: IntersectionObserver;
    
    let flatListItems: Array<{ type: 'header' | 'item', label?: string, item?: { feed: Feed | null, item: Item } }> = [];

    // Subscribe to itemsStore for reactive data
    $: if (plugin?.feedsManager && !unsubItems) {
        unsubItems = itemsStore.subscribe((feeds) => {
            // Update to the current feeds data.
            feedsDataRaw = feeds;
            // Filtrar feeds con error antes de pasarlos a la UI
            feedsData = feedsDataRaw.filter(feed => !(feed && (feed as any).error)).map(toFeed);
            allFeeds = feedsData;

            buildActiveFeedsFromSelection();
            // Inicializar favoritos y contadores al arrancar
            refreshFavorites(false);
            recomputeCountMaps();
            rebuildList();
        });
    }

    // Clean up subscription on destroy
    onDestroy(() => {
        if (unsubItems) {
            unsubItems();
            unsubItems = undefined;
        }

        if (observer && sentinel) observer.unobserve(sentinel as Element);
        observer = null;
    });

    function buildActiveFeedsFromSelection() {
        if (favoritesMode) return;
        if (activeFeedName) {
            const f = allFeeds.find(ff => ff.name() === activeFeedName);
            activeFeeds = f ? [f] : allFeeds;

            return;
        }
		
        if (activeFolderName) {
            const folderFeeds = allFeeds.filter(ff => ff.name() === activeFolderName);
            activeFeeds = folderFeeds.length ? folderFeeds : allFeeds;

            return;
        }
        activeFeeds = allFeeds;
    }
	
    const loadFolders = async () => {
        if (!plugin || !plugin.providers || !plugin.providers.getCurrent) {
            folders = [];
            return;
        }
        try {
            const current = plugin.providers.getCurrent();
            if (current && current.folders) { folders = await current.folders(); } else { folders = []; }
        } catch { folders = []; }

        // IMPORTANT: do NOT repopulate allFeeds from provider feeds here.
        // Provider feed objects may become stale regarding item read/favorite flags.
        // We rely on the itemsStore subscription to keep allFeeds ( = feedsData ) canonical.
        allFeeds = feedsData; // ensure we keep canonical reference
        buildActiveFeedsFromSelection();
        refreshFavorites(false);
    };

    function setActiveFeeds(feeds: Feed[]) {
        favoritesMode = false;
        activeFeeds = feeds;
    }

    // Resolve an incoming (possibly provider-origin) feed to the canonical wrapper from feedsData
    function canonicalFeed(feed: Feed): Feed {
        const match = feedsData.find(f => {
            try { return f.name() === feed.name(); } catch { return false; }
        });

        return match || feed; // fallback if not found yet
    }

    function canonicalize(feeds: Feed[]): Feed[] {
        return feeds.map(canonicalFeed); 
    }

    const imgSrcRegex = /<img[^>]+src=["']([^"']+)["']/i;

    function firstImageFromHtml(html: string): string | undefined {
        if (!html) return undefined;
        // Limit for the first 2-4 KB
        const snippet = html.slice(0, 4096);
        const m = imgSrcRegex.exec(snippet);
        return m ? m[1] : undefined;
    }

    // Returns the thumbnail URL for an item, caching the result for future calls
    function deriveThumb(item: Item): string | undefined {
        // Use a symbol for cache to avoid property conflicts
        const cacheKey = '_thumb';
        if (cacheKey in item) return (item as any)[cacheKey];

        // Try mediaThumbnail first
        const image = item.mediaThumbnail?.();
        if (image) {
            (item as any)[cacheKey] = image;
            return image;
        }

        // Fallback: extract first image from HTML body
        const html = item.body?.();
        if (html) {
            const thumb = firstImageFromHtml(html);
            (item as any)[cacheKey] = thumb;
            return thumb;
        }

        // No thumbnail found
        (item as any)[cacheKey] = undefined;
        return undefined;
    }

    // Helper to determine group order
    function groupOrder(key: string): number {
        if (key === 'today') return 0;
        if (key === 'yesterday') return 1;
        return 2;
    }

    // Rebuild the list
	function rebuildList() {
        // Always canonicalize activeFeeds to ensure we use the wrappers whose items reflect latest raw state.
        if (activeFeeds && activeFeeds.length) {
            activeFeeds = canonicalize(activeFeeds);
        }
        // Keep allFeeds pointing at feedsData (canonical) to avoid stale provider copies.
        allFeeds = feedsData;
        // Favoritos: lista directa
        if (favoritesMode) {
            // Intenta asociar cada item favorito con su feed real para evitar feed null en la UI
            listItems = favoriteItems.map(it => {
                const feedRef = allFeeds.find(f => {
                    try { return f.name() === it.feed(); } catch { return false; }
                });
                return { feed: feedRef ?? null as Feed | null, item: it };
            });
            listItems.sort((a,b)=> getPubTime(b.item) - getPubTime(a.item));
            buildGroups();
            
            return;
        }

        const sourceFeeds = activeFeeds && activeFeeds.length ? activeFeeds : allFeeds;
        const collected: { feed: Feed | null, item: Item }[] = [];

        function matchesSelection(feed: Feed): boolean {
            if (activeFeedName) return feed.name() === activeFeedName;
            if (activeFolderName) return feed.folderName() === activeFolderName;
            return true;
        }

        for (const feed of sourceFeeds) {
            if (!matchesSelection(feed)) continue;
            const its = feed.items();
            if (!its || !its.length) continue;
            for (const item of its) {
                if (item) collected.push({ feed, item });
            }
        }

        // Fallback: si sigue vacío, intentar con todos los feeds
        if (collected.length === 0 && sourceFeeds !== allFeeds) {
            for (const feed of allFeeds) {
                for (const item of feed.items()) collected.push({ feed, item });
            }
        }

        collected.sort((a, b) => getPubTime(b.item) - getPubTime(a.item));
        listItems = collected;
        buildGroups();
	}

    function buildFlatList() {
        flatListItems = [];
        for (const group of grouped) {
            flatListItems.push({ type: 'header', label: group.label });
            for (const li of group.items) {
                flatListItems.push({ type: 'item', item: li });
            }
        }
    }

    // Helper to get normalized date from an item
    function getNormalizedDate(item: Item): Date {
        const pubDateValue = item.pubDate?.();
        const date = pubDateValue && !isNaN(new Date(pubDateValue).getTime())
            ? new Date(pubDateValue)
            : new Date(0); // Epoch fallback
        date.setHours(0, 0, 0, 0);
        return date;
    }

    function getPubTime(item: Item): number { 
        try { 
            const v = item.pubDate?.();
            const t = v? Date.parse(v): NaN;
            return isNaN(t) ? 0 : t;

        } catch { return 0; }
    }

	/**
	 * Groups listItems by date (today, yesterday, or date string).
	 * Each group contains a label and sorted items.
	 * Updates the `grouped` variable for rendering.
	 */
    function buildGroups() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const yesterday = new Date(today.getTime() - 86400000);

        const byKey: Record<string, { label: string, items: { feed: Feed | null, item: Item }[] }> = {};

        for (const li of listItems) {
            const date = getNormalizedDate(li.item);
            let key: string;
            let label: string;

            if (date.getTime() === today.getTime()) {
                key = 'today';
                label = t('today') || 'Today';
            } else if (date.getTime() === yesterday.getTime()) {
                key = 'yesterday';
                label = t('yesterday') || 'Yesterday';
            } else if (!isNaN(date.getTime())) {
                key = date.toISOString().slice(0, 10);
                label = date.toLocaleDateString();
            } else {
                key = 'unknown';
                label = 'Unknown';
            }

            if (!byKey[key]) {
                byKey[key] = { label, items: [] };
            }
            byKey[key].items.push(li);
        }

        grouped = Object.entries(byKey)
            .sort(([keyA], [keyB]) => {
                const orderA = groupOrder(keyA);
                const orderB = groupOrder(keyB);
                if (orderA !== orderB) return orderA - orderB;
                if (orderA === 2) return keyA < keyB ? 1 : -1;
                return 0;
            })
            .map(([key, group]) => ({
                key,
                label: group.label,
                items: group.items
            }));
        
        buildFlatList();
    }

    // Optimized favorites refresh with change detection to avoid unnecessary rebuilds
    function refreshFavorites(rebuildIfActive: boolean = true) {
        const wasActive = favoritesMode;
        const prevSet = wasActive ? new Set(favoriteItems.map(i => i.url())) : undefined;
        const updated: Item[] = [];
        for (const feed of allFeeds) {
            try {
                for (const it of feed.items()) { if (it.starred()) updated.push(it); }
            } catch { /* ignore */ }
        }
        let changed = updated.length !== favoriteItems.length;
        if (!changed && prevSet) {
            for (const it of updated) { if (!prevSet.has(it.url())) { changed = true; break; } }
        }
        favoriteItems = updated;
        favoriteCountVal = favoriteItems.length;
        if (wasActive && rebuildIfActive && changed) rebuildList();
    }

    // Refactored to use services
    async function markAllGlobal(){
        const affectedLinks: string[] = [];

        // Use feedsManager to get all items instead of direct access
        if (plugin.feedsManager) {
            // Get all items and mark them as read
            await plugin.writeFeedContentDebounced((items) => {
            for (const fc of items) {
                if (Array.isArray(fc.items)) {
                    for (const it of fc.items) {
                        it.read = true;
                        if (it.link) affectedLinks.push(it.link);
                    }
                }
            }
            }, 250);
        }

        // Dispatch events
        try { 
            document.dispatchEvent(new CustomEvent(RSS_EVENTS.FEED_MARK_ALL, { 
                detail: { scope:'global', name:'__all__', links: affectedLinks } 
            }) );
        } catch {}
        
        dispatchCounts();
    }

    async function markFolderAsRead(folderName: string){
        const lc = folderName.toLowerCase();
        const affectedLinks: string[] = [];

        // Use feedsManager for consistent data access
        await plugin.writeFeedContentDebounced((items) => {
            for (const fc of items) {
                if (fc.folder && fc.folder.toLowerCase()===lc && Array.isArray(fc.items)) {
                    for (const it of fc.items) {
                    it.read = true;
                    if (it.link) affectedLinks.push(it.link);
                    }
                }
            }
        }, 250);

        try {
            document.dispatchEvent(new CustomEvent(RSS_EVENTS.FEED_MARK_FOLDER, { 
                detail: { scope:'folder', name: folderName, links: affectedLinks } 
            }) );
        } catch {}

        dispatchCounts();
    }

    async function markFeedAsRead(feed: Feed){
        const affectedLinks: string[] = [];
        // Use feedsManager to access feed content
        await plugin.writeFeedContentDebounced((items) => {
            for (const fc of items) {
                if (fc.name === feed.name() || fc.link === feed.url() && Array.isArray(fc.items)) {
                    for (const it of fc.items) {
                        it.read = true;
                        if (it.link) affectedLinks.push(it.link);
                    }
                }
            }
        }, 250);

        try { 
            document.dispatchEvent(new CustomEvent(RSS_EVENTS.FEED_MARK_FEED, { 
                detail: { scope:'feed', name: feed.name(), links: affectedLinks } 
            }) );
        } catch {}

        dispatchCounts();
    }

    function toggleFavorite(item: Item) {
        plugin.itemStateService.toggleFavorite(item).then(()=>{
            // Update favorites; rebuild only if in favorites mode and changed set
            refreshFavorites(true);
            recomputeCountMaps();
            countsVersion++;
        });
    }

    function toggleRead(item: Item) {
        plugin.itemStateService.toggleRead(item);
        // counts will update via event listeners; ensure repaint for badge cases
        countsVersion++;
    }

    function openFavorites() {
        // Si ya estamos en modo favoritos, actúa como toggle para salir
        if (favoritesMode) { 
            openAllFeeds(); 
            return; 
        }
        favoritesMode = true;
        refreshFavorites();
        
        activeFeedName = null;
        activeFolderName = null;
        
        countsVersion++;
    }

    function openAllFeeds() {
        favoritesMode = false;
        activeFeedName = null;
        activeFolderName = null;
        // Use canonical feedsData always
        setActiveFeeds(feedsData);
        rebuildList();

        countsVersion++;
    }

    function openFolder(feeds: Feed[]) {
        favoritesMode = false;
        const map = feedFolderLookup();
        let name: string|null = null;
        for (const f of feeds || []) { 
            const n = f.name();
            if (n && map[n]) { name = map[n]; break; } 
        }

        if (!name && feeds && feeds.length) name = feeds[0].name();

        activeFolderName = name;
        activeFeedName = null;
        // Canonicalize feeds to ensure consistent item state
        setActiveFeeds(canonicalize(feeds));
        rebuildList();

        countsVersion++;
    }

    function openFeed(feed: Feed) {
        favoritesMode = false;

        const cf = canonicalFeed(feed);
        activeFeedName = cf.name();
        activeFolderName = cf.folderName();
        
        setActiveFeeds([cf]);
        rebuildList();

        countsVersion++;
    }

    function toggleFolderCollapse(name: string) {
        if (collapsedFolders.has(name)) { collapsedFolders.delete(name); }
        else { collapsedFolders.add(name); }
        
        // trigger re-render
        collapsedFolders = new Set(collapsedFolders);
    }

    // Add missing feedFolderLookup function
    function feedFolderLookup(): Record<string, string> {
        const map: Record<string, string> = {};
        for (const fc of feedsData) {
            if (fc.name() && fc.folderName()) {
                map[fc.name()] = fc.folderName();
            }
        }
        
        return map;
    }

    // Compute counts using FeedsManager and ItemStateService
    function recomputeCountMaps() {
        if (!plugin.feedsManager) { 
            unreadFeedMap = {}; 
            unreadFolderMap = {}; 
            favoriteCountVal = 0; 
            globalUnreadVal = 0; 
            return; 
        }

        // Build feed map using FeedsManager
        const feedMap: Record<string, number> = {};
        for (const fc of feedsData) {
            feedMap[fc.name()] = plugin.feedsManager.getUnreadCountForFeed(fc.name());
        }
        unreadFeedMap = feedMap;

        // Build folder map using FeedsManager and Folder interface
        const folderMap: Record<string, number> = {};
        for (const folder of folders) {
            const folderName = folder.name().toLowerCase();
            folderMap[folderName] = plugin.feedsManager.getUnreadCountForFolder(folderName);
        }
        unreadFolderMap = folderMap;

        // Calculate favorite count
        favoriteCountVal = favoriteItems.length;

        // Calculate global unread count
        globalUnreadVal = Object.values(unreadFeedMap).reduce((sum, count) => sum + count, 0);
    }

    function dispatchCounts() {
        recomputeCountMaps();
        try { document.dispatchEvent(new CustomEvent(RSS_EVENTS.UNREAD_COUNTS_CHANGED)); } catch {}
        if (favoritesMode) refreshFavorites();

        countsVersion++;
    }
	
    function openItem(item: Item) {
        try {
            const rawItems = listItems.map(li => li.item);
            new ItemModal(plugin, item, rawItems).open();

            document.dispatchEvent(new CustomEvent('rss-item-opened', {
                detail:{ id: item?.id }
            }) );

        } catch {}
    }
    
    function stripHtml(str: string) {
        // Remove style, script, img, figure tags and all other HTML tags in one pass
        return str
            .replace(/<(style|script|figure)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
            .replace(/<img[^>]*>/gi, ' ')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/gi, ' ')
            .replace(/&amp;/gi, '&')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function summary(item: Item) {
        const txt = stripHtml(item.description());
        return txt.length > 280 ? txt.slice(0, 277) + '…' : txt;
    }

    async function refreshAllFeeds(){
        try { await plugin.updateFeeds?.(); } catch {}
        await loadFolders();
        
        dispatchCounts();
    }

    function getUnreadCountForFolder(folder: Folder): number {
        return plugin.feedsManager.getUnreadCountForFolder(folder.name());
    }

    // Initialize counts when plugin is ready
    $: if (plugin?.feedsManager && feedsData.length > 0) {
        recomputeCountMaps();
    }

    onMount(async () => {
        // Defer to next microtask to ensure plugin prop fully bound
        await Promise.resolve();
        await loadFolders();

        document.addEventListener(RSS_EVENTS.UNREAD_COUNTS_CHANGED, () => {
            recomputeCountMaps();
            countsVersion++;

        }, { passive: true });

        document.addEventListener(RSS_EVENTS.FAVORITE_UPDATED, () => {
            refreshFavorites(true);
            recomputeCountMaps();
            countsVersion++;

        }, { passive: true });

        // Listener de test: permitir activar modo favoritos vía evento personalizado
        document.addEventListener('___TEST_OPEN_FAVORITES', () => {
            openFavorites();

        }, { passive: true });

        observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && visibleGroups < grouped.length) {
            visibleGroups += groupsPerPage;
            }
        });

        if (sentinel) observer.observe(sentinel);    
    });

</script>

<div class="rss-fr-layout rss-root-wrapper">
    <FolderView
        {folders}
        favoritesMode={favoritesMode}
        favoriteCount={favoriteCountVal}
        globalUnread={globalUnreadVal}
        unreadFeedMap={unreadFeedMap}
        {activeFeedName}
        {activeFolderName}
        {collapsedFolders}
        {countsVersion}
        onMarkAllGlobal={markAllGlobal}
        onMarkFolder={markFolderAsRead}
        onMarkFeed={markFeedAsRead}
        onOpenAllFeeds={openAllFeeds}
        onOpenFavorites={openFavorites}
        onOpenFolder={openFolder}
        onOpenFeed={openFeed}
		{getUnreadCountForFolder}
        on:toggleFolder={(e)=> toggleFolderCollapse(e.detail)}
        onRefreshAll={refreshAllFeeds}
    />

    <div class="rss-fr-list">
        {#if listItems.length === 0}
            <div class="rss-fr-empty">No items</div>
        {:else}
            <VirtualList items={flatListItems} rowHeight={112} let:item>
                {#if item.type === 'header'}
                    <div class="rss-fr-group-header">{item.label}</div>
                {:else}
                    <ListItem
                        feed={item.item.feed ?? undefined}
                        item={item.item.item}
                        {deriveThumb}
                        {summary}
                        {toggleRead}
                        {toggleFavorite}
                        onOpen={openItem}
                    />
                {/if}
            </VirtualList>
            <div bind:this={sentinel}></div>
        {/if}
    </div>
    <div class="rss-fr-detail hidden"></div>
</div>

<style>

</style>