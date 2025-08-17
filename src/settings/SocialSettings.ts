import {SettingsSection} from './SettingsSection';
import {Setting, TextComponent, ToggleComponent, DropdownComponent} from 'obsidian';
import t from '../l10n/locale';

export class SocialSettings extends SettingsSection {
    getName(): string { return 'Social / Embeds'; }

    display(): void {
        this.contentEl.empty();
        const s = this.plugin.settings.socialEmbeds ?? {} as any;

        new Setting(this.contentEl)
            .setName('Activar embeds sociales')
            .setDesc('Convierte links de Twitter/X, Reddit en bloques enriquecidos (sin llamadas a APIs privadas).')
            .addToggle((tg: ToggleComponent)=> tg
                .setValue(!!s.enable)
                .onChange(async v => { await this.plugin.writeSettings(()=> ({ socialEmbeds: {...s, enable: v} })); })
            );

        new Setting(this.contentEl)
            .setName('Twitter/X modo')
            .setDesc('basic: sólo caja estilizada. nitter: reescribe enlace a instancia Nitter.')
            .addDropdown((dd: DropdownComponent)=> dd
                .addOption('basic','basic')
                .addOption('nitter','nitter')
                .setValue(s.twitterMode || 'basic')
                .onChange(async v=> { await this.plugin.writeSettings(()=> ({ socialEmbeds: {...s, twitterMode: v as any} })); })
            );

        if ((s.twitterMode||'basic') === 'nitter') {
            new Setting(this.contentEl)
                .setName('Instancia Nitter')
                .setDesc('Ej: https://nitter.net (sin slash final)')
                .addText((tx: TextComponent)=> tx
                    .setPlaceholder('https://nitter.net')
                    .setValue(s.nitterInstance || 'https://nitter.net')
                    .onChange(async v=> { await this.plugin.writeSettings(()=> ({ socialEmbeds: {...s, nitterInstance: v.trim()||'https://nitter.net'} })); })
                );
        }

        new Setting(this.contentEl)
            .setName('Reddit modo')
            .setDesc('basic: caja simple. teddit: reescribe enlace a instancia Teddit.')
            .addDropdown((dd: DropdownComponent)=> dd
                .addOption('basic','basic')
                .addOption('teddit','teddit')
                .setValue(s.redditMode || 'basic')
                .onChange(async v=> { await this.plugin.writeSettings(()=> ({ socialEmbeds: {...s, redditMode: v as any} })); })
            );

        if ((s.redditMode||'basic') === 'teddit') {
            new Setting(this.contentEl)
                .setName('Instancia Teddit')
                .setDesc('Ej: https://teddit.net (sin slash final)')
                .addText((tx: TextComponent)=> tx
                    .setPlaceholder('https://teddit.net')
                    .setValue(s.tedditInstance || 'https://teddit.net')
                    .onChange(async v=> { await this.plugin.writeSettings(()=> ({ socialEmbeds: {...s, tedditInstance: v.trim()||'https://teddit.net'} })); })
                );
        }

        new Setting(this.contentEl)
            .setName('Cache (min)')
            .setDesc('Tiempo para no reprocesar el mismo link.')
            .addText((tx: TextComponent)=> tx
                .setPlaceholder('60')
                .setValue(String(s.cacheMinutes ?? 60))
                .onChange(async v=> { const num = parseInt(v)||60; await this.plugin.writeSettings(()=> ({ socialEmbeds: {...s, cacheMinutes: num} })); })
            );

        new Setting(this.contentEl)
            .setName('YouTube modo')
            .setDesc('standard: iframe normal. invidious: reescribe a instancia Invidious.')
            .addDropdown((dd: DropdownComponent)=> dd
                .addOption('standard','standard')
                .addOption('invidious','invidious')
                .setValue(s.youtubeMode || 'standard')
                .onChange(async v=> { await this.plugin.writeSettings(()=> ({ socialEmbeds: {...s, youtubeMode: v as any} })); })
            );

        if ((s.youtubeMode||'standard') === 'invidious') {
            new Setting(this.contentEl)
                .setName('Instancia Invidious')
                .setDesc('Ej: https://yewtu.be (sin slash final)')
                .addText((tx: TextComponent)=> tx
                    .setPlaceholder('https://yewtu.be')
                    .setValue(s.invidiousInstance || 'https://yewtu.be')
                    .onChange(async v=> { await this.plugin.writeSettings(()=> ({ socialEmbeds: {...s, invidiousInstance: v.trim()||'https://yewtu.be'} })); })
                );
        }

        new Setting(this.contentEl)
            .setName('Suprimir errores en consola')
            .addToggle((tg: ToggleComponent)=> tg
                .setValue(!!s.suppressErrors)
                .onChange(async v=> { await this.plugin.writeSettings(()=> ({ socialEmbeds: {...s, suppressErrors: v} })); })
            );
    }
}
