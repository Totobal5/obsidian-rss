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

export const configuredFeedsStore = writable<Array<RssFeed>>([]);
export const filteredStore = writable<Array<FilteredFolder>>([]);
export const settingsStore = writable<RssReaderSettings>(DEFAULT_SETTINGS);

export const feedsStore = writable<RssFeedContent[]>([]);
export const sortedFeedsStore = writable<_.Dictionary<RssFeedContent[]>>();
export const filteredItemsStore = writable<Array<FilteredFolderContent>>();

export const foldedState = writable<Array<string>>();
export const tagsStore = writable<Set<string>>();
export const folderStore = writable<Set<string>>();
