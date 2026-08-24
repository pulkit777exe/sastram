import { describe, it } from 'mocha';
import { expect } from 'chai';
import {
  SEARCH_PHASES,
  DEFAULT_CONFIG,
  type ChatMessage,
  type AppState,
} from '@/components/ai-search/use-search-stream';

describe('use-search-stream exports', () => {
  describe('SEARCH_PHASES', () => {
    it('should have 4 phases', () => {
      expect(SEARCH_PHASES).to.have.lengthOf(4);
    });

    it('should have searching, reading, crossref, synthesizing phases', () => {
      expect(SEARCH_PHASES[0].id).to.equal('searching');
      expect(SEARCH_PHASES[1].id).to.equal('reading');
      expect(SEARCH_PHASES[2].id).to.equal('crossref');
      expect(SEARCH_PHASES[3].id).to.equal('synthesizing');
    });

    it('should have labels for each phase', () => {
      SEARCH_PHASES.forEach((phase) => {
        expect(phase.label).to.be.a('string');
        expect(phase.label.length).to.be.greaterThan(0);
      });
    });
  });

  describe('DEFAULT_CONFIG', () => {
    it('should have valid config shape', () => {
      expect(DEFAULT_CONFIG).to.be.an('object');
      expect(DEFAULT_CONFIG).to.have.property('exaMode');
      expect(DEFAULT_CONFIG).to.have.property('tavilyMode');
      expect(DEFAULT_CONFIG).to.have.property('sourceFilter');
      expect(DEFAULT_CONFIG).to.have.property('searchMode');
    });

    it('should have string values for all fields', () => {
      expect(DEFAULT_CONFIG.exaMode).to.be.a('string');
      expect(DEFAULT_CONFIG.tavilyMode).to.be.a('string');
      expect(DEFAULT_CONFIG.sourceFilter).to.be.a('string');
      expect(DEFAULT_CONFIG.searchMode).to.be.a('string');
    });
  });

  describe('ChatMessage type', () => {
    it('should be constructible with required fields', () => {
      const msg: ChatMessage = {
        id: 'test-id',
        role: 'user',
        query: 'test query',
        timestamp: Date.now(),
      };
      expect(msg.id).to.equal('test-id');
      expect(msg.role).to.equal('user');
    });

    it('should support assistant role with text and follow-ups', () => {
      const msg: ChatMessage = {
        id: 'test-id',
        role: 'assistant',
        query: 'test query',
        text: 'response text',
        followUps: ['follow-up 1'],
        sourceCount: 5,
        timestamp: Date.now(),
      };
      expect(msg.role).to.equal('assistant');
      expect(msg.text).to.equal('response text');
      expect(msg.followUps).to.have.lengthOf(1);
      expect(msg.sourceCount).to.equal(5);
    });
  });

  describe('AppState type', () => {
    it('should accept valid states', () => {
      const validStates: AppState[] = ['idle', 'loading', 'results', 'error', 'blocked'];
      validStates.forEach((state) => {
        expect(state).to.be.a('string');
      });
    });
  });
});
