import {setIcon, ItemView, WorkspaceLeaf} from "obsidian";
import RssReaderPlugin from "../main";
import {VIEW_ID} from "../consts";
import t from "../l10n/locale";
import {ItemModal} from "../modals/ItemModal";
import {Feed} from "../providers/Feed";
import Action from "../actions/Action";
import {RSS_EVENTS} from '../events';

export default class ViewLoader extends ItemView {
    private readonly plugin: RssReaderPlugin;
    private contentContainer: HTMLDivElement;
    private resizeObserver?: ResizeObserver;
    private layoutRoot?: HTMLDivElement;

    constructor(leaf: WorkspaceLeaf, plugin: RssReaderPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getDisplayText(): string {
        return t("RSS_Feeds");
    }

    getViewType(): string {
        return VIEW_ID;
    }

    getIcon(): string {
        return "rss";
    }

    protected async onOpen(): Promise<void> {
        // Usar el contenedor estándar de Obsidian para asegurar responsividad
        const container = this.containerEl.children[1] as HTMLElement; // .view-content
        container.empty();
        container.addClass('rss-view-container');
        this.contentContainer = container.createDiv({cls: 'rss-scrollable-content'});

        // Resize observer para adaptar layout al ancho del panel (no solo viewport)
        this.resizeObserver = new ResizeObserver(() => this.applyResponsiveClass());
        this.resizeObserver.observe(this.contentContainer);

        // Acción de refrescar usando la barra de acciones estándar
        this.addAction('refresh-cw', t('refresh_feeds'), async () => {
            await this.displayData();
        });

        await this.displayData();
    }

    protected async onClose(): Promise<void> {
        if (this.resizeObserver) {
            try { 
                this.resizeObserver.disconnect(); 
            } catch(error) {
                console.warn('Failed to disconnect resize observer:', error);
            }
            this.resizeObserver = undefined;
        }
    }

    private async displayData() {
        const displayStart = performance.now();
        console.log("📊 RSS View: Starting display data...");
        
        this.contentContainer.empty();
        // crear layout root separado para que querySelector funcione y evitar mezclar clases
        this.layoutRoot = this.contentContainer.createDiv({cls: 'rss-fr-layout'});
        const root = this.layoutRoot;

        const subsPane = root.createDiv({cls: 'rss-fr-subs'});
        const listPane = root.createDiv({cls: 'rss-fr-list'});
        // Detail pane not used for now, kept for future optional preview
        const detailPane = root.createDiv({cls: 'rss-fr-detail hidden'});

        const providerStart = performance.now();
        const provider = this.plugin.providers.getCurrent();
        
        // Si ya tenemos feeds cacheados, usarlos directamente para las carpetas
        let folders: any[] = [];
        try {
            folders = await provider.folders();
        } catch (error) {
            console.error("❌ Error loading folders:", error);
            folders = [];
        }
        console.log(`🗂️  Folders loaded in ${(performance.now() - providerStart).toFixed(2)}ms`);

    // Botón global (arriba) para marcar absolutamente todos como leídos
    const markAllGlobal = subsPane.createDiv({cls:'rss-mark-all-global'});
    const markAllGlobalIcon = markAllGlobal.createSpan();
    setIcon(markAllGlobalIcon, 'check');
        markAllGlobalIcon.style.marginRight='6px';
    markAllGlobal.createSpan({text: t('mark_all_as_read')});
    // Tooltip + accesibilidad
    const globalLabel = t('mark_all_as_read');
    markAllGlobal.setAttribute('title', globalLabel);
    markAllGlobal.setAttribute('aria-label', globalLabel);

    // Agregar botón "All Feeds" debajo
    const allFeedsButton = subsPane.createDiv({cls: 'rss-all-feeds-button'});
        const globeIcon = allFeedsButton.createSpan();
        setIcon(globeIcon, 'globe');
        globeIcon.style.marginRight = '8px';
        
        // All feeds inicial - obtener todos los feeds para el botón global
        const globalFeedsList: any[] = [];
        for (const f of folders) globalFeedsList.push(...f.feeds());
        
    // Contar total de entradas no leídas inicialmente
    const totalUnread = globalFeedsList.reduce((total, feed) => total + (feed.items()?.filter((i:any)=> !i.read || !i.read())?.length || 0), 0);
    allFeedsButton.createSpan({text: `All Feeds (${totalUnread})`});
        
        allFeedsButton.onclick = () => {
            // Remover clase active de otros elementos
            subsPane.querySelectorAll('.active').forEach(el => el.removeClass('active'));
            allFeedsButton.addClass('active');
            this.renderList(listPane, detailPane, globalFeedsList);
        };

        markAllGlobal.onclick = async () => {
            try {
                for (const feedContent of (this.plugin.settings.items||[])) {
                    if (Array.isArray(feedContent.items)) for (const raw of feedContent.items) raw.read = true;
                }
                await this.plugin.writeFeedContentDebounced(()=>{}, 250);
                try { document.dispatchEvent(new CustomEvent(RSS_EVENTS.UNREAD_COUNTS_CHANGED)); } catch {}
                this.refreshSidebarCounts();
                if (allFeedsButton.hasClass && allFeedsButton.hasClass('active')) this.renderList(listPane, detailPane, globalFeedsList);
            } catch(e){ console.warn('Mark all (global) failed', e); }
        };

        // Agregar categoría de Favoritos
        const favoritesButton = subsPane.createDiv({cls: 'rss-favorites-button'});
        const starIcon = favoritesButton.createSpan();
        setIcon(starIcon, 'star');
        starIcon.style.marginRight = '8px';
        
        // Count favorites directly from persisted settings (single source of truth)
        const persistedFavoriteCount = (this.plugin.settings.items || []).reduce((acc, feed) => {
            if (!feed || !Array.isArray(feed.items)) return acc;
            return acc + feed.items.filter(it => it.favorite === true).length;
        }, 0);
        console.log(`🔍 Found ${persistedFavoriteCount} persisted favorite items`);
        favoritesButton.createSpan({text: `Favorites (${persistedFavoriteCount})`});
        
        favoritesButton.onclick = () => {
            // Remover clase active de otros elementos
            subsPane.querySelectorAll('.active').forEach(el => el.removeClass('active'));
            favoritesButton.addClass('active');
            
            // Recalcular favoritos siempre desde settings (evita wrappers desactualizados)
            const currentFavoriteItems = [] as any[];
            for (const feedContent of (this.plugin.settings.items || [])) {
                if (!feedContent || !Array.isArray(feedContent.items)) continue;
                for (const raw of feedContent.items) {
                    if (raw.favorite === true) currentFavoriteItems.push(raw);
                }
            }
            console.log(`🔍 Favorites button clicked: Found ${currentFavoriteItems.length} current favorite raw items`);

            // Crear feed temporal para favoritos (adaptar a interfaz mínima consumida por renderList)
            const favoritesFeed = {
                id: () => -1,
                url: () => '#favorites',
                title: () => 'Favorites',
                name: () => 'Favorites',
                favicon: () => null as string | null,
                unreadCount: () => currentFavoriteItems.length,
                ordering: () => 0,
                link: () => '#favorites',
                folderId: () => -1,
                folderName: () => 'Special',
                items: () => currentFavoriteItems.map(raw => ({
                    // Implement required Item interface methods with safe fallbacks
                    title: () => raw.title,
                    pubDate: () => raw.pubDate,
                    description: () => raw.description,
                    body: () => raw.content,
                    mediaThumbnail: () => raw.image,
                    favorite: raw.favorite === true,
                    read: () => raw.read === true,
                    markRead: (v: boolean) => { raw.read = v; },
                    tags: () => raw.tags || [],
                    setTags: (tags: string[]) => { raw.tags = tags; },
                    // Additional methods expected by Item interface (return neutral values)
                    author: () => raw.creator || '',
                    created: () => raw.created === true,
                    enclosureLink: () => '',
                    enclosureMime: () => '',
                    feed: () => raw.feed || '',
                    feedId: () => 0,
                    folder: () => raw.folder || '',
                    guid: () => raw.guid || raw.link || '',
                    guidHash: () => raw.hash || '',
                    highlights: (): string[] => [],
                    id: () => raw.hash || raw.link || '',
                    language: () => raw.language || '',
                    markCreated: (v: boolean) => { raw.created = v; },
                    rtl: () => false,
                    starred: () => raw.favorite === true, // legacy
                    markStarred: (v: boolean) => { raw.favorite = v; },
                    url: () => raw.link,
                    mediaDescription: () => raw.description || '',
                }))
            };
            
            this.renderList(listPane, detailPane, [favoritesFeed]);
        };

    for (const folder of folders) {
            const folderHeader = subsPane.createDiv({cls: 'rss-folder-header'});
            const triangle = folderHeader.createSpan();
            setIcon(triangle, 'down-triangle');
            triangle.style.marginRight = '4px';
            
            // Contar entradas totales en esta carpeta
            const folderItemCount = folder.feeds().reduce((total: number, feed: any) => total + (feed.items()?.filter((it:any)=> !it.read || !it.read())?.length || 0), 0);
            
            // Botón carpeta: marcar todos en carpeta como leídos (✓) - ahora a la izquierda del nombre
            const markFolder = folderHeader.createSpan({text:'✓', cls: 'rss-mark-folder'});
            markFolder.style.cursor='pointer';
            markFolder.style.marginRight='6px';
            const folderLbl = t('mark_folder_as_read');
            markFolder.setAttribute('title', folderLbl);
            markFolder.setAttribute('aria-label', folderLbl);
            markFolder.onclick = async (ev) => {
                ev.stopPropagation();
                try {
                    const affectedLinks: string[] = [];
                    const folderNameLc = folder.name().toLowerCase();
                    // Determinar feeds realmente pertenecientes a la carpeta usando settings (fuente de verdad)
                    const allowedNames = new Set<string>();
                    const allowedLinks = new Set<string>();
                    for (const fc of (this.plugin.settings.items||[])) {
                        if (!fc || typeof fc.folder !== 'string') continue;
                        if (fc.folder.toLowerCase() === folderNameLc) {
                            if (fc.name) allowedNames.add(fc.name);
                            if (fc.link) allowedLinks.add(fc.link);
                        }
                    }
                    // Marcar sólo feeds cuyo name/link esté permitido (wrapper en memoria)
                    for (const feed of folder.feeds()) {
                        try {
                            const fname = (feed.name && feed.name()) || '';
                            const flink = (feed.link && feed.link()) || '';
                            if (!allowedNames.has(fname) && !allowedLinks.has(flink)) continue; // skip feeds ajenos
                            const rawFeed = (feed as any).parsed;
                            const items = rawFeed?.items || (feed.items? feed.items(): []);
                            for (const it of items) { if (it && it.read !== true) { it.read = true; if (it.link) affectedLinks.push(it.link); } }
                        } catch {}
                    }
                    // Persistencia: sólo feeds de la carpeta
                    for (const feedContent of (this.plugin.settings.items||[])) {
                        if (feedContent && typeof feedContent.folder === 'string' && feedContent.folder.toLowerCase() === folderNameLc && Array.isArray(feedContent.items)) {
                            for (const raw of feedContent.items) { if (raw.read !== true) { raw.read = true; if (raw.link) affectedLinks.push(raw.link); } }
                        }
                    }
                    await this.plugin.writeFeedContentDebounced(()=>{}, 250);
                    try { document.dispatchEvent(new CustomEvent(RSS_EVENTS.UNREAD_COUNTS_CHANGED)); } catch {}
                    try { document.dispatchEvent(new CustomEvent(RSS_EVENTS.FEED_MARK_ALL, {detail:{scope:'folder', name: folder.name(), links: affectedLinks}})); } catch {}
                    // Actualizar contador de la propia cabecera (optimista)
                    const textNode = folderHeader.querySelector('span:nth-child(2)');
                    if (textNode) textNode.textContent = `${folder.name()} (0)`;
                    this.refreshSidebarCounts();
                    if (folderHeader.hasClass && folderHeader.hasClass('active')) this.renderList(listPane, detailPane, folder.feeds());
                } catch(err){ console.warn('Mark folder read failed', err); }
            };

            const folderName = folderHeader.createSpan({text: `${folder.name()} (${folderItemCount})`});
            folderName.style.flex = '1';
            
            const feedsWrap = subsPane.createDiv();
            let collapsed = false;
            folderHeader.onclick = () => {
                collapsed = !collapsed;
                setIcon(triangle, collapsed ? 'right-triangle' : 'down-triangle');
                feedsWrap.style.display = collapsed ? 'none' : 'block';
                
                // Si no está colapsado, mostrar todos los feeds de esta carpeta
                if (!collapsed) {
                    // Remover clase active de otros elementos
                    subsPane.querySelectorAll('.active').forEach(el => el.removeClass('active'));
                    folderHeader.addClass('active');
                    this.renderList(listPane, detailPane, folder.feeds());
                }
            };
            for (const feed of folder.feeds()) {
                const feedHeader = feedsWrap.createDiv({cls: 'rss-feed-header'});
                feedHeader.style.display = 'flex';
                feedHeader.style.alignItems = 'center';
                feedHeader.style.justifyContent = 'space-between';
                
                const feedInfo = feedHeader.createDiv();
                feedInfo.style.display = 'flex';
                feedInfo.style.alignItems = 'center';
                feedInfo.style.flex = '1';

                // Botón feed: marcar todos los items de este feed como leídos (✓)
        const markFeedBtn = feedInfo.createSpan({text:'✓', cls:'rss-mark-feed'});
        markFeedBtn.style.cursor='pointer';
        markFeedBtn.style.marginRight='6px';
        const feedLbl = t('mark_feed_as_read');
        markFeedBtn.setAttribute('title', feedLbl);
        markFeedBtn.setAttribute('aria-label', feedLbl);
                markFeedBtn.onclick = async (ev) => {
                    ev.stopPropagation();
                    try {
                        // Marcar items del feed en memoria (parsed o wrapper)
                        const rawFeed = (feed as any).parsed;
            const items = rawFeed?.items || (feed.items? feed.items(): []);
            const affectedLinks: string[] = [];
            for (const it of items) { if (it && it.read !== true) { it.read = true; if (it.link) affectedLinks.push(it.link); } }
                        // Actualizar settings persistidos para este feed
                        for (const feedContent of (this.plugin.settings.items||[])) {
                            // Identificar feed por nombre o por link
                            if (feedContent.name === feed.name() || feedContent.link === feed.link()) {
                                if (Array.isArray(feedContent.items)) {
                    for (const raw of feedContent.items) { if (raw.read !== true) { raw.read = true; if (raw.link) affectedLinks.push(raw.link); } }
                                }
                            }
                        }
                        await this.plugin.writeFeedContentDebounced(()=>{}, 250);
                        try { document.dispatchEvent(new CustomEvent(RSS_EVENTS.UNREAD_COUNTS_CHANGED)); } catch {}
            try { document.dispatchEvent(new CustomEvent(RSS_EVENTS.FEED_MARK_ALL, {detail:{scope:'feed', name: feed.name(), links: affectedLinks}})); } catch {}
            // Actualizar badge de este feed (optimista)
            const badge = feedHeader.querySelector('.rss-item-count-badge');
            if (badge) badge.textContent = '0';
                        this.refreshSidebarCounts();
                        // Si este feed está activo refrescar lista
                        if (feedHeader.hasClass && feedHeader.hasClass('active')) this.renderList(listPane, detailPane, [feed]);
                    } catch(err){ console.warn('Mark feed read failed', err); }
                };
                
                if (feed.favicon()) {
                    const fav = feedInfo.createEl('img', {attr: {src: feed.favicon()}});
                    fav.style.width = '14px';
                    fav.style.height = '14px';
                    fav.style.marginRight = '6px';
                }
                
                const feedName = feedInfo.createSpan({text: feed.name()});
                feedName.style.flex = '1';
                
                // Contador de entradas para este feed
                const feedItemCount = feed.items()?.filter((i:any)=> !i.read || !i.read())?.length || 0;
                const countBadge = feedHeader.createSpan({
                    text: feedItemCount.toString(),
                    cls: 'rss-item-count-badge'
                });
                
                feedHeader.onclick = () => {
                    // Remover clase active de otros elementos
                    subsPane.querySelectorAll('.active').forEach(el => el.removeClass('active'));
                    feedHeader.addClass('active');
                    this.renderList(listPane, detailPane, [feed]);
                };
            }
        }

        // Renderizar inicialmente todas las entradas y marcar el botón "All Feeds" como activo
        allFeedsButton.addClass('active');
        this.renderList(listPane, detailPane, globalFeedsList);
        // aplicar clase responsive inmediatamente
        this.applyResponsiveClass();

        // Listener para refrescar contadores de no leídos
    document.addEventListener(RSS_EVENTS.UNREAD_COUNTS_CHANGED, () => this.refreshSidebarCounts(), {once:false});
        // Listener para actualizar estrellas cuando se cambian en el modal
    document.addEventListener(RSS_EVENTS.FAVORITE_UPDATED, (ev: any) => {
            const link = ev?.detail?.link;
            const fav = ev?.detail?.favorite;
            if (!link) return;
            // Buscar estrellas asociadas a ese link
            const starEls = this.containerEl.querySelectorAll(`.rss-fr-star[data-link="${CSS.escape(link)}"]`);
            starEls.forEach(star => {
                star.textContent = fav ? '★' : '☆';
                star.classList.toggle('is-starred', !!fav);
            });
            // Actualizar contador de favoritos
            this.updateFavoritesCounter();
        }, {once:false});
        // Listener para aplicar estado de lectura sobre filas desde el modal
    document.addEventListener(RSS_EVENTS.ITEM_READ_UPDATED, (ev: any) => {
            const link = ev?.detail?.link;
            const read = ev?.detail?.read;
            if (!link) return;
            let selectorLink = link;
            try { selectorLink = CSS.escape(link); } catch {}
            const row = this.containerEl.querySelector(`.rss-fr-row-article[data-link="${selectorLink}"]`) as HTMLElement;
            if (row) {
                row.toggleClass('read', !!read);
                row.toggleClass('unread', !read);
                const dot = row.querySelector('.rss-dot');
                if (dot) {
                    if (read) dot.classList.add('read'); else dot.classList.remove('read');
                }
            }
            this.refreshSidebarCounts();
        }, {once:false});
        // Listener para FEED_MARK_ALL (folder/feed) para asegurar refrescos de UI cuando se usan botones masivos
        document.addEventListener(RSS_EVENTS.FEED_MARK_ALL, (ev: any) => {
            try {
                const scope = ev?.detail?.scope;
                const name = ev?.detail?.name;
                const links: string[] = ev?.detail?.links || [];
                // Si no hay containerEl válido, solo refrescar contadores y salir
                if (!this.containerEl || typeof (this.containerEl as any).querySelector !== 'function') {
                    this.refreshSidebarCounts();
                    return;
                }
                // Marcar filas visibles correspondientes como leídas sin re-render completo
                if (Array.isArray(links) && links.length) {
                    for (const ln of links) {
                        if (!ln) continue;
                        let sel = ln; try { sel = CSS.escape(ln); } catch {}
                        const row = this.containerEl.querySelector(`.rss-fr-row-article[data-link="${sel}"]`);
                        if (row) {
                            row.classList.remove('unread');
                            row.classList.add('read');
                            const dot = row.querySelector('.rss-dot');
                            if (dot) dot.classList.add('read');
                        }
                    }
                }
                // Si la vista actual corresponde al feed/carpeta afectada, refrescar lista para recomputar agrupaciones
                const active = this.containerEl.querySelector('.rss-feed-header.active, .rss-folder-header.active, .rss-all-feeds-button.active');
                if (active) {
                    // Heurística: si estamos en la carpeta afectada o feed afectado, re-render parcial
                    if (scope === 'feed' && active.textContent?.includes(name)) {
                        // Re-render feed actual
                        const listPane = this.containerEl.querySelector('.rss-fr-list') as HTMLElement;
                        const detailPane = this.containerEl.querySelector('.rss-fr-detail') as HTMLElement;
                        if (listPane && detailPane) {
                            // For simplicity trigger full sidebar count refresh and let existing selection logic redraw
                            this.refreshSidebarCounts();
                        }
                    } else if (scope === 'folder' && active.textContent?.includes(name)) {
                        this.refreshSidebarCounts();
                    }
                } else {
                    this.refreshSidebarCounts();
                }
            } catch (e) { console.warn('FEED_MARK_ALL listener error', e); }
        }, {once:false});
        
        console.log(`📊 RSS View: Display completed in ${(performance.now() - displayStart).toFixed(2)}ms`);
    }

    private async updateFavoritesCounter() {
        try {
            const favoriteCount = this.plugin.counters?.favoriteCount() ?? 0;
            const favoriteItems = this.plugin.counters?.favoriteItems() ?? [];
            
            // Update favorites button text
            const favoritesButton = this.containerEl.querySelector('.rss-favorites-button');
            if (favoritesButton) {
                const span = favoritesButton.querySelector('span:last-child'); // Select the text span, not the icon span
                if (span) {
                    span.textContent = `Favorites (${favoriteCount})`;
                }
                
                // If favorites button is currently active, refresh the view
                if (favoritesButton.hasClass('active')) {
                    console.log(`🔍 Refreshing active favorites view with ${favoriteCount} items`);
                    const listPane = this.containerEl.querySelector('.rss-fr-list') as HTMLElement;
                    const detailPane = this.containerEl.querySelector('.rss-fr-detail') as HTMLElement;
                    if (listPane && detailPane) {
                        const favoritesFeed = {
                            id: () => -1,
                            url: () => '#favorites',
                            title: () => 'Favorites',
                            name: () => 'Favorites',
                            favicon: () => null as string | null,
                            unreadCount: () => favoriteCount,
                            ordering: () => 0,
                            link: () => '#favorites',
                            folderId: () => -1,
                            folderName: () => 'Special',
                            items: () => favoriteItems
                        };
                        this.renderList(listPane, detailPane, [favoritesFeed]);
                    }
                }
            }
            
            console.log(`🔍 Updated favorites counter: ${favoriteCount} items`);
        } catch (error) {
            console.error('Failed to update favorites counter:', error);
        }
    }

    private renderList(listPane: HTMLElement, detailPane: HTMLElement, feeds: Feed[]) {
        listPane.empty();
        const collected: {feed: Feed, item: any}[] = [];
        for (const feed of feeds) {
            for (const it of feed.items()) collected.push({feed, item: it});
        }
        if (!collected.length) {
            listPane.createDiv({cls: 'rss-fr-empty', text: 'No items'});
            return;
        }
        // Parse date strings -> Date objects (fallback to epoch 0 when invalid to keep stable sort)
        collected.sort((a,b)=> {
            const ad = (a.item as any).pubDateMs !== undefined ? (a.item as any).pubDateMs : new Date(a.item.pubDate?.() || a.item.pubDate || 0).getTime();
            const bd = (b.item as any).pubDateMs !== undefined ? (b.item as any).pubDateMs : new Date(b.item.pubDate?.() || b.item.pubDate || 0).getTime();
            return bd - ad;
        });
        let currentGroup: string | null = null;
        const frag = document.createDocumentFragment();
        for (const {feed, item} of collected) {
            const dateStrRaw = (typeof item.pubDate === 'function') ? item.pubDate() : item.pubDate; // Item interface returns string
            const dateObj = dateStrRaw ? new Date(dateStrRaw) : null;
            const groupLabel = dateObj ? this.groupLabel(dateObj) : 'Unknown';
            if (groupLabel !== currentGroup) {
                currentGroup = groupLabel;
                frag.appendChild(createDiv({cls: 'rss-fr-group-header', text: groupLabel}));
            }
            const row = createDiv({cls: 'rss-fr-row rss-fr-row-article'});
            if (!item.read || !item.read()) row.addClass('unread'); else row.addClass('read');
            const dot = row.createSpan({cls: 'rss-dot'});
            // Guardar link para sincronizar desde modal
            try { (row as any).dataset.link = (item.url ? item.url() : item.link) || ''; } catch {}
            
            // Create star button for favorites
            const isCurrentlyStarred = item.favorite === true;
            const starEl = row.createSpan({cls: 'rss-fr-star', text: isCurrentlyStarred ? '★' : '☆'});
            try { (starEl as any).dataset.link = (item.url ? item.url() : item.link) || ''; } catch {}
            if (isCurrentlyStarred) starEl.addClass('is-starred');
            // Thumbnail
            let thumbUrl = (item as any)._thumb || '';
            if (!thumbUrl) {
                try { thumbUrl = (item.mediaThumbnail && item.mediaThumbnail()) || ''; } catch {}
                if (!thumbUrl) {
                    try {
                        const raw = (item.description && item.description()) || (item.body && item.body()) || '';
                        const m = raw.match(/<img[^>]+src="([^"]+)"/i);
                        if (m) thumbUrl = m[1];
                    } catch {}
                }
                (item as any)._thumb = thumbUrl || ''; // cache
            }
            let hasThumb = false;
            if (thumbUrl) {
                const img = row.createEl('img', {cls: 'rss-fr-thumb', attr: {src: thumbUrl}});
                img.loading = 'lazy';
                hasThumb = true;
                row.addClass('has-thumbnail');
            } else {
                // Añadir clase específica cuando no hay imagen
                row.addClass('no-thumbnail');
            }
            const main = row.createDiv({cls: 'rss-fr-main' + (hasThumb ? '' : ' no-thumb')});
            // Nueva fila para el nombre/"sección" del feed
            const feedLine = main.createDiv({cls: 'rss-fr-feedline'});
            feedLine.createSpan({cls: 'rss-fr-feed', text: feed.name()});
            const topLine = main.createDiv({cls: 'rss-fr-top'});
            topLine.createSpan({cls: 'rss-fr-title', text: item.title()});
            const timeLabel = dateObj ? dateObj.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '';
            topLine.createSpan({cls: 'rss-fr-date', text: timeLabel});
            const descLine = main.createDiv({cls: 'rss-fr-desc'});
            // strip HTML tags
            let descRaw = '';
            try { 
                descRaw = (item.description && item.description()) || (item.body && item.body()) || ''; 
            } catch(error) {
                console.debug('Failed to get item description:', error);
            }
            const text = descRaw.replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<style[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
            descLine.setText(this.truncateWords(text, 220));

            const refreshCounters = () => {
                try { document.dispatchEvent(new CustomEvent(RSS_EVENTS.UNREAD_COUNTS_CHANGED)); } catch {}
            };

            // (Dot click handled via delegated listener below using ItemStateService)

            // dataset for event delegation
            (row as any).dataset.action = 'open';
            frag.appendChild(row);
        }
        listPane.appendChild(frag);

        // Event delegation for star, dot, and row open
        listPane.onclick = async (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (target.closest('.rss-fr-star')) {
                const star = target.closest('.rss-fr-star') as HTMLElement;
                const link = star?.dataset.link;
                if (!link) return;
                const raw = this.plugin.getItemByLink(link);
                if (!raw) return;
                await Action.FAVORITE.processor(this.plugin as any, { item: raw, favorite: raw.favorite, title: ()=> raw.title, body: ()=> raw.content, markRead: ()=>{}, tags: ()=> raw.tags||[], setTags: (t:string[])=> raw.tags=t } as any);
                const isStarred = raw.favorite === true;
                star.setText(isStarred ? '★' : '☆');
                star.toggleClass('is-starred', isStarred);
                await this.updateFavoritesCounter();
                e.stopPropagation();
                return;
            }
            if (target.closest('.rss-dot')) {
                e.stopPropagation();
                const row = target.closest('.rss-fr-row-article') as HTMLElement;
                const link = row?.dataset.link;
                if (!link) return;
                const raw = this.plugin.getItemByLink(link);
                if (!raw) return;
                try {
                    const newState = await this.plugin.itemStateService.toggleRead(raw as any);
                    row.toggleClass('read', newState);
                    row.toggleClass('unread', !newState);
                    target.classList.toggle('read', newState);
                    this.refreshSidebarCounts();
                } catch(err){ console.warn('Dot toggle failed', err); }
                return;
            }
            const row = target.closest('.rss-fr-row-article') as HTMLElement;
            if (row && (row as any).dataset.link) {
                const raw = this.plugin.getItemByLink((row as any).dataset.link);
                if (!raw) return;
                if (!raw.read) { raw.read = true; row.removeClass('unread'); row.addClass('read'); row.querySelector('.rss-dot')?.classList.add('read'); }
                await this.plugin.writeFeedContentDebounced(()=>{}, 250);
                try { document.dispatchEvent(new CustomEvent(RSS_EVENTS.UNREAD_COUNTS_CHANGED)); } catch {}
                this.refreshSidebarCounts();
                new ItemModal(this.plugin, {
                    item: raw,
                    id: () => (raw as any).id || raw.link || raw.title || '',
                    guid: () => (raw as any).guid || raw.link || raw.title || '',
                    guidHash: () => ((raw as any).guid || raw.link || raw.title || '').toString(),
                    feedId: () => 0,
                    feed: () => (raw as any).feed || '',
                    folder: () => raw.folder || '',
                    url: () => raw.link,
                    title: () => raw.title,
                    author: () => (raw as any).author || '',
                    pubDate: () => raw.pubDate,
                    body: () => raw.content,
                    description: () => raw.description || '',
                    mediaThumbnail: () => raw.image || '',
                    mediaDescription: () => '',
                    enclosureMime: () => (raw as any).enclosureMime || '',
                    enclosureLink: () => (raw as any).enclosureLink || '',
                    read: () => raw.read,
                    starred: () => !!raw.favorite,
                    rtl: () => false,
                    markRead: (v: boolean) => { raw.read = v; },
                    markStarred: (v: boolean) => { raw.favorite = v; },
                    tags: () => raw.tags || [],
                    setTags: (t: string[]) => { raw.tags = t; },
                    created: () => true,
                    markCreated: () => {},
                    language: () => raw.language || 'en',
                    highlights: () => raw.highlights || [],
                } as any, collected.map(c=>c.item), true).open();
            }
        };
    }

    private refreshSidebarCounts() {
        try {
            const counters = this.plugin.counters;
            if (!counters) return;
            const allUnread = counters.globalUnread();
            const allBtn = this.contentContainer.querySelector('.rss-all-feeds-button');
            const span = allBtn?.querySelector('span:last-child');
            if (span) span.textContent = `All Feeds (${allUnread})`;

            const unreadByFolder = counters.unreadByFolder();
            const folderHeaders = Array.from(this.contentContainer.querySelectorAll('.rss-folder-header')) as HTMLElement[];
            for (const header of folderHeaders) {
                const textNode = header.querySelector('span:nth-child(2)');
                if (!textNode) continue;
                const folderName = textNode.textContent?.replace(/ \(.*\)$/,'')?.trim() || '';
                const unreadInFolder = unreadByFolder[folderName.toLowerCase()] || 0;
                textNode.textContent = `${folderName} (${unreadInFolder})`;
            }

            const unreadByFeed = counters.unreadByFeed();
            const feedHeaders = Array.from(this.contentContainer.querySelectorAll('.rss-feed-header')) as HTMLElement[];
            for (const fh of feedHeaders) {
                const nameEl = fh.querySelector('div span');
                const badge = fh.querySelector('.rss-item-count-badge');
                if (!nameEl || !badge) continue;
                const feedName = nameEl.textContent || '';
                badge.textContent = String(unreadByFeed[feedName] || 0);
            }
            console.log('🔄 Sidebar unread counters refreshed (CountersService)');
        } catch(err) { console.debug('Sidebar count refresh failed', err); }
    }

    private groupLabel(d: Date): string {
        const now = new Date();
        const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const diffMs = startToday.getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        const dayDiff = Math.round(diffMs / 86400000);
	if (dayDiff === 0) return 'Today';
	if (dayDiff === 1) return 'Yesterday';
        return d.toLocaleDateString();
    }

    // openDetail no longer used (modal preferred)

    private applyResponsiveClass() {
        const root = this.layoutRoot;
        if (!root) return;
        const width = this.contentContainer.getBoundingClientRect().width;
        if (width < 720) root.addClass('rss-narrow'); else root.removeClass('rss-narrow');
    }

    private truncateWords(text: string, maxChars: number): string {
        if (text.length <= maxChars) return text;
        // Cut slightly over then roll back to nearest space
        let slice = text.slice(0, maxChars + 8);
        const space = slice.lastIndexOf(' ');
        if (space > 0) slice = slice.slice(0, space);
        return slice.replace(/[\s\.,;:!-]*$/,'') + '…';
    }
}
