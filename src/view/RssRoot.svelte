<script lang="ts">
  import { onMount } from 'svelte';
  import FolderView from './FolderView.svelte';
  import type RssReaderPlugin from '../main';
  import { CountersService } from '../services/CountersService';
  import { RSS_EVENTS } from '../events';
  import t from '../l10n/locale';
  import type { Feed } from '../providers/Feed';
  import type { Item } from '../providers/Item';

  export let plugin: RssReaderPlugin;

  let folders: any[] = [];
  let allFeeds: Feed[] = [];
  let activeFeeds: Feed[] = [];
  let favoritesMode = false;
  let favoriteItems: any[] = [];
  let listItems: { feed: Feed|null, item: any }[] = [];

  const loadFolders = async () => {
    try { folders = await plugin.providers.getCurrent().folders(); } catch { folders = []; }
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

  function rebuildList() {
    if (favoritesMode) {
      listItems = favoriteItems.map(it => ({ feed: null, item: it }));
    } else {
      const collected: {feed: Feed, item: any}[] = [];
      for (const feed of activeFeeds) for (const it of feed.items()) collected.push({feed, item: it});
      collected.sort((a,b)=>{
        const ad = (a.item as any).pubDateMs !== undefined
          ? (a.item as any).pubDateMs
          : new Date((()=>{ const pv = (a.item as any).pubDate; return typeof pv === 'function' ? pv() : pv; })() || 0).getTime();
        const bd = (b.item as any).pubDateMs !== undefined
          ? (b.item as any).pubDateMs
          : new Date((()=>{ const pv = (b.item as any).pubDate; return typeof pv === 'function' ? pv() : pv; })() || 0).getTime();
        return bd - ad;
      });
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

  function onRowClick(raw:any){ if(!raw.read){ toggleRead(raw); } }

  onMount(async ()=> {
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
        <div class="rss-fr-row rss-fr-row-article {obj.item.read ? 'read':'unread'}" role="button" tabindex="0" data-link={obj.item.link} on:click={()=> onRowClick(obj.item)} on:keydown={(e)=> (e.key==='Enter'||e.key===' ') && onRowClick(obj.item)}>
          <button type="button" class="rss-dot {obj.item.read ? 'read':''}" on:click|stopPropagation={()=> toggleRead(obj.item)} aria-label={obj.item.read? 'Mark unread':'Mark read'}></button>
          <button type="button" class="rss-fr-star {obj.item.favorite?'is-starred':''}" data-link={obj.item.link} on:click|stopPropagation={()=> toggleFavorite(obj.item)} aria-label={obj.item.favorite? 'Unfavorite':'Favorite'}>{obj.item.favorite?'★':'☆'}</button>
          <div class="rss-fr-main">
            <div class="rss-fr-feedline"><span class="rss-fr-feed">{obj.feed ? obj.feed.name(): (obj.item.feed||'')}</span></div>
            <div class="rss-fr-top"><span class="rss-fr-title">{typeof obj.item.title === 'function' ? obj.item.title() : obj.item.title}</span></div>
            <div class="rss-fr-desc">{typeof obj.item.description === 'function' ? obj.item.description() : obj.item.description || ''}</div>
          </div>
        </div>
      {/each}
    {/if}
  </div>
  <div class="rss-fr-detail hidden"></div>
</div>

<style>
  .rss-fr-layout { display:flex; height:100%; }
  /* subscriptions column now lives in FolderView */
  .rss-fr-list { flex:1; overflow-y:auto; }
  .rss-fr-row { padding:4px 8px; display:flex; gap:6px; cursor:pointer; }
  .rss-fr-row.unread { font-weight:600; }
  .rss-dot { width:10px; height:10px; border-radius:50%; background:var(--interactive-accent); display:inline-block; margin-top:6px; }
  .rss-dot.read { opacity:0.25; }
  .rss-fr-star { width:16px; text-align:center; }
  .rss-fr-star.is-starred { color:gold; }
  .rss-fr-row button { background:transparent; border:0; cursor:pointer; }
</style>
