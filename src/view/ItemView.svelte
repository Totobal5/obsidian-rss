<script lang="ts">
    import RssReaderPlugin from "../main";
    import HtmlTooltip from "./HtmlTooltip.svelte";
    import ItemTitle from "./ItemTitle.svelte";
    import {settingsStore} from "../stores";
    import MarkdownContent from "./MarkdownContent.svelte";
    import type {Item} from "../providers/Item";

    export let plugin: RssReaderPlugin = null;
    export let item: Item = null;
    export let items: Item[] = null;

    let hover = false;

    function toggleHover() {
        hover = !hover;
    }

</script>

{#if item}
    <div class="is-clickable rss-tooltip rss-fee d-item {(item.read()) ? 'rss-read' : 'rss-not-read'}">
        {#if $settingsStore.displayStyle === "list"}
            <div class="rss-list-item" style="display: flex; align-items: flex-start; gap: 1em;">
                {#if item.mediaThumbnail() && !item.mediaThumbnail().includes(".mp3")}
                    <a href={item.url()} target="_blank" rel="noopener">
                        <img src={item.mediaThumbnail()} width="80em" alt="Article" style="border-radius: 6px;">
                    </a>
                {/if}
                <div style="flex: 1;">
                    <a href={item.url()} target="_blank" rel="noopener" class="rss-list-title" style="font-weight: bold; text-decoration: underline;">
                        {item.title()}
                    </a>
                    {#if item.tags().length > 0}
                        <span>
                            {#each item.tags() as tag}
                                &nbsp;<a class="tag rss-tag" href="#{tag}">{tag}</a>
                            {/each}
                        </span>
                    {/if}
                    {#if item.description()}
                        <div class="rss-list-desc" style="margin-top: 0.5em;">
                            <MarkdownContent content={item.description()} plugin={plugin}/>
                        </div>
                    {/if}
                </div>
            </div>

        {:else if $settingsStore.displayStyle === "cards"}
            <div class="rss-card is-clickable" style="display: flex; flex-direction: column; align-items: flex-start;">
                {#if item.mediaThumbnail() && !item.mediaThumbnail().includes(".mp3")}
                    <a href={item.url()} target="_blank" rel="noopener">
                        <img src={item.mediaThumbnail()} width="250em" alt="Article" style="border-radius: 8px;">
                    </a>
                {/if}
                <a href={item.url()} target="_blank" rel="noopener" class="rss-card-title" style="font-weight: bold; font-size: 1.1em; margin-top: 0.5em; text-decoration: underline;">
                    {item.title()}
                </a>
                {#if item.tags().length > 0}
                    <span>
                        {#each item.tags() as tag}
                            &nbsp;<a class="tag rss-tag" href="#{tag}">{tag}</a>
                        {/each}
                    </span>
                {/if}
                {#if item.description()}
                    <div class="rss-card-desc" style="margin-top: 0.5em;">
                        <MarkdownContent content={item.description()} plugin={plugin}/>
                    </div>
                {/if}
            </div>
        {/if}
    </div>
{/if}
