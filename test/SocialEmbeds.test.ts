import {ItemModal} from '../src/modals/ItemModal';
import { jest } from '@jest/globals';
jest.mock('@vanakat/plugin-api', () => ({ pluginApi: (): null => null }));

class FakeApp { workspace:any = { getLeavesOfType: (): any[] => [] }; plugins:any = { plugins: {} }; }
class FakePlugin { app:any = new FakeApp(); settings:any; writeFeedContent=async()=>{}; constructor(settings:any){ this.settings = settings; } }

function baseSettings(){
  return {
    hotkeys:{}, dateFormat:'YYYY-MM-DD', displayMedia:false,
    items: [ { name:'Feed', folder:'', items:[] } ],
    socialEmbeds: {
      enable: true,
      twitterMode: 'nitter', nitterInstance: 'https://nitter.net',
      redditMode: 'teddit', tedditInstance: 'https://teddit.net',
      youtubeMode: 'invidious', invidiousInstance: 'https://yewtu.be',
      cacheMinutes: 60, suppressErrors: true
    }
  };
}

class FakeItem {
  raw:any; private _html:string;
  constructor(html:string){
    this.raw = { link:'l', title:'Title', read:false, favorite:false };
    this._html = html;
  }
  title(){ return 'Title'; }
  id(){ return 'id'; }
  body(){ return this._html; }
  description(){ return '<p>Desc</p>'; }
  author(){ return 'Auth'; }
  pubDate(){ return new Date().toISOString(); }
  language(){ return 'en'; }
  tags(): any[]{ return []; }
  highlights(): any[]{ return []; }
  enclosureLink(): any { return null; }
  enclosureMime(){ return ''; }
  markRead(v:boolean){ this.raw.read = v; }
}

function extractLinks(modal: any){
  return Array.from(modal.contentEl.querySelectorAll('a')).map((a:any)=>a.href);
}

describe('Social embeds rewriting', () => {
  beforeAll(()=> { (globalThis as any).window = (globalThis as any).window || {}; (window as any).moment = ()=> ({ format:()=> '2025-01-01' }); });

  test('nitter + teddit + invidious rewrites and creates basic boxes', async () => {
    // Usamos contenedor sintético para invocar directamente el método privado y aislar de MarkdownRenderer.
    const html = `<a href="https://twitter.com/user/status/1234567890123456789">tweet</a>`+
      `<a href="https://www.reddit.com/r/test/comments/abcdef/post_title/">reddit</a>`+
      `<a href="https://www.youtube.com/watch?v=VIDEOID12345">yt1</a>`+
      `<a href="https://youtu.be/VIDEOID67890">yt2</a>`;
    const item:any = new FakeItem(`<p>placeholder</p>`); // cuerpo no relevante aquí
    const plugin:any = new FakePlugin(baseSettings());
    plugin.settings.items[0].items.push(item.raw);
    const modal:any = new ItemModal(plugin, item, [item], true);
    // Crear contenedor manual
    const container = document.createElement('div');
    container.innerHTML = html;
    await modal.embedSocialLinks(container);
  const boxes = container.querySelectorAll('.social-embed.simple');
  expect(boxes.length).toBe(2); // twitter + reddit boxes
  const linkHrefs = Array.from(container.querySelectorAll('a')).map((a:any)=>a.href);
  const boxLinkHrefs = Array.from(container.querySelectorAll('.social-embed.simple a')).map((a:any)=>a.href);
  // Nitter rewrite present in some box link
  expect(boxLinkHrefs.some(h=> h.includes('nitter.net/user/status/1234567890123456789'))).toBeTruthy();
  // Debug log to inspect generated box links
  // (Will appear in test output if failing)
  // eslint-disable-next-line no-console
  console.log('BOX_LINK_HREFS', boxLinkHrefs);
  // Teddit rewrite present (allow any suffix after /abcdef)
  expect(boxLinkHrefs.some(h=> h.includes('teddit.net/r/test/comments/abcdef'))).toBeTruthy();
  // youtube rewrites (anchors list)
  expect(linkHrefs.some(h=> h.includes('yewtu.be/watch?v=VIDEOID12345'))).toBeTruthy();
  expect(linkHrefs.some(h=> h.includes('yewtu.be/watch?v=VIDEOID67890'))).toBeTruthy();
  });

  test('disabled feature does not add boxes or rewrite', async () => {
  const html = `<a href="https://twitter.com/user/status/1">tweet</a>`;
  const item:any = new FakeItem(`<p>placeholder</p>`);
    const s = baseSettings(); s.socialEmbeds.enable = false;
    const plugin:any = new FakePlugin(s); plugin.settings.items[0].items.push(item.raw);
  const modal:any = new ItemModal(plugin, item, [item], true);
  const container = document.createElement('div');
  container.innerHTML = html;
  await modal.embedSocialLinks(container);
  const boxes = container.querySelectorAll('.social-embed.simple');
    expect(boxes.length).toBe(0);
  const links = Array.from(container.querySelectorAll('a')).map((a:any)=>a.href);
    expect(links.some(h=> h.includes('twitter.com/user/status/1'))).toBeTruthy();
  });
});
