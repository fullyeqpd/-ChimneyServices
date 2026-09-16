// A primary source behind a read. Mirrors the "Sources" row on state pages.
import { defineField, defineType } from 'sanity';

export default defineType({
  name: 'source',
  title: 'Source',
  type: 'object',
  fields: [
    defineField({ name: 'label', title: 'Short cite', type: 'string', validation: (r) => r.required() }),
    defineField({ name: 'url', title: 'URL', type: 'url', validation: (r) => r.required().uri({ scheme: ['https', 'http'] }) }),
    defineField({
      name: 'evidenceClass',
      title: 'Evidence class',
      type: 'string',
      options: { list: ['GOV', 'DOC', 'REF'], layout: 'radio' },
      validation: (r) => r.required(),
    }),
    defineField({ name: 'lastVerified', title: 'Last verified', type: 'date', validation: (r) => r.required() }),
    defineField({
      name: 'provenance',
      title: 'Provenance',
      type: 'string',
      options: { list: ['PUBLIC RECORD', 'REPORTED BY BUSINESS', 'VERIFIED BY CHIMNEY.SERVICES'] },
      initialValue: 'PUBLIC RECORD',
      validation: (r) => r.required(),
    }),
  ],
});
