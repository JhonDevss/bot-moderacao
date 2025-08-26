import { ExtendedClient } from '../types';
import Database from 'better-sqlite3';

export default {
  name: 'ready',
  once: true,
  execute(client: ExtendedClient, db: Database.Database) {
    console.log(`Bot online como ${client.user?.tag}`);
  }
};
