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
import { copy, rssToMd } from "../functions";
import type { Item } from "../providers/Item";
import { pluginApi } from "@vanakat/plugin-api";

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
    // allow plain object or provider Item
    private readonly item: Item;
    // list of raw items for navigation
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

        if (!this.plugin.settings) return;

        const { hotkeys } = this.plugin.settings;

        const hotkeyActions: Array<[string, () => void]> = [
            [hotkeys.read, () => this.markAsRead()],
            [hotkeys.favorite, () => this.markAsFavorite()],
            [hotkeys.create, () => Action.CREATE_NOTE.processor(this.plugin, this.item)],
            [hotkeys.paste, () => Action.PASTE.processor(this.plugin, this.item)],
            [hotkeys.copy, () => Action.COPY.processor(this.plugin, this.item)],
            [hotkeys.open, () => Action.OPEN.processor(this.plugin, this.item)],
            [hotkeys.next, () => this.next()],
            [hotkeys.previous, () => this.previous()],
        ];

        for (const [key, handler] of hotkeyActions) {
            if (key) this.scope.register([], key, handler);
        }

        if (window['PluginApi'] && hotkeys.tts) {
            const tts = pluginApi("tts");
            if (tts) {
                this.scope.register([], hotkeys.tts, () => {
                    if (tts.isSpeaking()) {
                        tts.isPaused() ? tts.resume() : tts.pause();
                        return;
                    }
                    tts.say(this.item.title(), this.item.body());
                });
            }
        }
    }

    // move to earlier index
    public previous(): void {
        if (!this.items || this.items.length === 0) return;
        let index = this.items.findIndex((itm) => itm === this.item);
        index--;

        if (index >= 0 && index < this.items.length) {
            const target = this.items[index];
            if (target) {
                // Mark target as read (optimistic) before navigating
                this.plugin.itemStateService.toggleRead(target).catch(() => {});
                this.close();
                new ItemModal(this.plugin, target, this.items, this.save).open();
            }
        }
    }

    // move to later index
    public next(): void {
        if (!this.items || this.items.length === 0) return;
        let index = this.items.findIndex((itm) => itm === this.item);
        index++;
        
        if (index >= 0 && index < this.items.length) {
            const target = this.items[index];
            if (target) {
                this.plugin.itemStateService.toggleRead(target).catch(() => {});
                this.close();
                new ItemModal(this.plugin, target, this.items, this.save).open();
            }
        }
    }

    private getFavoriteState(): boolean {
        return !!(this.item.starred() );
    }

    private async markAsFavorite(): Promise<void> {
        const prev = this.getFavoriteState();
        // Optimista
        this.favoriteButton.buttonEl.toggleClass('is-favorite', !prev);

        try {
            const newFav = await this.plugin.itemStateService.toggleFavorite(this.item);
            this.favoriteButton.setTooltip(newFav ? t("remove_from_favorites") : t("mark_as_favorite"));
        } catch (e) {
            // revertir si falla
            this.favoriteButton.buttonEl.toggleClass('is-favorite', prev);
            console.warn('Favorite toggle failed', e);
        }
    }

    private async markAsRead(): Promise<void> {
        // idempotente
        if (this.item.read()) return;

        // UI optimista
        this.readButton.buttonEl.toggleClass('is-read', true);
        this.readButton.setIcon('eye-off');
        this.readButton.setTooltip(t("mark_as_unread"));

        try {
            await this.plugin.itemStateService.toggleRead(this.item);
            // (El servicio ya despacha eventos; elimina los dispatch manuales si es así)
        } catch (e) {
            // revertir si falla
            this.readButton.buttonEl.toggleClass('is-read', false);
            this.readButton.setIcon('eye');
            this.readButton.setTooltip(t("mark_as_read"));
            console.warn('Mark read failed', e);
        }
    }

    async display(): Promise<void> {
        this.modalEl.addClass("rss-modal");
        const { contentEl } = this;
        this.prepareContainer(contentEl);

        await this.buildTopButtons(contentEl);
        this.renderHeader(contentEl);

        const bodyHtml = this.getBodyHtml();
        const mediaContainer = contentEl.createDiv('rss-content');
        mediaContainer.addClass("rss-scrollable-content", "rss-selectable");
        this.renderMedia(mediaContainer);

        if (bodyHtml) {
            await this.renderBodyWithMarkdown(bodyHtml, mediaContainer);
            await this.embedYouTubeLinks(mediaContainer);
            await this.embedSocialLinks(mediaContainer);

            const excerptEl = contentEl.querySelector('.rss-excerpt');
            if (excerptEl) await this.embedSocialLinks(excerptEl as HTMLElement);

            this.applyHighlights(mediaContainer, contentEl);
            this.attachBodyInteractions(mediaContainer, contentEl);
        }
    }

    private prepareContainer(contentEl: HTMLElement): void {
        contentEl.empty();
        contentEl.style.height = "100%";
        contentEl.style.overflowY = "auto";
        contentEl.style.maxHeight = "80vh";
    }

    private async buildTopButtons(contentEl: HTMLElement): Promise<void> {
        const top = contentEl.createDiv('topButtons');
        Object.assign(top.style, {
            position: 'sticky', 
            top: '0', 
            backgroundColor: 'var(--background-primary)', 
            zIndex: '10',
            padding: '8px 0', 
            marginBottom: '12px'
        });

        // Base action set
        let actions = [Action.CREATE_NOTE, Action.PASTE, Action.COPY, Action.OPEN];

        if (this.save) {
            // Read button
            const initialRead = !!this.item.read();
            this.readButton = new ButtonComponent(top)
                .setIcon(initialRead ? 'eye-off' : 'eye')
                .setTooltip(initialRead ? t("mark_as_unread") : t("mark_as_read"))
                .onClick(async () => { await this.markAsRead(); });
            this.readButton.buttonEl.addClass("rss-button");
            this.readButton.buttonEl.setAttribute('tabindex','-1');
            this.readButton.buttonEl.toggleClass('is-read', initialRead);

            // Favorite button
            const initialFav = this.getFavoriteState();
            this.favoriteButton = new ButtonComponent(top)
                .setIcon('star')
                .setTooltip(initialFav ? t("remove_from_favorites") : t("mark_as_favorite"))
                .onClick(async () => { await this.markAsFavorite(); });
            this.favoriteButton.buttonEl.addClass("rss-button");
            this.favoriteButton.buttonEl.setAttribute('tabindex','-1');
            this.favoriteButton.buttonEl.toggleClass('is-favorite', initialFav);

            actions = [Action.TAGS, ...actions];
        }

        // Core actions
        actions.forEach(a => {
            const btn = new ButtonComponent(top)
                .setIcon(a.icon)
                .setTooltip(a.name)
                .onClick(async () => { await a.processor(this.plugin, this.item); });
            btn.buttonEl.addClass('rss-button');
            btn.buttonEl.setAttribute('tabindex','-1');
        });

        // TTS (plugin api)
        try {
            if (window['PluginApi']) {
                const tts = pluginApi('tts');
                if (tts) {
                    const ttsBtn = new ButtonComponent(top)
                        .setIcon('headphones')
                        .setTooltip(t('read_article_tts'))
                        .onClick(async () => {
                            const content = htmlToMarkdown(this.item.body());
                            await tts.say(this.item.title(), content, this.item.language());
                        });
                    ttsBtn.buttonEl.addClass('rss-button');
                }
            }
        } catch {}

        // Prev / Next
        new ButtonComponent(top)
            .setIcon('left-arrow-with-tail')
            .setTooltip(t('previous'))
            .onClick(() => this.previous())
            .buttonEl.addClass('rss-button');
        new ButtonComponent(top)
            .setIcon('right-arrow-with-tail')
            .setTooltip(t('next'))
            .onClick(() => this.next())
            .buttonEl.addClass('rss-button');

        // Auto mark on open (after buttons so state matches UI)
        try {
            if (this.plugin.settings.autoMarkOnOpen && !this.item.read() ) {
                await this.markAsRead();
            }
        } catch {}
    }

    private renderHeader(contentEl: HTMLElement): void {
        contentEl.createEl('h1', { cls: ['rss-title','rss-selectable'], text: this.item.title() });
        this.renderExcerpt(contentEl);
        
        // Subtitle (author + date)
        const subtitle = contentEl.createEl('h3','rss-subtitle');
        subtitle.addClass('rss-selectable');
        const authVal = this.item.author() ? this.item.author() : '';
        if (authVal) subtitle.appendText(authVal);
        // Obtain publication date
        if (this.item.pubDate() ) {
            const pd = this.item.pubDate();
            if (pd) subtitle.appendText(' - ' + window.moment(pd).format(this.plugin.settings.dateFormat));
        }

        // Tags
        const tags = this.item.tags() ? this.item.tags() : [];
        if (Array.isArray(tags) && tags.length) {
            const tagEl = contentEl.createSpan('tags');
            tags.forEach((tag: string) => {
                const tagA = tagEl.createEl('a');
                tagA.setText(tag);
                tagA.addClass('tag','rss-tag');
            });
        }
    }

    /**
     * Renders a cleaned and truncated excerpt from the item's description,
     * avoiding duplication with the body content.
     */
    private renderExcerpt(contentEl: HTMLElement): void {
        try {
            // Get raw description and return early if missing
            const rawDesc = this.item.description?.() ?? '';
            if (!rawDesc) return;

            // Remove scripts, styles, HTML tags, and extra whitespace
            const textDesc = rawDesc
                .replace(/<script[\s\S]*?<\/script>/gi, '')
                .replace(/<style[\s\S]*?<\/style>/gi, '')
                .replace(/<[^>]+>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
            if (!textDesc) return;

            // Get body HTML and strip tags for comparison
            const bodyHtml = this.getBodyHtml();
            const bodyStripped = (bodyHtml ?? '')
                .replace(/<[^>]+>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();

            // Avoid rendering excerpt if it's a duplicate of the body
            if (bodyStripped.slice(0, 300) === textDesc.slice(0, 300)) return;

            // Truncate and linkify excerpt, then render
            const excerpt = this.truncateWords(textDesc, 300);
            const p = contentEl.createEl('p', { cls: ['rss-excerpt', 'rss-selectable'] });
            p.innerHTML = this.linkify(excerpt);
        } catch (e) {
            console.warn('Excerpt render failed', e);
        }
    }

    private getBodyHtml(): string {
        const bodyText = this.item.body();
        if (bodyText && bodyText.trim().length > 0) {
            // Si es texto plano (no contiene etiquetas HTML), reemplazar \n por <br>
            if (!bodyText.includes('<') && bodyText.includes('\n')) {
                return bodyText.replace(/\n/g, '<br>');
            }
            return bodyText;
        }

        const descText = this.item.description();
        if (descText && descText.trim().length > 0) {
            if (!descText.includes('<') && descText.includes('\n')) {
                return descText.replace(/\n/g, '<br>');
            }
            return descText;
        }

        return '';
    }

    /**
     * Renders media content (audio, video, YouTube) in the provided container.
     */
    private renderMedia(container: HTMLElement): void {
        const enclosureLink = this.item.enclosureLink();
        const enclosureMime = (this.item.enclosureMime() || '').toString().toLowerCase();

        // Exit early if no enclosure link or media display is disabled
        if (!enclosureLink || !this.plugin.settings.displayMedia) return;

        // Render audio player if MIME type indicates audio
        if (enclosureMime.includes('audio')) {
            const audioElement = container.createEl('audio', { attr: { controls: 'controls' } });
            audioElement.createEl('source', { attr: { src: enclosureLink, type: enclosureMime } });
        }

        // Render video player if MIME type indicates video
        if (enclosureMime.includes('video')) {
            const videoElement = container.createEl('video', { attr: { controls: 'controls', width: '100%', height: '100%' } });
            videoElement.createEl('source', { attr: { src: enclosureLink, type: enclosureMime } });
        }

        // Special case: YouTube enclosure (id starts with 'yt:')
        const itemId = this.item.id().toString();
        if (enclosureLink && itemId.startsWith('yt:')) {
            container.createEl('iframe', {
                attr: {
                    type: 'text/html',
                    src: `https://www.youtube.com/embed/${enclosureLink}`,
                    width: '100%',
                    height: '100%',
                    allowFullscreen: 'true'
                }
            });
        }
    }

    private async renderBodyWithMarkdown(bodyHtml: string, target: HTMLElement): Promise<void> {
        const markdown = rssToMd(this.plugin, bodyHtml);
        await MarkdownRenderer.renderMarkdown(markdown, target, '', this.plugin);
    }

    private applyHighlights(content: HTMLElement, root: HTMLElement): void {
        const highlightsArr = this.item.highlights() || [];
        if (!Array.isArray(highlightsArr) || highlightsArr.length === 0) return;

        const walk = (node: Node | HTMLElement) => {
            if (node.nodeType === Node.TEXT_NODE) {
                highlightsArr.forEach((hl: string) => {
                    if (!hl) return;
                    let idx = node.textContent?.indexOf(hl);
                    if (idx !== undefined && idx > -1) {
                        const before = node.textContent!.slice(0, idx);
                        const after = node.textContent!.slice(idx + hl.length);

                        const frag = document.createDocumentFragment();
                        if (before) frag.appendChild(document.createTextNode(before));
                        const mark = document.createElement('mark');
                        mark.textContent = hl;
                        frag.appendChild(mark as Node);
                        if (after) frag.appendChild(document.createTextNode(after));

                        node.parentNode?.replaceChild(frag, node as Node);
                    }
                });
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                Array.from((node as Element).childNodes).forEach(walk);
            }
        };

        walk(content);
    }

    private attachBodyInteractions(content: HTMLElement, root: HTMLElement): void {
        // Link click open externally
        content.addEventListener('click', (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            const link = target.closest('a');
            if (link && (link as HTMLAnchorElement).href) {
                event.preventDefault();
                window.open((link as HTMLAnchorElement).href, '_blank', 'noopener,noreferrer');
            }
        });

        content.addEventListener('contextmenu', (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            if (target.closest('a')) return; // keep default link menu
            event.preventDefault();

            const selection = document.getSelection();
            if (!selection || selection.rangeCount === 0) return;
            const range = selection.getRangeAt(0);

            const div = root.createDiv();
            const htmlContent = range.cloneContents();
            div.appendChild(htmlContent.cloneNode(true));
            const selected = div.innerHTML;
            div.remove();

            const menu = new Menu();
            let previousHighlight: HTMLElement;
            try {
                if (this.item.highlights().includes(range.startContainer.parentElement.innerHTML)) previousHighlight = range.startContainer.parentElement as HTMLElement;
                if (!previousHighlight && this.item.highlights().includes(range.startContainer.parentElement?.parentElement?.innerHTML)) previousHighlight = range.startContainer.parentElement.parentElement as HTMLElement;
            } catch {}

            if (previousHighlight) {
                menu.addItem(mi => mi.setIcon('highlight-glyph').setTitle(t('highlight_remove')).onClick(async () => {
                    const repl = root.createSpan();
                    repl.innerHTML = previousHighlight.innerHTML;
                    previousHighlight.replaceWith(repl);
                    this.item.highlights().remove(previousHighlight.innerHTML);
                    const feedContents = this.plugin.settings.items;
                    await this.plugin.writeFeedContent(() => feedContents);
                }));
            } else if (selected.length > 0 && !this.item.highlights().includes(selected)) {
                menu.addItem(mi => mi.setIcon('highlight-glyph').setTitle(t('highlight')).onClick(async () => {
                    const newNode = root.createEl('mark');
                    newNode.innerHTML = selected;
                    range.deleteContents();
                    range.insertNode(newNode);
                    this.item.highlights().push(selected);
                    const feedContents = this.plugin.settings.items;
                    await this.plugin.writeFeedContent(() => feedContents);
                    this.removeDanglingElements(root);
                    this.removeDanglingElements(root);
                }));
            }

            if (selected.length > 0) {
                menu.addItem(mi => mi.setIcon('documents').setTitle(t('copy_to_clipboard')).onClick(async () => { await copy(selection.toString()); }));
                const pluginsManager = (window as any).app?.plugins;
                if (pluginsManager && pluginsManager.plugins['obsidian-tts']) {
                    menu.addItem(mi => mi.setIcon('headphones').setTitle(t('read_article_tts')).onClick(() => {
                        const ttsService = pluginsManager.plugins['obsidian-tts'].ttsService;
                        ttsService.say('', selection.toString());
                    }));
                }
            }

            menu.showAtMouseEvent(event);
        });
    }

    async onClose(): Promise<void> {
        const { contentEl } = this;
        contentEl.empty();

        // const feedContents = this.plugin.settings.items;
        // await this.plugin.writeFeedContent(() => feedContents, 250);
    }

    async onOpen(): Promise<void> {
        await this.display();
    }

    /**
     * Truncates the input text to a maximum number of characters,
     * ensuring it does not cut off in the middle of a word.
     * Adds an ellipsis at the end if truncated.
     */
    private truncateWords(text: string, maxChars: number): string {
        // If the text is already short enough, return as is
        if (text.length <= maxChars) {
            return text;
        }

        // Take a slice of the text up to maxChars minus one for the ellipsis
        let truncated = text.slice(0, maxChars - 1);
        const lastSpaceIndex = truncated.lastIndexOf(' ');
        if (lastSpaceIndex > 40) {
            truncated = truncated.slice(0, lastSpaceIndex);
        }

        return truncated.trimEnd() + '…';
    }

    private linkify(text: string): string {
        // Regex to match URLs not already inside an anchor tag
        const urlRegex = /((https?:\/\/)[\w.-]+(?:\/[\w\-._~:/?#@!$&'()*+,;=%]*)?)/gi;

        return text.replace(urlRegex, (url: string) => {
            // Avoid replacing URLs that are already part of an anchor tag
            // (simple check: if previous 10 chars contain 'href=' or 'src=' skip)
            const prev = text.substring(Math.max(0, text.indexOf(url) - 10), text.indexOf(url));
            if (/href=|src=/.test(prev)) return url;

            const safeUrl = url.replace(/"/g, '&quot;');
            const isTwitter = /twitter\.com|t\.co/.test(url);
            const cls = isTwitter ? 'rss-link twitter' : 'rss-link';

            return `<a href="${safeUrl}" target="_blank" rel="noopener" class="${cls}">${url}</a>`;
        });
    }

    private async embedYouTubeLinks(contentEl: HTMLElement): Promise<void> {
        // Helper to extract YouTube video ID from a URL
        const extractVideoId = (url: string): string | null => {
            const patterns = [
                /(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
                /youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]{11})/
            ];
            for (const pattern of patterns) {
                const match = url.match(pattern);
                if (match && match[1]) return match[1];
            }
            return null;
        };

        const youtubeLinks = Array.from(contentEl.querySelectorAll('a[href*="youtube.com"], a[href*="youtu.be"]')) as HTMLAnchorElement[];

        for (const link of youtubeLinks) {
            const href = link.href;
            const videoId = extractVideoId(href);

            if (!videoId) continue;

            // Skip if already embedded
            if (link.nextElementSibling?.classList.contains('youtube-embed')) continue;

            // Create embed container
            const embedContainer = link.ownerDocument.createElement('div');
            embedContainer.className = 'youtube-embed';
            embedContainer.style.margin = '20px auto';
            embedContainer.style.textAlign = 'center';
            embedContainer.style.maxWidth = '100%';

            // Create iframe
            const iframe = link.ownerDocument.createElement('iframe');
            iframe.style.width = '100%';
            iframe.style.maxWidth = '560px';
            iframe.style.height = '315px';
            iframe.style.border = 'none';
            iframe.style.borderRadius = '8px';
            iframe.src = `https://www.youtube.com/embed/${videoId}?rel=0`;
            iframe.setAttribute('allowfullscreen', 'true');
            iframe.setAttribute('frameborder', '0');

            embedContainer.appendChild(iframe as unknown as Node);

            // Insert after the link
            if (link.parentNode) {
                link.parentNode.insertBefore(embedContainer as unknown as Node, link.nextSibling);
            }
        }
    }

    private async embedSocialLinks(contentEl: HTMLElement): Promise<void> {
        const cfg = this.plugin.settings.socialEmbeds;
        if (!cfg?.enable) return;

        const allLinks = Array.from(contentEl.querySelectorAll('a[href]')) as HTMLAnchorElement[];

        const getHostname = (a: HTMLAnchorElement) => {
            try { return new URL(a.href).hostname.toLowerCase(); } catch { return ''; }
        };

        const twitterLinks = allLinks.filter(a => {
            const h = getHostname(a);
            return h.endsWith('twitter.com') || h === 'x.com' || h === 't.co';
        });

        const redditLinks = allLinks.filter(a => {
            const h = getHostname(a);
            return h === 'www.reddit.com' || h === 'old.reddit.com' || h === 'reddit.com';
        });

        const youtubeLinks = allLinks.filter(a => {
            const h = getHostname(a);
            return h.endsWith('youtube.com') || h === 'youtu.be';
        });

        const processLink = (el: HTMLAnchorElement, platform: 'twitter' | 'reddit') => {
            if (el.dataset.rssProcessed) return;
            el.dataset.rssProcessed = '1';

            let displayUrl = el.href;
            let boxTitle = platform === 'twitter' ? 'Twitter/X' : 'Reddit';

            if (platform === 'twitter' && cfg.twitterMode === 'nitter') {
                try {
                    const u = new URL(el.href);
                    const parts = u.pathname.split('/').filter(Boolean);
                    if (parts.length >= 3 && parts[1] === 'status') {
                        displayUrl = `${cfg.nitterInstance.replace(/\/$/, '')}/${parts[0]}/status/${parts[2]}`;
                    } else {
                        displayUrl = `${cfg.nitterInstance.replace(/\/$/, '')}${u.pathname}`;
                    }
                } catch {}
            } else if (platform === 'reddit' && cfg.redditMode === 'teddit') {
                try {
                    const u = new URL(el.href);
                    displayUrl = `${cfg.tedditInstance.replace(/\/$/, '')}${u.pathname}`;
                } catch {}
            }

            const wrap = el.ownerDocument.createElement('div');
            wrap.className = 'social-embed simple';
            wrap.style.cssText = 'margin:16px 0;padding:12px;border:1px solid var(--background-modifier-border);border-radius:8px;background:var(--background-secondary);';
            wrap.innerHTML = `<strong>${boxTitle}</strong><div style="margin-top:6px;word-break:break-word;">
                <a href="${displayUrl}" target="_blank" rel="noopener" class="rss-link">${displayUrl}</a>
                </div>`;
            el.parentNode?.insertBefore(wrap as unknown as Node, el.nextSibling);
        };

        twitterLinks.forEach(a => processLink(a, 'twitter'));
        redditLinks.forEach(a => processLink(a, 'reddit'));

        if (cfg.youtubeMode === 'invidious') {
            youtubeLinks.forEach(el => {
                if (el.dataset.rssInvidious) return;
                el.dataset.rssInvidious = '1';
                try {
                    let videoId = '';
                    if (el.href.includes('youtu.be/')) {
                        videoId = el.href.split('youtu.be/')[1].split(/[?&]/)[0];
                    } else if (el.href.includes('watch?v=')) {
                        const u = new URL(el.href);
                        videoId = u.searchParams.get('v') || '';
                    }
                    if (videoId) {
                        const base = cfg.invidiousInstance.replace(/\/$/, '');
                        el.href = `${base}/watch?v=${videoId}`;
                        el.textContent = el.href;
                    }
                } catch {}
            });
        }
    }

    private removeDanglingElements(el: HTMLElement): void {
        el.querySelectorAll('li, a, div, p, span').forEach(element => {
            if (element.innerHTML.trim() === '') {
                element.remove();
            }
        });
    }
}