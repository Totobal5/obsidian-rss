<script lang="ts">
  import type { Feed } from '../providers/Feed';
  export let feed: Feed | null; // may be null when favorites view
  export let item: any; // legacy shape; functions or plain props
  export let summary: (it:any)=> string;
  export let deriveThumb: (it:any)=> string | undefined;
  export let toggleRead: (it:any)=> void;
  export let toggleFavorite: (it:any)=> void;
  export let onOpen: (it:any)=> void;

  // Helpers
  function runOpen(){ onOpen(item); }
  function onClick(){
    // Open modal first to avoid losing context if list re-renders on read toggle
    runOpen();
    if(!val(item.read)) {
      // Defer toggle slightly so modal instantiation is not interrupted by rebuild
      setTimeout(()=> toggleRead(item), 0);
    }
  }
  function val(v:any){ try { return typeof v === 'function' ? v() : v; } catch { return v; } }
  $: thumb = deriveThumb(item);
  function formatDate(pd:any): string {
    try {
      const raw = typeof pd === 'function' ? pd() : pd;
      if(!raw) return '';
      const d = new Date(raw);
      if(isNaN(d.getTime())) return '';
      return d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    } catch { return ''; }
  }
</script>
{#key item.link}
<div class="list-item-container rss-fr-row-article {thumb ? 'has-thumbnail' : 'no-thumbnail'} {val(item.read) ? 'read' : 'unread'}"
     on:click={onClick} on:keydown={(e)=> (e.key==='Enter'||e.key===' ') && onClick()} role="button" tabindex="0" aria-label="Open item">
  <!-- Dot (read/unread) -->
  <button type="button" class="rss-dot" on:click|stopPropagation={()=> toggleRead(item)} aria-label={val(item.read) ? 'Mark unread' : 'Mark read'}></button>
  <!-- Star/Favorite -->
  <button type="button" class="rss-star rss-fr-star {val(item.favorite) ? 'is-starred' : ''}" on:click|stopPropagation={()=> toggleFavorite(item)} aria-label={val(item.favorite) ? 'Unfavorite' : 'Favorite'}>★</button>

  {#if thumb}
    <div class="rss-fr-thumb-wrapper">
      <img class="rss-fr-thumb list-item-thumb" src={thumb} alt="" loading="lazy" />
    </div>
  {/if}

  <div class="rss-fr-main">
    <div class="rss-fr-feedline">
      <span class="rss-fr-feed">{feed ? feed.name() : (item.feed || '')}</span>
    </div>
    <div class="rss-fr-top">
      <div class="rss-fr-title list-item-title">{typeof item.title === 'function' ? item.title() : item.title}</div>
      {#if item.pubDate || (typeof item.pubDate === 'function' && item.pubDate())}
        <div class="rss-fr-date">{formatDate(item.pubDate)}</div>
      {/if}
    </div>
    <div class="rss-fr-desc list-item-description">{summary(item)}</div>
  </div>
</div>
{/key}

<!-- styles moved to global main.scss -->
