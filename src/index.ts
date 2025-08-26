import 'dotenv/config';
import { Client, GatewayIntentBits, Collection } from 'discord.js';
import path from 'path';
import Database from 'better-sqlite3';
import { ExtendedClient, Command, MuteRecord } from './types';

const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent
  ] 
}) as ExtendedClient;

const db = new Database(path.join(__dirname, '..', 'database', 'bot.sqlite'));

// Import da função de limpeza de roles temporários
// import { cleanupExpiredTempRoles } from './commands/role/role';

client.commands = new Collection<string, Command>();

// Carregar handlers
import commandHandler from './handlers/commandHandler';
import eventHandler from './handlers/eventHandler';

(async () => {
  await commandHandler(client, db);
  await eventHandler(client, db);
  
  client.login(process.env.DISCORD_TOKEN);
})();

client.once('ready', async () => {
  console.log(`✅ Bot logado como ${client.user?.tag}`);
  
  // await cleanupExpiredTempRoles(client, db);

  const now = Date.now();
  
  // Criar tabela de mutes se não existir
  db.prepare(`
    CREATE TABLE IF NOT EXISTS mutes (
      id INTEGER PRIMARY KEY AUTOINCREMENT, 
      user_id TEXT, 
      guild_id TEXT, 
      expires_at INTEGER, 
      mute_role_id TEXT
    )
  `).run();

  // Processar mutes expirados
  const muteRows = db.prepare('SELECT * FROM mutes WHERE expires_at <= ?').all(now) as MuteRecord[];
  for (const row of muteRows) {
    const guild = client.guilds.cache.get(row.guild_id);
    if (!guild) continue;
    
    try {
      const member = await guild.members.fetch(row.user_id);
      if (member && member.roles.cache.has(row.mute_role_id)) {
        await member.roles.remove(row.mute_role_id);
      }
    } catch (error) {
      // Membro não encontrado ou erro ao remover role
    }
    
    db.prepare('DELETE FROM mutes WHERE id = ?').run(row.id);
  }

  // Agendar mutes futuros
  const futureMuteRows = db.prepare('SELECT * FROM mutes WHERE expires_at > ?').all(now) as MuteRecord[];
  for (const row of futureMuteRows) {
    const ms = row.expires_at - now;
    
    // JavaScript setTimeout tem limite de ~24.8 dias (2^31-1 ms)
    if (ms <= 2147483647) {
      setTimeout(async () => {
        const guild = client.guilds.cache.get(row.guild_id);
        if (!guild) return;
        
        try {
          const member = await guild.members.fetch(row.user_id);
          if (member && member.roles.cache.has(row.mute_role_id)) {
            await member.roles.remove(row.mute_role_id);
            
            // Log do desmute automático
            const { sendLog } = require('./handlers/logUtil');
            const { EmbedBuilder } = require('discord.js');
            const logEmbed = new EmbedBuilder()
              .setDescription(`# <:megaphone:1400607103240114316> Mute removido de <@${row.user_id}> (automático)\n**<:users:1400607499865817118> ID:** \`${row.user_id}\``)
              .setFooter({ text: `Desmute automático por expiração`, iconURL: client.user?.displayAvatarURL() })
              .setColor(0x00FF99);
            sendLog(db, client, row.guild_id, 'mute', logEmbed);
          }
        } catch (error) {
          // Erro ao processar desmute
        }
        
        db.prepare('DELETE FROM mutes WHERE id = ?').run(row.id);
      }, ms);
    }
  }

  // Verificação periódica para mutes com timeout muito longo
  setInterval(() => {
    const currentTime = Date.now();
    const expiredMutes = db.prepare('SELECT * FROM mutes WHERE expires_at <= ?').all(currentTime) as MuteRecord[];
    
    for (const row of expiredMutes) {
      const guild = client.guilds.cache.get(row.guild_id);
      if (guild) {
        guild.members.fetch(row.user_id).then(member => {
          if (member && member.roles.cache.has(row.mute_role_id)) {
            member.roles.remove(row.mute_role_id).catch(() => {});
            
            const { sendLog } = require('./handlers/logUtil');
            const { EmbedBuilder } = require('discord.js');
            const logEmbed = new EmbedBuilder()
              .setDescription(`# <:megaphone:1400607103240114316> Mute removido de <@${row.user_id}> (automático)\n**<:users:1400607499865817118> ID:** \`${row.user_id}\``)
              .setFooter({ text: `Desmute automático por expiração`, iconURL: client.user?.displayAvatarURL() })
              .setColor(0x00FF99);
            sendLog(db, client, row.guild_id, 'mute', logEmbed);
          }
        }).catch(() => {});
      }
      db.prepare('DELETE FROM mutes WHERE id = ?').run(row.id);
    }
  }, 60000); // Verifica a cada minuto
});
