import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { Command } from '../../types';
import { sendLog } from '../../handlers/logUtil';

const mute: Command = {
  data: new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Silencia um usuário por tempo determinado.')
    .addUserOption(option => 
      option.setName('usuario')
        .setDescription('Usuário a ser silenciado')
        .setRequired(true)
    )
    .addStringOption(option => 
      option.setName('motivo')
        .setDescription('Motivo do mute')
        .setRequired(true)
    )
    .addStringOption(option => 
      option.setName('tempo')
        .setDescription('Tempo do mute (ex: 10m, 1h, 2d)')
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
    const tempo = interaction.options.getString('tempo', true);
    const motivo = interaction.options.getString('motivo', true);
    
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

      if (member.roles.cache.has(muteRoleId)) {
        const embed = new EmbedBuilder()
          .setTitle('Erro')
          .setDescription('O usuário já está mutado.')
          .setColor(0xFF0000);
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      // Verificar hierarquia de cargos
      if (interaction.member && 'roles' in interaction.member && 'cache' in interaction.member.roles && member.roles.highest.position >= interaction.member.roles.highest.position && interaction.user.id !== interaction.guild.ownerId) {
        const embed = new EmbedBuilder()
          .setTitle('Erro')
          .setDescription('Você não pode mutar este usuário devido à hierarquia de cargos.')
          .setColor(0xFF0000);
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      // Parse tempo (ex: 10m, 1h)
      const match = tempo.match(/^(\d+)([smhd])$/);
      if (!match) {
        const embed = new EmbedBuilder()
          .setTitle('Erro')
          .setDescription('Tempo inválido. Use o formato 10m, 1h, 2d, etc.')
          .setColor(0xFF0000);
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      const value = parseInt(match[1]);
      const unit = match[2];

      if (value <= 0) {
        const embed = new EmbedBuilder()
          .setTitle('Erro')
          .setDescription('O tempo deve ser maior que zero.')
          .setColor(0xFF0000);
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      if (unit === 'd' && value > 30) {
        const embed = new EmbedBuilder()
          .setTitle('Erro')
          .setDescription('O tempo máximo de mute é 30 dias.')
          .setColor(0xFF0000);
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      let ms = 0;
      if (unit === 's') ms = value * 1000;
      else if (unit === 'm') ms = value * 60 * 1000;
      else if (unit === 'h') ms = value * 60 * 60 * 1000;
      else if (unit === 'd') ms = value * 24 * 60 * 60 * 1000;
      
      const expiresAt = Date.now() + ms;

      // Adicionar cargo de mute
      await member.roles.add(muteRoleId);

      // Salvar no banco
      if (db) {
        db.prepare(`CREATE TABLE IF NOT EXISTS mutes (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, guild_id TEXT, expires_at INTEGER, mute_role_id TEXT)`).run();
        db.prepare(`INSERT INTO mutes (user_id, guild_id, expires_at, mute_role_id) VALUES (?, ?, ?, ?)`)
          .run(user.id, interaction.guild.id, expiresAt, muteRoleId);
      }

      // Agendar remoção do mute
      setTimeout(async () => {
        const guild = client?.guilds.cache.get(interaction.guild!.id);
        if (!guild) return;
        
        try {
          const targetMember = await guild.members.fetch(user.id);
          if (targetMember && targetMember.roles.cache.has(muteRoleId)) {
            await targetMember.roles.remove(muteRoleId);
            
            // Log de desmute automático
            if (db && client) {
              const logEmbed = new EmbedBuilder()
                .setDescription(`# <:megaphone:1400607103240114316> Mute removido de <@${user.id}> (automático)\n**<:users:1400607499865817118> ID:** \`${user.id}\``)
                .setFooter({ text: `Desmute automático por expiração`, iconURL: client.user?.displayAvatarURL() })
                .setColor(0x00FF99);
              sendLog(db, client, interaction.guild!.id, 'mute', logEmbed);
            }
          }
        } catch (error) {
          // Usuário não encontrado ou erro ao remover role
        }
        
        if (db) {
          db.prepare('DELETE FROM mutes WHERE user_id = ? AND guild_id = ?').run(user.id, interaction.guild!.id);
        }
      }, ms);

      // Resposta e log
      const embed = new EmbedBuilder()
        .setDescription(`# <:megaphone:1400607103240114316> Mute aplicado em <@${user.id}>\n<:clock:1400607518065033266> Duração: ${tempo} (Expira: <t:${Math.floor(expiresAt/1000)}:f>)\n**<:pen:1400607081383333938> Motivo:** ${motivo}\n\n**<:users:1400607499865817118> ID:** \`${user.id}\``)
        .setFooter({ text: `Executado por: ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
        .setColor(0xFF9900);
      
      await interaction.reply({ embeds: [embed] });

      // Log de moderação
      if (db && client) {
        sendLog(db, client, interaction.guild.id, 'mute', embed);
      }

    } catch (error) {
      console.error('Erro ao aplicar mute:', error);
      const embed = new EmbedBuilder()
        .setTitle('Erro')
        .setDescription('Não foi possível aplicar o mute. Verifique se o bot tem permissões suficientes.')
        .setColor(0xFF0000);
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }
};

export default mute;
