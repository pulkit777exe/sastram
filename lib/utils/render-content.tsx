import React from 'react';

export function renderContent(content: string) {
  if (!content) return null;
  // split on @handle pattern and wrap matches
  return content.split(/(@\w+)/g).map((part, i) =>
    part.startsWith('@') ? (
      <span key={i} className="bg-blue-50 text-blue-600 rounded px-0.5 font-medium dark:bg-blue-950/30 dark:text-blue-400">
        {part}
      </span>
    ) : (
      part
    )
  );
}
