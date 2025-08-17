<script lang="ts">
  import type { Feed } from '../providers/Feed';
  import t from '../l10n/locale';
  // No plugin needed directly; parent passes derived data + handlers
  export let folders: any[] = [];
  export let favoritesMode = false;
  export let favoriteCount = 0;
  export let globalUnread = 0;
  export let unreadInFeed: (feed: Feed) => number;
  export let unreadInFolder: (feeds: Feed[]) => number;

  export let onMarkAllGlobal: () => void;
  export let onMarkFolder: (folderName: string) => void;
  export let onMarkFeed: (feed: Feed) => void;
  export let onOpenAllFeeds: () => void;
  export let onOpenFavorites: () => void;
  export let onOpenFolder: (feeds: Feed[]) => void;
  export let onOpenFeed: (feed: Feed) => void;
</script>

<div class="rss-fr-subs">
  <button type="button" class="rss-mark-all-global" on:click={onMarkAllGlobal} title={t('mark_all_as_read')} aria-label={t('mark_all_as_read')}>
    <span>✓</span><span>{t('mark_all_as_read')}</span>
  </button>
  <button type="button" class="rss-all-feeds-button {favoritesMode?'' : 'active'}" on:click={onOpenAllFeeds}>
    <span>🌐</span><span>All Feeds ({globalUnread})</span>
  </button>
  <button type="button" class="rss-favorites-button {favoritesMode?'active':''}" on:click={onOpenFavorites}>
    <span>★</span><span>Favorites ({favoriteCount})</span>
  </button>
  {#each folders as folder (folder.name())}
    <div class="rss-folder-wrapper">
      <button type="button" class="rss-folder-header" on:click={() => onOpenFolder(folder.feeds())}>
        <span>▼</span>
        <span>{folder.name()} ({unreadInFolder(folder.feeds())})</span>
      </button>
      <button type="button" class="rss-mark-folder" title={t('mark_all_as_read')} on:click={() => onMarkFolder(folder.name())}>✓</button>
    </div>
    <div>
      {#each folder.feeds() as feed}
        <div class="rss-feed-line">
          <button type="button" class="rss-feed-header" on:click={()=> onOpenFeed(feed)}>
            <div><span>{feed.name()}</span></div>
            <span class="rss-item-count-badge">{unreadInFeed(feed)}</span>
          </button>
          <button type="button" class="rss-mark-feed" title={t('mark_feed_as_read')} on:click={()=> onMarkFeed(feed)}>✓</button>
        </div>
      {/each}
    </div>
  {/each}
</div>

<style>
  .rss-fr-subs { width:240px; overflow-y:auto; }
  .rss-item-count-badge { background:#444; color:#fff; padding:0 4px; border-radius:8px; font-size:0.75em; }
  .rss-mark-feed { margin-left:8px; cursor:pointer; }
  .rss-mark-folder { margin-left:auto; cursor:pointer; }
  button { background:transparent; border:0; font:inherit; text-align:left; }
  .rss-folder-header, .rss-feed-header, .rss-all-feeds-button, .rss-favorites-button, .rss-mark-all-global { padding:4px 6px; cursor:pointer; display:flex; align-items:center; gap:4px; width:100%; }
  .rss-folder-wrapper { display:flex; align-items:center; }
  .rss-feed-line { display:flex; align-items:center; }
  .rss-all-feeds-button.active, .rss-favorites-button.active { background:var(--background-modifier-hover); }
</style>
