import fs from 'fs';
import path from 'path';
import { REST, Routes } from 'discord.js';
import { ExtendedClient, Command } from '../types';
import Database from 'better-sqlite3';

export default async (client: ExtendedClient, db: Database.Database): Promise<void> => {
  const commands: any[] = [];
  const commandsPath = path.join(__dirname, '../commands');
  
  for (const category of fs.readdirSync(commandsPath)) {
    const categoryPath = path.join(commandsPath, category);
    for (const file of fs.readdirSync(categoryPath)) {
      if (file.endsWith('.js') || file.endsWith('.ts')) {
        const commandModule = await import(path.join(categoryPath, file));
        const command: Command = commandModule.default || commandModule;
        client.commands.set(command.data.name, command);
        commands.push(command.data.toJSON());
      }
    }
  }

  client.once('ready', async () => {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN!);
    const guildId = '1294983823691485275'; // ID da guild para registro rápido
    
    try {
      // Remove todos os comandos globais
      const globalCommands: any[] = await rest.get(Routes.applicationCommands(client.user!.id)) as any[];
      for (const cmd of globalCommands) {
        await rest.delete(`${Routes.applicationCommands(client.user!.id)}/${cmd.id}`);
      }
      console.log('Comandos globais removidos!');

      // Registra comandos na guild
      await rest.put(
        Routes.applicationGuildCommands(client.user!.id, guildId),
        { body: commands }
      );
      console.log('Comandos slash registrados na guild!');
    } catch (error) {
      console.error(error);
    }
  });
};
