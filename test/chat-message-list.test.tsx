import { describe, it, afterEach } from 'mocha';
import { expect } from 'chai';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';
import { ChatMessageList } from '@/components/ai-search/ChatMessageList';
import type { ChatMessage, AppState } from '@/components/ai-search/use-search-stream';

function makeUserMsg(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'user-1',
    role: 'user',
    query: 'What is React?',
    timestamp: Date.now(),
    ...overrides,
  };
}

function makeAssistantMsg(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'assistant-1',
    role: 'assistant',
    query: 'What is React?',
    text: 'React is a JavaScript library.',
    sources: [],
    citations: [],
    followUps: ['How does useState work?', 'What are hooks?'],
    conflictData: { detected: false, description: '', sideA: '', sideB: '' },
    queryType: 'technical',
    sourceCount: 3,
    timestamp: Date.now(),
    ...overrides,
  };
}

function defaultProps(overrides: Partial<React.ComponentProps<typeof ChatMessageList>> = {}) {
  return {
    messages: [],
    streamingMessage: null,
    appState: 'idle' as AppState,
    currentStep: 0,
    taskFailed: false,
    slowHint: false,
    errorMessage: '',
    isOffline: false,
    onFollowUp: () => {},
    onRetry: () => {},
    onFeedback: () => {},
    onNewSearch: () => {},
    messagesEndRef: { current: null },
    ...overrides,
  };
}

describe('ChatMessageList', () => {
  afterEach(() => {
    cleanup();
  });

  it('should render empty container when no messages', () => {
    const { container } = render(<ChatMessageList {...defaultProps()} />);
    const flexContainer = container.querySelector('.flex-1.overflow-y-auto');
    expect(flexContainer).to.exist;
  });

  it('should render user message bubble', () => {
    render(<ChatMessageList {...defaultProps({ messages: [makeUserMsg()] })} />);
    expect(screen.getByText('What is React?')).to.exist;
  });

  it('should render Sai Synthesis header for assistant messages', () => {
    render(<ChatMessageList {...defaultProps({ messages: [makeAssistantMsg()] })} />);
    expect(screen.getByText('Sai Synthesis')).to.exist;
  });

  it('should render source count for assistant messages', () => {
    render(<ChatMessageList {...defaultProps({ messages: [makeAssistantMsg()] })} />);
    expect(screen.getByText(/3 sources/)).to.exist;
  });

  it('should render follow-up buttons for latest assistant message', () => {
    render(<ChatMessageList {...defaultProps({ messages: [makeAssistantMsg()] })} />);
    expect(screen.getByText('How does useState work?')).to.exist;
    expect(screen.getByText('What are hooks?')).to.exist;
  });

  it('should call onFollowUp when follow-up button is clicked', () => {
    let clickedQuery = '';
    render(
      <ChatMessageList
        {...defaultProps({
          messages: [makeAssistantMsg()],
          onFollowUp: (q: string) => { clickedQuery = q; },
        })}
      />
    );
    fireEvent.click(screen.getByText('How does useState work?'));
    expect(clickedQuery).to.equal('How does useState work?');
  });

  it('should render both user and assistant messages', () => {
    render(
      <ChatMessageList
        {...defaultProps({
          messages: [makeUserMsg(), makeAssistantMsg()],
        })}
      />
    );
    expect(screen.getByText('What is React?')).to.exist;
    expect(screen.getByText('Sai Synthesis')).to.exist;
  });

  it('should show streaming skeleton when streaming without text', () => {
    const streamingMsg = makeAssistantMsg({ text: undefined });
    const { container } = render(
      <ChatMessageList
        {...defaultProps({
          streamingMessage: streamingMsg,
          appState: 'loading',
        })}
      />
    );
    // TaskSteps renders an <ol aria-label="Search progress">
    const progressList = container.querySelector('ol[aria-label="Search progress"]');
    expect(progressList).to.exist;
  });

  it('should show streaming text when streaming with text', () => {
    const streamingMsg = makeAssistantMsg({ text: 'Still typing...' });
    render(
      <ChatMessageList
        {...defaultProps({
          streamingMessage: streamingMsg,
          appState: 'loading',
        })}
      />
    );
    expect(screen.getByText('Sai Synthesis')).to.exist;
  });

  it('should show blocked state with message', () => {
    render(
      <ChatMessageList
        {...defaultProps({
          appState: 'blocked',
          errorMessage: 'Daily limit reached',
        })}
      />
    );
    expect(screen.getByText('Search limit reached')).to.exist;
    expect(screen.getByText('Daily limit reached')).to.exist;
  });

  it('should show error state with retry button', () => {
    render(
      <ChatMessageList
        {...defaultProps({
          appState: 'error',
          errorMessage: 'Network error',
        })}
      />
    );
    expect(screen.getByText('Something went wrong')).to.exist;
    expect(screen.getByText('Network error')).to.exist;
    expect(screen.getByText('Try Again')).to.exist;
  });

  it('should show offline state', () => {
    render(
      <ChatMessageList
        {...defaultProps({
          appState: 'error',
          isOffline: true,
          errorMessage: 'No internet',
        })}
      />
    );
    expect(screen.getByText("You're offline")).to.exist;
  });

  it('should call onNewSearch when retry button clicked in error state', () => {
    let called = false;
    render(
      <ChatMessageList
        {...defaultProps({
          appState: 'error',
          errorMessage: 'Error',
          onNewSearch: () => { called = true; },
        })}
      />
    );
    fireEvent.click(screen.getByText('Try Again'));
    expect(called).to.be.true;
  });

  it('should show slow hint when slowHint is true', () => {
    render(
      <ChatMessageList
        {...defaultProps({
          streamingMessage: makeAssistantMsg({ text: undefined }),
          appState: 'loading',
          slowHint: true,
        })}
      />
    );
    expect(screen.getByText(/taking longer than usual/)).to.exist;
  });

  it('should not show follow-ups for non-latest assistant messages', () => {
    const msg1 = makeAssistantMsg({ id: 'a1', text: 'First answer', followUps: ['Q1'] });
    const msg2 = makeAssistantMsg({ id: 'a2', text: 'Second answer', followUps: ['Q2'] });
    render(
      <ChatMessageList
        {...defaultProps({
          messages: [msg1, msg2],
        })}
      />
    );
    expect(screen.queryByText('Q1')).to.be.null;
    expect(screen.getByText('Q2')).to.exist;
  });

  it('should have end ref div', () => {
    const ref = { current: null };
    render(
      <ChatMessageList {...defaultProps({ messagesEndRef: ref })} />
    );
    expect(ref.current).to.not.be.null;
  });
});
