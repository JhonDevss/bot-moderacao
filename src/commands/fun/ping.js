const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Mostra a latência do bot'),
  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setTitle('🏓 Pong!')
      .setDescription(`**Latência:** \`${Date.now() - interaction.createdTimestamp}ms\`\n**API:** \`${Math.round(interaction.client.ws.ping)}ms\``)
      .setColor(0x00FF99)
      .setTimestamp();
    
    await interaction.reply({ embeds: [embed] });
  }
};
