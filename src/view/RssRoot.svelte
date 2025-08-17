<script lang="ts">
  import { onMount } from 'svelte';
  import type RssReaderPlugin from '../main';
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
        const ad = (a.item as any).pubDateMs !== undefined ? (a.item as any).pubDateMs : new Date(a.item.pubDate?.() || a.item.pubDate || 0).getTime();
        const bd = (b.item as any).pubDateMs !== undefined ? (b.item as any).pubDateMs : new Date(b.item.pubDate?.() || b.item.pubDate || 0).getTime();
        return bd - ad;
      });
      listItems = collected;
    }
  }

  function refreshFavorites(rebuild = true){
    favoriteItems = plugin.counters?.favoriteItems() ?? [];
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

  function toggleFavorite(raw:any){ plugin.itemStateService.toggleFavorite(raw); }
  function toggleRead(raw:any){ plugin.itemStateService.toggleRead(raw); }

  function openFavorites(){
    favoritesMode = true;
    refreshFavorites();
  }

  function openAllFeeds(){ setActiveFeeds(allFeeds); }

  function openFolder(feeds: Feed[]){ setActiveFeeds(feeds); }
  function openFeed(feed: Feed){ setActiveFeeds([feed]); }

  function unreadInFeed(feed: Feed){ return feed.items()?.filter((i:any)=> !i.read || !i.read())?.length || 0; }
  function unreadInFolder(feeds: Feed[]){ return feeds.reduce((a,f)=> a + unreadInFeed(f),0); }
  function globalUnread(){ return plugin.counters?.globalUnread() ?? 0; }

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
  <div class="rss-fr-subs">
    <div class="rss-mark-all-global" on:click={markAllGlobal} title={t('mark_all_as_read')} aria-label={t('mark_all_as_read')}>
      <span>✓</span><span>{t('mark_all_as_read')}</span>
    </div>
    <div class="rss-all-feeds-button {favoritesMode?'' : 'active'}" on:click={openAllFeeds}>
      <span>🌐</span><span>All Feeds ({globalUnread()})</span>
    </div>
    <div class="rss-favorites-button {favoritesMode?'active':''}" on:click={openFavorites}>
      <span>★</span><span>Favorites ({favoriteItems.length})</span>
    </div>
  {#each folders as folder (folder.name())}
      <div class="rss-folder-header" on:click={() => openFolder(folder.feeds())}>
        <span>▼</span>
        <span>{folder.name()} ({unreadInFolder(folder.feeds())})</span>
        <span class="rss-mark-folder" title={t('mark_all_as_read')} on:click|stopPropagation={() => markFolderAsRead(folder.name())}>✓</span>
      </div>
      <div>
        {#each folder.feeds() as feed}
          <div class="rss-feed-header" on:click={()=> openFeed(feed)}>
            <div><span>{feed.name()}</span></div>
            <span class="rss-item-count-badge">{unreadInFeed(feed)}</span>
            <span class="rss-mark-feed" title={t('mark_feed_as_read')} on:click|stopPropagation={()=> markFeedAsRead(feed)}>✓</span>
          </div>
        {/each}
      </div>
    {/each}
  </div>
  <div class="rss-fr-list">
    {#if listItems.length === 0}
      <div class="rss-fr-empty">No items</div>
    {:else}
      {#each listItems as obj (obj.item.link)}
        <div class="rss-fr-row rss-fr-row-article {obj.item.read ? 'read':'unread'}" data-link={obj.item.link} on:click={()=> onRowClick(obj.item)}>
          <span class="rss-dot {obj.item.read ? 'read':''}" on:click|stopPropagation={()=> toggleRead(obj.item)}></span>
          <span class="rss-fr-star {obj.item.favorite?'is-starred':''}" data-link={obj.item.link} on:click|stopPropagation={()=> toggleFavorite(obj.item)}>{obj.item.favorite?'★':'☆'}</span>
          <div class="rss-fr-main">
            <div class="rss-fr-feedline"><span class="rss-fr-feed">{obj.feed ? obj.feed.name(): (obj.item.feed||'')}</span></div>
            <div class="rss-fr-top"><span class="rss-fr-title">{obj.item.title?.() || obj.item.title}</span></div>
            <div class="rss-fr-desc">{obj.item.description?.() || obj.item.description || ''}</div>
          </div>
        </div>
      {/each}
    {/if}
  </div>
  <div class="rss-fr-detail hidden" />
</div>

<style>
  .rss-fr-layout { display:flex; height:100%; }
  .rss-fr-subs { width:240px; overflow-y:auto; }
  .rss-fr-list { flex:1; overflow-y:auto; }
  .rss-fr-row { padding:4px 8px; display:flex; gap:6px; cursor:pointer; }
  .rss-fr-row.unread { font-weight:600; }
  .rss-dot { width:10px; height:10px; border-radius:50%; background:var(--interactive-accent); display:inline-block; margin-top:6px; }
  .rss-dot.read { opacity:0.25; }
  .rss-fr-star { width:16px; text-align:center; }
  .rss-fr-star.is-starred { color:gold; }
  .rss-item-count-badge { background:#444; color:#fff; padding:0 4px; border-radius:8px; font-size:0.75em; }
  .rss-mark-feed { margin-left:8px; cursor:pointer; }
  .rss-folder-header, .rss-feed-header, .rss-all-feeds-button, .rss-favorites-button, .rss-mark-all-global { padding:4px 6px; cursor:pointer; display:flex; align-items:center; gap:4px; }
  .rss-mark-folder { margin-left:auto; cursor:pointer; }
  .rss-folder-header.active, .rss-feed-header.active, .rss-all-feeds-button.active, .rss-favorites-button.active { background:var(--background-modifier-hover); }
</style>
