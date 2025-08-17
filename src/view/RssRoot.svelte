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

  const loadFolders = async () => {
    if (!plugin || !plugin.providers || !plugin.providers.getCurrent) { folders = []; return; }
    try { const current = plugin.providers.getCurrent(); if(current && current.folders) { folders = await current.folders(); } else { folders = []; } } catch { folders = []; }
    allFeeds = [];
    for (const f of folders) allFeeds.push(...f.feeds());
    if (!favoritesMode) setActiveFeeds(allFeeds);
    refreshFavorites(false);
  };

  function setActiveFeeds(feeds: Feed[]) {
    favoritesMode = false;
    activeFeeds = feeds;
    rebuildList();
  }

  function firstImageFromHtml(html: string): string | undefined {
    if (!html) return undefined;
    try {
      const m = html.match(/<img[^>]+src="([^"]+)"/i);
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

  function rebuildList() {
    if (favoritesMode) {
      listItems = favoriteItems.map(it => ({ feed: null as Feed | null, item: it }));
    } else {
      const collected: {feed: Feed, item: any}[] = [];
      for (const feed of activeFeeds) {
        let arr: any[] = [];
        try { arr = feed.items?.() || feed.items?.() === 0 ? feed.items() : feed.items(); } catch { try { arr = feed.items?.() ?? []; } catch { arr = []; } }
        if (!Array.isArray(arr)) continue;
        for (const it of arr) if (it) collected.push({feed, item: it});
      }
      const extractDate = (obj: {item:any}|undefined) => {
        try {
          if (!obj || !obj.item) return 0;
          const itm: any = obj.item;
          if (itm.pubDateMs !== undefined && typeof itm.pubDateMs === 'number') return itm.pubDateMs;
            const pv = itm.pubDate;
            const raw = typeof pv === 'function' ? pv() : pv;
            const d = raw ? new Date(raw) : undefined;
            return d && !isNaN(d.getTime()) ? d.getTime() : 0;
        } catch { return 0; }
      };
      collected.sort((a,b)=> extractDate(b) - extractDate(a));
      listItems = collected;
    }
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
    try { document.dispatchEvent(new CustomEvent(RSS_EVENTS.FAVORITE_UPDATED)); } catch {}
  }
  function toggleRead(raw:any){ plugin.itemStateService.toggleRead(raw); }

  function openFavorites(){
    favoritesMode = true;
    refreshFavorites();
  }

  function openAllFeeds(){ setActiveFeeds(allFeeds); }

  function openFolder(feeds: Feed[]){ setActiveFeeds(feeds); }
  function openFeed(feed: Feed){ setActiveFeeds([feed]); }

  function val(v:any){ try { return typeof v === 'function' ? v() : v; } catch { return v; } }
  function unreadInFeed(feed: Feed){
    let items: any[] = [];
    try {
      const raw = (feed as any).items;
      if (typeof raw === 'function') items = raw(); else if (Array.isArray(raw)) items = raw; else items = [];
    } catch { items = []; }
    return items.filter(i=> !val(i.read)).length;
  }
  let counters: CountersService | undefined;
  $: if (!counters && plugin) { counters = plugin.counters || new CountersService(plugin); }
  function unreadInFolder(feeds: Feed[]){ return feeds.reduce((a,f)=> a + unreadInFeed(f),0); }
  function globalUnread(){ return counters ? counters.globalUnread() : 0; }

  function dispatchCounts(){ try { document.dispatchEvent(new CustomEvent(RSS_EVENTS.UNREAD_COUNTS_CHANGED)); } catch {}
    if (favoritesMode) refreshFavorites();
    rebuildList();
  }

  function openItem(raw:any){
    try { new ItemModal(plugin, raw, listItems.map(li=>li.item)).open(); } catch {}
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
    document.addEventListener(RSS_EVENTS.UNREAD_COUNTS_CHANGED, ()=> { rebuildList(); }, { passive:true });
    document.addEventListener(RSS_EVENTS.FAVORITE_UPDATED, ()=> { refreshFavorites(); }, { passive:true });
  });
</script>

<div class="rss-fr-layout">
  <FolderView
    {folders}
    favoritesMode={favoritesMode}
    favoriteCount={favoriteItems.length}
    globalUnread={globalUnread()}
    {unreadInFeed}
    {unreadInFolder}
    onMarkAllGlobal={markAllGlobal}
    onMarkFolder={markFolderAsRead}
    onMarkFeed={markFeedAsRead}
    onOpenAllFeeds={openAllFeeds}
    onOpenFavorites={openFavorites}
    onOpenFolder={openFolder}
    onOpenFeed={openFeed}
  />
  <div class="rss-fr-list">
    {#if listItems.length === 0}
      <div class="rss-fr-empty">No items</div>
    {:else}
      {#each listItems as obj (obj.item.link)}
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
    {/if}
  </div>
  <div class="rss-fr-detail hidden"></div>
</div>

<style>

</style>
