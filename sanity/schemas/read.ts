// One research section rendered as a "read" (JSON: sections[]).
import { defineField, defineType } from 'sanity';

export default defineType({
  name: 'read',
  title: 'Read',
  type: 'object',
  fields: [
    defineField({ name: 'number', title: 'Research section number', type: 'string', validation: (r) => r.required() }),
    defineField({ name: 'key', type: 'string', validation: (r) => r.required() }),
    defineField({
      name: 'anchor',
      title: 'Anchor (immutable after publish)',
      type: 'slug',
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'group',
      type: 'string',
      options: { list: ['licensing', 'home-sale', 'remedies', 'permits', 'co', 'season'] },
    }),
    defineField({ name: 'rawHeading', type: 'string' }),
    defineField({ name: 'researchTitle', type: 'string' }),
    defineField({ name: 'title', type: 'string', validation: (r) => r.required() }),
    defineField({ name: 'evidence', type: 'array', of: [{ type: 'string' }], options: { list: ['GOV', 'DOC', 'REF'] } }),
    defineField({ name: 'confidenceNote', type: 'string' }),
    defineField({ name: 'markdown', title: 'Body (markdown)', type: 'text', rows: 14, validation: (r) => r.required() }),
    defineField({ name: 'sources', type: 'array', of: [{ type: 'source' }] }),
    defineField({ name: 'lastVerified', title: 'Last verified', type: 'date', validation: (r) => r.required() }),
    defineField({
      name: 'provenance',
      type: 'string',
      options: { list: ['PUBLIC RECORD', 'REPORTED BY BUSINESS', 'VERIFIED BY CHIMNEY.SERVICES'] },
      initialValue: 'PUBLIC RECORD',
      validation: (r) => r.required(),
    }),
  ],
});
