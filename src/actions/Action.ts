import {copy, createNewNote, openInBrowser, pasteToNote} from "../functions";
import RssReaderPlugin from "../main";
import {htmlToMarkdown, Notice} from "obsidian";
import {TagModal} from "../modals/TagModal";
import t from "../l10n/locale";
import {Item} from "../providers/Item";
import {RSS_EVENTS} from '../events';

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
            await plugin.settingsManager.writeFeedContentDebounced(()=>{},250);
        };
        modal.open();
        return Promise.resolve();
    })));

    static READ = new Action(t("mark_as_read_unread"), "eye", ((async (plugin, item) : Promise<void> => {
        const newState = await plugin.itemStateService.toggleRead(item as any);
        new Notice(newState ? t("marked_as_read") : t("marked_as_unread"));
        return Promise.resolve();
    })));

    static FAVORITE = new Action(t("mark_as_favorite_remove"), "star", ((async (plugin, item) : Promise<void> => {
        const newFav = await plugin.itemStateService.toggleFavorite(item as any);
        // Notice already shown inside service
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
