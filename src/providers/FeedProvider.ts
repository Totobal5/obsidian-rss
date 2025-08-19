import type {Feed} from "./Feed";
import type {Folder} from "./Folder";
import type {Item} from "./Item";
import {SettingsSection} from "../settings/SettingsSection";

export interface FeedProvider {

    id(): string;

    name(): string;

    isValid(): Promise<boolean>;

    warnings() : string[];

    folders(): Promise<Folder[]>;

    filteredFolders() : Promise<Folder[]>;

    feeds(): Promise<Feed[]>;

    items() : Promise<Item[]>;

    settings(containerEl: HTMLDivElement) : SettingsSection;
}