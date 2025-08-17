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
  function onClick(){ if(!val(item.read)) toggleRead(item); runOpen(); }
  function val(v:any){ try { return typeof v === 'function' ? v() : v; } catch { return v; } }
  $: thumb = deriveThumb(item);
</script>

<div class="list-item-container {val(item.read) ? 'read' : 'unread'}"
     on:click={onClick} on:keydown={(e)=> (e.key==='Enter'||e.key===' ') && onClick()} role="button" tabindex="0" aria-label="Open item">
  <div class="list-item-indicators">
    <button type="button" class="rss-dot" on:click|stopPropagation={()=> toggleRead(item)} aria-label={val(item.read) ? 'Mark unread' : 'Mark read'}></button>
    <button type="button" class="rss-star {val(item.favorite) ? 'is-starred' : ''} rss-fr-star" on:click|stopPropagation={()=> toggleFavorite(item)} aria-label={val(item.favorite) ? 'Unfavorite' : 'Favorite'}>★</button>
  </div>
  <div class="list-item-content">
    <div class="list-item-title">{typeof item.title === 'function' ? item.title() : item.title}</div>
    <div class="list-item-feed">{feed ? feed.name() : (item.feed || '')}</div>
    <div class="list-item-body">
      {#if thumb}
        <div class="list-item-thumb-wrapper">
          <img class="list-item-thumb" src={thumb} alt="" loading="lazy"/>
        </div>
      {/if}
      <div class="list-item-meta">            
        <div class="list-item-description">{summary(item)}</div>
      </div>
    </div>
  </div>
</div>

<style>
/* Intentionally left empty; relies on parent styles */
</style>
