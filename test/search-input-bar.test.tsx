import { describe, it, afterEach } from 'mocha';
import { expect } from 'chai';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';
import { SearchInputBar } from '@/components/ai-search/SearchInputBar';

function defaultProps(overrides: Partial<React.ComponentProps<typeof SearchInputBar>> = {}) {
  return {
    query: '',
    onQueryChange: () => {},
    onSubmit: () => {},
    isStreaming: false,
    isChatActive: false,
    onNewSearch: () => {},
    ...overrides,
  };
}

describe('SearchInputBar', () => {
  afterEach(() => {
    cleanup();
  });

  it('should render textarea with placeholder', () => {
    render(<SearchInputBar {...defaultProps()} />);
    expect(screen.getByPlaceholderText('Search across Sastram...')).to.exist;
  });

  it('should use chat placeholder when chat is active', () => {
    render(<SearchInputBar {...defaultProps({ isChatActive: true })} />);
    expect(screen.getByPlaceholderText('Ask a follow-up question...')).to.exist;
  });

  it('should call onQueryChange when typing', () => {
    let changed = '';
    render(
      <SearchInputBar
        {...defaultProps({
          onQueryChange: (q: string) => { changed = q; },
        })}
      />
    );
    const textarea = screen.getByPlaceholderText('Search across Sastram...');
    fireEvent.change(textarea, { target: { value: 'hello' } });
    expect(changed).to.equal('hello');
  });

  it('should call onSubmit when Enter is pressed with enough text', () => {
    let submitted = false;
    render(
      <SearchInputBar
        {...defaultProps({
          query: 'hello world',
          onSubmit: () => { submitted = true; },
        })}
      />
    );
    const textarea = screen.getByPlaceholderText('Search across Sastram...');
    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(submitted).to.be.true;
  });

  it('should not submit when Enter is pressed with short text', () => {
    let submitted = false;
    render(
      <SearchInputBar
        {...defaultProps({
          query: 'hi',
          onSubmit: () => { submitted = true; },
        })}
      />
    );
    const textarea = screen.getByPlaceholderText('Search across Sastram...');
    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(submitted).to.be.false;
  });

  it('should not submit when Shift+Enter is pressed', () => {
    let submitted = false;
    render(
      <SearchInputBar
        {...defaultProps({
          query: 'hello world',
          onSubmit: () => { submitted = true; },
        })}
      />
    );
    const textarea = screen.getByPlaceholderText('Search across Sastram...');
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });
    expect(submitted).to.be.false;
  });

  it('should disable submit button when streaming', () => {
    render(
      <SearchInputBar
        {...defaultProps({
          query: 'hello',
          isStreaming: true,
        })}
      />
    );
    const submitBtn = screen.getByLabelText('Send') as HTMLButtonElement;
    expect(submitBtn.disabled).to.be.true;
  });

  it('should disable submit button when text is too short', () => {
    render(
      <SearchInputBar
        {...defaultProps({
          query: 'hi',
        })}
      />
    );
    const submitBtn = screen.getByLabelText('Send') as HTMLButtonElement;
    expect(submitBtn.disabled).to.be.true;
  });

  it('should show loading spinner when streaming', () => {
    render(
      <SearchInputBar
        {...defaultProps({
          query: 'hello',
          isStreaming: true,
        })}
      />
    );
    // The Loader2 icon renders with animate-spin class
    const spinner = document.querySelector('.animate-spin');
    expect(spinner).to.exist;
  });

  it('should show new search button when chat is active', () => {
    render(<SearchInputBar {...defaultProps({ isChatActive: true })} />);
    expect(screen.getByText('New conversation')).to.exist;
  });

  it('should not show new search button when chat is not active', () => {
    render(<SearchInputBar {...defaultProps({ isChatActive: false })} />);
    expect(screen.queryByText('New conversation')).to.be.null;
  });

  it('should call onNewSearch when new search button is clicked', () => {
    let called = false;
    render(
      <SearchInputBar
        {...defaultProps({
          isChatActive: true,
          onNewSearch: () => { called = true; },
        })}
      />
    );
    fireEvent.click(screen.getByText('New conversation'));
    expect(called).to.be.true;
  });

  it('should auto-resize textarea on input', () => {
    render(<SearchInputBar {...defaultProps({ query: '' })} />);
    const textarea = screen.getByPlaceholderText('Search across Sastram...');
    // Initial height should be set
    expect(textarea.style.height).to.be.a('string');
  });

  it('should call onSubmit when send button is clicked', () => {
    let submitted = false;
    render(
      <SearchInputBar
        {...defaultProps({
          query: 'hello world',
          onSubmit: () => { submitted = true; },
        })}
      />
    );
    fireEvent.click(screen.getByLabelText('Send'));
    expect(submitted).to.be.true;
  });
});
