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
        // Access the raw item data directly - no more starred() nonsense
        const rawItem = (item as any).item || item; // Get the underlying RssFeedItem
        const wasFavorite = rawItem.favorite || false;
        console.log(`🔍 FAVORITE Action - before: favorite=${wasFavorite}`);
        
        // Toggle the favorite state DIRECTLY on the raw item
        const newFavoriteState = !wasFavorite;
        rawItem.favorite = newFavoriteState;
        
        // Show appropriate notice
        if (newFavoriteState) {
            new Notice(t("added_to_favorites"));
            console.log(`🔍 FAVORITE Action - added to favorites`);
        } else {
            new Notice(t("removed_from_favorites"));
            console.log(`🔍 FAVORITE Action - removed from favorites`);
        }
        
        console.log(`🔍 FAVORITE Action - after setting favorite: favorite=${rawItem.favorite}`);
        // --- CRITICAL SYNC STEP ---
        // Ensure the item inside plugin.settings.items is updated (don't rely on wrapper reference)
        try {
            let updated = false;
            for (const feedContent of plugin.settings.items) {
                if (!feedContent || !Array.isArray(feedContent.items)) continue;
                const match = feedContent.items.find((i: any) => i.link === rawItem.link);
                if (match) {
                    match.favorite = rawItem.favorite === true; // normalize to boolean
                    updated = true;
                    break;
                }
            }
            if (!updated) {
                console.warn('⚠️ FAVORITE Action - item not found in settings by link, cannot persist favorite state');
            }
        } catch (err) {
            console.error('❌ FAVORITE Action - failed syncing favorite state into settings:', err);
        }

        // Persist settings (writeFeedContent just re-saves current array without rebuilding objects)
        await plugin.writeFeedContent((current: any[]) => {
            console.log(`🔍 FAVORITE Action - saving ${current.length} feeds to storage (favorites synced by link)`);
            return current; // array already mutated in place
        });

        // Invalidate provider cache so new favorite state is visible immediately in views
        try {
            const localProvider: any = await plugin.providers.getById('local');
            if (localProvider?.invalidateCache) localProvider.invalidateCache();
        } catch(e) {
            console.debug('Cache invalidation skipped:', e);
        }
        
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
