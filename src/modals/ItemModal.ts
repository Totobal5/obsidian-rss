import {
    ButtonComponent,
    htmlToMarkdown,
    MarkdownRenderer,
    Menu,
    Modal,
} from "obsidian";
import RssReaderPlugin from "../main";
import Action from "../actions/Action";
import t from "../l10n/locale";
import {copy, rssToMd} from "../functions";
import {Item} from "../providers/Item";
import {pluginApi} from "@vanakat/plugin-api";

// Declaraciones de tipos para Twitter
declare global {
    interface Window {
        twttr?: {
            widgets: {
                load: (element?: HTMLElement) => void;
            };
        };
    }
}

export class ItemModal extends Modal {

    private readonly plugin: RssReaderPlugin;
    private readonly item: Item;
    private readonly items: Item[];

    private readonly save: boolean;

    private readButton: ButtonComponent;
    private favoriteButton: ButtonComponent;

    constructor(plugin: RssReaderPlugin, item: Item, items: Item[], save = true) {
        super(plugin.app);
    this.plugin = plugin;
    this.items = items ?? [];
    this.item = item;
    this.save = save;


        if (this.save) {
            this.item.markRead(true);

            const feedContents = this.plugin.settings.items;
            this.plugin.writeFeedContent(() => {
                return feedContents;
            });

            if (!this.plugin.settings) {
                return;
            }

            if (this.plugin.settings.hotkeys.read) {
                this.scope.register([], this.plugin.settings.hotkeys.read, () => {
                    this.markAsRead();
                });
            }

            if (this.plugin.settings.hotkeys.favorite) {
                this.scope.register([], this.plugin.settings.hotkeys.favorite, () => {
                    this.markAsFavorite();
                });
            }

            if (this.plugin.settings.hotkeys.tags) {
                this.scope.register([], this.plugin.settings.hotkeys.tags, () => {
                    Action.TAGS.processor(this.plugin, this.item);
                });
            }
        }

        if (this.plugin.settings.hotkeys.create) {
            this.scope.register([], this.plugin.settings.hotkeys.create, () => {
                Action.CREATE_NOTE.processor(this.plugin, this.item);
            });
        }

        if (this.plugin.settings.hotkeys.paste) {
            this.scope.register([], this.plugin.settings.hotkeys.paste, () => {
                Action.PASTE.processor(this.plugin, this.item);
            });
        }

        if (this.plugin.settings.hotkeys.copy) {
            this.scope.register([], this.plugin.settings.hotkeys.copy, () => {
                Action.COPY.processor(this.plugin, this.item);
            });
        }

        if (this.plugin.settings.hotkeys.open) {
            this.scope.register([], this.plugin.settings.hotkeys.open, () => {
                Action.OPEN.processor(this.plugin, this.item);
            });
        }

        if (this.plugin.settings.hotkeys.next) {
            this.scope.register([], this.plugin.settings.hotkeys.next, () => {
                this.next();
            });
        }
        if (this.plugin.settings.hotkeys.previous) {
            this.scope.register([], this.plugin.settings.hotkeys.previous, () => {
                this.previous();
            });
        }
        if(window['PluginApi']) {
            const tts = pluginApi("tts");
            if (tts && this.plugin.settings.hotkeys.tts) {
                this.scope.register([], this.plugin.settings.hotkeys.tts, () => {
                    if (tts.isSpeaking()) {
                        if (tts.isPaused()) {
                            tts.resume();
                        } else {
                            tts.pause();
                        }
                        return;
                    }
                    const content = htmlToMarkdown(this.item.body());
                    tts.say(this.item.title(), content);
                });
            }
        }
    }

    previous(): void {
        if (!this.items || this.items.length === 0) return;
        let index = this.items.findIndex((item) => item === this.item);
        index++;
        if (index >= 0 && index < this.items.length) {
            const item = this.items[index];
            if (item !== undefined) {
                this.close();
                new ItemModal(this.plugin, item, this.items, this.save).open();
            }
        }
    }

    next(): void {
        if (!this.items || this.items.length === 0) return;
        let index = this.items.findIndex((item) => item === this.item);
        index--;
        if (index >= 0 && index < this.items.length) {
            const item = this.items[index];
            if (item !== undefined) {
                this.close();
                new ItemModal(this.plugin, item, this.items, this.save).open();
            }
        }
    }

    async markAsFavorite(): Promise<void> {
        await Action.FAVORITE.processor(this.plugin, this.item);
        this.favoriteButton.setIcon((this.item.starred()) ? 'star-glyph' : 'star');
        this.favoriteButton.setTooltip((this.item.starred()) ? t("remove_from_favorites") : t("mark_as_favorite"));
    }

    async markAsRead(): Promise<void> {
        await Action.READ.processor(this.plugin, this.item);
        this.readButton.setIcon((this.item.read()) ? 'eye-off' : 'eye');
        this.readButton.setTooltip((this.item.read()) ? t("mark_as_unread") : t("mark_as_unread"));
    }

    async display(): Promise<void> {
        this.modalEl.addClass("rss-modal");
        const {contentEl} = this;
        contentEl.empty();

        // Permitir scroll en el modal
        contentEl.style.height = "100%";
        contentEl.style.overflowY = "auto";
        contentEl.style.maxHeight = "80vh";

        const topButtons = contentEl.createDiv('topButtons');
        topButtons.style.position = "sticky";
        topButtons.style.top = "0";
        topButtons.style.backgroundColor = "var(--background-primary)";
        topButtons.style.zIndex = "10";
        topButtons.style.padding = "8px 0";
        topButtons.style.marginBottom = "12px";

        let actions = Array.of(Action.CREATE_NOTE, Action.PASTE, Action.COPY, Action.OPEN);

        if (this.save) {
            this.readButton = new ButtonComponent(topButtons)
                .setIcon(this.item.read ? 'eye-off' : 'eye')
                .setTooltip(this.item.read ? t("mark_as_unread") : t("mark_as_read"))
                .onClick(async () => {
                    await this.markAsRead();
                });
            this.readButton.buttonEl.setAttribute("tabindex", "-1");
            this.readButton.buttonEl.addClass("rss-button");

            this.favoriteButton = new ButtonComponent(topButtons)
                .setIcon(this.item.starred() ? 'star-glyph' : 'star')
                .setTooltip(this.item.starred() ? t("remove_from_favorites") : t("mark_as_favorite"))
                .onClick(async () => {
                    await this.markAsFavorite();
                });
            this.favoriteButton.buttonEl.setAttribute("tabindex", "-1");
            this.favoriteButton.buttonEl.addClass("rss-button");

            actions = Array.of(Action.TAGS, ...actions);
        }


        actions.forEach((action) => {
            const button = new ButtonComponent(topButtons)
                .setIcon(action.icon)
                .setTooltip(action.name)
                .onClick(async () => {
                    await action.processor(this.plugin, this.item);
                });
            button.buttonEl.setAttribute("tabindex", "-1");
            button.buttonEl.addClass("rss-button");
        });
        if(window['PluginApi']) {
            const tts = pluginApi("tts");
            if (tts) {
                const ttsButton = new ButtonComponent(topButtons)
                    .setIcon("headphones")
                    .setTooltip(t("read_article_tts"))
                    .onClick(async () => {
                        const content = htmlToMarkdown(this.item.body());
                        await tts.say(this.item.title, content, this.item.language());
                    });
                ttsButton.buttonEl.addClass("rss-button");
            }
        }

        const prevButton = new ButtonComponent(topButtons)
            .setIcon("left-arrow-with-tail")
            .setTooltip(t("previous"))
            .onClick(() => {
                this.previous();
            });
        prevButton.buttonEl.addClass("rss-button");

        const nextButton = new ButtonComponent(topButtons)
            .setIcon("right-arrow-with-tail")
            .setTooltip(t("next"))
            .onClick(() => {
                this.next();
            });
        nextButton.buttonEl.addClass("rss-button");

        contentEl.createEl('h1', {cls: ["rss-title", "rss-selectable"], text: this.item.title()});
        // description under title (even if also appears later)
        try {
            const rawDesc = (this.item.description && this.item.description()) || '';
            const textDesc = rawDesc
                .replace(/<script[\s\S]*?<\/script>/gi,'')
                .replace(/<style[\s\S]*?<\/style>/gi,'')
                .replace(/<[^>]+>/g,' ')
                .replace(/\s+/g,' ')
                .trim();
            if (textDesc) {
                const excerpt = this.truncateWords(textDesc, 300);
                const p = contentEl.createEl('p', {cls: ['rss-excerpt','rss-selectable']});
                p.innerHTML = this.linkify(excerpt);
            }
        } catch(_) {}

        const subtitle = contentEl.createEl("h3", "rss-subtitle");
        subtitle.addClass("rss-selectable");
        if (this.item.author()) {
            subtitle.appendText(this.item.author());
        }
        if (this.item.pubDate) {
            subtitle.appendText(" - " + window.moment(this.item.pubDate()).format(this.plugin.settings.dateFormat));
        }
        const tagEl = contentEl.createSpan("tags");
        this.item.tags().forEach((tag) => {
            const tagA = tagEl.createEl("a");
            tagA.setText(tag);
            tagA.addClass("tag", "rss-tag");
        });

        const content = contentEl.createDiv('rss-content');
        content.addClass("rss-scrollable-content", "rss-selectable");

        if (this.item.enclosureLink() && this.plugin.settings.displayMedia) {
            if (this.item.enclosureMime().toLowerCase().contains("audio")) {
                const audio = content.createEl("audio", {attr: {controls: "controls"}});
                audio.createEl("source", {attr: {src: this.item.enclosureLink(), type: this.item.enclosureMime()}});
            }
            if (this.item.enclosureMime().toLowerCase().contains("video")) {
                const video = content.createEl("video", {attr: {controls: "controls", width: "100%", height: "100%"}});
                video.createEl("source", {attr: {src: this.item.enclosureLink(), type: this.item.enclosureMime()}});
            }

            //embedded yt player
            if (this.item.enclosureLink() && typeof this.item.id() === "string" && (this.item.id() as string).startsWith("yt:")) {
                content.createEl("iframe", {
                    attr: {
                        type: "text/html",
                        src: "https://www.youtube.com/embed/" + this.item.enclosureLink(),
                        width: "100%",
                        height: "100%",
                        allowFullscreen: "true"
                    }
                });
            }
        }

        if (this.item.body()) {
            //prepend empty yaml to fix rendering errors
            const markdown = "---\n---" + rssToMd(this.plugin, this.item.body());

            await MarkdownRenderer.renderMarkdown(markdown, content, "", this.plugin);

            // Mejorar embeds de YouTube en el contenido
            await this.embedYouTubeLinks(content);
            
            // Crear embeds sociales después del renderizado
            await this.embedSocialLinks(content);
            
            // También procesar links que puedan estar en el excerpt
            const excerptEl = contentEl.querySelector('.rss-excerpt');
            if (excerptEl) {
                await this.embedSocialLinks(excerptEl as HTMLElement);
            }

            this.item.highlights().forEach(highlight => {
                if (content.innerHTML.includes(highlight)) {
                    const newNode = contentEl.createEl("mark");
                    newNode.innerHTML = highlight;
                    content.innerHTML = content.innerHTML.replace(highlight, newNode.outerHTML);
                    newNode.remove();
                } else {
                    console.log("Highlight not included");
                    console.log(highlight);
                }
            });

            // Permitir que los links funcionen correctamente
            content.addEventListener('click', (event) => {
                const target = event.target as HTMLElement;
                const link = target.closest('a');
                if (link && link.href) {
                    event.preventDefault();
                    window.open(link.href, '_blank', 'noopener,noreferrer');
                }
            });

            content.addEventListener('contextmenu', (event) => {
                // Solo preventDefault si no es un link
                const target = event.target as HTMLElement;
                if (!target.closest('a')) {
                    event.preventDefault();
                } else {
                    return; // Permitir comportamiento normal de links
                }

                const selection = document.getSelection();
                const range = selection.getRangeAt(0);

                const div = contentEl.createDiv();
                const htmlContent = range.cloneContents();
                const html = htmlContent.cloneNode(true);
                div.appendChild(html);
                const selected = div.innerHTML;
                div.remove();

                const menu = new Menu();

                let previousHighlight: HTMLElement;
                if (this.item.highlights().includes(range.startContainer.parentElement.innerHTML)) {
                    previousHighlight = range.startContainer.parentElement;
                }
                if (this.item.highlights().includes(range.startContainer.parentElement.parentElement.innerHTML)) {
                    previousHighlight = range.startContainer.parentElement.parentElement;
                }

                if(previousHighlight) {
                    menu.addItem(item => {
                        item
                            .setIcon("highlight-glyph")
                            .setTitle(t("highlight_remove"))
                            .onClick(async () => {
                                const replacement = contentEl.createSpan();
                                replacement.innerHTML = previousHighlight.innerHTML;
                                previousHighlight.replaceWith(replacement);
                                this.item.highlights().remove(previousHighlight.innerHTML);

                                const feedContents = this.plugin.settings.items;
                                await this.plugin.writeFeedContent(() => {
                                    return feedContents;
                                });
                            });
                    });
                }else if(!this.item.highlights().includes(selected) && selected.length > 0) {
                    menu.addItem(item => {
                        item
                            .setIcon("highlight-glyph")
                            .setTitle(t("highlight"))
                            .onClick(async () => {
                                const newNode = contentEl.createEl("mark");
                                newNode.innerHTML = selected;
                                range.deleteContents();
                                range.insertNode(newNode);
                                this.item.highlights().push(selected);

                                const feedContents = this.plugin.settings.items;
                                await this.plugin.writeFeedContent(() => {
                                    return feedContents;
                                });

                                //cleaning up twice to remove nested elements
                                this.removeDanglingElements(contentEl);
                                this.removeDanglingElements(contentEl);
                            });
                    });
                }

                if(selected.length > 0) {
                    menu
                        .addItem(item => {
                            item
                                .setIcon("documents")
                                .setTitle(t("copy_to_clipboard"))
                                .onClick(async () => {
                                    await copy(selection.toString());
                                });
                        });
                    //@ts-ignore
                    if (this.app.plugins.plugins["obsidian-tts"]) {
                        menu.addItem(item => {
                            item
                                .setIcon("headphones")
                                .setTitle(t("read_article_tts"))
                                .onClick(() => {
                                    //@ts-ignore
                                    const tts = this.app.plugins.plugins["obsidian-tts"].ttsService;
                                    tts.say("", selection.toString());
                                });
                        });
                    }
                }

                menu.showAtMouseEvent(event);
            });
        }
    }

    async onClose(): Promise<void> {
        const {contentEl} = this;
        contentEl.empty();

        const feedContents = this.plugin.settings.items;
        await this.plugin.writeFeedContent(() => {
            return feedContents;
        });
    }

    async onOpen(): Promise<void> {
        await this.display();
    }

    private truncateWords(text: string, maxChars: number): string {
        if (text.length <= maxChars) return text;
        let slice = text.slice(0, maxChars - 1);
        const lastSpace = slice.lastIndexOf(' ');
        if (lastSpace > 40) slice = slice.slice(0, lastSpace);
        return slice.trimEnd() + '…';
    }

    private linkify(text: string): string {
        // Simple URL to anchor conversion, preserve existing links and highlight twitter
        return text.replace(/(?<!href=")(?<!src=")(https?:\/\/[\w.-]+(?:\/[\w\-._~:/?#@!$&'()*+,;=%]*)?)/gi, (url) => {
            const safe = url.replace(/"/g,'&quot;');
            const cls = url.includes('twitter.com') || url.includes('t.co') ? 'rss-link twitter' : 'rss-link';
            return `<a href="${safe}" target="_blank" rel="noopener" class="${cls}">${url}</a>`;
        });
    }

    private async embedYouTubeLinks(contentEl: HTMLElement): Promise<void> {
        // Patrones para detectar links de YouTube
        const youtubePatterns = [
            /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/g,
            /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]{11})/g
        ];

        // Buscar todos los links de YouTube
        const allLinks = contentEl.querySelectorAll('a[href*="youtube.com"], a[href*="youtu.be"]');
        
        for (const link of Array.from(allLinks)) {
            const href = (link as HTMLAnchorElement).href;
            let videoId = '';
            
            // Extraer video ID usando los patrones
            for (const pattern of youtubePatterns) {
                const match = href.match(pattern);
                if (match && match[1]) {
                    videoId = match[1];
                    break;
                }
            }
            
            if (videoId) {
                // Verificar que no existe ya un embed para este video
                if (link.nextElementSibling?.classList.contains('youtube-embed')) {
                    continue;
                }

                // Crear el iframe embed
                const embedContainer = link.ownerDocument.createElement('div');
                embedContainer.className = 'youtube-embed';
                embedContainer.style.cssText = `
                    margin: 20px auto;
                    text-align: center;
                    max-width: 100%;
                `;

                const iframe = link.ownerDocument.createElement('iframe');
                iframe.style.cssText = `
                    width: 100%;
                    max-width: 560px;
                    height: 315px;
                    border: none;
                    border-radius: 8px;
                `;
                iframe.setAttribute('src', `https://www.youtube.com/embed/${videoId}?rel=0`);
                iframe.setAttribute('allowfullscreen', 'true');
                iframe.setAttribute('frameborder', '0');

                embedContainer.appendChild(iframe);
                
                // Insertar después del link
                if (link.parentNode) {
                    link.parentNode.insertBefore(embedContainer, link.nextSibling);
                }
            }
        }
    }

    private async embedSocialLinks(contentEl: HTMLElement): Promise<void> {
        // Definir patrones para todas las redes sociales
        const twitterOEmbedFn = (url: string) => `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&theme=dark&dnt=true&omit_script=true`;
        const instagramOEmbedFn = (url: string) => `https://graph.facebook.com/v18.0/instagram_oembed?url=${encodeURIComponent(url)}&access_token=YOUR_ACCESS_TOKEN`;
        const facebookOEmbedFn = (url: string) => `https://graph.facebook.com/v18.0/oembed_post?url=${encodeURIComponent(url)}&access_token=YOUR_ACCESS_TOKEN`;
        const tumblrOEmbedFn = (url: string) => `https://www.tumblr.com/oembed/1.0?url=${encodeURIComponent(url)}`;
        
        const socialPatterns = [
            {
                name: 'Twitter/X',
                icon: 'M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z',
                color: '#1da1f2',
                selectors: 'a[href*="twitter.com"], a[href*="x.com"], a[href*="t.co"]',
                urlPattern: /(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/,
                oembedUrl: twitterOEmbedFn
            },
            {
                name: 'Instagram',
                icon: 'M7.8 2c2.5 0 2.8 0 3.8.1 1.6.1 2.7.5 3.7 1.6 1 1 1.5 2.1 1.6 3.7.1 1 .1 1.3.1 3.8s0 2.8-.1 3.8c-.1 1.6-.5 2.7-1.6 3.7-1 1-2.1 1.5-3.7 1.6-1 .1-1.3.1-3.8.1s-2.8 0-3.8-.1c-1.6-.1-2.7-.5-3.7-1.6-1-1-1.5-2.1-1.6-3.7C2 13.8 2 13.5 2 11s0-2.8.1-3.8c.1-1.6.5-2.7 1.6-3.7 1-1 2.1-1.5 3.7-1.6C5.8 2 6.1 2 8.6 2h-.8zm0 1.8C6.3 3.8 6 3.8 5 3.9c-1.2.1-1.9.4-2.4.7-.4.2-.7.4-1 .7-.3.3-.5.6-.7 1-.3.5-.6 1.2-.7 2.4-.1 1-.1 1.3-.1 3.8s0 2.8.1 3.8c.1 1.2.4 1.9.7 2.4.2.4.4.7.7 1 .3.3.6.5 1 .7.5.3 1.2.6 2.4.7 1 .1 1.3.1 3.8.1s2.8 0 3.8-.1c1.2-.1 1.9-.4 2.4-.7.4-.2.7-.4 1-.7.3-.3.5-.6.7-1 .3-.5.6-1.2.7-2.4.1-1 .1-1.3.1-3.8s0-2.8-.1-3.8c-.1-1.2-.4-1.9-.7-2.4-.2-.4-.4-.7-.7-1-.3-.3-.6-.5-1-.7-.5-.3-1.2-.6-2.4-.7-1-.1-1.3-.1-3.8-.1zm0 5.4a3.8 3.8 0 110 7.6 3.8 3.8 0 010-7.6zm0 1.4a2.4 2.4 0 100 4.8 2.4 2.4 0 000-4.8zm4.8-2.2a.9.9 0 11-1.8 0 .9.9 0 011.8 0z',
                color: '#e4405f',
                selectors: 'a[href*="instagram.com/p/"], a[href*="instagram.com/reel/"], a[href*="instagram.com/tv/"]',
                urlPattern: /instagram\.com\/(p|reel|tv)\/([A-Za-z0-9_-]+)/,
                oembedUrl: instagramOEmbedFn
            },
            {
                name: 'Facebook',
                icon: 'M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z',
                color: '#4267B2',
                selectors: 'a[href*="facebook.com"]',
                urlPattern: /facebook\.com\/.*\/(posts|photos|videos)\/([0-9]+)/,
                oembedUrl: facebookOEmbedFn
            },
            {
                name: 'Tumblr',
                icon: 'M14.563 24c-5.093 0-7.031-3.756-7.031-6.411V9.747H5.116V6.648c3.63-1.313 4.512-4.596 4.71-6.469C9.84.051 9.941 0 9.999 0h3.517v6.114h4.801v3.633h-4.82v7.47c.016 1.001.375 2.371 2.207 2.371h.09c.631-.02 1.486-.205 1.936-.419l1.156 3.425c-.436.636-2.4 1.374-4.156 1.404h-.178l.011.002z',
                color: '#00cf35',
                selectors: 'a[href*="tumblr.com/post/"]',
                urlPattern: /([a-zA-Z0-9-]+)\.tumblr\.com\/post\/([0-9]+)/,
                oembedUrl: tumblrOEmbedFn
            },
            {
                name: 'Mastodon',
                icon: 'M23.268 5.313c-.35-2.578-2.617-4.61-5.304-5.004C17.51.242 15.792 0 11.813 0h-.03c-3.98 0-4.835.242-5.288.309C3.882.692 1.496 2.518.917 5.127.64 6.412.61 7.837.661 9.143c.074 1.874.088 3.745.26 5.611.118 1.24.325 2.47.62 3.68.55 2.237 2.777 4.098 4.96 4.857 2.336.792 4.849.923 7.256.38.265-.061.527-.132.786-.213.585-.184 1.27-.39 1.774-.753a.057.057 0 0 0 .023-.043v-1.809a.052.052 0 0 0-.02-.041.053.053 0 0 0-.046-.01 20.282 20.282 0 0 1-4.709.545c-2.73 0-3.463-1.284-3.674-1.818a5.593 5.593 0 0 1-.319-1.433.053.053 0 0 1 .066-.054c1.517.363 3.072.546 4.632.546.376 0 .75 0 1.125-.01 1.57-.044 3.224-.124 4.768-.422.038-.008.077-.015.11-.024 2.435-.464 4.753-1.92 4.989-5.604.008-.145.03-1.52.03-1.67.002-.512.167-3.63-.024-5.545zm-3.748 9.195h-2.561V8.29c0-1.309-.55-1.976-1.67-1.976-1.23 0-1.846.79-1.846 2.35v3.403h-2.546V8.663c0-1.56-.617-2.35-1.848-2.35-1.112 0-1.668.668-1.67 1.977v6.218H4.822V8.102c0-1.31.337-2.35 1.011-3.12.696-.77 1.608-1.164 2.74-1.164 1.311 0 2.302.5 2.962 1.498l.638 1.06.638-1.06c.66-.999 1.65-1.498 2.96-1.498 1.13 0 2.043.395 2.74 1.164.675.77 1.012 1.81 1.012 3.12z',
                color: '#6364ff',
                selectors: 'a[href*="mastodon"], a[href*="/@"]',
                urlPattern: /https?:\/\/([a-zA-Z0-9.-]+)\/(@[a-zA-Z0-9_]+)\/([0-9]+)/,
                oembedUrl: null // Mastodon no tiene oEmbed estándar
            }
        ];

        // Procesar cada red social
        for (const platform of socialPatterns) {
            const links = contentEl.querySelectorAll(platform.selectors);
            
            for (const link of Array.from(links)) {
                const href = (link as HTMLAnchorElement).href;
                const match = platform.urlPattern ? href.match(platform.urlPattern) : true;
                
                if (match) {
                    await this.createSocialEmbed(
                        link as HTMLElement, 
                        href, 
                        platform.name, 
                        platform.icon, 
                        platform.color,
                        platform.oembedUrl
                    );
                }
            }
        }
    }

    private async createSocialEmbed(
        linkElement: HTMLElement, 
        originalUrl: string, 
        platformName: string, 
        platformIcon: string, 
        platformColor: string,
        oembedUrlGenerator: ((url: string) => string) | null
    ): Promise<void> {
        try {
            // Verificar si ya existe un embed para este link
            if (linkElement.nextElementSibling?.classList.contains('social-embed')) {
                return;
            }

            // Crear el container del embed centrado
            const embedContainer = linkElement.ownerDocument.createElement('div');
            embedContainer.className = `social-embed ${platformName.toLowerCase().replace(/[^a-z]/g, '-')}-embed`;
            embedContainer.style.cssText = `
                margin: 20px auto;
                padding: 16px;
                border: 1px solid var(--background-modifier-border);
                border-radius: 12px;
                background: var(--background-secondary);
                max-width: 550px;
                position: relative;
                display: block;
                text-align: center;
            `;

            // Intentar obtener contenido rico via oEmbed (solo para plataformas que lo soporten)
            let embedContent = '';
            let hasRichContent = false;

            if (oembedUrlGenerator && (platformName === 'Twitter/X' || platformName === 'Tumblr')) {
                try {
                    const oembedUrl = oembedUrlGenerator(originalUrl);
                    
                    // Intentar varios métodos para obtener el contenido
                    const methods = [
                        // Método 1: AllOrigins proxy (más confiable)
                        async () => {
                            const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(oembedUrl)}`;
                            const response = await fetch(proxyUrl);
                            if (response.ok) {
                                const data = await response.json();
                                return JSON.parse(data.contents);
                            }
                            throw new Error('AllOrigins failed');
                        },
                        
                        // Método 2: CORS Anywhere (backup)
                        async () => {
                            const proxyUrl = `https://cors-anywhere.herokuapp.com/${oembedUrl}`;
                            const response = await fetch(proxyUrl, {
                                headers: { 'X-Requested-With': 'XMLHttpRequest' }
                            });
                            if (response.ok) return await response.json();
                            throw new Error('CORS Anywhere failed');
                        },

                        // Método 3: Direct oEmbed (puede fallar por CORS)
                        async () => {
                            const response = await fetch(oembedUrl);
                            if (response.ok) return await response.json();
                            throw new Error('Direct oEmbed failed');
                        }
                    ];

                    for (const method of methods) {
                        try {
                            const data = await method();
                            if (data.html) {
                                let cleanHtml = data.html
                                    .replace(/<script[^>]*>.*?<\/script>/gi, '')
                                    .replace(/<blockquote[^>]*twitter-tweet[^>]*>/gi, '<div class="tweet-content" style="padding: 12px; border-left: 3px solid var(--interactive-accent); margin: 8px 0;">')
                                    .replace(/<\/blockquote>/gi, '</div>')
                                    .replace(/<a[^>]*href="https:\/\/t\.co[^"]*"[^>]*>pic\.twitter\.com[^<]*<\/a>/gi, ''); // Remover links de imágenes de Twitter

                                // Para Twitter, extraer el contenido del tweet
                                if (platformName === 'Twitter/X') {
                                    // Limpiar el HTML y extraer solo el texto del tweet
                                    const tempDiv = document.createElement('div');
                                    tempDiv.innerHTML = cleanHtml;
                                    const tweetText = tempDiv.textContent?.replace(/https:\/\/t\.co\S*/g, '').trim() || '';
                                    
                                    embedContent = `
                                        <div class="embed-content">
                                            <div class="user-info">
                                                <span class="username">@${data.author_name || 'usuario'}</span>
                                            </div>
                                            <div class="post-text">${tweetText}</div>
                                            <div class="post-meta">${new Date().toLocaleDateString()}</div>
                                        </div>
                                    `;
                                } else {
                                    embedContent = `
                                        <div class="embed-content">
                                            ${cleanHtml}
                                        </div>
                                    `;
                                }
                                hasRichContent = true;
                                break;
                            }
                        } catch (e) {
                            console.log(`Embed method failed:`, e);
                            continue; // Probar siguiente método
                        }
                    }
                } catch (error) {
                    console.log('All oEmbed methods failed for', platformName, error);
                }
            }

            // Si no hay contenido rico, crear un embed básico pero atractivo
            if (!hasRichContent) {
                embedContent = this.createBasicEmbedContent(originalUrl, platformName);
            }

            // Construir el HTML completo del embed
            embedContainer.innerHTML = `
                <div class="platform-header">
                    <svg viewBox="0 0 24 24">
                        <path d="${platformIcon}" fill="${platformColor}"/>
                    </svg>
                    <span class="platform-name">${platformName}</span>
                    <span class="platform-badge">Publicación</span>
                </div>
                ${embedContent}
                <div class="embed-footer">
                    <a href="${originalUrl}" target="_blank" rel="noopener" class="view-original">
                        Ver en ${platformName}
                        <svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3m-2 16H5V5h7V3H5c-1.11 0-2 .89-2 2v14c0 1.11.89 2 2 2h14c1.11 0 2-.89 2-2v-7h-2v7Z"/>
                        </svg>
                    </a>
                </div>
            `;

            // Insertar el embed después del link original
            linkElement.parentNode?.insertBefore(embedContainer, linkElement.nextSibling);

            // Opcional: ocultar el link original
            linkElement.style.display = 'none';

        } catch (error) {
            console.error('Error creating social embed:', error);
            // En caso de error, mostrar un embed básico
            this.createFallbackEmbed(linkElement, originalUrl, platformName, platformColor);
        }
    }

    private createBasicEmbedContent(url: string, platformName: string): string {
        // Extraer información básica de la URL
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split('/').filter(Boolean);
        
        let contentPreview = '';
        
        switch (platformName) {
            case 'Twitter/X':
                const twitterUsername = pathParts[0];
                contentPreview = `
                    <div class="embed-content">
                        <div class="user-info">
                            <span class="username">@${twitterUsername}</span>
                        </div>
                        <div class="post-text">Ver este tweet para acceder al contenido completo</div>
                    </div>
                `;
                break;
                
            case 'Instagram':
                contentPreview = `
                    <div class="embed-content">
                        <div class="post-text">📸 Publicación de Instagram</div>
                        <div class="post-meta">Haz clic para ver fotos, videos y contenido</div>
                    </div>
                `;
                break;
                
            case 'Facebook':
                contentPreview = `
                    <div class="embed-content">
                        <div class="post-text">📱 Publicación de Facebook</div>
                        <div class="post-meta">Ver publicación completa en Facebook</div>
                    </div>
                `;
                break;
                
            case 'Tumblr':
                const blogName = urlObj.hostname.split('.')[0];
                contentPreview = `
                    <div class="embed-content">
                        <div class="user-info">
                            <span class="username">${blogName}</span>
                        </div>
                        <div class="post-text">🎨 Publicación de Tumblr</div>
                    </div>
                `;
                break;
                
            case 'Mastodon':
                const instance = urlObj.hostname;
                const mastodonUsername = pathParts[0];
                contentPreview = `
                    <div class="embed-content">
                        <div class="user-info">
                            <span class="username">${mastodonUsername}@${instance}</span>
                        </div>
                        <div class="post-text">🐘 Publicación en Mastodon</div>
                    </div>
                `;
                break;
                
            default:
                contentPreview = `
                    <div class="embed-content">
                        <div class="post-meta">Ver contenido en ${platformName}</div>
                    </div>
                `;
        }
        
        return contentPreview;
    }

    private createFallbackEmbed(linkElement: HTMLElement, url: string, platformName: string, color: string): void {
        const fallbackEmbed = linkElement.ownerDocument.createElement('div');
        fallbackEmbed.className = 'social-embed fallback';
        fallbackEmbed.innerHTML = `
            <div style="padding: 12px; border: 1px solid var(--background-modifier-border); border-radius: 8px; background: var(--background-secondary);">
                <div style="color: var(--text-normal); margin-bottom: 8px;">🔗 ${platformName}</div>
                <a href="${url}" target="_blank" rel="noopener" style="color: ${color}; text-decoration: none;">Ver publicación</a>
            </div>
        `;
        linkElement.parentNode?.insertBefore(fallbackEmbed, linkElement.nextSibling);
    }

    removeDanglingElements(el: HTMLElement) : void {
        //remove wallabag.xml dangling elements
        const lists = el.querySelectorAll('li, a, div, p, span');
        for (let i = 0; i < lists.length; i++) {
            const listEL = lists.item(i);
            if(listEL.innerHTML === '') {
                listEL.remove();
            }
        }
    }

}
