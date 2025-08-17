import {FilteredFolder} from "../modals/FilteredFolderModal";
import {RssFeedContent} from "../parser/rssParser";

export interface RssFeed {
    name: string,
    url: string,
    folder: string
}

export interface RssReaderSettings {
    feeds: RssFeed[],
    template: string,
    pasteTemplate: string,
    updateTime: number,
    saveLocation: string,
    saveLocationFolder: string,
    filtered: FilteredFolder[],
    items: RssFeedContent[],
    dateFormat: string,
    askForFilename: boolean,
    defaultFilename: string,
    autoSync: boolean,
    autoMarkOnOpen: boolean,
    debugLogging: boolean,
    displayStyle: string,
    hotkeys: {
        create: string,
        paste: string,
        copy: string,
        favorite: string,
        read: string,
        tags: string,
        open: string,
        tts: string,
        next: string,
        previous: string,
    },
    folded: string[],
    renamedText: {
        filtered_folders: string,
        folders: string,
        no_folder: string,
    },
    displayMedia: boolean,
    provider: string,
}

function deepFreeze<T>(obj: T): T {
    if (obj && typeof obj === 'object') {
        Object.freeze(obj);
        for (const key of Object.getOwnPropertyNames(obj)) {
            // @ts-ignore
            const value = obj[key];
            if (value && (typeof value === 'object') && !Object.isFrozen(value)) deepFreeze(value);
        }
    }
    return obj;
}

export const DEFAULT_SETTINGS: RssReaderSettings = deepFreeze({
    feeds: [],
    updateTime: 60,
    filtered: [{
        name: "Favorites",
        read: true,
        unread: true,
        filterTags: [],
        filterFolders: [],
        filterFeeds: [],
        ignoreTags: [],
        ignoreFeeds: [],
        ignoreFolders: [],
        favorites: true,
        sortOrder: "ALPHABET_NORMAL"
    }],
    saveLocation: 'default',
    displayStyle: 'cards',
    saveLocationFolder: '',
    items: [],
    dateFormat: "YYYY-MM-DDTHH:mm:SS",
    template: "---\n" +
        "link: {{link}}\n" +
        "author: {{author}}\n" +
        "published: {{published}}\n" +
        "tags: [{{tags:,}}]\n" +
        "---\n" +
        "# Highlights\n" +
        "{{highlights}}\n\n" +
        "---\n" +
        "# {{title}}\n" +
        "{{content}}",
    pasteTemplate: "## {{title}}\n" +
        "{{content}}",
    askForFilename: false,
    defaultFilename: "{{title}}",
    autoSync: false,
    autoMarkOnOpen: true,
    debugLogging: false,
    hotkeys: {
        create: "n",
        paste: "v",
        copy: "c",
        favorite: "f",
        read: "r",
        tags: "t",
        open: "o",
        tts: "s",
        previous: "ArrowLeft",
        next: "ArrowRight"
    },
    folded: [],
    renamedText: {
        filtered_folders: "",
        folders: "",
        no_folder: ""
    },
    displayMedia: true,
    provider: "local"
});

