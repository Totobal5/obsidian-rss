import type {Item} from "./Item";

export enum FeedOrder {
    DEFAULT,
    OLDEST_FIRST,
    NEWEST_FIRST,
}

/**
 * Represents an RSS feed with its metadata and items.
 *
 * Provides methods to access feed properties such as ID, URL, title, name, favicon,
 * unread item count, ordering, link, folder information, and the list of items.
 *
 * @remarks
 * This interface abstracts the structure and behavior of a feed, allowing
 * implementations to provide concrete logic for each property.
 *
 * @interface Feed
 */
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