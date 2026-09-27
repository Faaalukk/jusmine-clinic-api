import { boolean, index, integer, pgTable, primaryKey, serial, text, timestamp } from 'drizzle-orm/pg-core'

export const branches = pgTable('branches', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  active: boolean('active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const sources = pgTable('sources', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  // Key into the frontend icon set, e.g. "facebook", "users", "ellipsis"
  icon: text('icon').notNull().default('megaphone'),
  active: boolean('active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const responses = pgTable(
  'responses',
  {
    id: serial('id').primaryKey(),
    branchId: integer('branch_id')
      .notNull()
      .references(() => branches.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('responses_created_at_idx').on(t.createdAt), index('responses_branch_idx').on(t.branchId)],
)

export const responseSources = pgTable(
  'response_sources',
  {
    responseId: integer('response_id')
      .notNull()
      .references(() => responses.id, { onDelete: 'cascade' }),
    sourceId: integer('source_id')
      .notNull()
      .references(() => sources.id),
  },
  (t) => [primaryKey({ columns: [t.responseId, t.sourceId] }), index('response_sources_source_idx').on(t.sourceId)],
)
