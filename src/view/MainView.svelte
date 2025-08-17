<script lang="ts">
    import RssReaderPlugin from "../main";
    import type {Item} from "../providers/Item";
    import type {Feed} from "../providers/Feed";
    import type {Folder} from "../providers/Folder";
    import FeedView from "./FeedView.svelte";

    export let plugin: RssReaderPlugin;

    let feeds: Feed[] = [];
    plugin.providers.getCurrent().feeds().then(_feeds => {
        feeds = _feeds;
    });

    let folders: Folder[] = [];
    plugin.providers.getCurrent().folders().then(_folders => {
        folders = _folders;
    });

</script>

{#each folders as folder}
    <p>{folder.name()}</p>
    {#each feeds.filter(feed => feed.folderId() === folder.id()) as feed}
        <FeedView plugin={plugin} feed={feed}/>
    {/each}

{/each}
