import type RssReaderPlugin from '../main';

/**
 * CountersService
 * ----------------
 * Pequeño helper centrado en calcular cantidades de artículos no leídos
 * (global, por feed y por carpeta) a partir del snapshot actual de
 * `plugin.settings.items` (fuente de verdad persistida).
 *
 * NOTA: Actualmente la UI (p.ej. `ViewLoader.refreshSidebarCounts`) recalcula
 * estos valores manualmente sin usar este servicio. Si deseas un único punto
 * de lógica, puedes reemplazar esas reducciones directas por llamadas a este
 * servicio en el futuro. Mientras tanto lo dejamos más legible y documentado.
 */
export class CountersService {
  constructor(private plugin: RssReaderPlugin) {}

  /** Obtiene el arreglo de feeds persistidos (defensivo). */
  private feeds(): any[] { return Array.isArray(this.plugin.settings.items) ? this.plugin.settings.items : []; }

  /** Cuenta items no leídos dentro de un feedContent (objeto persistido). */
  private unreadInFeedContent(feedContent: any): number {
    if (!feedContent || !Array.isArray(feedContent.items)) return 0;
    return feedContent.items.reduce((acc: number, it: any) => acc + (it && it.read !== true ? 1 : 0), 0);
  }

  /** Total global de items no leídos. */
  globalUnread(): number {
    return this.feeds().reduce((acc, fc) => acc + this.unreadInFeedContent(fc), 0);
  }

  /**
   * No leídos para un feed por nombre exacto (distinción simple, case-sensitive).
   * Si quisieras case-insensitive, cambiar a: f.name?.toLowerCase() === name.toLowerCase().
   */
  feedUnread(name: string): number {
    if (!name) return 0;
    const fc = this.feeds().find(f => f && f.name === name);
    return fc ? this.unreadInFeedContent(fc) : 0;
  }

  /**
   * No leídos para una carpeta. Hace coincidencia case-insensitive y recorta espacios.
   */
  folderUnread(folder: string): number {
    if (!folder) return 0;
    const target = folder.trim().toLowerCase();
    return this.feeds()
      .filter(f => f && typeof f.folder === 'string' && f.folder.trim().toLowerCase() === target)
      .reduce((acc, fc) => acc + this.unreadInFeedContent(fc), 0);
  }

  /** Número total de favoritos. */
  favoriteCount(): number {
    return this.feeds().reduce((acc, fc: any) => acc + (Array.isArray(fc.items) ? fc.items.filter((i:any)=> i?.favorite === true).length : 0), 0);
  }

  /** Devuelve array plano de todos los items favoritos (RAW persistidos). */
  favoriteItems(): any[] {
    const out: any[] = [];
    for (const fc of this.feeds()) {
      if (!Array.isArray(fc.items)) continue;
      for (const it of fc.items) if (it?.favorite === true) out.push(it);
    }
    // Ordenar descendente por timestamp para que más reciente aparezca primero (paridad con lista principal)
    out.sort((a,b)=> {
      const ta = (typeof a.pubDateMs === 'number') ? a.pubDateMs : (a.pubDate ? new Date(a.pubDate).getTime() : 0);
      const tb = (typeof b.pubDateMs === 'number') ? b.pubDateMs : (b.pubDate ? new Date(b.pubDate).getTime() : 0);
      return tb - ta;
    });
    return out;
  }

  /** Mapa nombreFeed -> unread (una sola pasada). */
  unreadByFeed(): Record<string, number> {
    const map: Record<string, number> = {};
    for (const fc of this.feeds()) {
      if (!fc || !fc.name) continue;
      map[fc.name] = (map[fc.name] || 0) + this.unreadInFeedContent(fc);
    }
    return map;
  }

  /** Mapa folder(lowercased) -> unread (para refrescos eficientes). */
  unreadByFolder(): Record<string, number> {
    const map: Record<string, number> = {};
    for (const fc of this.feeds()) {
      const folder = typeof fc.folder === 'string' ? fc.folder.trim().toLowerCase() : '';
      if (!folder) continue;
      map[folder] = (map[folder] || 0) + this.unreadInFeedContent(fc);
    }
    return map;
  }
}
