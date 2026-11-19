import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  username: text('username').notNull(),
  passwordHash: text('password_hash').notNull(),
  bio: text('bio').notNull().default(''),
  avatar: text('avatar').notNull().default(''),
  createdAt: integer('created_at').notNull(),
});

export const vaults = sqliteTable('vaults', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const notes = sqliteTable(
  'notes',
  {
    id: text('id').primaryKey(),
    vaultId: text('vault_id')
      .notNull()
      .references(() => vaults.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    title: text('title').notNull(),
    content: text('content').notNull().default(''),
    tags: text('tags').notNull().default('[]'),
    wordCount: integer('word_count').notNull().default(0),
    isFolder: integer('is_folder', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('notes_vault_path_idx').on(table.vaultId, table.path),
    index('notes_vault_title_idx').on(table.vaultId, table.title),
  ]
);

export const noteLinks = sqliteTable(
  'note_links',
  {
    id: text('id').primaryKey(),
    vaultId: text('vault_id')
      .notNull()
      .references(() => vaults.id, { onDelete: 'cascade' }),
    sourceNoteId: text('source_note_id')
      .notNull()
      .references(() => notes.id, { onDelete: 'cascade' }),
    targetNoteId: text('target_note_id').references(() => notes.id, {
      onDelete: 'set null',
    }),
    targetTitle: text('target_title').notNull(),
  },
  (table) => [
    index('note_links_source_idx').on(table.sourceNoteId),
    index('note_links_target_idx').on(table.targetNoteId),
    index('note_links_vault_idx').on(table.vaultId),
  ]
);

export const shareLinks = sqliteTable('share_links', {
  id: text('id').primaryKey(),
  noteId: text('note_id')
    .notNull()
    .references(() => notes.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  code: text('code').notNull().unique(),
  passwordHash: text('password_hash'),
  expiresAt: integer('expires_at'),
  viewCount: integer('view_count').notNull().default(0),
  createdAt: integer('created_at').notNull(),
});

export const noteRevisions = sqliteTable(
  'note_revisions',
  {
    id: text('id').primaryKey(),
    noteId: text('note_id')
      .notNull()
      .references(() => notes.id, { onDelete: 'cascade' }),
    vaultId: text('vault_id')
      .notNull()
      .references(() => vaults.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    wordCount: integer('word_count').notNull().default(0),
    label: text('label').notNull().default(''),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [index('note_revisions_note_idx').on(table.noteId, table.createdAt)]
);
