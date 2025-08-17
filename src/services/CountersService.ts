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
}
