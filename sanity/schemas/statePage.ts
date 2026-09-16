// Mirrors src/content/states/{slug}.json (see src/content.config.ts for the Zod twin).
import { defineField, defineType } from 'sanity';

const verdicts = ['READY', 'READY WITH CAVEATS', 'DO NOT PUBLISH', 'UNVERIFIED'];

export default defineType({
  name: 'statePage',
  title: 'State rights page',
  type: 'document',
  fields: [
    defineField({ name: 'name', type: 'string', validation: (r) => r.required() }),
    defineField({ name: 'slug', type: 'slug', options: { source: 'name' }, validation: (r) => r.required() }),
    defineField({ name: 'abbr', type: 'string', validation: (r) => r.required().length(2) }),
    defineField({ name: 'sourceFile', type: 'string' }),
    defineField({ name: 'researched', type: 'date' }),
    defineField({ name: 'lawsCitedAs', type: 'string' }),
    defineField({ name: 'headerNote', title: 'Research correction note', type: 'text' }),
    defineField({ name: 'verified', type: 'date' }),
    defineField({ name: 'lastVerified', title: 'Last verified', type: 'date', validation: (r) => r.required() }),
    defineField({
      name: 'provenance',
      type: 'string',
      options: { list: ['PUBLIC RECORD', 'REPORTED BY BUSINESS', 'VERIFIED BY CHIMNEY.SERVICES'] },
      initialValue: 'PUBLIC RECORD',
      validation: (r) => r.required(),
    }),
    defineField({ name: 'publishVerdict', type: 'string', options: { list: verdicts }, validation: (r) => r.required() }),
    defineField({ name: 'publishVerdictNote', type: 'text' }),
    defineField({
      name: 'verification',
      type: 'object',
      fields: [
        defineField({ name: 'heading', type: 'string' }),
        defineField({ name: 'checked', type: 'date' }),
        defineField({ name: 'markdown', type: 'text' }),
      ],
    }),
    defineField({ name: 'h1', title: 'H1', type: 'string', validation: (r) => r.required().max(90) }),
    defineField({ name: 'metaDescription', type: 'string', validation: (r) => r.required().max(155) }),
    defineField({ name: 'sections', title: 'Reads', type: 'array', of: [{ type: 'read' }] }),
    defineField({
      name: 'story',
      type: 'object',
      fields: [defineField({ name: 'heading', type: 'string' }), defineField({ name: 'markdown', type: 'text' })],
    }),
    defineField({
      name: 'summary',
      title: 'Summary row',
      type: 'object',
      fields: ['source', 'license_regime', 'registration_name', 'disclosure_law', 'chimney_item_on_form', 'three_day_cancel', 'co_law', 'lookup_url'].map(
        (n) => defineField({ name: n, type: 'string' }),
      ),
    }),
    defineField({ name: 'tableStatus', type: 'string', options: { list: ['IN TABLE', 'NOT YET IN TABLE'] } }),
    defineField({ name: 'tableRowStale', type: 'boolean' }),
    defineField({
      name: 'verdictGrid',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: ['id', 'label', 'answer', 'note', 'anchor', 'rule', 'derivedFrom', 'evidence'].map((n) => defineField({ name: n, type: 'string' })),
        },
      ],
      validation: (r) => r.length(6),
    }),
    defineField({
      name: 'municipal',
      type: 'object',
      fields: [defineField({ name: 'cities', type: 'string' }), defineField({ name: 'derivedFrom', type: 'string' })],
    }),
    defineField({
      name: 'season',
      type: 'object',
      fields: [
        defineField({ name: 'rush', type: 'array', of: [{ type: 'number' }] }),
        defineField({ name: 'best', type: 'array', of: [{ type: 'number' }] }),
        defineField({ name: 'rushParsed', type: 'boolean' }),
        defineField({ name: 'bestParsed', type: 'boolean' }),
        defineField({ name: 'note', type: 'text' }),
      ],
    }),
    defineField({
      name: 'faq',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            defineField({ name: 'id', type: 'string' }),
            defineField({ name: 'q', type: 'string' }),
            defineField({ name: 'a', type: 'text' }),
            defineField({ name: 'expanded', type: 'boolean' }),
            defineField({ name: 'derivedFrom', type: 'string' }),
          ],
        },
      ],
    }),
    defineField({ name: 'compare', type: 'object', fields: [defineField({ name: 'neighborSlug', type: 'string' }), defineField({ name: 'label', type: 'string' })], options: { collapsible: true } }),
  ],
  preview: { select: { title: 'name', subtitle: 'publishVerdict' } },
});
