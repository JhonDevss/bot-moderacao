import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction } from 'discord.js';
import { ExtendedClient } from '../../types';
import { Database } from 'better-sqlite3';

export default {
  data: new SlashCommandBuilder()
    .setName('dice')
    .setDescription('Rola um dado')
    .addIntegerOption(option =>
      option.setName('lados')
        .setDescription('Número de lados do dado (padrão: 6)')
        .setMinValue(2)
        .setMaxValue(100)
        .setRequired(false)
    ),
  async execute(interaction: ChatInputCommandInteraction, client: ExtendedClient, db: Database) {
    const sides = interaction.options.getInteger('lados') || 6;
    const result = Math.floor(Math.random() * sides) + 1;
    
    const embed = new EmbedBuilder()
      .setTitle('🎲 Rolando o dado...')
      .setDescription(`**Resultado:** \`${result}\`\n**Dado:** D${sides}`)
      .setColor(0xFF6B35)
      .setTimestamp();
    
    await interaction.reply({ embeds: [embed] });
  }
};
