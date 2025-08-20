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
    import type { RssFeed } from "src/settings/settings";
    import type { RssFeedContent } from "src/parser/rssParser";
    
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
    
    // Subscribe to itemsStore for reactive data
    $: if (plugin?.feedsManager && !unsubItems) {
        unsubItems = itemsStore.subscribe((feeds) => {
            // Update to the current feeds data.
            feedsDataRaw = feeds;
            feedsData = feedsDataRaw.map(toFeed);
            allFeeds = feedsData;

            buildActiveFeedsFromSelection();
            rebuildList();
        });
    }

    // Clean up subscription on destroy
    onDestroy(() => {
        if (unsubItems) {
            unsubItems();
            unsubItems = undefined;
        }
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
        allFeeds = [];
        for (const f of folders) allFeeds.push(...f.feeds());
        buildActiveFeedsFromSelection();
        rebuildList();
        refreshFavorites(false);
    };

    function setActiveFeeds(feeds: Feed[]) {
        favoritesMode = false;
        activeFeeds = feeds;
    }

    function firstImageFromHtml(html: string): string | undefined {
        if (!html) return undefined;
        try {
            const m = html.match(/<img[^>]+src="([^"]+)"/i);
            return m ? m[1] : undefined;
        } catch { return undefined; }
    }

    function deriveThumb(item: Item): string | undefined {
        try {
          const image = item.mediaThumbnail();
          if (image) {
            return image;
          } else {
            const html = item.body();
            if (html) return firstImageFromHtml(html || '');
          }
        } catch { return undefined; }
    }

    // Helper to determine group order
    function groupOrder(key: string): number {
        if (key === 'today') return 0;
        if (key === 'yesterday') return 1;
        return 2;
    }

    // Rebuild the list
	function rebuildList() {
        // Show favorites if in favorites mode
        if (favoritesMode) {
            listItems = favoriteItems.map(it => ({ feed: null as Feed | null, item: it }));
            buildGroups();
            return;
        }

        const collected: { feed: Feed | null, item: Item }[] = [];
        const feedMap: Record<string, Feed> = {};
        for (const feed of allFeeds) {
            feedMap[feed.name()] = feed;
        }

        // Helper to check if feed matches current selection
        function isFeedActive(feed: Feed): boolean {
            const feedName = feed.name();
            const folderVal = feed.folderName();

            if (activeFeedName) return feedName === activeFeedName;
            if (activeFolderName) return folderVal === activeFolderName;
            return true;
        }

        // Collect items from feeds matching selection
        for (const feed of allFeeds) {
            if (!isFeedActive(feed)) continue;
            for (const item of feed.items()) {
                if (item) collected.push({ feed, item });
            }
        }

        // If no selection and nothing collected, show all items
        if (!activeFeedName && !activeFolderName && collected.length === 0) {
            for (const feed of allFeeds) {
                for (const item of feed.items()) {
                    collected.push({ feed, item });
                }
            }
        }

        // Sort items by date descending (most recent first)
        collected.sort((a, b) => getNormalizedDate(b.item).getTime() - getNormalizedDate(a.item).getTime());
        listItems = collected;
        buildGroups();
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
                items: group.items.sort((a, b) => {
                    return getNormalizedDate(b.item).getTime() - getNormalizedDate(a.item).getTime();
                })
            }));
    }

    // Refactored to use FeedsManager instead of CountersService
    function refreshFavorites(rebuild = true) {
        favoriteItems = [];
        // Usa los objetos Item
        for (const feed of allFeeds) {
            favoriteItems.push(...feed.items().filter(item => item.starred()));
        }

        if (favoritesMode && rebuild) rebuildList();
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
        plugin.itemStateService.toggleFavorite(item);
        refreshFavorites(false);
        try { document.dispatchEvent(new CustomEvent(RSS_EVENTS.FAVORITE_UPDATED)); } catch {}
        
        countsVersion++;
    }

    function toggleRead(item: Item) {
        plugin.itemStateService.toggleRead(item);
        // counts will update via event listeners; ensure repaint for badge cases
        countsVersion++;
    }

    function openFavorites() {
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
        
        setActiveFeeds(allFeeds);
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
        setActiveFeeds(feeds);
        rebuildList();

        countsVersion++;
    }

    function openFeed(feed: Feed) {
        activeFeedName = feed.name();
        activeFolderName = feed.folderName();
        
        setActiveFeeds([feed]);
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
        
        rebuildList();
        countsVersion++;
    }
	
    function openItem(item: Item) {
        try {
            const rawItems = listItems.map(li => li.item);
            new ItemModal(plugin, item, rawItems).open();
        } catch {}

        try {
            document.dispatchEvent(new CustomEvent('rss-item-opened', { 
                detail:{ id: item?.id } 
            }) ); 
        } catch {}
    }

    function onRowClick(raw: Item) {
        if (!raw.read) { toggleRead(raw); }
        openItem(raw);
    }

	// UTIL: plain-text resumen sin imágenes para la lista
    function stripHtml(str: string) {
        try { 
            return str
                .replace(/<style[\s\S]*?<\/style>/gi,'')
                .replace(/<script[\s\S]*?<\/script>/gi,'')
                .replace(/<img[^>]*>/gi,' ')
                .replace(/<figure[\s\S]*?<\/figure>/gi,' ')
                .replace(/<[^>]+>/g,' ') // tags
                .replace(/&nbsp;/gi,' ')
                .replace(/&amp;/gi,'&')
                .replace(/\s+/g,' ')
                .trim();
        } catch { return str; }
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
            rebuildList(); 
            countsVersion++; 
        }, { passive: true });

        document.addEventListener(RSS_EVENTS.FAVORITE_UPDATED, () => {
            refreshFavorites(true);
            recomputeCountMaps(); // Recalculate favorite count
            countsVersion++;
        }, { passive: true });

        // Listener de test: permitir activar modo favoritos vía evento personalizado
        document.addEventListener('___TEST_OPEN_FAVORITES', () => {
            openFavorites();
        }, { passive: true });
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
        {#each grouped as g (g.key)}
            <div class="rss-fr-group-header">{g.label}</div>
            {#each g.items as obj (obj.item.url())}
                <ListItem
                    feed={obj.feed || ''}
                    item={obj.item}
                    {deriveThumb}
                    {summary}
                    {toggleRead}
                    {toggleFavorite}
                    onOpen={openItem}
                />
            {/each}
        {/each}
        {/if}
    </div>
    <div class="rss-fr-detail hidden"></div>
</div>

<style>

</style>