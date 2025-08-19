import {writable} from "svelte/store";
import {DEFAULT_SETTINGS} from "./settings/settings";
import type {RssFeed, RssReaderSettings} from "./settings/settings";
import type {RssFeedContent, RssFeedItem} from "./parser/rssParser";
import type {FilteredFolder} from "./modals/FilteredFolderModal";

export interface FeedItems {
    items: RssFeedItem[];
}
export interface FilteredFolderContent {
    filter: FilteredFolder;
    items: FeedItems;
}


export const filteredStore = writable<Array<FilteredFolder>>([]);

/**
 * A Svelte writable store that holds the current settings for the RSS Reader.
 * Initialized with the default settings defined in `DEFAULT_SETTINGS`.
 *
 * @remarks
 * Use this store to read or update the RSS Reader's configuration throughout the application.
 *
 * @see {@link RssReaderSettings}
 * @see {@link DEFAULT_SETTINGS}
 */
export const settingsStore = writable<RssReaderSettings>(DEFAULT_SETTINGS);

// The feeds added to the reader.
/**
 * A Svelte writable store that holds an array of {@link RssFeed} objects.
 * 
 * This store is used to manage the list of RSS feeds within the application.
 * Components can subscribe to this store to reactively receive updates when
 * the list of feeds changes.
 *
 * @see {@link RssFeed}
 */
export const feedsStore = writable<Array<RssFeed>>([]);

// The feed entries (items).
/**
 * A Svelte writable store that holds an array of `RssFeedContent` items.
 * 
 * Use this store to manage and reactively update the list of RSS feed contents
 * throughout the application.
 *
 * @remarks
 * The store is initialized as an empty array and can be subscribed to for changes.
 *
 * @see {@link RssFeedContent}
 */
export const itemsStore = writable<RssFeedContent[]>([]);

export const foldedState = writable<Array<string>>();

export const tagsStore = writable<Set<string>>();

export const folderStore = writable<Set<string>>();