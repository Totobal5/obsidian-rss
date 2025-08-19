<script lang="ts">
    import type { Feed } from '../providers/Feed';
    import t from '../l10n/locale';
    import { createEventDispatcher } from 'svelte';
    import type { Folder } from 'src/providers/Folder';

    const dispatch = createEventDispatcher();
    // No plugin needed directly; parent passes derived data + handlers
    export let folders: Folder[] = [];
    export let favoritesMode = false;
    export let favoriteCount = 0;
    export let globalUnread = 0;
    export let unreadFeedMap: Record<string, number> = {};
    export let activeFeedName: string | null = null;
    export let activeFolderName: string | null = null;
    export let collapsedFolders: Set<string> = new Set();
    export let countsVersion: number = 0; // dummy prop to force updates
    export let getUnreadCountForFolder: (folder: any) => number;

    export let onMarkAllGlobal: () => void;
    export let onMarkFolder: (folderName: string) => void;
    export let onMarkFeed: (feed: Feed) => void;
    export let onOpenAllFeeds: () => void;
    export let onOpenFavorites: () => void;
    export let onOpenFolder: (feeds: Feed[]) => void;
    export let onOpenFeed: (feed: Feed) => void;
    export let onRefreshAll: () => void; // new
</script>

<div class="rss-fr-subs">
    <div class="rss-top-actions">
        <button
            type="button"
            class="rss-mark-all-global"
            on:click={onMarkAllGlobal}
            title={t('mark_all_as_read')}
            aria-label={t('mark_all_as_read')}
        >
            <span>✓</span>
            <span>{t('mark_all_as_read')}</span>
        </button>
        
        <button
            type="button"
            class="rss-refresh-all"
            on:click={onRefreshAll}
            title={t('refresh_feeds')}
            aria-label={t('refresh_feeds')}
        >
            <span>↻</span>
            <span>{t('refresh_feeds')}</span>
        </button>
    </div>
    
    <button
        type="button"
        class="rss-all-feeds-button {favoritesMode ? '' : 'active'}"
        on:click={onOpenAllFeeds}
        aria-label="Show all feeds"
        title="Show all feeds"
    >
        <span>🌐</span>
        <span>
            {t('show_all_feeds')}
            <span class="rss-count">({globalUnread})</span>
        </span>
    </button>

    <button
        type="button"
        class="rss-favorites-button {favoritesMode ? 'active' : ''}"
        on:click={onOpenFavorites}
        aria-label={t('favorites')}
        title={t('favorites')}
    >
        <span>★</span>
        <span>
            {t('favorites')}
            <span class="rss-count">({favoriteCount})</span>
        </span>
    </button>

    <div class="rss-folder-groups">
        {#each folders as folder (folder.name()) }
            {#key countsVersion + folder.name()}
                <div class="rss-folder-group {collapsedFolders.has(folder.name()) ? 'collapsed' : ''}">
                    <div class="rss-folder-wrapper">
                        <button
                            type="button"
                            class="rss-mark-folder"
                            title={t('mark_all_as_read')}
                            on:click={() => onMarkFolder(folder.name())}
                        >
                            ✓
                        </button>
                        
                        <button
                            type="button"
                            class="rss-folder-caret-btn"
                            aria-label={
                            collapsedFolders.has(folder.name())
                                ? t('expand_folder') || 'Expand folder'
                                : t('collapse_folder') || 'Collapse folder'
                            }
                            aria-expanded={!collapsedFolders.has(folder.name())}
                            on:click={(e) => {
                                e.stopPropagation();
                                dispatch('toggleFolder', folder.name());
                            }}
                        >
                            {collapsedFolders.has(folder.name()) ? '▶' : '▼'}
                        </button>

                        <button
                            type="button"
                            class="rss-folder-header {activeFolderName === folder.name() ? 'active' : ''}"
                            on:click={() => onOpenFolder(folder.feeds()) }
                        >
                            <span class="rss-folder-label">
                            {folder.name()} ( {getUnreadCountForFolder(folder)} )
                            </span>
                        </button>

                    </div>

                    {#if !collapsedFolders.has(folder.name())}
                        <div class="rss-folder-feeds">
                            {#each folder.feeds() as feed (feed.name())}
                                <div class="rss-feed-line">
                                    <button
                                        type="button"
                                        class="rss-mark-feed"
                                        title={t('mark_feed_as_read')}
                                        on:click={() => onMarkFeed(feed)}
                                        aria-label={t('mark_feed_as_read')}
                                    >
                                        ✓
                                    </button>

                                    <button
                                        type="button"
                                        class="rss-feed-header {activeFeedName === feed.name() ? 'active' : ''}"
                                        on:click={() => onOpenFeed(feed)}
                                        aria-label={feed.name()}
                                        title={feed.name()}
                                    >
                                        <div class="rss-feed-name">
                                            <span>{feed.name()}</span>
                                        </div>
                                        <span class="rss-item-count-badge">
                                            {unreadFeedMap[feed.name()] || 0}
                                        </span>
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