import type {Feed} from "../Feed";
import {FeedOrder} from "../Feed";
import type {Item} from "../Item";
import type {RssFeedContent} from "../../parser/rssParser";
import {LocalFeedItem} from "./LocalFeedItem";

/**
 * Represents a local RSS feed, providing access to its metadata and items.
 * 
 * The `LocalFeed` class implements the `Feed` interface, wrapping parsed RSS feed content
 * and exposing methods to retrieve feed information, such as title, link, favicon, folder,
 * and items. It also supports custom naming and caches items for efficient access.
 * 
 * @remarks
 * - The feed is initialized with parsed RSS content and an optional custom name.
 * - Items are cached and refreshed if the underlying parsed items change.
 * - Folder and ID information are derived from the parsed content.
 * - Unread count is always zero for local feeds.
 * 
 * @example
 * ```typescript
 * const feed = new LocalFeed(parsedContent, "My Custom Feed");
 * console.log(feed.title()); // Prints the feed's title
 * const items = feed.items(); // Retrieves feed items
 * ```
 * 
 * @see Feed
 * @see LocalFeedItem
 */
export class LocalFeed implements Feed {

    private readonly parsed: RssFeedContent;

    private readonly customName: string;

    // Cache items for fast access
    private itemsCache: Item[] = [];
    private lastItemsLength: number = 0;
    
    constructor(parsed: RssFeedContent, customName?: string) {
        this.parsed = parsed;
        this.customName = customName || parsed.name || parsed.title;
    }

    favicon(): string {
        return this.parsed.image;
    }

    folderId(): number {
        return this.parsed.folder.length;
    }

    folderName(): string {
        return this.parsed.folder;
    }

    id(): number {
        return Number(this.parsed.hash) || 0;
    }

    items(): Item[] {
        if (this.itemsCache.length === 0 || this.lastItemsLength !== this.parsed.items.length) {
            this.itemsCache = this.parsed.items.map(item => new LocalFeedItem(item));
            this.lastItemsLength = this.parsed.items.length;
        }

        return this.itemsCache;
    }

    link(): string {
        return this.parsed.link;
    }

    ordering(): FeedOrder {
        return FeedOrder.DEFAULT;
    }

    title(): string {
        return this.parsed.title;
    }

    name(): string {
        return this.customName;
    }

    unreadCount(): number {
        return this.parsed.items.length;
    }

    url(): string {
        return this.parsed.link;
    }

}
