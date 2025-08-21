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
        return undefined;
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
        // Priorizar el campo image del item
        if (this.item.image && this.item.image.length > 0) {
            return this.item.image;
        }
        
        // Si no hay imagen, buscar en el contenido HTML
        if (this.item.content) {
            const imgMatch = this.item.content.match(/<img[^>]+src="([^"]+)"/);
            if (imgMatch) {
                return imgMatch[1];
            }
        }
        
        return "";
    }
    
    pubDate(): string {
        return this.item.pubDate;
    }

    read(): boolean {
        // Return actual persisted read state
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