/**
 * Represents an RSS feed item with metadata, content, and state management methods.
 *
 * @remarks
 * This interface defines the structure and behavior for an RSS feed item, including
 * identification, content, author, publication details, media, tags, and state flags
 * such as read, starred, and created.
 *
 * @method id - Gets the unique identifier for the item.
 * @method guid - Gets the globally unique identifier for the item.
 * @method guidHash - Gets a hash of the item's GUID.
 * @method url - Gets the URL of the item.
 * @method title - Gets the title of the item.
 * @method author - Gets the author of the item.
 * @method pubDate - Gets the publication date of the item.
 * @method body - Gets the main body content of the item.
 * @method description - Gets the description of the item.
 * @method feedId - Gets the identifier of the feed this item belongs to.
 * @method read - Indicates whether the item has been read.
 * @method starred - Indicates whether the item has been starred.
 * @method rtl - Indicates if the item's content is right-to-left.
 * @method mediaThumbnail - Gets the URL of the item's media thumbnail.
 * @method mediaDescription - Gets the description of the item's media.
 * @method enclosureMime - Gets the MIME type of the item's enclosure.
 * @method enclosureLink - Gets the link to the item's enclosure.
 * @method markStarred - Marks the item as starred or unstarred.
 * @method markRead - Marks the item as read or unread.
 * @method tags - Gets the tags associated with the item.
 * @method setTags - Sets the tags for the item.
 * @method created - Indicates whether the item has been created.
 * @method markCreated - Marks the item as created or not.
 * @method language - Gets the language of the item, if available.
 * @method highlights - Gets the highlighted text fragments in the item.
 * @method folder - Gets the folder name associated with the item.
 * @method feed - Gets the feed name associated with the item.
 */
export interface Item {
    id(): string | number;
    guid(): string;
    guidHash(): string;
    url(): string;
    title(): string;
    author(): string;
    pubDate(): string;
    body(): string;
    description(): string;
    feedId(): number;
    read(): boolean;
    starred(): boolean;
    rtl(): boolean;
    mediaThumbnail(): string;
    mediaDescription(): string;
    enclosureMime(): string;
    enclosureLink(): string;
    markStarred(starred: boolean): void;
    markRead(read: boolean): void;
    tags(): string[];
    setTags(tags: string[]): void;
    created(): boolean;
    markCreated(created: boolean): void;
    language(): string | undefined;
    highlights(): string[];
    folder(): string;
    feed(): string;
}

// Runtime placeholder for ESM named import compatibility in tests