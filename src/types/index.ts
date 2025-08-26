import { SlashCommandBuilder, ChatInputCommandInteraction, Client, Collection } from 'discord.js';
import { Database } from 'better-sqlite3';

export interface Command {
  data: any;
  execute: (interaction: ChatInputCommandInteraction, client?: ExtendedClient, db?: Database) => Promise<void>;
}

export interface Event {
  name: string;
  once?: boolean;
  execute: (...args: any[]) => Promise<void>;
}

export interface ExtendedClient extends Client {
  commands: Collection<string, Command>;
}

export interface LogChannels {
  guild_id: string;
  log_mod_channel?: string;
  log_role_channel?: string;
}

export interface MuteRecord {
  id: number;
  user_id: string;
  guild_id: string;
  expires_at: number;
  mute_role_id: string;
}

export interface TempRoleRecord {
  id: number;
  user_id: string;
  guild_id: string;
  role_id: string;
  expires_at: number;
  added_by: string;
}

export interface DatabaseTables {
  log_channels: LogChannels;
  mutes: MuteRecord;
  temp_roles: TempRoleRecord;
}
