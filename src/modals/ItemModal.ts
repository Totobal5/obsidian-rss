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
import type {Item} from "../providers/Item";
import {pluginApi} from "@vanakat/plugin-api";
import {RSS_EVENTS} from '../events';

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
    private readonly item: any; // allow plain object or provider Item
    private readonly items: any[]; // list of raw items for navigation
    private readonly save: boolean;
    private readButton: ButtonComponent;
    private favoriteButton: ButtonComponent;

    constructor(plugin: RssReaderPlugin, item: Item, items: Item[], save = true) {
        super(plugin.app);
        this.plugin = plugin;
        this.items = items ?? [];
        this.item = item;
        this.save = save;
    // Ya no marcamos como leído aquí (opción 2): se hará en onOpen para centralizar eventos/servicios.

        if (!this.plugin.settings) return;

        if (this.plugin.settings.hotkeys.read) {
            this.scope.register([], this.plugin.settings.hotkeys.read, () => this.markAsRead());
        }
        if (this.plugin.settings.hotkeys.favorite) {
            this.scope.register([], this.plugin.settings.hotkeys.favorite, () => this.markAsFavorite());
        }
        if (this.plugin.settings.hotkeys.create) {
            this.scope.register([], this.plugin.settings.hotkeys.create, () => Action.CREATE_NOTE.processor(this.plugin, this.item));
        }
        if (this.plugin.settings.hotkeys.paste) {
            this.scope.register([], this.plugin.settings.hotkeys.paste, () => Action.PASTE.processor(this.plugin, this.item));
        }
        if (this.plugin.settings.hotkeys.copy) {
            this.scope.register([], this.plugin.settings.hotkeys.copy, () => Action.COPY.processor(this.plugin, this.item));
        }
        if (this.plugin.settings.hotkeys.open) {
            this.scope.register([], this.plugin.settings.hotkeys.open, () => Action.OPEN.processor(this.plugin, this.item));
        }
        if (this.plugin.settings.hotkeys.next) {
            this.scope.register([], this.plugin.settings.hotkeys.next, () => this.next());
        }
        if (this.plugin.settings.hotkeys.previous) {
            this.scope.register([], this.plugin.settings.hotkeys.previous, () => this.previous());
        }
        if (window['PluginApi']) {
            const tts = pluginApi("tts");
            if (tts && this.plugin.settings.hotkeys.tts) {
                this.scope.register([], this.plugin.settings.hotkeys.tts, () => {
                    if (tts.isSpeaking()) {
                        if (tts.isPaused()) tts.resume(); else tts.pause();
                        return;
                    }
                    const content = htmlToMarkdown(typeof (this.item as any).body === 'function' ? (this.item as any).body() : (this.item as any).body || '');
                    const titleVal = typeof (this.item as any).title === 'function' ? (this.item as any).title() : (this.item as any).title;
                    tts.say(titleVal, content);
                });
            }
        }
    }

    private valueOrFn(v:any){
        try {
            if (typeof v === 'function') {
                try { return v.call(this.item); } catch { return v(); }
            }
            return v;
        } catch { return v; }
    }

    previous(): void { // move to earlier index
        if (!this.items || this.items.length === 0) return;
    let index = this.items.findIndex((itm) => itm === this.item);
        index--;
        if (index >= 0 && index < this.items.length) {
            const target = this.items[index];
            if (target) {
                this.markItemReadAndPersist(target).then(() => {
                    this.close();
                    new ItemModal(this.plugin, target, this.items, this.save).open();
                });
            }
        }
    }

    next(): void { // move to later index
        if (!this.items || this.items.length === 0) return;
    let index = this.items.findIndex((itm) => itm === this.item);
        index++;
        if (index >= 0 && index < this.items.length) {
            const target = this.items[index];
            if (target) {
                this.markItemReadAndPersist(target).then(() => {
                    this.close();
                    new ItemModal(this.plugin, target, this.items, this.save).open();
                });
            }
        }
    }

    /** Marca un item como leído si no lo está y persiste + evento para refrescar contadores */
    private async markItemReadAndPersist(target: Item): Promise<void> {
        try {
            const raw = (target as any).item || target;
            if (!raw.read) {
                raw.read = true;
                if (target.markRead) target.markRead(true);
                // Sincronizar dentro de settings por link
                outer: for (const feedContent of this.plugin.settings.items) {
                    if (!feedContent || !Array.isArray(feedContent.items)) continue;
                    for (const i of feedContent.items) {
                        if (i.link === raw.link) { i.read = true; break outer; }
                    }
                }
                await this.plugin.writeFeedContent(arr => arr);
                try {
                    const localProvider: any = await this.plugin.providers.getById('local');
                    localProvider?.invalidateCache && localProvider.invalidateCache();
                } catch {}
                try { document.dispatchEvent(new CustomEvent(RSS_EVENTS.UNREAD_COUNTS_CHANGED)); } catch {}
                try { document.dispatchEvent(new CustomEvent(RSS_EVENTS.ITEM_READ_UPDATED, {detail:{link: raw.link, read: true}})); } catch {}
            }
        } catch (e) { console.warn('Failed to auto-mark read on navigation', e); }
    }

    private getFavoriteState(): boolean {
    return !!(this.item.favorite ?? this.valueOrFn(this.item.favorite));
    }

    async markAsFavorite(): Promise<void> {
        // Access the raw item data directly
    await Action.FAVORITE.processor(this.plugin, this.item);
    const fav = this.getFavoriteState();
    this.favoriteButton.setIcon('star');
    this.favoriteButton.setTooltip(fav ? t("remove_from_favorites") : t("mark_as_favorite"));
    this.favoriteButton.buttonEl.toggleClass('is-favorite', fav);
    try { document.dispatchEvent(new CustomEvent(RSS_EVENTS.FAVORITE_UPDATED)); } catch {}
    }

    private async refreshMainView(): Promise<void> {
        // Encontrar y refrescar solo el contador de la vista principal de RSS
        const views = this.plugin.app.workspace.getLeavesOfType('RSS_FEED');
        for (const view of views) {
            if (view.view && 'updateFavoritesCounter' in view.view) {
                console.log(`🔍 Updating main RSS view favorites counter after favorite change`);
                await (view.view as any).updateFavoritesCounter();
            }
        }
    }

    async markAsRead(): Promise<void> {
    await Action.READ.processor(this.plugin, this.item);
    const isRead = !!this.item.read;
    this.readButton.setIcon(isRead ? 'eye-off' : 'eye');
    this.readButton.setTooltip(isRead ? t("mark_as_unread") : t("mark_as_read"));
    this.readButton.buttonEl.toggleClass('is-read', isRead);
    try { document.dispatchEvent(new CustomEvent(RSS_EVENTS.ITEM_READ_UPDATED)); } catch {}
    try { document.dispatchEvent(new CustomEvent(RSS_EVENTS.UNREAD_COUNTS_CHANGED)); } catch {}
    }

    async display(): Promise<void> {
        // Debug: Estado inicial del item al abrir modal
    // Clean display – remove noisy debug logs
        
        this.modalEl.addClass("rss-modal");
        const {contentEl} = this;
        contentEl.empty();

        // Permitir scroll en el modal
        contentEl.style.height = "100%";
        contentEl.style.overflowY = "auto";
        contentEl.style.maxHeight = "80vh";

    const topButtons = contentEl.createDiv('top-buttons');
        topButtons.style.position = "sticky";
        topButtons.style.top = "0";
        topButtons.style.backgroundColor = "var(--background-primary)";
        topButtons.style.zIndex = "10";
        topButtons.style.padding = "8px 0";
        topButtons.style.marginBottom = "12px";

        let actions = Array.of(Action.CREATE_NOTE, Action.PASTE, Action.COPY, Action.OPEN);

        if (this.save) {
            const rawItem = (this.item as any).item || this.item;
            const initialRead = !!rawItem.read;
            this.readButton = new ButtonComponent(topButtons)
                .setIcon(initialRead ? 'eye-off' : 'eye')
                .setTooltip(initialRead ? t("mark_as_unread") : t("mark_as_read"))
                .onClick(async () => {
                    await this.markAsRead();
                });
            this.readButton.buttonEl.setAttribute("tabindex", "-1");
            this.readButton.buttonEl.addClass("rss-button");
            this.readButton.buttonEl.toggleClass('is-read', initialRead);

            const initialFav = this.getFavoriteState();
            this.favoriteButton = new ButtonComponent(topButtons)
                .setIcon('star')
                .setTooltip(initialFav ? t("remove_from_favorites") : t("mark_as_favorite"))
                .onClick(async () => {
                    await this.markAsFavorite();
                });
            this.favoriteButton.buttonEl.setAttribute("tabindex", "-1");
            this.favoriteButton.buttonEl.addClass("rss-button");
            this.favoriteButton.buttonEl.toggleClass('is-favorite', initialFav);

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

        // autoMarkOnOpen: mark unread items as read immediately when modal opens
        try {
            const raw = (this.item as any).item || this.item;
            if (this.plugin.settings.autoMarkOnOpen && !raw.read) {
                await this.markAsRead();
            }
        } catch {}
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

    contentEl.createEl('h1', {cls: ["rss-title", "rss-selectable"], text: this.valueOrFn(this.item.title)});
        // description under title (even if also appears later)
        try {
            // Fallback chain: body() / body prop -> content / content() -> description
            const bodyRawFallback = this.item.body ? this.valueOrFn(this.item.body)
                : (this.item.content ? this.valueOrFn(this.item.content)
                    : (this.item.description ? this.valueOrFn(this.item.description) : ''));
            const rawDesc = this.item.description ? this.valueOrFn(this.item.description) : '';
            const textDesc = rawDesc
                .replace(/<script[\s\S]*?<\/script>/gi,'')
                .replace(/<style[\s\S]*?<\/style>/gi,'')
                .replace(/<[^>]+>/g,' ')
                .replace(/\s+/g,' ')
                .trim();
            const bodyHtml = bodyRawFallback;
            const bodyStripped = (bodyHtml||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
            // Mostrar excerpt solo si difiere del cuerpo (para evitar duplicación)
            if (textDesc && bodyStripped && bodyStripped.slice(0,300) !== textDesc.slice(0,300)) {
                const excerpt = this.truncateWords(textDesc, 300);
                const p = contentEl.createEl('p', {cls: ['rss-excerpt','rss-selectable']});
                p.innerHTML = this.linkify(excerpt);
            }
        } catch(error) {
            console.warn('Failed to process item content for display:', error);
        }

        const subtitle = contentEl.createEl("h3", "rss-subtitle");
        subtitle.addClass("rss-selectable");
    const authVal = this.item.author ? this.valueOrFn(this.item.author) : '';
    if (authVal) subtitle.appendText(authVal);
        if (this.item.pubDate) {
            const pd = this.valueOrFn(this.item.pubDate);
            if (pd) subtitle.appendText(" - " + window.moment(pd).format(this.plugin.settings.dateFormat));
        }
        const tagEl = contentEl.createSpan("tags");
        const tagsArr = this.item.tags ? this.valueOrFn(this.item.tags) : [];
        tagsArr.forEach((tag: string) => {
            const tagA = tagEl.createEl("a");
            tagA.setText(tag);
            tagA.addClass("tag", "rss-tag");
        });

        const content = contentEl.createDiv('rss-content');
        content.addClass("rss-scrollable-content", "rss-selectable");

    const encLink = this.item.enclosureLink ? this.valueOrFn(this.item.enclosureLink) : null;
    const encMime = this.item.enclosureMime ? (this.valueOrFn(this.item.enclosureMime) || '').toString() : '';
        if (encLink && this.plugin.settings.displayMedia) {
            const mimeLower = encMime.toLowerCase();
            if (mimeLower.includes("audio")) {
                const audio = content.createEl("audio", {attr: {controls: "controls"}});
                audio.createEl("source", {attr: {src: encLink, type: encMime}});
            }
            if (mimeLower.includes("video")) {
                const video = content.createEl("video", {attr: {controls: "controls", width: "100%", height: "100%"}});
                video.createEl("source", {attr: {src: encLink, type: encMime}});
            }

            //embedded yt player
            const idVal2 = this.item.id ? this.valueOrFn(this.item.id) : '';
            if (encLink && typeof idVal2 === "string" && idVal2.startsWith("yt:")) {
                content.createEl("iframe", {
                    attr: {
                        type: "text/html",
                        src: "https://www.youtube.com/embed/" + encLink,
                        width: "100%",
                        height: "100%",
                        allowFullscreen: "true"
                    }
                });
            }
        }

    const bodyVal = this.item.body ? this.valueOrFn(this.item.body)
            : (this.item.content ? this.valueOrFn(this.item.content)
                : (this.item.description ? this.valueOrFn(this.item.description) : ''));
        if (bodyVal) {
            //prepend empty yaml to fix rendering errors
            const markdown = "---\n---" + rssToMd(this.plugin, bodyVal);

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

            const highlightsArr = this.item.highlights ? this.valueOrFn(this.item.highlights) : [];
            highlightsArr.forEach((highlight: string) => {
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
            content.addEventListener('click', (event: MouseEvent) => {
                const target = event.target as HTMLElement;
                const link = target.closest('a');
                if (link && link.href) {
                    event.preventDefault();
                    window.open(link.href, '_blank', 'noopener,noreferrer');
                }
            });

            content.addEventListener('contextmenu', (event: MouseEvent) => {
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
        // Opción 2: marcar leído al abrir (antes de render) sólo si 'save' y aún no leído.
        try {
            if (this.save && !this.item.read) {
                if (this.plugin.itemStateService) {
                    // Usar acción estándar (emitirá eventos internos) y actualizar UI.
                    try { await Action.READ.processor(this.plugin, this.item); } catch {}
                } else {
                    // Fallback ligero sin dependencias.
                    this.item.read = true;
                    if (typeof this.item.markRead === 'function') this.item.markRead(true);
                    try { document.dispatchEvent(new CustomEvent(RSS_EVENTS.ITEM_READ_UPDATED)); } catch {}
                    try { document.dispatchEvent(new CustomEvent(RSS_EVENTS.UNREAD_COUNTS_CHANGED)); } catch {}
                }
            }
        } catch {}
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

                (embedContainer as any).appendChild(iframe as any);
                
                // Insertar después del link
                if (link.parentNode) {
                    (link.parentNode as any).insertBefore(embedContainer, link.nextSibling as any);
                }
            }
        }
    }

    private async embedSocialLinks(contentEl: HTMLElement): Promise<void> {
        const cfg = this.plugin.settings.socialEmbeds;
        if (!cfg || !cfg.enable) return; // feature disabled

        // Seleccionamos todos y filtramos por hostname para evitar falsos positivos (ej: 'reddit.com' contiene la subcadena 't.co')
        const allLinks = Array.from(contentEl.querySelectorAll('a[href]')) as HTMLAnchorElement[];
        const twitterLinks = allLinks.filter(a => {
            try { const h = new URL(a.href).hostname.toLowerCase(); return h.endsWith('twitter.com') || h === 'x.com' || h === 't.co'; } catch { return false; }
        });
        const redditLinks = allLinks.filter(a => {
            try { const h = new URL(a.href).hostname.toLowerCase(); return h === 'www.reddit.com' || h === 'old.reddit.com' || h === 'reddit.com'; } catch { return false; }
        });
	const youtubeLinks = allLinks.filter(a => {
            try { const h = new URL(a.href).hostname.toLowerCase(); return h.endsWith('youtube.com') || h === 'youtu.be'; } catch { return false; }
        });

        const processLink = (el: HTMLAnchorElement, platform: 'twitter'|'reddit') => {
            if (el.dataset['rssProcessed']) return;
            el.dataset['rssProcessed'] = '1';
            let displayUrl = el.href;
            let boxTitle = '';
            if (platform === 'twitter') {
                boxTitle = 'Twitter/X';
                if (cfg.twitterMode === 'nitter') {
                    try {
                        const u = new URL(el.href);
                        const parts = u.pathname.split('/').filter(Boolean);
                        if (parts.length >= 3 && parts[1] === 'status') {
                            displayUrl = `${cfg.nitterInstance.replace(/\/$/,'')}/${parts[0]}/status/${parts[2]}`;
                        } else {
                            displayUrl = `${cfg.nitterInstance.replace(/\/$/,'')}${u.pathname}`;
                        }
                    } catch {}
                }
            } else if (platform === 'reddit') {
                boxTitle = 'Reddit';
                if (cfg.redditMode === 'teddit') {
                    try {
                        const u = new URL(el.href);
                        displayUrl = `${cfg.tedditInstance.replace(/\/$/,'')}${u.pathname}`;
                    } catch {}
                }
            }

            // Crear contenedor básico (sin fetch)
            const wrap = el.ownerDocument.createElement('div');
            wrap.className = 'social-embed simple';
            wrap.style.cssText = 'margin:16px 0;padding:12px;border:1px solid var(--background-modifier-border);border-radius:8px;background:var(--background-secondary);';
            wrap.innerHTML = `<strong>${boxTitle}</strong><div style="margin-top:6px;word-break:break-word;">`+
                `<a href="${displayUrl}" target="_blank" rel="noopener" class="rss-link">${displayUrl}</a>`+
                `</div>`;
            if (el.parentNode) (el.parentNode as any).insertBefore(wrap, el.nextSibling as any);
        };

    twitterLinks.forEach(a => processLink(a,'twitter'));
    redditLinks.forEach(a => processLink(a,'reddit'));
        if (cfg.youtubeMode === 'invidious') {
            youtubeLinks.forEach(a => {
                const el = a as HTMLAnchorElement;
                if (el.dataset['rssInvidious']) return;
                el.dataset['rssInvidious'] = '1';
                try {
                    let videoId = '';
                    if (el.href.includes('youtu.be/')) {
                        videoId = el.href.split('youtu.be/')[1].split(/[?&]/)[0];
                    } else if (el.href.includes('watch?v=')) {
                        const u = new URL(el.href);
                        videoId = u.searchParams.get('v') || '';
                    }
                    if (videoId) {
                        const base = cfg.invidiousInstance.replace(/\/$/,'');
                        el.href = `${base}/watch?v=${videoId}`;
                        el.textContent = el.href; // actualizar texto para claridad
                    }
                } catch {}
            });
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
        // Legacy stub retained for potential future rich embed support.
        if (this.plugin.settings?.socialEmbeds?.suppressErrors !== false) {
            // silently ignore
            return;
        }
        console.debug('Rich social embed disabled (stub called)', {originalUrl, platformName});
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
    if (linkElement.parentNode) (linkElement.parentNode as any).insertBefore(fallbackEmbed, linkElement.nextSibling as any);
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
