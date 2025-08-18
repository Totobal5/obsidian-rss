<script lang="ts">
  import type { Feed } from '../providers/Feed';
  import t from '../l10n/locale';
  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();
  // No plugin needed directly; parent passes derived data + handlers
  export let folders: any[] = [];
  export let favoritesMode = false;
  export let favoriteCount = 0;
  export let globalUnread = 0;
  export let unreadFeedMap: Record<string, number> = {};
  export let unreadFolderMap: Record<string, number> = {};
  export let activeFeedName: string | null = null;
  export let activeFolderName: string | null = null;
  export let collapsedFolders: Set<string> = new Set();
  export let countsVersion: number = 0; // dummy prop to force updates

  export let onMarkAllGlobal: () => void;
  export let onMarkFolder: (folderName: string) => void;
  export let onMarkFeed: (feed: Feed) => void;
  export let onOpenAllFeeds: () => void;
  export let onOpenFavorites: () => void;
  export let onOpenFolder: (feeds: Feed[]) => void;
  export let onOpenFeed: (feed: Feed) => void;
  export let onRefreshAll: () => void; // new

  // Precompute folder and feed names/arrays to avoid calling methods repeatedly
  // in the template (those calls can be expensive and cause many re-renders).
  // This mapping is recomputed only when `folders` changes.
  $: mappedFolders = (folders || []).map((folder) => {
    const name = typeof folder.name === 'function' ? folder.name() : folder.name;
    const feedsArr = typeof folder.feeds === 'function' ? (folder.feeds() || []) : (folder.feeds || []);
    const feeds = (feedsArr || []).map((feed) => {
      const fname = typeof feed.name === 'function' ? feed.name() : feed.name;
      return { feed, name: fname };
    });
    return { folder, name, feeds };
  });
</script>

<div class="rss-fr-subs">
  <div class="rss-top-actions">
    <button type="button" class="rss-mark-all-global" on:click={onMarkAllGlobal} title={t('mark_all_as_read')} aria-label={t('mark_all_as_read')}>
      <span>✓</span><span>{t('mark_all_as_read')}</span>
    </button>
  <button type="button" class="rss-refresh-all" on:click={onRefreshAll} title={t('refresh_feeds')} aria-label={t('refresh_feeds')}>↻</button>
  </div>
  <button type="button" class="rss-all-feeds-button {favoritesMode?'' : 'active'}" on:click={onOpenAllFeeds}>
    <span>🌐</span><span>All Feeds ({globalUnread})</span>
  </button>
  <button type="button" class="rss-favorites-button {favoritesMode?'active':''}" on:click={onOpenFavorites}>
    <span>★</span><span>Favorites ({favoriteCount})</span>
  </button>

  <div class="rss-folder-groups">
    {#each mappedFolders as m (m.name)}
      {#key countsVersion + m.name}
      <div class="rss-folder-group {collapsedFolders.has(m.name) ? 'collapsed' : ''}">
        <div class="rss-folder-wrapper">
          <button type="button" class="rss-mark-folder" title={t('mark_all_as_read')} on:click={() => onMarkFolder(m.name)}>✓</button>
          <button
            type="button"
            class="rss-folder-caret-btn"
            aria-label={collapsedFolders.has(m.name) ? t('expand_folder') || 'Expand folder' : t('collapse_folder') || 'Collapse folder'}
            aria-expanded={!collapsedFolders.has(m.name)}
            on:click={(e)=> { e.stopPropagation(); dispatch('toggleFolder', m.name); }}
          >{collapsedFolders.has(m.name) ? '▶' : '▼'}</button>
          <button
            type="button"
            class="rss-folder-header {activeFolderName === m.name ? 'active' : ''}"
            on:click={() => onOpenFolder(m.feeds.map(x => x.feed))}
          >
            <span class="rss-folder-label">{m.name} ({unreadFolderMap[(m.name||'').toString().trim().toLowerCase()] || 0})</span>
          </button>
        </div>
        {#if !collapsedFolders.has(m.name)}
          <div class="rss-folder-feeds">
            {#each m.feeds as item (item.name)}
              <div class="rss-feed-line">
                <button type="button" class="rss-mark-feed" title={t('mark_feed_as_read')} on:click={()=> onMarkFeed(item.feed)}>✓</button>
                <button type="button" class="rss-feed-header {activeFeedName === item.name ? 'active' : ''}" on:click={()=> onOpenFeed(item.feed)}>
                  <div class="rss-feed-name"><span>{item.name}</span></div>
                  <span class="rss-item-count-badge">{unreadFeedMap[item.name] || 0}</span>
                </button>
              </div>
            {/each}
          </div>
        {/if}
      </div>
      {/key}
    {/each}
  </div>
</div>

<!-- Styles moved to SCSS partial: src/style/partials/_folders.scss -->
