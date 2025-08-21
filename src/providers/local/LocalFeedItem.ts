import type {Item} from "../Item";
import type {RssFeedItem} from "../../parser/rssParser";

export class LocalFeedItem implements Item {

    private readonly item: RssFeedItem;

    constructor(item: RssFeedItem) {
        this.item = item;
    }

    author(): string {
        return this.item.creator;
    }

    body(): string {
        return this.item.content;
    }

    created(): boolean {
        return false;
    }

    description(): string {
        return this.item.description;
    }

    enclosureLink(): string {
        return "";
    }

    enclosureMime(): string {
        return "";
    }

    feed(): string {
        return "";
    }

    feedId(): number {
        return 0;
    }

    folder(): string {
        return "";
    }

    guid(): string {
        return "";
    }

    guidHash(): string {
        return "";
    }

    highlights(): string[] {
        return [];
    }

    id(): string | number {
        return this.item.id;
    }

    language(): string | undefined {
        return this.item.language;
    }

    markCreated(created: boolean): void {
        this.item.created = created;
    }

    markRead(read: boolean): void {
        this.item.read = read;
    }

    markStarred(starred: boolean): void {
        this.item.favorite = starred;
    }

    mediaDescription(): string {
        return this.item.description || "";
    }

    mediaThumbnail(): string {
        if (this.item.image) return this.item.image;

        if (this.item.content) {
            const idx = this.item.content.indexOf('<img');
            if (idx !== -1) {
                const srcIdx = this.item.content.indexOf('src="', idx);
                if (srcIdx !== -1) {
                    const start = srcIdx + 5;
                    const end = this.item.content.indexOf('"', start);
                    if (end !== -1) {
                        return this.item.content.substring(start, end);
                    }
                }
            }
        }

        return "";
    }
    
    pubDate(): string {
        return this.item.pubDate;
    }

    read(): boolean {
        return this.item.read;
    }

    rtl(): boolean {
        return false;
    }

    setTags(tags: string[]): void {
        this.item.tags = tags;
    }

    starred(): boolean {
        return this.item.favorite;
    }

    tags(): string[] {
        return this.item.tags;
    }

    title(): string {
        return this.item.title;
    }

    url(): string {
        return this.item.link;
    }
}