# Plan de Refactorización y Documentación (TypeScript / Svelte)

Este documento propone mejoras enfocadas en: (1) Documentación JSDoc consistente, (2) Organización y legibilidad, (3) Comentarios explicativos puntuales. No aplica cambios todavía; brinda un blueprint preciso para implementarlos.

Leyenda de prioridad:
- (A) Alta: Riesgo técnico / muy usado / reduce ambigüedad.
- (M) Media: Mejora de comprensión y mantenibilidad.
- (B) Baja: Estético o poco usado.

Formato repetido por archivo: se listan bloques concretos (líneas aproximadas) con “Código Anterior” y “Código Sugerido” agregando sólo documentación / nombres / estructura (sin alterar lógica). Cuando un patrón se repite muchas veces, se muestra 1 ejemplo + instrucción “Aplicar mismo patrón a X ocurrencias”.

---
## 1. src/main.ts
### 1.1 JSDoc clase principal (A)
**Ubicación:** Línea ~40 (declaración de clase)
**Mejora:** Añadir descripción y documentar propiedades clave.
**Código Anterior:**
```ts
export default class RssReaderPlugin extends Plugin {
    settings: RssReaderSettings;
    providers: Providers;
    private updating = false;
    private updateAbort?: AbortController;
    // Performance indexes
    private itemByLink: Map<string, RssFeedItem> = new Map();
    private unreadCountByFeed: Map<string, number> = new Map();
    private feedContentSaveTimer: number | undefined;
    // Services (initialized lazily in onload)
    settingsManager!: SettingsManager;
    feedUpdater!: FeedUpdater;
    itemStateService!: ItemStateService;
    counters!: CountersService;
    migrations!: MigrationService;
```
**Código Sugerido:**
```ts
/**
 * Principal plugin RSS Reader.
 * - Orquesta carga de settings, registro de vistas y comandos.
 * - Mantiene índices en memoria para acceso rápido a items y conteos.
 * - Delegaciones: actualización de feeds (FeedUpdater), estado de items (ItemStateService), contadores (CountersService).
 */
export default class RssReaderPlugin extends Plugin {
  /** Settings combinados (persistidos + defaults). */
  settings: RssReaderSettings;
  /** Gestor de proveedores de feeds (HTTP/local). */
  providers: Providers;
  /** Flag para evitar ejecuciones concurrentes de ciertas operaciones globales. */
  private updating = false;
  /** AbortController activo de procesos largos (update feeds). */
  private updateAbort?: AbortController;
  /** Índice rápido link -> item (reconstruido tras mutaciones). */
  private itemByLink = new Map<string, RssFeedItem>();
  /** Conteo de no leídos por feedName (cacheada). */
  private unreadCountByFeed = new Map<string, number>();
  /** Timer para debounce de escritura de items. */
  private feedContentSaveTimer: number | undefined;
  // Servicios inyectados (lazy import en onload)
  settingsManager!: SettingsManager;
  feedUpdater!: FeedUpdater;
  itemStateService!: ItemStateService;
  counters!: CountersService;
  migrations!: MigrationService;
```

### 1.2 onload() – dividir y documentar fases (A)
**Ubicación:** Línea ~50–210.
**Mejora:** Extraer secciones a métodos privados + JSDoc. Reduce longitud cognitiva.
**Código Anterior (fragmento):**
```ts
async onload(): Promise<void> {
  const startTime = performance.now();
  // ... carga settings, imports dinámicos, comandos, vistas, intervalos, suscripciones ...
}
```
**Código Sugerido (esqueleto):**
```ts
async onload(): Promise<void> {
  const start = performance.now();
  await this.initSettings();
  await this.initProvidersAndServices();
  this.registerCommands();
  this.registerViewAndSettingTab();
  this.setupIntervals();
  this.setupReactiveStores();
  this.deferWorkspaceInit();
  console.log(`[rss] loaded in ${(performance.now()-start).toFixed(2)}ms`);
}

/** Carga settings desde disco + suscripción para mantener this.settings. */
private async initSettings(): Promise<void> { /* mover bloque */ }
/** Construcción de Providers + servicios (imports dinámicos). */
private async initProvidersAndServices(): Promise<void> { /* mover bloque */ }
/** Registro de TODOS los comandos; separar debug opcionales. */
private registerCommands(): void { /* mover bloque */ }
/** Registrar vista Svelte + pestaña de configuración. */
private registerViewAndSettingTab(): void { /* mover bloque */ }
/** Interválicos (fetch / autosync) con registerInterval + guards. */
private setupIntervals(): void { /* mover bloque */ }
/** Subscriptions a stores para reacciones a cambios de settings. */
private setupReactiveStores(): void { /* mover bloque */ }
/** onLayoutReady inicial: migraciones, leaf inicial, update. */
private deferWorkspaceInit(): void { /* mover bloque */ }
```

### 1.3 filterItems – corregir uso de `contains` + documentar (A)
**Ubicación:** ~225–300.
**Código Anterior (extracto problemático):**
```ts
if (filter.filterTags.length > 0) {
  filteredItems = filteredItems.filter((item) => {
    for (const tag of filter.filterTags) {
      if (!item.tags.contains(tag)) return false;
    }
    return true;
  });
}
```
**Código Sugerido:**
```ts
/**
 * Aplica filtro de tags (requiere que el item contenga TODOS los tags del filtro).
 */
if (filter.filterTags.length > 0) {
  filteredItems = filteredItems.filter(item =>
    Array.isArray(item.tags) && filter.filterTags.every(tag => item.tags.includes(tag))
  );
}
```

### 1.4 rebuildIndexes – JSDoc y simplificación (M)
**Ubicación:** ~500.
**Código Anterior:**
```ts
rebuildIndexes(): void {
  this.itemByLink.clear();
  this.unreadCountByFeed.clear();
  for (const feedContent of (this.settings.items || [])) {
    if (!feedContent || !Array.isArray(feedContent.items)) continue;
    let unread = 0;
    for (const it of feedContent.items) {
      if (it && it.link) this.itemByLink.set(it.link, it as any);
      if (!it.read) unread++;
      if (it.pubDate && (it as any).pubDateMs === undefined) {
        (it as any).pubDateMs = Date.parse(it.pubDate) || 0;
      }
    }
    this.unreadCountByFeed.set(feedContent.name, unread);
  }
}
```
**Código Sugerido:**
```ts
/**
 * Reconstruye índices aceleradores:
 * - link -> item
 * - feedName -> unreadCount
 * También pre-calcula pubDateMs si no existe.
 */
rebuildIndexes(): void {
  this.itemByLink.clear();
  this.unreadCountByFeed.clear();
  const feeds = this.settings.items ?? [];
  for (const fc of feeds) {
    if (!fc?.items) continue;
    let unread = 0;
    for (const it of fc.items) {
      if (!it) continue;
      if (it.link) this.itemByLink.set(it.link, it as RssFeedItem);
      if (!it.read) unread++;
      if (it.pubDate && (it as any).pubDateMs == null) (it as any).pubDateMs = Date.parse(it.pubDate) || 0;
    }
    if (fc.name) this.unreadCountByFeed.set(fc.name, unread);
  }
}
```

### 1.5 writeFeedContentDebounced duplicado (M)
**Mejora:** Eliminar en `main.ts` y delegar sólo al `SettingsManager`. Documentar en ese archivo.

---
## 2. src/services/FeedUpdater.ts
### 2.1 Clase y método principal (A)
**Ubicación:** inicio + método `updateFeeds`.
**Código Anterior (fragmento):**
```ts
export class FeedUpdater {
  private abort?: AbortController;
  private updating = false;
  constructor(private plugin: RssReaderPlugin) {}
  async updateFeeds(): Promise<void> { /* ... */ }
}
```
**Código Sugerido:**
```ts
/**
 * Orquesta la actualización concurrente de todos los feeds configurados.
 * Gestiona abort (cancel) y evita ejecuciones superpuestas.
 */
export class FeedUpdater {
  private abort?: AbortController;
  private updating = false;
  constructor(private plugin: RssReaderPlugin) {}

  /** @returns true si ya hay una actualización en curso. */
  isUpdating(): boolean { return this.updating; }
  /** Cancela (abort) la ejecución actual si existe. */
  cancel(): void { this.abort?.abort(); }

  /**
   * Descarga y fusiona items de todos los feeds.
   * - Aplica timeout individual por feed.
   * - Preserva estado de usuario (read/favorite/highlights).
   */
  async updateFeeds(): Promise<void> { /* body sin cambios lógicos */ }
}
```

### 2.2 Timeout helper extraído (M)
**Código Anterior:** Inline `const timeout = (p,ms)=>...` dentro del método.
**Código Sugerido:**
```ts
/** Envuelve una promesa con timeout de rechazo. */
private withTimeout<T>(p: Promise<T>, ms: number): Promise<T> { /* mover implementación */ }
```
(Aplicar y reemplazar llamadas.)

### 2.3 Comentarios en merge de feeds (M)
Insertar comentarios:
```ts
// STEP 1: Mapear items existentes por link para preservación de flags
// STEP 2: Fusionar items nuevos reteniendo estado usuario
// STEP 3: Conservar items antiguos ausentes (histórico)
```

---
## 3. src/services/ItemStateService.ts
### 3.1 Métodos toggle con JSDoc (A)
**Código Anterior:**
```ts
async toggleRead(wrapperOrRaw: any): Promise<boolean> { /* ... */ }
```
**Código Sugerido:**
```ts
/**
 * Invierte estado read de un item (envoltorio o raw) y persiste con debounce.
 * @param wrapperOrRaw Item o wrapper con .item interno.
 * @returns Nuevo estado read (true = leído).
 */
async toggleRead(wrapperOrRaw: RssFeedItem | {item:RssFeedItem}): Promise<boolean> { /* ... */ }
```
*(Aplicar también a `toggleFavorite` + documentar `syncRaw` privado.)*

---
## 4. src/services/CountersService.ts
### 4.1 Documentar métodos públicos (M)
Ejemplo:
```ts
/** @returns número total de items no leídos en todos los feeds. */
globalUnread(): number { /* ... */ }
```
Aplicar a: `feedUnread`, `folderUnread`, `favoriteCount`, `favoriteItems`, `unreadByFeed`, `unreadByFolder`.

---
## 5. src/modals/ItemModal.ts
### 5.1 Clase + campos (A)
Agregar bloque JSDoc general similar al de `main.ts`.

### 5.2 Métodos de navegación previous/next (M)
**Código Anterior:**
```ts
previous(): void { /* findIndex luego -- */ }
```
**Código Sugerido:**
```ts
/** Navega al item anterior en la colección mantenida. No hace nada si ya es el primero. */
previous(): void { /* sin cambio lógico */ }
```

### 5.3 markItemReadAndPersist (A)
Añadir documentación clara de efectos secundarios (evento + persistencia) y reemplazar bucle anidado por lookup directo con índice si ya se adopta `plugin.getItemByLink`.

### 5.4 embedSocialLinks (A)
**Código Anterior (fragmento inicial):**
```ts
private async embedSocialLinks(contentEl: HTMLElement): Promise<void> {
  const cfg = this.plugin.settings.socialEmbeds;
  if (!cfg || !cfg.enable) return;
  // ...
}
```
**Código Sugerido:**
```ts
/**
 * Reescribe enlaces sociales según configuración (nitter / teddit / invidious) y
 * genera cajas simples sin llamadas de red.
 * Idempotente: marca cada enlace con data-* para evitar reprocesos.
 */
private async embedSocialLinks(contentEl: HTMLElement): Promise<void> {
  const cfg = this.plugin.settings.socialEmbeds;
  if (!cfg?.enable) return;
  // ... resto sin cambio lógico
}
```

### 5.5 Comentarios de pasos en embedSocialLinks (M)
Insertar comentarios:
```ts
// 1. Clasificar anchors por dominio destino
// 2. Procesar Twitter -> nitter (si configurado)
// 3. Procesar Reddit -> teddit
// 4. Reescritura YouTube -> Invidious (si aplica)
// 5. Insertar contenedores embebidos básicos
```

### 5.6 Seguridad excerpt (A)
Añadir comentario TODO:
```ts
// TODO: Sanitizar HTML antes de innerHTML (riesgo XSS si feed malicioso)
```

---
## 6. src/view/ViewLoader.ts
### 6.1 Clase + onOpen/onClose (M)
Agregar JSDoc a la clase y cada método público (`getViewType`, `getDisplayText`, `mountSvelte`).

### 6.2 mountSvelte error path (B)
Añadir comentario explicando fallback y sugerencia de botón Retry.

---
## 7. src/view/RssRoot.svelte
### 7.1 Bloque `<script>`: describir estado (A)
Agregar comentario superior:
```ts
/**
 * RssRoot: Componente raíz de la vista RSS.
 * Responsabilidades: cargar carpetas, construir lista plana, agrupar por día,
 * gestionar modo favoritos y despacho de eventos.
 */
```

### 7.2 Reemplazar `any` (A)
**Código Anterior (fragmento):**
```ts
let listItems: { feed: Feed|null, item: any }[] = [];
```
**Código Sugerido:**
```ts
interface ListEntry { feed: Feed|null; item: RssFeedItem; }
let listItems: ListEntry[] = [];
```
*(Aplicar donde se repiten `any` para items.)*

### 7.3 Funciones auxiliares con JSDoc (M)
Ejemplo para `deriveThumb`:
```ts
/** Heurística para determinar miniatura del item (mediaThumbnail > image > primera <img>). */
function deriveThumb(it: RssFeedItem): string | undefined { /* ... */ }
```

### 7.4 Listeners globales – comentar necesidad (M)
Añadir comentario antes de `addEventListener` indicando cleanup (y luego implementarlo) – aunque este plan es sólo documental, se documenta intención:
```ts
// NOTE: Listeners globales: asegurarse de remover en onDestroy (ver sección refactor). 
```

### 7.5 Agrupado por fechas – comentarios pasos (M)
Insertar:
```ts
// Paso: normalizar fecha a medianoche para clave de agrupado
// Paso: clasificar en today / yesterday / ISO date
```

### 7.6 summary() sanitización (A)
Agregar TODO comentario como en ItemModal.

---
## 8. src/settings/settings.ts
### 8.1 Interfaces exportadas (M)
Agregar JSDoc a `RssReaderSettings`, `RssFeed`, secciones anidadas (`socialEmbeds`).

### 8.2 DEFAULT_SETTINGS (B)
Añadir comentario arriba:
```ts
/** Valores por defecto fusionados con el estado persistido en loadSettings(). */
```

---
## 9. src/settings/SocialSettings.ts
### 9.1 Clase sección UI (M)
Agregar JSDoc breve explicando que renderiza controles de social embeds y persistencia inmediata.

### 9.2 onChange callbacks (B)
Insertar comentario “// Persistir ajuste y re-render dinámico” sobre cada bloque.

---
## 10. src/services/SettingsManager.ts
### 10.1 Clase + métodos (M)
Documentar cada método con @param y @returns.

**Ejemplo:**
```ts
/** Persiste un cambio completo de items (no debounced). @param change Función que retorna nuevo array de items. */
async writeFeedContent(change: (items: RssFeedContent[]) => RssFeedContent[]): Promise<void> { /* ... */ }
```

---
## 11. src/parser/*.ts (opmlParser, rssParser, opmlExport)
### 11.1 Funciones principales (A)
Agregar JSDoc a exportaciones: propósito, entradas, formato de retorno, errores posibles.

**Ejemplo (rssParser extracto hipotético):**
```ts
/**
 * Descarga y parsea un feed RSS/Atom.
 * @param feed Definición de feed (url, nombre, carpeta).
 * @param opts Opciones (signal para abort, etc.).
 * @returns Estructura normalizada RssFeedContent o null en error.
 */
export async function getFeedItems(feed: RssFeed, opts?: { signal?: AbortSignal }): Promise<RssFeedContent|null> {
  // ...
}
```

---
## 12. src/providers/*.ts (Feed, Folder, Item, FeedProvider, LocalFeedProvider)
### 12.1 Clases modelo (M)
Agregar JSDoc: qué encapsula, qué métodos exponen (getter wrappers vs raw).

### 12.2 Factores de naming (B)
Si existen métodos ambiguos (ej. `items()` vs `getItems()`), sugerir estandarizar prefijo `get` para claridad.

---
## 13. src/actions/Action.ts
### 13.1 Enum-like / registry (M)
Agregar JSDoc por acción describiendo side-effects (copiar al portapapeles, abrir link, etc.).

---
## 14. src/functions.ts (utilidades) (A)
### 14.1 Archivo grande – segmentación
Dividir en módulos temáticos (`markdownUtils.ts`, `stringUtils.ts`, `fsUtils.ts`). Documentar cada función con propósito y casos borde.

**Ejemplo JSDoc sugerido:**
```ts
/** Convierte HTML RSS a Markdown con ajustes específicos del plugin. */
export function rssToMd(plugin: RssReaderPlugin, html: string): string { /* ... */ }
```

---
## 15. src/events.ts / src/consts.ts
Añadir JSDoc por clave exportada explicando cuándo se emite / cómo se consume.

**Ejemplo:**
```ts
/** Disparado cuando conteos unread cambian (marcar leído / refresh feeds). Detail opcional: { scope, name }. */
export const RSS_EVENTS = { /* ... */ };
```

---
## 16. Componentes Svelte extra (FolderView, ListItem, etc.)
### 16.1 Props y eventos (M)
Agregar en `<script>` comentarios:
```ts
/** Props:
 * @prop feed Feed asociado
 * @prop item Item individual
 * Eventos emitidos: on:open, on:toggleRead
 */
```

### 16.2 Bloques condicionales complejos (B)
Insertar comentarios arriba de cada `{#if}` extenso explicando intención (“// Mostrar placeholder si no hay items cargados”).

---
## 17. Tests (referencia rápida, opcional)
Aunque fuera del alcance estricto, añadir JSDoc a utilidades de mocks ayuda a onboard.

---
## 18. Guía de Estándares a Introducir
Agregar (en README futuro) apartado “Estilo Interno” con:
- Todas las funciones exportadas deben tener JSDoc.
- Clases: descripción + responsabilidades + invariantes.
- Prefijo `get` para getters que no son propiedades directas.
- Evitar `any`: usar tipos `RssFeedItem`, `RssFeedContent`.
- Comentarios de bloque `/** STEP: ... */` para secciones largas.

---
## 19. Patrón de Comentarios Internos
Ejemplo a replicar en merges / transformaciones:
```ts
// STEP 1: Normalizar entrada
// STEP 2: Filtrar duplicados por link
// STEP 3: Enriquecer con metadata (pubDateMs)
// STEP 4: Ordenar por fecha descendente
```

---
## 20. Checklist de Implementación (orden sugerido)
1. Definir tipos centrales (`RssFeedItem`, `RssFeedContent`) y reemplazar `any` (fases). (A)
2. Añadir JSDoc a clases de servicios y plugin. (A)
3. Documentar parser y providers. (A)
4. Refactor `main.ts` en métodos privados (sin dividir archivo aún). (M)
5. Documentar `ItemModal` y anotar TODO de sanitización. (A)
6. Svelte: agregar interfaces / props + comentarios de agrupado. (M)
7. Segmentar `functions.ts` (si grande) y documentar. (M)
8. Añadir comentarios STEP en merges (FeedUpdater). (M)
9. Añadir JSDoc a settings e interfaces. (M)
10. Ajustar README con “Estilo Interno”. (B)

---
## Notas Finales
- Ningún cambio propuesto altera lógica; sólo estructuración y claridad.
- Al aplicar, ejecutar linters para asegurar que no se introducen errores de import faltante tras segmentación.
- Tras tipar, se recomienda activar `"noImplicitAny": true` en `tsconfig` (si no lo está) como fase final.

---
## Resumen Breve de Cambios Globales
| Área | Acción | Impacto |
|------|--------|---------|
| Tipado | Reemplazar any por tipos dominio | +Seguridad estática |
| Documentación | JSDoc en clases/funciones | +Onboarding |
| Organización | Extraer métodos en main / segmentar utils | +Legibilidad |
| Comentarios | STEP / TODO XSS | +Mantenibilidad |
| Naming | Prefijo get y consistencia | +Claridad |

Fin del plan.
