import type {Item} from "./Item";

export enum FeedOrder {
    DEFAULT,
    OLDEST_FIRST,
    NEWEST_FIRST,
}


export interface Feed {
    id(): number;
    url(): string;
    title(): string;
    name(): string;
    favicon(): string;
    unreadCount(): number;
    ordering(): FeedOrder;
    link(): string;
    folderId(): number;
    folderName(): string;
    items(): Item[];
}

// Provide a runtime no-op export to satisfy ESM named import when only types are used elsewhere
// (No runtime export needed; all consumers should use `import type {Feed}`)
