import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { Command, MuteRecord } from '../../types';

const mutelist: Command = {
  data: new SlashCommandBuilder()
    .setName('mutelist')
    .setDescription('Lista todos os usuários mutados no servidor.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    
  async execute(interaction, client, db) {
    const modRoleId = process.env.MOD_ROLE_ID;
    
    // Verificar permissão de cargo de moderador
    if (modRoleId && interaction.member && 'cache' in interaction.member.roles && !interaction.member.roles.cache.has(modRoleId)) {
      const embed = new EmbedBuilder()
        .setTitle('Permissão negada')
        .setDescription('Você não possui o cargo necessário para usar este comando.')
        .setColor(0xFF0000);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    if (!interaction.guild || !db) {
      await interaction.reply({ content: 'Este comando só pode ser usado em um servidor.', ephemeral: true });
      return;
    }

    try {
      db.prepare(`CREATE TABLE IF NOT EXISTS mutes (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, guild_id TEXT, expires_at INTEGER, mute_role_id TEXT)`).run();
      
      const mutes = db.prepare('SELECT * FROM mutes WHERE guild_id = ? ORDER BY expires_at ASC').all(interaction.guild.id) as MuteRecord[];
      
      if (mutes.length === 0) {
        const embed = new EmbedBuilder()
          .setTitle('Lista de Mutes')
          .setDescription('Não há usuários mutados no servidor.')
          .setColor(0x00FF99);
        await interaction.reply({ embeds: [embed] });
        return;
      }

      let description = '';
      const now = Date.now();
      
      for (const mute of mutes.slice(0, 10)) { // Limita a 10 para evitar embed muito grande
        const user = await client?.users.fetch(mute.user_id).catch(() => null);
        const username = user ? user.tag : `ID: ${mute.user_id}`;
        const timeLeft = mute.expires_at - now;
        
        if (timeLeft > 0) {
          const minutes = Math.floor(timeLeft / (1000 * 60));
          const hours = Math.floor(minutes / 60);
          const days = Math.floor(hours / 24);
          
          let timeStr = '';
          if (days > 0) timeStr = `${days}d ${hours % 24}h ${minutes % 60}m`;
          else if (hours > 0) timeStr = `${hours}h ${minutes % 60}m`;
          else timeStr = `${minutes}m`;
          
          description += `<@${mute.user_id}> (${username})\n📅 Expira em: ${timeStr} (<t:${Math.floor(mute.expires_at/1000)}:R>)\n\n`;
        } else {
          description += `<@${mute.user_id}> (${username})\n⏰ **EXPIRADO** - será removido em breve\n\n`;
        }
      }

      if (mutes.length > 10) {
        description += `\n*... e mais ${mutes.length - 10} usuário(s) mutado(s)*`;
      }

      const embed = new EmbedBuilder()
        .setTitle(`Lista de Mutes (${mutes.length})`)
        .setDescription(description)
        .setColor(0xFF9900);
        
      await interaction.reply({ embeds: [embed] });
      
    } catch (error) {
      console.error('Erro no comando mutelist:', error);
      const embed = new EmbedBuilder()
        .setTitle('Erro')
        .setDescription('Ocorreu um erro ao buscar a lista de mutes.')
        .setColor(0xFF0000);
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }
};

export default mutelist;
