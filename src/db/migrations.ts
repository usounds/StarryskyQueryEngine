import { Kysely, Migration, MigrationProvider } from 'kysely'

const migrations: Record<string, Migration> = {}

export const migrationProvider: MigrationProvider = {
  async getMigrations() {
    return migrations
  },
}

migrations['001'] = {
  async up(db: Kysely<unknown>) {
    await db.schema
      .createTable('post')
      .addColumn('uri', 'varchar',(col) => col.notNull())
      .addColumn('key', 'varchar',(col) => col.notNull())
      .addColumn('cid', 'varchar', (col) => col.notNull())
      .addColumn('replyParent', 'varchar')
      .addColumn('replyRoot', 'varchar')
      .addColumn('indexedAt', 'varchar', (col) => col.notNull())
      .addPrimaryKeyConstraint('pk1',['uri','key'])
      .execute()
    await db.schema
      .createTable('sub_state')
      .addColumn('service', 'varchar', (col) => col.primaryKey())
      .addColumn('cursor', 'integer', (col) => col.notNull())
      .execute()
    await db.schema
      .createTable('conditions')
      .addColumn('key', 'varchar', (col) => col.primaryKey())
      .addColumn('recordName', 'varchar', (col) => col.notNull())
      .addColumn('query', 'varchar', (col) => col.notNull())
      .addColumn('inputRegex', 'varchar', (col) => col.notNull())
      .addColumn('invertRegex', 'varchar')
      .addColumn('refresh', 'integer', (col) => col.notNull())
      .addColumn('lang', 'varchar')
      .addColumn('labelDisable', 'varchar')
      .addColumn('replyDisable', 'varchar')
      .addColumn('imageOnly', 'varchar')
      .addColumn('includeAltText', 'varchar')
      .addColumn('initPost', 'integer', (col) => col.notNull())
      .addColumn('pinnedPost', 'varchar')
      .addColumn('lastExecTime', 'varchar')
      .execute()
  },
  async down(db: Kysely<unknown>) {
    await db.schema.dropTable('post').execute()
    await db.schema.dropTable('sub_state').execute()
    await db.schema.dropTable('conditions').execute()
  },
}
