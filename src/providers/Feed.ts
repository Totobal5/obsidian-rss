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