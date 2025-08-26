import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { Command, ExtendedClient, TempRoleRecord } from '../../types';
import { sendLog } from '../../handlers/logUtil';
import Database from 'better-sqlite3';

// Função de startup para limpar cargos temporários expirados e logar remoção
export async function cleanupExpiredTempRoles(client: ExtendedClient, db: Database.Database): Promise<void> {
  db.prepare(`CREATE TABLE IF NOT EXISTS temproles (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, role_id TEXT, guild_id TEXT, expires_at INTEGER, added_by TEXT)`).run();
  const now = Date.now();
  
  // Remover cargos expirados imediatamente
  const expired = db.prepare('SELECT * FROM temproles WHERE expires_at <= ?').all(now) as TempRoleRecord[];
  for (const row of expired) {
    const guild = client.guilds.cache.get(row.guild_id);
    if (!guild) continue;
    
    try {
      const member = await guild.members.fetch(row.user_id);
      if (member && member.roles.cache.has(row.role_id)) {
        await member.roles.remove(row.role_id);
        
        // Log de remoção automática
        const autoLog = new EmbedBuilder()
          .setDescription(`# <:megaphone:1400607103240114316> Cargo temporário <@&${row.role_id}> removido de <@${row.user_id}>\n**<:pen:1400607081383333938> Motivo:** Cargo Expirado (startup)\n\n**<:users:1400607499865817118> ID:** \`${row.user_id}\``)
          .setFooter({ text: `Remoção automática (startup)`, iconURL: client.user?.displayAvatarURL() })
          .setColor(0xFF0000);
        sendLog(db, client, row.guild_id, 'role', autoLog);
      }
    } catch (error) {
      // Membro não encontrado ou erro ao remover role
    }
    
    db.prepare('DELETE FROM temproles WHERE id = ?').run(row.id);
  }

  // Agendar remoção dos cargos temporários ainda ativos
  const active = db.prepare('SELECT * FROM temproles WHERE expires_at > ?').all(now) as TempRoleRecord[];
  for (const row of active) {
    const delay = row.expires_at - now;
    setTimeout(async () => {
      const guild = client.guilds.cache.get(row.guild_id);
      if (!guild) return;
      
      try {
        const member = await guild.members.fetch(row.user_id);
        if (member && member.roles.cache.has(row.role_id)) {
          await member.roles.remove(row.role_id);
          
          // Log de remoção automática
          const autoLog = new EmbedBuilder()
            .setDescription(`# <:megaphone:1400607103240114316> Cargo temporário <@&${row.role_id}> removido de <@${row.user_id}>\n**<:pen:1400607081383333938> Motivo:** Cargo Expirado\n\n**<:users:1400607499865817118> ID:** \`${row.user_id}\``)
            .setFooter({ text: `Remoção automática`, iconURL: client.user?.displayAvatarURL() })
            .setColor(0xFF0000);
          sendLog(db, client, row.guild_id, 'role', autoLog);
        }
      } catch (error) {
        // Membro não encontrado ou erro ao remover role
      }
      
      db.prepare('DELETE FROM temproles WHERE id = ?').run(row.id);
    }, delay);
  }
}

const role: Command = {
  data: new SlashCommandBuilder()
    .setName('role')
    .setDescription('Gerenciamento de cargos')
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('Adiciona um cargo a um ou mais usuários')
        .addStringOption(opt => opt.setName('usuarios').setDescription('IDs ou menções dos usuários separados por espaço').setRequired(true))
        .addRoleOption(opt => opt.setName('cargo').setDescription('Cargo a ser adicionado').setRequired(true))
        .addStringOption(opt => opt.setName('motivo').setDescription('Motivo da aplicação do cargo').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('Remove um cargo de um ou mais usuários')
        .addStringOption(opt => opt.setName('usuarios').setDescription('IDs ou menções dos usuários separados por espaço').setRequired(true))
        .addRoleOption(opt => opt.setName('cargo').setDescription('Cargo a ser removido').setRequired(true))
        .addStringOption(opt => opt.setName('motivo').setDescription('Motivo da remoção do cargo').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('addtemp')
        .setDescription('Adiciona um cargo temporário a um ou mais usuários')
        .addStringOption(opt => opt.setName('usuarios').setDescription('IDs ou menções dos usuários separados por espaço').setRequired(true))
        .addRoleOption(opt => opt.setName('cargo').setDescription('Cargo a ser adicionado').setRequired(true))
        .addStringOption(opt => opt.setName('tempo').setDescription('Tempo do cargo (ex: 10m, 1h)').setRequired(true))
        .addStringOption(opt => opt.setName('motivo').setDescription('Motivo da aplicação do cargo').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('removetemp')
        .setDescription('Remove um cargo temporário de um ou mais usuários')
        .addStringOption(opt => opt.setName('usuarios').setDescription('IDs ou menções dos usuários separados por espaço').setRequired(true))
        .addRoleOption(opt => opt.setName('cargo').setDescription('Cargo a ser removido').setRequired(true))
        .addStringOption(opt => opt.setName('motivo').setDescription('Motivo da remoção do cargo').setRequired(false))
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

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

    if (!interaction.guild || !db || !client) {
      await interaction.reply({ content: 'Este comando só pode ser usado em um servidor.', ephemeral: true });
      return;
    }

    const sub = interaction.options.getSubcommand();
    const usuariosStr = interaction.options.getString('usuarios', true);
    const motivo = interaction.options.getString('motivo') || 'Não informado';
    const role = interaction.options.getRole('cargo', true);
    
    const userIds = usuariosStr.match(/\d{17,}/g);
    if (!userIds || userIds.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle('Erro')
        .setDescription('Nenhum usuário válido informado.')
        .setColor(0xFF0000);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    const success: any[] = [];

    try {
      if (sub === 'add') {
        for (const userId of userIds) {
          const member = await interaction.guild.members.fetch(userId).catch(() => null);
          if (!member) continue;
          await member.roles.add(role.id);
          success.push(member);
        }

        if (success.length > 0) {
          const usersMention = success.map(m => `<@${m.id}>`).join(', ');
          const usersId = success.map(m => `\n\`${m.id}\` (${m.user.tag})`).join('');

          // Log e resposta
          const logEmbed = new EmbedBuilder()
            .setDescription(`# <:megaphone:1400607103240114316> Cargo <@&${role.id}> adicionado para ${usersMention} por <@${interaction.user.id}>\n**<:pen:1400607081383333938> Motivo:** ${motivo}\n\n**<:users:1400607499865817118> ID(s):**${usersId}`)
            .setFooter({ text: `Executado por: ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
            .setColor(0x2DE733);

          await interaction.reply({ embeds: [logEmbed] });
          sendLog(db, client, interaction.guild.id, 'role', logEmbed);
        }

      } else if (sub === 'remove') {
        for (const userId of userIds) {
          const member = await interaction.guild.members.fetch(userId).catch(() => null);
          if (!member) continue;
          await member.roles.remove(role.id);
          success.push(member);
        }

        if (success.length > 0) {
          const usersMention = success.map(m => `<@${m.id}>`).join(', ');
          const usersId = success.map(m => `\n\`${m.id}\` (${m.user.tag})`).join('');

          const logEmbed = new EmbedBuilder()
            .setDescription(`# <:megaphone:1400607103240114316> Cargo <@&${role.id}> removido de ${usersMention} por <@${interaction.user.id}>\n**<:pen:1400607081383333938> Motivo:** ${motivo}\n\n**<:users:1400607499865817118> ID(s):**${usersId}`)
            .setFooter({ text: `Executado por: ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
            .setColor(0xFF0000);

          await interaction.reply({ embeds: [logEmbed] });
          sendLog(db, client, interaction.guild.id, 'role', logEmbed);
        }

      } else if (sub === 'addtemp') {
        const tempo = interaction.options.getString('tempo', true);
        
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

        let ms = 0;
        if (unit === 's') ms = value * 1000;
        else if (unit === 'm') ms = value * 60 * 1000;
        else if (unit === 'h') ms = value * 60 * 60 * 1000;
        else if (unit === 'd') ms = value * 24 * 60 * 60 * 1000;

        const expiresAt = Date.now() + ms;

        // Criar tabela se não existir
        db.prepare(`CREATE TABLE IF NOT EXISTS temproles (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, role_id TEXT, guild_id TEXT, expires_at INTEGER, added_by TEXT)`).run();

        for (const userId of userIds) {
          const member = await interaction.guild.members.fetch(userId).catch(() => null);
          if (!member) continue;
          
          await member.roles.add(role.id);
          success.push(member);

          // Salvar no banco
          db.prepare('INSERT INTO temproles (user_id, role_id, guild_id, expires_at, added_by) VALUES (?, ?, ?, ?, ?)').run(userId, role.id, interaction.guild.id, expiresAt, interaction.user.id);

          // Agendar remoção
          setTimeout(async () => {
            const guild = client.guilds.cache.get(interaction.guild!.id);
            if (!guild) return;
            
            try {
              const targetMember = await guild.members.fetch(userId);
              if (targetMember && targetMember.roles.cache.has(role.id)) {
                await targetMember.roles.remove(role.id);
                
                const autoLog = new EmbedBuilder()
                  .setDescription(`# <:megaphone:1400607103240114316> Cargo temporário <@&${role.id}> removido de <@${userId}>\n**<:pen:1400607081383333938> Motivo:** Cargo Expirado\n\n**<:users:1400607499865817118> ID:** \`${userId}\``)
                  .setFooter({ text: `Remoção automática`, iconURL: client.user?.displayAvatarURL() })
                  .setColor(0xFF0000);
                sendLog(db, client, interaction.guild!.id, 'role', autoLog);
              }
            } catch (error) {
              // Membro não encontrado
            }
            
            db.prepare('DELETE FROM temproles WHERE user_id = ? AND role_id = ? AND guild_id = ?').run(userId, role.id, interaction.guild!.id);
          }, ms);
        }

        if (success.length > 0) {
          const usersMention = success.map(m => `<@${m.id}>`).join(', ');
          const usersId = success.map(m => `\n\`${m.id}\` (${m.user.tag})`).join('');

          const logEmbed = new EmbedBuilder()
            .setDescription(`# <:megaphone:1400607103240114316> Cargo temporário <@&${role.id}> adicionado para ${usersMention} por <@${interaction.user.id}>\n<:clock:1400607518065033266> Duração: ${tempo} (Expira: <t:${Math.floor(expiresAt/1000)}:f>)\n**<:pen:1400607081383333938> Motivo:** ${motivo}\n\n**<:users:1400607499865817118> ID(s):**${usersId}`)
            .setFooter({ text: `Executado por: ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
            .setColor(0x2DE733);

          await interaction.reply({ embeds: [logEmbed] });
          sendLog(db, client, interaction.guild.id, 'role', logEmbed);
        }

      } else if (sub === 'removetemp') {
        for (const userId of userIds) {
          const member = await interaction.guild.members.fetch(userId).catch(() => null);
          if (!member) continue;
          await member.roles.remove(role.id);
          success.push(member);
          
          // Remover do banco de dados
          db.prepare('DELETE FROM temproles WHERE user_id = ? AND role_id = ? AND guild_id = ?').run(userId, role.id, interaction.guild.id);
        }

        if (success.length > 0) {
          const usersMention = success.map(m => `<@${m.id}>`).join(', ');
          const usersId = success.map(m => `\n\`${m.id}\` (${m.user.tag})`).join('');

          const logEmbed = new EmbedBuilder()
            .setDescription(`# <:megaphone:1400607103240114316> Cargo temporário <@&${role.id}> removido de ${usersMention} por <@${interaction.user.id}>\n**<:pen:1400607081383333938> Motivo:** ${motivo}\n\n**<:users:1400607499865817118> ID(s):**${usersId}`)
            .setFooter({ text: `Executado por: ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
            .setColor(0xFF0000);

          await interaction.reply({ embeds: [logEmbed] });
          sendLog(db, client, interaction.guild.id, 'role', logEmbed);
        }
      }

      if (success.length === 0) {
        const embed = new EmbedBuilder()
          .setTitle('Erro')
          .setDescription('Nenhum usuário válido foi encontrado para processar.')
          .setColor(0xFF0000);
        await interaction.reply({ embeds: [embed], ephemeral: true });
      }

    } catch (error) {
      console.error('Erro no comando role:', error);
      const embed = new EmbedBuilder()
        .setTitle('Erro')
        .setDescription('Ocorreu um erro ao processar o comando.')
        .setColor(0xFF0000);
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }
};

export default role;
