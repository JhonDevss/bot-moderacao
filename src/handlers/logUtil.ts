import { EmbedBuilder, Client } from 'discord.js';
import Database from 'better-sqlite3';
import { LogChannels } from '../types';

export function sendLog(
  db: Database.Database, 
  client: Client, 
  guildId: string, 
  type: 'mod' | 'role' | 'mute', 
  embed: EmbedBuilder
): void {
  // Criar tabela se não existir
  db.prepare(`CREATE TABLE IF NOT EXISTS log_channels (guild_id TEXT PRIMARY KEY, log_mod_channel TEXT, log_role_channel TEXT)`).run();
  
  const row = db.prepare('SELECT * FROM log_channels WHERE guild_id = ?').get(guildId) as LogChannels | undefined;
  
  let channelId: string | null = null;
  if (row) {
    if (type === 'mod' || type === 'mute') channelId = row.log_mod_channel || null;
    if (type === 'role') channelId = row.log_role_channel || null;
  }
  
  if (!channelId) return;
  
  const channel = client.channels.cache.get(channelId);
  if (!channel || !channel.isTextBased()) return;
  
  if ('send' in channel) {
    channel.send({ embeds: [embed] }).catch(() => {});
  }
}
