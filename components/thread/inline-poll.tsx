'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { BarChart2, X, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils/cn';
import { createPollAction } from '@/modules/polls/actions';
import { toasts } from '@/lib/utils/toast';

interface InlinePollProps {
  threadId: string;
  canManagePoll: boolean;
  onPollCreated?: (poll: { id: string; threadId: string; question: string; options: string[]; isActive: boolean; expiresAt: Date | null; createdAt: Date }) => void;
  isOpen: boolean;
  onToggle: (isOpen: boolean) => void;
}

const MAX_OPTIONS = 6;
const MIN_OPTIONS = 2;

export function InlinePoll({ threadId, canManagePoll, onPollCreated, isOpen, onToggle }: InlinePollProps) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [expiresAt, setExpiresAt] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleAddOption = () => {
    setOptions([...options, '']);
  };

  const handleRemoveOption = (index: number) => {
    if (options.length <= MIN_OPTIONS) return;
    const newOptions = [...options];
    newOptions.splice(index, 1);
    setOptions(newOptions);
  };

  const handleOptionChange = (index: number, value: string) => {
    const newOptions = [...options];
    newOptions[index] = value;
    setOptions(newOptions);
  };

  const createPoll = async () => {
    if (!question.trim()) {
      toasts.error('Please add a question to your poll');
      return;
    }
    
const validOptions = options.filter(option => option.trim().length > 0);
    if (validOptions.length < MIN_OPTIONS) {
      toasts.error(`Please add at least ${MIN_OPTIONS} options to your poll`);
      return;
    }

    if (validOptions.length > MAX_OPTIONS) {
      toasts.error(`You can add up to ${MAX_OPTIONS} options only`);
      return;
    }

    setIsSaving(true);
    
    try {
      const result = await createPollAction(
        threadId,
        question,
        options.filter(opt => opt.trim().length > 0),
        expiresAt ? new Date(expiresAt) : undefined
      );
      
      if (result.error) {
        toasts.error(result.error || 'Failed to create poll');
      } else if (result.data) {
        const pollData = result.data;
        onPollCreated?.({
          ...pollData,
          options: pollData.options as string[],
        });
        toasts.success('Poll created successfully!');
        onToggle(false);
      }
    } catch (error) {
      toasts.serverError();
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="space-y-4 p-4 bg-white rounded-lg shadow-lg border border-gray-200">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Create a Poll</h3>
        <Button 
          variant="ghost" 
          size="sm"
          onClick={() => onToggle(false)}
          className="h-6 w-6 p-0"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      
      <div className="space-y-4">
        <div className="space-y-2">
          <Label className="text-sm font-medium">Question</Label>
          <Input 
            value={question} 
            onChange={(e) => setQuestion(e.target.value)} 
            placeholder="Enter your poll question"
          />
        </div>
        
        <div className="space-y-3">
          <Label className="text-sm font-medium">Options</Label>
          {options.map((option, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                value={option}
                onChange={(e) => handleOptionChange(index, e.target.value)}
                placeholder={`Option ${index + 1}`}
              />
              {index >= 2 && (
                <Button 
                  variant="ghost" 
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => handleRemoveOption(index)}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
        
        <div className="flex items-center gap-2">
          <Button 
            type="button" 
            onClick={handleAddOption}
            disabled={options.length >= MAX_OPTIONS}
            variant="outline"
            size="sm"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Option
          </Button>
        </div>
        
        <div className="space-y-2">
          <Label className="text-sm font-medium">Poll expires at (optional)</Label>
          <Input
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
          />
        </div>
        
        <div className="flex items-center justify-between pt-2">
          <Button 
            onClick={createPoll}
            disabled={isSaving || !question.trim() || options.some((opt, i) => i < 2 && !opt.trim())}
            className="w-full"
          >
            {isSaving ? 'Creating...' : 'Create Poll'}
          </Button>
        </div>
      </div>
    </div>
  );
}