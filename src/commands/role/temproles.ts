import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction } from 'discord.js';
import { ExtendedClient } from '../../types';
import { Database } from 'better-sqlite3';

export default {
  data: new SlashCommandBuilder()
    .setName('temproles')
    .setDescription('Lista todos os cargos temporários ativos no servidor.'),
  async execute(interaction: ChatInputCommandInteraction, client: ExtendedClient, db: Database) {
    const roleManagerId = process.env.ROLE_MANAGER_ID;
    if (!(interaction.member as any)?.roles?.cache?.has(roleManagerId!)) {
      const embed = new EmbedBuilder()
        .setTitle('Permissão negada')
        .setDescription('Você não possui o cargo necessário para usar este comando.')
        .setColor(0xFF0000);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    db.prepare(`CREATE TABLE IF NOT EXISTS temproles (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, role_id TEXT, guild_id TEXT, expires_at INTEGER)`).run();
    
    const rows = db.prepare(`SELECT * FROM temproles WHERE guild_id = ? ORDER BY expires_at ASC`).all(interaction.guild!.id) as {
      id: number;
      user_id: string;
      role_id: string;
      guild_id: string;
      expires_at: number;
    }[];

    if (rows.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle('# <:clipboard:1402079233198526665> Sem Temproles Ativos')
        .setColor(0x0099FF);
      return interaction.reply({ embeds: [embed] });
    }

    // Paginação: mostrar só os 10 primeiros
    const page = 1;
    const perPage = 10;
    const totalPages = Math.ceil(rows.length / perPage);
    const start = (page - 1) * perPage;
    const end = start + perPage;
    const pageRows = rows.slice(start, end);

    let desc = '';
    for (let i = 0; i < pageRows.length; i++) {
      const row = pageRows[i];
      const now = Date.now();
      const ms = row.expires_at - now;
      let tempoInformado = '';
      let absMs = Math.abs(ms);
      
      if (absMs >= 24*60*60*1000) tempoInformado = Math.round(absMs/(24*60*60*1000)) + 'd';
      else if (absMs >= 60*60*1000) tempoInformado = Math.round(absMs/(60*60*1000)) + 'h';
      else if (absMs >= 60*1000) tempoInformado = Math.round(absMs/(60*1000)) + 'm';
      else tempoInformado = Math.round(absMs/1000) + 's';

      const expiresLong = `<t:${Math.floor(row.expires_at/1000)}:f>`;
      const expiresRel = `<t:${Math.floor(row.expires_at/1000)}:R>`;
      
      desc += `# <:clipboard:1402079233198526665> Temproles Ativos\n\n`;
      desc += `**<:user:1402079206124294204> Membro(a):** <@${row.user_id}>\n`;
      desc += `**└<:at:1402079216983343276> Cargo:** <@&${row.role_id}>\n`;
      desc += `ㅤ**└<:calendar:1402079225628065843> Expira em:** ${expiresLong} (${expiresRel}) ➽ ${tempoInformado}\n`;
      
      if (i !== pageRows.length - 1) {
        desc += `\n⎽⎽⎽⎽⎽⎽⎽⎽⎽⎽⎽⎽⎽⎽⎽⎽⎽⎽⎽⎽⎽⎽⎽⎽⎽⎽⎽⎽⎽⎽⎽⎽⎽⎽⎽⎽⎽⎽⎽⎽⎽⎽⎽⎽⎽⎽⎽⎽⎽⎽⎽⎽⎽\n`;
      }
    }

    const embed = new EmbedBuilder()
      .setDescription(desc)
      .setColor('Random');
    
    return await interaction.reply({ embeds: [embed] });
  }
};
