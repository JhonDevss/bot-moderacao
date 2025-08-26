import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { Command } from '../../types';
import { sendLog } from '../../handlers/logUtil';

const ban: Command = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Bane um usuário do servidor.')
    .addUserOption(option => 
      option.setName('usuario')
        .setDescription('Usuário a ser banido')
        .setRequired(true)
    )
    .addStringOption(option => 
      option.setName('motivo')
        .setDescription('Motivo do banimento')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    
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

    const user = interaction.options.getUser('usuario', true);
    const motivo = interaction.options.getString('motivo') || 'Não informado';
    
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

      // Verificar se o usuário pode ser banido
      if (!member.bannable) {
        const embed = new EmbedBuilder()
          .setTitle('Erro')
          .setDescription('Não posso banir este usuário. Verifique se ele tem um cargo superior ao meu.')
          .setColor(0xFF0000);
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      await member.ban({ reason: motivo });
      
      const embed = new EmbedBuilder()
        .setTitle('Usuário Banido')
        .setDescription(`O usuário ${user.tag} foi banido.\n**Motivo:** ${motivo}`)
        .setColor(0xFF9900);
      
      await interaction.reply({ embeds: [embed] });

      // Log de moderação
      if (db && client) {
        const logEmbed = new EmbedBuilder()
          .setDescription(`# <:ban:1400607118495981640> Ban aplicado a <@${user.id}>\n**<:users:1400607499865817118> ID:** \`${user.id}\`\n**<:reason:1400607504949899366> Motivo:** \`${motivo}\``)
          .setFooter({ text: `Banido por ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
          .setColor(0xFF0000);
        
        sendLog(db, client, interaction.guild.id, 'mod', logEmbed);
      }
    } catch (error) {
      console.error('Erro ao banir usuário:', error);
      const embed = new EmbedBuilder()
        .setTitle('Erro')
        .setDescription('Ocorreu um erro ao tentar banir o usuário.')
        .setColor(0xFF0000);
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }
};

export default ban;
