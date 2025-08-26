import { SlashCommandBuilder, EmbedBuilder, CommandInteraction } from 'discord.js';
import { ExtendedClient } from '../../types';
import { Database } from 'better-sqlite3';

export default {
  data: new SlashCommandBuilder()
    .setName('teste')
    .setDescription('Comando de teste para verificar se o bot está funcionando.'),
  async execute(interaction: CommandInteraction, client: ExtendedClient, db: Database) {
    const embed = new EmbedBuilder()
      .setTitle('Bot funcionando!')
      .setDescription('O comando de teste foi executado com sucesso.')
      .setColor(0x00FF00);
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
