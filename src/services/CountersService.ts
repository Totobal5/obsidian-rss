import type RssReaderPlugin from '../main';

export class CountersService {
  constructor(private plugin: RssReaderPlugin) {}
  globalUnread(): number { return (this.plugin.settings.items||[]).reduce((a,fc:any)=> a + (Array.isArray(fc.items)? fc.items.filter((i:any)=> i.read!==true).length:0),0); }
  feedUnread(name: string): number { const fc = (this.plugin.settings.items||[]).find((f:any)=> f.name===name); return fc? fc.items.filter((i:any)=> i.read!==true).length:0; }
  folderUnread(folder: string): number { return (this.plugin.settings.items||[]).filter((f:any)=> f.folder===folder).reduce((a,fc:any)=> a+ fc.items.filter((i:any)=> i.read!==true).length,0); }
}
