import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { Command } from '../../types';
import { sendLog } from '../../handlers/logUtil';

const unmute: Command = {
  data: new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('Remove o mute de um usuário.')
    .addUserOption(option => 
      option.setName('usuario')
        .setDescription('Usuário para remover o mute')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    
  async execute(interaction, client, db) {
    const modRoleId = process.env.MOD_ROLE_ID;
    const muteRoleId = process.env.MUTE_ROLE_ID;
    
    // Verificar permissão de cargo de moderador
    if (modRoleId && interaction.member && 'cache' in interaction.member.roles && !interaction.member.roles.cache.has(modRoleId)) {
      const embed = new EmbedBuilder()
        .setTitle('Permissão negada')
        .setDescription('Você não possui o cargo necessário para usar este comando.')
        .setColor(0xFF0000);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    if (!muteRoleId) {
      const embed = new EmbedBuilder()
        .setTitle('Erro de configuração')
        .setDescription('O cargo de mute não está configurado. Contate um administrador.')
        .setColor(0xFF0000);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    const user = interaction.options.getUser('usuario', true);
    
    if (!interaction.guild) {
      await interaction.reply({ content: 'Este comando só pode ser usado em um servidor.', ephemeral: true });
      return;
    }

    try {
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      
      if (!member) {
        const embed = new EmbedBuilder()
          .setTitle('Erro')
          .setDescription('Usuário não encontrado no servidor.')
          .setColor(0xFF0000);
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      if (!member.roles.cache.has(muteRoleId)) {
        const embed = new EmbedBuilder()
          .setTitle('Erro')
          .setDescription('O usuário não está mutado.')
          .setColor(0xFF0000);
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      // Remover cargo de mute
      await member.roles.remove(muteRoleId);
      
      // Remover do banco de dados
      if (db) {
        db.prepare('DELETE FROM mutes WHERE user_id = ? AND guild_id = ?').run(user.id, interaction.guild.id);
      }

      const embed = new EmbedBuilder()
        .setTitle('Mute removido')
        .setDescription(`O usuário ${user.tag} foi desmutado.`)
        .setColor(0x00FF99);
      
      await interaction.reply({ embeds: [embed] });

      // Log de moderação
      if (db && client) {
        const logEmbed = new EmbedBuilder()
          .setDescription(`# <:megaphone:1400607103240114316> Mute removido de <@${user.id}> por <@${interaction.user.id}>\n**<:users:1400607499865817118> ID:** \`${user.id}\``)
          .setFooter({ text: `Executado por: ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
          .setColor(0x00FF99);
        
        sendLog(db, client, interaction.guild.id, 'mute', logEmbed);
      }

    } catch (error) {
      console.error('Erro ao remover mute:', error);
      const embed = new EmbedBuilder()
        .setTitle('Erro')
        .setDescription('Não foi possível remover o mute. Verifique se o bot tem permissões suficientes.')
        .setColor(0xFF0000);
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }
};

export default unmute;
