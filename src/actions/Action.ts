import {copy, createNewNote, openInBrowser, pasteToNote} from "../functions";
import RssReaderPlugin from "../main";
import {htmlToMarkdown, Notice} from "obsidian";
import {TagModal} from "../modals/TagModal";
import t from "../l10n/locale";
import {Item} from "../providers/Item";

export default class Action {

    static CREATE_NOTE = new Action(t("create_note"), "create-new", (plugin, item) : Promise<void> => {
        return createNewNote(plugin, item);
    });

    static PASTE = new Action(t("paste_to_note"), "paste", (plugin, item) : Promise<void> => {
        return pasteToNote(plugin, item);
    });

    static COPY = new Action(t("copy_to_clipboard"), "documents", ((_, item) : Promise<void> => {
        return copy(htmlToMarkdown(item.body()));
    }));

    static OPEN = new Action(t("open_browser"), "open-elsewhere-glyph", ((_, item) : Promise<void> => {
        openInBrowser(item);
        return Promise.resolve();
    }));

    static TAGS = new Action(t("edit_tags"), "tag-glyph", (((plugin, item) => {
        const modal = new TagModal(plugin, item.tags());

        modal.onClose = async () => {
            item.setTags(modal.tags);
            const items = plugin.settings.items;
            await plugin.writeFeedContent(() => {
                return items;
            });
        };

        modal.open();
        return Promise.resolve();
    })));

    static READ = new Action(t("mark_as_read_unread"), "eye", ((async (plugin, item) : Promise<void> => {
        if (item.read()) {
            item.markRead(false);
            new Notice(t("marked_as_unread"));
        } else {
            item.markRead(true);
            new Notice(t("marked_as_read"));
        }
        // Guardar cambios en settings
        await plugin.saveSettings();
        return Promise.resolve();
    })));

    static FAVORITE = new Action(t("mark_as_favorite_remove"), "star", ((async (plugin, item) : Promise<void> => {
        const wasStarred = item.starred();
        console.log(`🔍 FAVORITE Action - before: starred=${wasStarred}`);
        
        if (wasStarred) {
            item.markStarred(false);
            new Notice(t("removed_from_favorites"));
            console.log(`🔍 FAVORITE Action - removed from favorites`);
        } else {
            item.markStarred(true);
            new Notice(t("added_to_favorites"));
            console.log(`🔍 FAVORITE Action - added to favorites`);
        }
        
        console.log(`🔍 FAVORITE Action - after markStarred: starred=${item.starred()}`);
        
        // Encontrar y actualizar el item específico en los feedContents
        const itemId = item.id();
        const itemTitle = item.title();
        const isNowStarred = item.starred();
        
        console.log(`🔍 FAVORITE Action - updating item: id=${itemId}, title="${itemTitle}", starred=${isNowStarred}`);
        
        await plugin.writeFeedContent((feedContents) => {
            // Buscar el feed que contiene este item y actualizar su estado
            const updatedFeeds = feedContents.map(feed => {
                const updatedItems = feed.items.map(feedItem => {
                    if (feedItem.id === itemId || feedItem.title === itemTitle) {
                        console.log(`🔍 Found matching item in feed "${feed.name}", updating favorite to ${isNowStarred}`);
                        return { ...feedItem, favorite: isNowStarred };
                    }
                    return feedItem;
                });
                return { ...feed, items: updatedItems };
            });
            return updatedFeeds;
        });
        
        console.log(`🔍 FAVORITE Action - completed successfully`);
        return Promise.resolve();
    })));

    static actions = Array.of(Action.FAVORITE, Action.READ, Action.TAGS, Action.CREATE_NOTE, Action.PASTE, Action.COPY, Action.OPEN);

    readonly name: string;
    readonly icon: string;
    readonly processor: (plugin: RssReaderPlugin, value: Item) => Promise<void>;

    constructor(name: string, icon: string, processor: (plugin: RssReaderPlugin, item: Item) => Promise<void>) {
        this.name = name;
        this.icon = icon;
        this.processor = processor;
    }
}
