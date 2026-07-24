import { defaultSchema } from 'rehype-sanitize';

const baseAttributes = defaultSchema.attributes || {};

// Raw HTML is supported in posts for editor-generated galleries and media, but
// it must pass through this allowlist before React renders it. In particular,
// scripts, event handlers, unsafe URLs, and arbitrary embedded documents are
// deliberately excluded.
export const markdownSanitizeSchema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames || []),
    'audio',
    'video',
    'figure',
    'figcaption',
  ],
  attributes: {
    ...baseAttributes,
    '*': [
      ...(baseAttributes['*'] || []),
      'className',
      'style',
    ],
    a: [
      ...(baseAttributes.a || []),
      'target',
      'rel',
    ],
    audio: ['src', 'controls', 'preload', 'loop', 'muted'],
    video: ['src', 'controls', 'preload', 'loop', 'muted', 'poster', 'width', 'height'],
    source: [...(baseAttributes.source || []), 'src', 'type'],
  },
  protocols: {
    ...defaultSchema.protocols,
    poster: ['http', 'https'],
  },
};
