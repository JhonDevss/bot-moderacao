import fs from 'fs';
import path from 'path';
import { ExtendedClient, Event } from '../types';
import Database from 'better-sqlite3';

export default async (client: ExtendedClient, db: Database.Database): Promise<void> => {
  const eventsPath = path.join(__dirname, '../events');
  
  for (const file of fs.readdirSync(eventsPath)) {
    if (file.endsWith('.js') || file.endsWith('.ts')) {
      const eventModule = await import(path.join(eventsPath, file));
      const event: Event = eventModule.default || eventModule;
      if (event.once) {
        client.once(event.name, (...args) => event.execute(...args, client, db));
      } else {
        client.on(event.name, (...args) => event.execute(...args, client, db));
      }
    }
  }
};
