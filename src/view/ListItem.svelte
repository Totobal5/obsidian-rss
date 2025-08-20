<script lang="ts">
    import type { Feed } from '../providers/Feed';
    import type { Item } from '../providers/Item';

    export let feed: Feed | null;   // may be null when favorites view
    export let item: Item;          // legacy shape; functions or plain props

    export let summary: (it: Item) => string;
    export let deriveThumb: (it: Item) => string | undefined;
    export let toggleRead: (it: Item) => void;
    export let toggleFavorite: (it: Item) => void;
    export let onOpen: (it: Item) => void;

    $: thumb = deriveThumb(item);

    // Helpers
    function runOpen() {
        onOpen(item); 
    }

    function onClick() {
        // Open modal first to avoid losing context if list re-renders on read toggle
        runOpen();
        if (!item.read()) {
            // Defer toggle slightly so modal instantiation is not interrupted by rebuild
            setTimeout(() => toggleRead(item), 0);
        }
    }

    function formatDate(item: Item): string {
        try {
            const pubdate = item.pubDate();
            if(!pubdate) return '';
            const date = new Date(pubdate);

            if(isNaN(date.getTime())) return '';
            return date.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
        } catch { return ''; }
    }
    
</script>

{#key item.url()}
    <div
        class="list-item-container rss-fr-row-article"
        class:has-thumbnail={!!thumb}
        class:no-thumbnail={!thumb}
        class:read={item.read()}
        class:unread={!item.read()}
        on:click={onClick}
        on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && onClick()}
        role="button"
        tabindex="0"
        aria-label="Open item"
    >
    <!-- Dot (read/unread) -->
    <button
        type="button"
        class="rss-dot"
        on:click|stopPropagation={() => toggleRead(item)}
        aria-label={item.read() ? 'Mark unread' : 'Mark read'}
    ></button>
    
    <!-- Star/Favorite -->
    <button
        type="button"
        class="rss-star rss-fr-star"
        class:is-starred={item.starred()}
        on:click|stopPropagation={() => toggleFavorite(item)}
        aria-label={item.starred() ? 'Unfavorite' : 'Favorite'}
    >★</button>

    {#if thumb}
        <div class="rss-fr-thumb-wrapper">
        <img class="rss-fr-thumb list-item-thumb" src={thumb} alt="" loading="lazy" />
        </div>
    {/if}

    <div class="rss-fr-main">
        <div class="rss-fr-feedline">
            <span class="rss-fr-feed"> {feed.name()} </span>
        </div>

        <div class="rss-fr-top">
            <div class="rss-fr-title list-item-title"> {item.title()} </div>
            <div class="rss-fr-date"> {formatDate(item)} </div>
        </div>
        <div class="rss-fr-desc list-item-description"> {summary(item)} </div>
    </div>
  </div>
{/key}

<!-- styles moved to global main.scss -->