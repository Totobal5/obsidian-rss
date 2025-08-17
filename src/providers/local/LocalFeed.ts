import type {Feed} from "../Feed";
import {FeedOrder} from "../Feed";
import type {Item} from "../Item";
import type {RssFeedContent} from "../../parser/rssParser";
import {LocalFeedItem} from "./LocalFeedItem";

export class LocalFeed implements Feed {

    private readonly parsed: RssFeedContent;
    private readonly customName: string;

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
        return 0;
    }

    items(): Item[] {
        const result: Item[] = [];
        for (const item of this.parsed.items) {
            result.push(new LocalFeedItem(item));
        }
        return result;
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
        return 0;
    }

    url(): string {
        return this.parsed.link;
    }

}
