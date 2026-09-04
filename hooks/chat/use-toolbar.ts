'use client';

interface UseToolbarOptions {
  content: string;
  setContent: (value: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}

/**
 * Markdown toolbar actions (bold, italic, code, link), emoji insertion,
 * and @sai trigger.
 *
 * Each handler wraps the current selection or inserts at cursor, then
 * refocuses the textarea with the correct selection.
 */
export function useToolbar({ content, setContent, textareaRef }: UseToolbarOptions) {
  function wrapSelection(before: string, after: string) {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = content.substring(start, end);
    const next = content.slice(0, start) + before + selected + after + content.slice(end);
    setContent(next);
    requestAnimationFrame(() => {
      textarea.focus();
      const cursor = start + before.length;
      if (selected) {
        textarea.setSelectionRange(cursor, cursor + selected.length);
      } else {
        textarea.setSelectionRange(cursor, cursor);
      }
    });
  }

  function insertAtCursor(text: string) {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const next = content.slice(0, start) + text + content.slice(textarea.selectionEnd);
    setContent(next);
    requestAnimationFrame(() => {
      textarea.focus();
      const cursor = start + text.length;
      textarea.setSelectionRange(cursor, cursor);
    });
  }

  function handleBold() {
    wrapSelection('**', '**');
  }

  function handleItalic() {
    wrapSelection('*', '*');
  }

  function handleCode() {
    wrapSelection('`', '`');
  }

  function handleLink() {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = content.substring(start, end);
    const url = window.prompt('Enter URL:', 'https://');
    if (!url) return;
    const linkText = selected || 'link';
    const next = content.slice(0, start) + '[' + linkText + '](' + url + ')' + content.slice(end);
    setContent(next);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start, start + next.length - (content.length - end));
    });
  }

  function handleEmojiSelect(emoji: string) {
    insertAtCursor(emoji);
  }

  function handleAtSai() {
    insertAtCursor('@sai ');
  }

  return {
    handleBold,
    handleItalic,
    handleCode,
    handleLink,
    handleEmojiSelect,
    insertAtCursor,
    handleAtSai,
  };
}
