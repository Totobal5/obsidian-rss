<script lang="ts">
  import { onMount } from 'svelte';
  import FolderView from './FolderView.svelte';
  import type RssReaderPlugin from '../main';
  import { CountersService } from '../services/CountersService';
  import { RSS_EVENTS } from '../events';
  import t from '../l10n/locale';
  import type { Feed } from '../providers/Feed';
  import type { Item } from '../providers/Item';
  import { ItemModal } from '../modals/ItemModal';
  import ListItem from './ListItem.svelte';

  export let plugin: RssReaderPlugin;

  let folders: any[] = [];
  let allFeeds: Feed[] = [];
  let activeFeeds: Feed[] = [];
  let favoritesMode = false;
  let favoriteItems: any[] = [];
  let listItems: { feed: Feed|null, item: any }[] = [];
  let grouped: { key: string, label: string, items: {feed: Feed | null, item:any }[] } [] = [];
  // UI state for sidebar
  let activeFeedName: string | null = null;
  let activeFolderName: string | null = null;
  let collapsedFolders: Set<string> = new Set();
  // bump to force FolderView rerender
  let countsVersion = 0;
  
  function buildActiveFeedsFromSelection() {
    if (favoritesMode) return; // favorite mode handled separately
    if (activeFeedName) {
      const f = allFeeds.find(ff => safeName(ff) === activeFeedName);
      activeFeeds = f ? [f] : allFeeds;
      return;
    }
    if (activeFolderName) {
      const folderFeeds = allFeeds.filter(ff => safeFolderName(ff) === activeFolderName);
      activeFeeds = folderFeeds.length ? folderFeeds : allFeeds;
      return;
    }
    activeFeeds = allFeeds;
  }
  
  // Loads folder and feed data from the plugin, updates local state, rebuilds active feed selection and item lists, and refreshes favorites.
  async function loadFolders() {
    if (!plugin || !plugin.providers || !plugin.providers.getCurrent) { folders = []; return; }
    
    try {
      const current = plugin.providers.getCurrent();
      if (current && current.folders) {
        folders = await current.folders();
      } else {
        folders = [];
      }
    } catch (err) {
      console.error('Error loading folders:', err);
      folders = [];
    }

    const feeds: Feed[] = [];
    for (const f of folders) {
      feeds.push(...f.feeds());
    }
    allFeeds = feeds;

    buildActiveFeedsFromSelection();
    rebuildList();
    refreshFavorites(false);
  }

  function setActiveFeeds(feeds: Feed[]) {
    favoritesMode = false;
    activeFeeds = feeds;
  }

  // Extracts the first image URL from an HTML string using a regex; may not handle complex or malformed HTML.
  function firstImageFromHtml(html: string): string | undefined {
    if (!html) return undefined;
    try {
      const m = html.match(/src\s*=\s*["']?([^"'\s>]+)["']?/i);
      return m ? m[1] : undefined;
    } catch { return undefined; }
  }

  function deriveThumb(it: any): string | undefined {
    try {
      if (it.image) return it.image;
      if (typeof it.mediaThumbnail === 'function') { const v = it.mediaThumbnail(); if (v) return v; }
      if (it.mediaThumbnail && typeof it.mediaThumbnail === 'string') return it.mediaThumbnail;
      const html = typeof it.content === 'function' ? it.content() : it.content || it.description;
      return firstImageFromHtml(html || '');
    } catch { return undefined; }
  }

  function extractDate(obj: { item: any } | undefined): number {
    if (!obj || !obj.item) return 0;
    const itm: any = obj.item;
    if (typeof itm.pubDateMs === 'number') return itm.pubDateMs;
    const pubDateValue = itm.pubDate;
    let rawDate: any;
    
    if (typeof pubDateValue === 'function') {
      rawDate = pubDateValue();
    } else {
      rawDate = pubDateValue;
    }

    if (typeof rawDate === 'string' || rawDate instanceof Date) {
      const dateObj = new Date(rawDate);
      if (!isNaN(dateObj.getTime())) return dateObj.getTime();
    }

    return 0;
  }

  function rebuildList() {
    if (favoritesMode) {
      listItems = favoriteItems.map(it => {
        // Try to find the feed for this item by matching feed name or link
        let feed = allFeeds.find(f =>
          (typeof f.name === 'function' ? f.name() : f.name) === it.feedName ||
          (typeof f.link === 'function' ? f.link() : f.link) === it.feedLink
        ) || null;
        return { feed, item: it };
      });

      buildGroups();
      return;
    }

    // Derive from plugin.settings.items to ensure consistency with counters
    const collected: {feed: Feed|null, item:any}[] = [];
    const rawFeeds: any[] = Array.isArray(plugin?.settings?.items) ? plugin.settings.items : [];

    // Create feedName -> Feed instance map for metadata
    const byName: Record<string, Feed> = {};
    for (const f of allFeeds) {
      byName[safeName(f)] = f;
    }

    for (const fc of rawFeeds) {
      if (!fc || !Array.isArray(fc.items) ) continue;
      
      const fname = fc.name;
      const feedObj = byName[fname];
      // Filter by selection
      if (activeFeedName && fname !== activeFeedName) continue;

      if (!activeFeedName && activeFolderName) {
        // If there is not an active feed but there is an active folder, filter by folder
        if (!activeFeedName && !activeFolderName) {
          if (collected.length === 0) {
            const seenLinks = new Set<string>();
            for (const fc of rawFeeds) {
              if (fc && Array.isArray(fc.items)) {
                for (const it of fc.items) {
                  const link = it?.link;
                  if (link && seenLinks.has(link)) continue;
                  if (link) seenLinks.add(link);
                  collected.push({feed: byName[fc.name]||null, item: it});
                }
              }
            }
          }
        }
      }


      const itm: any = obj.item;
      if (itm.pubDateMs && typeof itm.pubDateMs === 'number') return itm.pubDateMs;
      const pubDateValue = itm.pubDate;
      const rawDate = typeof pubDateValue === 'function' ? pubDateValue() : pubDateValue;
      const dateObj = rawDate ? new Date(rawDate) : undefined;
      return dateObj && !isNaN(dateObj.getTime()) ? dateObj.getTime() : 0;
      } catch {
    // Descending sort: newest items appear at the top of the UI group (matches user expectations)
    collected.sort((a,b)=> extractDate(b)-extractDate(a));
    }
    
    // Descending so la más reciente quede al inicio visualmente dentro de su grupo
    collected.sort((a,b)=> extractDate(b)-extractDate(a));
    listItems = collected;

    buildGroups();
  }

  function buildGroups(){
    const today = new Date(); today.setHours(0,0,0,0);
    const yesterday = new Date(today.getTime()-86400000);
    const byKey: Record<string,{label:string,items:{feed:Feed|null,item:any}[]}> = {};
    for (const li of listItems){
      let dVal: any = li.item.pubDateMs ?? (typeof li.item.pubDate==='function'? li.item.pubDate(): li.item.pubDate);
      const d = dVal ? new Date(dVal) : new Date(0);
      d.setHours(0,0,0,0);
      let key:string; let label:string;
      if (d.getTime() === today.getTime()) { key='today'; label = t('today') || 'Today'; }
      else if (d.getTime() === yesterday.getTime()) { key='yesterday'; label = t('yesterday') || 'Yesterday'; }
      else { key = d.toISOString().slice(0,10); label = d.toLocaleDateString(); }
      if(!byKey[key]) byKey[key] = {label, items:[]};
      byKey[key].items.push(li);
    }
    grouped = Object.entries(byKey)
      .sort((a,b)=> {
        const order = (k:string)=> k==='today'?0 : k==='yesterday'?1 : 2;
        const oa = order(a[0]); const ob = order(b[0]);
        if (oa!==ob) return oa - ob; // today first, then yesterday, then older
        // For older groups (date keys) order descending by date key so most recent days appear earlier
        if (oa===2) return a[0] < b[0] ? 1 : -1;
        return 0;
      })
      .map(([k,v])=> ({ key:k, label:v.label, items: v.items.sort((a,b)=> {
        // Orden descendente (más reciente primero). Usar pubDateMs cuando exista.
        const da = (a.item.pubDateMs && typeof a.item.pubDateMs==='number') ? a.item.pubDateMs
          : new Date(a.item.pubDate || (typeof a.item.pubDate==='function'? a.item.pubDate():0)).getTime();
        const db = (b.item.pubDateMs && typeof b.item.pubDateMs==='number') ? b.item.pubDateMs
          : new Date(b.item.pubDate || (typeof b.item.pubDate==='function'? b.item.pubDate():0)).getTime();
        return db - da; }) }));
  }

  function refreshFavorites(rebuild = true){
    favoriteItems = counters ? counters.favoriteItems() : [];
    if (favoritesMode && rebuild) rebuildList();
  }

  function markAllGlobal(){
  const affectedLinks: string[] = [];
  for (const fc of (plugin.settings.items||[])) if (Array.isArray(fc.items)) for (const it of fc.items) { it.read = true; if (it.link) affectedLinks.push(it.link); }
  plugin.writeFeedContentDebounced(()=>{},250);
    // Dispatch new specific event plus legacy (compat layer)
    try { 
      document.dispatchEvent(new CustomEvent(RSS_EVENTS.FEED_MARK_ALL, { detail: { scope:'global', name:'__all__', links: affectedLinks } }));
    } catch {}
  dispatchCounts();
  }

  function markFolderAsRead(folderName: string){
  const lc = folderName.toLowerCase();
  const affectedLinks: string[] = [];
  for (const fc of (plugin.settings.items||[])) if (fc.folder && fc.folder.toLowerCase()===lc && Array.isArray(fc.items)) for (const it of fc.items) { it.read = true; if (it.link) affectedLinks.push(it.link); }
  plugin.writeFeedContentDebounced(()=>{},250);
    try {
      document.dispatchEvent(new CustomEvent(RSS_EVENTS.FEED_MARK_FOLDER, { detail: { scope:'folder', name: folderName, links: affectedLinks } }));
    } catch {}
  dispatchCounts();
  }

  function markFeedAsRead(feed: Feed){
  const affectedLinks: string[] = [];
  for (const fc of (plugin.settings.items||[])) if ((fc.name===feed.name()||fc.link===feed.link()) && Array.isArray(fc.items)) for (const it of fc.items) { it.read = true; if (it.link) affectedLinks.push(it.link); }
  plugin.writeFeedContentDebounced(()=>{},250);
    try { 
      document.dispatchEvent(new CustomEvent(RSS_EVENTS.FEED_MARK_FEED, { detail: { scope:'feed', name: feed.name(), links: affectedLinks } }));
    } catch {}
  dispatchCounts();
  }

  function toggleFavorite(raw:any){
    plugin.itemStateService.toggleFavorite(raw);
    if (counters) refreshFavorites(false);
    try { document.dispatchEvent(new CustomEvent(RSS_EVENTS.FAVORITE_UPDATED)); } catch {}
    countsVersion++;
  }

  function toggleRead(raw:any){
    plugin.itemStateService.toggleRead(raw);
    // counts will update via event listeners; ensure repaint for badge cases
    countsVersion++;
  }

  function openFavorites(){
    favoritesMode = true;
    refreshFavorites();
    activeFeedName = null; activeFolderName = null;
    countsVersion++;
  }

  // (Nota prueba) Eliminado intento de exponer openFavorites por 'this' ya que Svelte instance scope distinto en runtime.

  function openAllFeeds(){
    favoritesMode = false;
    activeFeedName = null; activeFolderName = null;
    setActiveFeeds(allFeeds);
    rebuildList();
    countsVersion++;
  }

  function openFolder(feeds: Feed[]){
    favoritesMode = false;
    const map = feedFolderLookup();
    let name: string|null = null;
    for (const f of feeds || []) { const n = safeName(f); if (n && map[n]) { name = map[n]; break; } }
    if (!name && feeds && feeds.length) name = safeFolderName(feeds[0]);
    activeFolderName = name;
    activeFeedName = null;
    setActiveFeeds(feeds);
    rebuildList();
    countsVersion++;
  }
  function openFeed(feed: Feed){
    activeFeedName = safeName(feed);
    activeFolderName = safeFolderName(feed);
    setActiveFeeds([feed]);
    rebuildList();
    countsVersion++;
  }

  function toggleFolderCollapse(name:string){
    if (collapsedFolders.has(name)) collapsedFolders.delete(name); else collapsedFolders.add(name);
    // trigger re-render
    collapsedFolders = new Set(collapsedFolders);
  }

  function val(v:any){ try { return typeof v === 'function' ? v() : v; } catch { return v; } }
  function safeName(feed: any){ try { return typeof feed.name === 'function' ? feed.name() : (feed.name || ''); } catch { return ''; } }
  function safeFolderName(feed:any){
    try {
      if (typeof feed.folderName === 'function') return feed.folderName();
      if (typeof feed.folder === 'function') return feed.folder();
      return feed.folderName || feed.folder || null;
    } catch { return null; }
  }
  // --- UNREAD COUNTS (now delegated to CountersService with precomputed maps) ---
  let counters: CountersService | undefined;
  let unreadFeedMap: Record<string, number> = {};
  let unreadFolderMap: Record<string, number> = {};
  let favoriteCountVal = 0;
  let globalUnreadVal = 0;
  $: if (!counters && plugin) { 
    counters = (plugin as any).counters || new CountersService(plugin); 
    if (!(plugin as any).counters) (plugin as any).counters = counters; 
    recomputeCountMaps();
  }
  function recomputeCountMaps(){
    if (!counters) { unreadFeedMap = {}; unreadFolderMap = {}; favoriteCountVal = 0; globalUnreadVal = 0; return; }
    // Feed map
    if (typeof (counters as any).unreadByFeed === 'function') unreadFeedMap = (counters as any).unreadByFeed();
    else {
      const map: Record<string, number> = {};
      const rawFeeds: any[] = Array.isArray(plugin?.settings?.items) ? plugin.settings.items : [];
      for (const fc of rawFeeds) if (fc?.name) map[fc.name] = counters!.feedUnread(fc.name);
      unreadFeedMap = map;
    }
    // Folder map
    if (typeof (counters as any).unreadByFolder === 'function') unreadFolderMap = (counters as any).unreadByFolder();
    else {
      const fmap: Record<string, number> = {};
      const rawFeeds: any[] = Array.isArray(plugin?.settings?.items) ? plugin.settings.items : [];
      for (const fc of rawFeeds) { const folder = (fc.folder||'').trim().toLowerCase(); if (folder) fmap[folder] = (fmap[folder]||0) + counters!.folderUnread(folder); }
      unreadFolderMap = fmap;
    }
    favoriteCountVal = (counters as any).favoriteCount ? (counters as any).favoriteCount() : favoriteItems.length;
    globalUnreadVal = counters.globalUnread();
  }

  function dispatchCounts(){
    recomputeCountMaps();
    try { document.dispatchEvent(new CustomEvent(RSS_EVENTS.UNREAD_COUNTS_CHANGED)); } catch {}
    if (favoritesMode) refreshFavorites();
    rebuildList();
  countsVersion++;
  }

  function openItem(raw:any){
    try {
      const rawItems = listItems.map(li => li.item);
      new ItemModal(plugin, raw, rawItems).open();
    } catch {}
    try { document.dispatchEvent(new CustomEvent('rss-item-opened', { detail:{ link: raw?.link } })); } catch {}
  }
  function onRowClick(raw:any){
    if(!raw.read){ toggleRead(raw); }
    openItem(raw);
  }

  // UTIL: plain-text resumen sin imágenes para la lista
  function stripHtml(str:string){
    try { return str
      .replace(/<style[\s\S]*?<\/style>/gi,'')
      .replace(/<script[\s\S]*?<\/script>/gi,'')
      .replace(/<img[^>]*>/gi,' ')
      .replace(/<figure[\s\S]*?<\/figure>/gi,' ')
      .replace(/<[^>]+>/g,' ') // tags
      .replace(/&nbsp;/gi,' ')
      .replace(/&amp;/gi,'&')
      .replace(/\s+/g,' ')
      .trim(); } catch { return str; }
  }
  function summary(it:any){
    const raw = typeof it.description === 'function' ? it.description() : it.description || '';
    const txt = stripHtml(raw);
    return txt.length>280 ? txt.slice(0,277)+'…' : txt;
  }

  onMount(async ()=> {
    // Defer to next microtask to ensure plugin prop fully bound
    await Promise.resolve();
    await loadFolders();
  document.addEventListener(RSS_EVENTS.UNREAD_COUNTS_CHANGED, ()=> { recomputeCountMaps(); rebuildList(); countsVersion++; }, { passive:true });
    document.addEventListener(RSS_EVENTS.FAVORITE_UPDATED, ()=> { refreshFavorites(); favoriteCountVal = (counters as any)?.favoriteCount ? (counters as any).favoriteCount() : favoriteItems.length; countsVersion++; }, { passive:true });
    // Listener de test: permitir activar modo favoritos vía evento personalizado
    document.addEventListener('___TEST_OPEN_FAVORITES', ()=> { openFavorites(); }, { passive:true });
  });

  async function refreshAllFeeds(){
    try { await plugin.updateFeeds?.(); } catch {}
    await loadFolders();
    dispatchCounts();
  }
</script>

<div class="rss-fr-layout rss-root-wrapper">
  <FolderView
    {folders}
    favoritesMode={favoritesMode}
    favoriteCount={favoriteCountVal}
    globalUnread={globalUnreadVal}
    unreadFeedMap={unreadFeedMap}
    unreadFolderMap={unreadFolderMap}
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
  on:toggleFolder={(e)=> toggleFolderCollapse(e.detail)}
  onRefreshAll={refreshAllFeeds}
  />
  <div class="rss-fr-list">
    {#if listItems.length === 0}
      <div class="rss-fr-empty">No items</div>
    {:else}
      {#each grouped as g (g.key)}
        <div class="rss-fr-group-header">{g.label}</div>
        {#each g.items as obj (obj.item.link)}
          <ListItem
            feed={obj.feed}
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
