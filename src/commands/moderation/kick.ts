import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { Command } from '../../types';
import { sendLog } from '../../handlers/logUtil';

const kick: Command = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Expulsa um usuário do servidor.')
    .addUserOption(option => 
      option.setName('usuario')
        .setDescription('Usuário a ser expulso')
        .setRequired(true)
    )
    .addStringOption(option => 
      option.setName('motivo')
        .setDescription('Motivo da expulsão')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
    
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

      // Verificar se o usuário pode ser expulso
      if (!member.kickable) {
        const embed = new EmbedBuilder()
          .setTitle('Erro')
          .setDescription('Não posso expulsar este usuário. Verifique se ele tem um cargo superior ao meu.')
          .setColor(0xFF0000);
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      await member.kick(motivo);
      
      const embed = new EmbedBuilder()
        .setTitle('Usuário Expulso')
        .setDescription(`O usuário ${user.tag} foi expulso.\n**Motivo:** ${motivo}`)
        .setColor(0xFF9900);
      
      await interaction.reply({ embeds: [embed] });

      // Log de moderação
      if (db && client) {
        const logEmbed = new EmbedBuilder()
          .setDescription(`# <:kick:1400607113838391327> Kick aplicado a <@${user.id}>\n**<:users:1400607499865817118> ID:** \`${user.id}\`\n**<:reason:1400607504949899366> Motivo:** \`${motivo}\``)
          .setFooter({ text: `Expulso por ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
          .setColor(0xFF9900);
        
        sendLog(db, client, interaction.guild.id, 'mod', logEmbed);
      }
    } catch (error) {
      console.error('Erro ao expulsar usuário:', error);
      const embed = new EmbedBuilder()
        .setTitle('Erro')
        .setDescription('Ocorreu um erro ao tentar expulsar o usuário.')
        .setColor(0xFF0000);
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }
};

export default kick;
