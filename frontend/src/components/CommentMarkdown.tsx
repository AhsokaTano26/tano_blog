'use client';

import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const remarkPlugins = [remarkGfm];

export const CommentMarkdown = memo(function CommentMarkdown({ content }: { content: string }) {
  return <ReactMarkdown remarkPlugins={remarkPlugins}>{content}</ReactMarkdown>;
});
