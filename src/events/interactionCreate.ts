import { EmbedBuilder, Interaction, ChatInputCommandInteraction, ButtonInteraction, ChannelSelectMenuInteraction, ActionRowBuilder, ChannelSelectMenuBuilder, ChannelType } from 'discord.js';
import { ExtendedClient } from '../types';
import Database from 'better-sqlite3';

export default {
  name: 'interactionCreate',
  async execute(interaction: Interaction, client: ExtendedClient, db: Database.Database) {
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      
      try {
        await command.execute(interaction, client, db);
      } catch (error) {
        console.error(error);
        const embed = new EmbedBuilder()
          .setTitle('Erro')
          .setDescription('Ocorreu um erro ao executar o comando.')
          .setColor(0xFF0000);
        await interaction.reply({ embeds: [embed], ephemeral: true });
      }
    } else if (interaction.isButton()) {
      // Botões de configuração
      if (interaction.customId === 'config_log_mod') {
        const row = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
          new ChannelSelectMenuBuilder()
            .setCustomId('select_log_mod_channel')
            .setPlaceholder('Selecione o canal de log de moderação')
            .addChannelTypes(ChannelType.GuildText)
        );
        const embed = new EmbedBuilder()
          .setTitle('Configurar log de moderação')
          .setDescription('Selecione o canal para logs de moderação:')
          .setColor(0x0099FF);
        await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
      } else if (interaction.customId === 'config_log_role') {
        const row = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
          new ChannelSelectMenuBuilder()
            .setCustomId('select_log_role_channel')
            .setPlaceholder('Selecione o canal de log de comandos de role')
            .addChannelTypes(ChannelType.GuildText)
        );
        const embed = new EmbedBuilder()
          .setTitle('Configurar log de comandos de role')
          .setDescription('Selecione o canal para logs de comandos de role:')
          .setColor(0x0099FF);
        await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
      }
    } else if (interaction.isChannelSelectMenu()) {
      const embed = new EmbedBuilder();
      db.prepare(`CREATE TABLE IF NOT EXISTS log_channels (guild_id TEXT PRIMARY KEY, log_mod_channel TEXT, log_role_channel TEXT)` ).run();
      
      if (interaction.customId === 'select_log_mod_channel') {
        const channel = interaction.channels.first();
        if (!channel) return;
        
        // Atualiza apenas o canal de moderação
        const prev = db.prepare('SELECT * FROM log_channels WHERE guild_id = ?').get(interaction.guild?.id);
        if (prev) {
          db.prepare('UPDATE log_channels SET log_mod_channel = ? WHERE guild_id = ?').run(channel.id, interaction.guild?.id);
        } else {
          db.prepare('INSERT INTO log_channels (guild_id, log_mod_channel, log_role_channel) VALUES (?, ?, NULL)').run(interaction.guild?.id, channel.id);
        }
        embed.setTitle('Canal de log de moderação configurado!')
          .setDescription(`Os logs de moderação serão enviados para <#${channel.id}>.`)
          .setColor(0x00FF99);
        await interaction.update({ embeds: [embed], components: [] });
      } else if (interaction.customId === 'select_log_role_channel') {
        const channel = interaction.channels.first();
        if (!channel) return;
        
        // Atualiza apenas o canal de role
        const prev = db.prepare('SELECT * FROM log_channels WHERE guild_id = ?').get(interaction.guild?.id);
        if (prev) {
          db.prepare('UPDATE log_channels SET log_role_channel = ? WHERE guild_id = ?').run(channel.id, interaction.guild?.id);
        } else {
          db.prepare('INSERT INTO log_channels (guild_id, log_mod_channel, log_role_channel) VALUES (?, NULL, ?)').run(interaction.guild?.id, channel.id);
        }
        embed.setTitle('Canal de log de comandos de role configurado!')
          .setDescription(`Os logs de comandos de role serão enviados para <#${channel.id}>.`)
          .setColor(0x00FF99);
        await interaction.update({ embeds: [embed], components: [] });
      }
    }
  }
};
