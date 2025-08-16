import {setIcon, ItemView, WorkspaceLeaf} from "obsidian";
import RssReaderPlugin from "../main";
import {VIEW_ID} from "../consts";
import t from "../l10n/locale";
import {ItemModal} from "../modals/ItemModal";
import {Feed} from "../providers/Feed";
import Action from "../actions/Action";

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

        // Agregar botón "All Feeds" al principio
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
        document.addEventListener('rss-reader-read-updated', () => this.refreshSidebarCounts(), {once:false});
        // Listener para actualizar estrellas cuando se cambian en el modal
        document.addEventListener('rss-reader-favorite-updated', (ev: any) => {
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
        document.addEventListener('rss-reader-item-read-updated', (ev: any) => {
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
        
        console.log(`📊 RSS View: Display completed in ${(performance.now() - displayStart).toFixed(2)}ms`);
    }

    private async updateFavoritesCounter() {
        try {
            const provider = this.plugin.providers.getCurrent();
            const folders = await provider.folders();
            // Count favorites directly from RAW data, not wrapper objects
            let favoriteCount = 0;
            for (const folder of folders) {
                for (const feed of folder.feeds()) {
                    // Access the raw parsed data directly
                    const rawFeed = (feed as any).parsed;
                    if (rawFeed && rawFeed.items) {
                        favoriteCount += rawFeed.items.filter((rawItem: any) => rawItem.favorite === true).length;
                    }
                }
            }
            
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
                    
                    // Find the list and detail panes
                    const listPane = this.containerEl.querySelector('.rss-fr-list') as HTMLElement;
                    const detailPane = this.containerEl.querySelector('.rss-fr-detail') as HTMLElement;
                    
                    if (listPane && detailPane) {
                        // Collect actual favorite items for the view
                        const favoriteItems: any[] = [];
                        for (const folder of folders) {
                            for (const feed of folder.feeds()) {
                                const items = feed.items().filter((item: any) => item.favorite === true);
                                favoriteItems.push(...items);
                            }
                        }
                        
                        // Create updated favorites feed
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
            const ad = new Date(a.item.pubDate?.() || a.item.pubDate || 0).getTime();
            const bd = new Date(b.item.pubDate?.() || b.item.pubDate || 0).getTime();
            return bd - ad;
        });
        let currentGroup: string | null = null;
        for (const {feed, item} of collected) {
            const dateStrRaw = (typeof item.pubDate === 'function') ? item.pubDate() : item.pubDate; // Item interface returns string
            const dateObj = dateStrRaw ? new Date(dateStrRaw) : null;
            const groupLabel = dateObj ? this.groupLabel(dateObj) : 'Unknown';
            if (groupLabel !== currentGroup) {
                currentGroup = groupLabel;
                listPane.createDiv({cls: 'rss-fr-group-header', text: groupLabel});
            }
            const row = listPane.createDiv({cls: 'rss-fr-row rss-fr-row-article'});
            if (!item.read || !item.read()) row.addClass('unread'); else row.addClass('read');
            const dot = row.createSpan({cls: 'rss-dot'});
            // Guardar link para sincronizar desde modal
            try { (row as any).dataset.link = (item.url ? item.url() : item.link) || ''; } catch {}
            
            // Create star button for favorites
            const isCurrentlyStarred = item.favorite === true;
            const starEl = row.createSpan({cls: 'rss-fr-star', text: isCurrentlyStarred ? '★' : '☆'});
            try { (starEl as any).dataset.link = (item.url ? item.url() : item.link) || ''; } catch {}
            if (isCurrentlyStarred) {
                starEl.addClass('is-starred');
            }
            
            starEl.onclick = async (e) => {
                e.stopPropagation();
                
                console.log(`🔍 ViewLoader: Star clicked for item: "${item.title()}", current favorite: ${item.favorite}`);
                
                // Use the FAVORITE action for consistent behavior
                await Action.FAVORITE.processor(this.plugin, item);
                
                // CRITICAL FIX: Access updated favorite state directly 
                // The LocalFeedItem now has a favorite getter that reads the raw item
                const isStarred = item.favorite === true;
                starEl.setText(isStarred ? '★' : '☆');
                starEl.toggleClass('is-starred', isStarred);
                
                console.log(`🔍 ViewLoader: Updated star UI, new favorite state: ${isStarred} (refreshed)`);
                
                // Update favorites counter immediately with raw data access
                await this.updateFavoritesCounter();
            };
            // Thumbnail
            let thumbUrl = '';
            try { 
                thumbUrl = (item.mediaThumbnail && item.mediaThumbnail()) || ''; 
            } catch(error) {
                console.debug('Failed to get media thumbnail:', error);
            }
            if (!thumbUrl) {
                // fallback: search <img src> in description/body
                try {
                    const raw = (item.description && item.description()) || (item.body && item.body()) || '';
                    const m = raw.match(/<img[^>]+src="([^"]+)"/i);
                    if (m) thumbUrl = m[1];
                } catch(error) {
                    console.debug('Failed to extract image from content:', error);
                }
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
                try { document.dispatchEvent(new CustomEvent('rss-reader-read-updated')); } catch {}
            };

            // Toggle read state by clicking the left dot
            dot.onclick = async (e) => {
                e.stopPropagation();
                try {
                    const raw = (item as any).item || item;
                    const nowRead = !(raw.read === true || (item.read && item.read()));
                    raw.read = nowRead;
                    if (item.markRead) item.markRead(nowRead);
                    row.toggleClass('unread', !nowRead);
                    row.toggleClass('read', nowRead);
                    dot.toggleClass('read', nowRead);
            console.log(`🟢 Dot toggle: ${nowRead ? 'read' : 'unread'} -> ${raw.title}`);
                    // Sync settings
                    outer: for (const feedContent of this.plugin.settings.items) {
                        if (!feedContent || !Array.isArray(feedContent.items)) continue;
                        for (const i of feedContent.items) {
                            if (i.link === raw.link) { i.read = nowRead; break outer; }
                        }
                    }
            await this.plugin.writeFeedContent(arr => arr);
                    try { const localProvider: any = await this.plugin.providers.getById('local'); localProvider?.invalidateCache && localProvider.invalidateCache(); } catch {}
                    refreshCounters();
                    this.refreshSidebarCounts();
                } catch(err) { console.warn('Toggle read failed', err); }
            };

            row.onclick = async () => {
                const raw = (item as any).item || item;
                let mutated = false;
                try {
                    if (!raw.read) {
                        raw.read = true;
                        if (item.markRead) item.markRead(true);
                        row.removeClass('unread');
                        row.addClass('read');
                        dot.addClass('read');
                        mutated = true;
                    }
                    // No visited flag anymore
                    if (mutated) {
                        // Sync inside settings by link
                        outer: for (const feedContent of this.plugin.settings.items) {
                            if (!feedContent || !Array.isArray(feedContent.items)) continue;
                            for (const i of feedContent.items) {
                                if (i.link === raw.link) {
                                    if (raw.read) i.read = true;
                                    break outer;
                                }
                            }
                        }
            await this.plugin.writeFeedContent(arr => arr);
                        try {
                            const localProvider: any = await this.plugin.providers.getById('local');
                            localProvider?.invalidateCache && localProvider.invalidateCache();
                        } catch {}
                    }
                } catch(e) { console.warn('Read/visited sync failed', e); }
        console.log('📖 Row click marked read for', raw.title);
                refreshCounters();
                this.refreshSidebarCounts();
                new ItemModal(this.plugin, item, collected.map(c=>c.item), true).open();
            };
        }
    }

    private refreshSidebarCounts() {
        try {
            const settingsFeeds = this.plugin.settings.items || [];
            // Global unread
            const allUnread = settingsFeeds.reduce((acc: number, fc: any) => acc + (Array.isArray(fc.items) ? fc.items.filter((i:any)=> i.read !== true).length : 0), 0);
            const allBtn = this.contentContainer.querySelector('.rss-all-feeds-button');
            const span = allBtn?.querySelector('span:last-child');
            if (span) span.textContent = `All Feeds (${allUnread})`;

            // Folder headers
            const folderHeaders = Array.from(this.contentContainer.querySelectorAll('.rss-folder-header')) as HTMLElement[];
            for (const header of folderHeaders) {
                const textNode = header.querySelector('span:nth-child(2)');
                if (!textNode) continue;
                const folderName = textNode.textContent?.replace(/ \(.*\)$/,'');
                const unreadInFolder = settingsFeeds.filter((fc:any)=> fc.folder === folderName)
                    .reduce((acc:number, fc:any)=> acc + fc.items.filter((i:any)=> i.read !== true).length, 0);
                textNode.textContent = `${folderName} (${unreadInFolder})`;
            }

            // Feed badges
            const feedHeaders = Array.from(this.contentContainer.querySelectorAll('.rss-feed-header')) as HTMLElement[];
            for (const fh of feedHeaders) {
                const nameEl = fh.querySelector('div span');
                const badge = fh.querySelector('.rss-item-count-badge');
                if (!nameEl || !badge) continue;
                const feedName = nameEl.textContent;
                const unreadInFeed = settingsFeeds.filter((fc:any)=> fc.name === feedName)
                    .reduce((acc:number, fc:any)=> acc + fc.items.filter((i:any)=> i.read !== true).length, 0);
                badge.textContent = String(unreadInFeed);
            }
            // Optional console (can be silenced later)
            console.log('🔄 Sidebar unread counters refreshed');
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
