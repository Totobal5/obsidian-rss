import {Notice, SearchComponent, Setting, TextComponent} from "obsidian";
import RssReaderPlugin from "../main";
import type {RssFeed} from "../settings/settings";
import {getFeedItems} from "../parser/rssParser";
import {isValidHttpUrl} from "../consts";
import {BaseModal} from "./BaseModal";
import t from "../l10n/locale";
import {FeedFolderSuggest} from "../view/FeedFolderSuggest";

export class FeedModal extends BaseModal {
    name: string;
    url: string;
    folder: string;

    saved = false;

    constructor(plugin: RssReaderPlugin, feed?: RssFeed) {
        super(plugin.app);

        if(feed) {
            this.name = feed.name;
            this.url = feed.url;
            this.folder = feed.folder;
        }
    }

    async display() : Promise<void> {
        const { contentEl } = this;

        contentEl.empty();

        let nameText: TextComponent;
        const name = new Setting(contentEl)
            .setName(t("name"))
            .setDesc(t("name_help"))
            .addText((text) => {
                nameText = text;
                text.setValue(this.name)
                    .onChange((value) => {
                        this.removeValidationError(text);
                       this.name = value;
                    });
            });
        name.controlEl.addClass("rss-setting-input");

        let urlText: TextComponent;
        const url = new Setting(contentEl)
            .setName("URL")
            .setDesc(t("url_help"))
            .addText((text) => {
                urlText = text;
                text.setValue(this.url)
                    .onChange(async(value) => {
                        this.removeValidationError(text);
                        this.url = value;

                    });
            });
        url.controlEl.addClass("rss-setting-input");

        new Setting(contentEl)
            .setName(t("folder"))
            .setDesc(t("folder_help"))
            .addSearch(async (search: SearchComponent) => {
                new FeedFolderSuggest(this.app, search.inputEl);
                search
                    .setValue(this.folder)
                    .setPlaceholder(t("no_folder"))
                    .onChange(async (value: string) => {
                        this.folder = value;
                    });
            });

        const footerEl = contentEl.createDiv();
        const footerButtons = new Setting(footerEl);
        footerButtons.addButton((b) => {
            b.setTooltip(t("save"))
                .setIcon("checkmark")
                .onClick(async () => {
                    let error = false;
                    if(!nameText.getValue().length) {
                        this.setValidationError(nameText, t("invalid_name"));
                        error = true;
                    }

                    if(!urlText.getValue().length) {
                        this.setValidationError(urlText, t("invalid_url"));
                        error = true;
                    }
                    if(!isValidHttpUrl(urlText.getValue())) {
                        this.setValidationError(urlText, t("invalid_url"));
                        error = true;
                    }else {
                        const items = await getFeedItems({name: "test", url: urlText.getValue(), folder: ""});
                        if(items.items.length == 0) {
                            this.setValidationError(urlText, t("invalid_feed"));
                            error = true;
                        }
                    }

                    if(error) {
                        new Notice(t("fix_errors"));
                        return;
                    }
                    this.saved = true;
                    this.close();
                });
            return b;
        });
        footerButtons.addExtraButton((b) => {
            b.setIcon("cross")
                .setTooltip(t("cancel"))
                .onClick(() => {
                    this.saved = false;
                    this.close();
                });
            return b;
        });
    }

    async onOpen() : Promise<void> {
        await this.display();
    }
}
