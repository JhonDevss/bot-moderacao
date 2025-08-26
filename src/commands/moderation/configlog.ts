import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } from 'discord.js';
import { Command, LogChannels } from '../../types';

const configlog: Command = {
  data: new SlashCommandBuilder()
    .setName('configlog')
    .setDescription('Configura os canais de logs de moderação e de comandos de role.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
  async execute(interaction, client, db) {
    const roleManagerId = process.env.ROLE_MANAGER_ID;
    
    // Verificar permissão de cargo de gerenciador de roles
    if (roleManagerId && interaction.member && 'cache' in interaction.member.roles && !interaction.member.roles.cache.has(roleManagerId)) {
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

    // Buscar canais configurados
    db.prepare(`CREATE TABLE IF NOT EXISTS log_channels (guild_id TEXT PRIMARY KEY, log_mod_channel TEXT, log_role_channel TEXT)`).run();
    const logRow = db.prepare('SELECT * FROM log_channels WHERE guild_id = ?').get(interaction.guild.id) as LogChannels | undefined;
    
    const modLog = logRow && logRow.log_mod_channel ? `<#${logRow.log_mod_channel}>` : 'Não configurado';
    const roleLog = logRow && logRow.log_role_channel ? `<#${logRow.log_role_channel}>` : 'Não configurado';
    
    const embed = new EmbedBuilder()
      .setTitle('Configuração de Logs')
      .setDescription('Escolha qual log deseja configurar:')
      .addFields(
        { name: 'Log de Moderação', value: modLog, inline: false },
        { name: 'Log de Comandos de Role', value: roleLog, inline: false }
      )
      .setColor(0x0099FF);
    
    const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('config_log_mod')
        .setLabel('Configurar log de moderação')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('config_log_role')
        .setLabel('Configurar log de comandos de role')
        .setStyle(ButtonStyle.Secondary)
    );
    
    await interaction.reply({ embeds: [embed], components: [actionRow], ephemeral: true });
  }
};

export default configlog;
