import type { Feed } from "./Feed";

/**
 * Represents a folder containing RSS feeds.
 *
 * @interface Folder
 * @method id Returns the unique identifier of the folder.
 * @method name Returns the name of the folder.
 * @method feeds Returns an array of feeds contained in the folder.
 */
export interface Folder {
    id(): number;
    name(): string;
    feeds(): Feed[];
}