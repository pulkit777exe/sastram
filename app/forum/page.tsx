"use client";

import { useUser } from "@clerk/nextjs";
import { useState, useEffect } from "react";
import Link from "next/link";
import { toast } from "react-hot-toast";
import { 
  Search, 
  ArrowUp,
  ArrowDown,
  Bookmark,
  Share,
  Flame,
  Ellipsis,
  MessageSquareDot,
} from "lucide-react";

interface Question {
  id: string;
  title: string;
  content: string;
  votes: number;
  views: number;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  createdAt: string;
  tags: { tag: { name: string } }[];
  answers: { id: string }[];
}

export default function ForumPage() {
  const { user } = useUser();
  const [activeTab, setActiveTab] = useState("newest");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [bookmarkedQuestions, setBookmarkedQuestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchQuestions();
  }, [activeTab]);

  const fetchQuestions = async () => {
    try {
      const response = await fetch('/api/questions');
      if (!response.ok) throw new Error('Failed to fetch questions');
      const data = await response.json();
      setQuestions(data);
    } catch (error) {
      toast.error('Failed to load questions');
    } finally {
      setLoading(false);
    }
  };

  const handleVote = async (questionId: string, direction: 'up' | 'down') => {
    if (!user) {
      toast.error("Please sign in to vote");
      return;
    }

    try {
      const response = await fetch(`/api/questions/${questionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'vote',
          value: direction === 'up' ? 1 : -1
        })
      });

      if (!response.ok) throw new Error('Failed to vote');
      
      // Update local state
      setQuestions(questions.map(q => {
        if (q.id === questionId) {
          return {
            ...q,
            votes: direction === 'up' ? q.votes + 1 : q.votes - 1
          };
        }
        return q;
      }));
    } catch (error) {
      toast.error('Failed to vote');
    }
  };

  const handleBookmark = async (questionId: string) => {
    if (!user) {
      toast.error("Please sign in to bookmark questions");
      return;
    }

    try {
      const response = await fetch(`/api/questions/${questionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'bookmark'
        })
      });

      if (!response.ok) throw new Error('Failed to bookmark');

      setBookmarkedQuestions(prev => {
        if (prev.includes(questionId)) {
          return prev.filter(id => id !== questionId);
        }
        return [...prev, questionId];
      });
    } catch (error) {
      toast.error('Failed to bookmark question');
    }
  };

  const handleShare = async (questionId: string) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/forum/question/${questionId}`);
      toast.success("Link copied to clipboard!");
    } catch {
      toast.error("Failed to copy link");
    }
  };

  const handleAskQuestion = () => {
    if (!user) {
      toast.error("Please sign in to ask a question");
      return;
    }
    window.location.href = "/forum/ask";
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl text-gray-600">Loading questions...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Link href="/" className="flex items-center">
                <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center text-white font-bold">
                  C
                </div>
                <span className="ml-2 text-xl font-semibold text-gray-900">Cortex Forum</span>
              </Link>
            </div>
            <div className="flex-1 max-w-2xl mx-8">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search questions..."
                  className="w-full px-4 py-2 pl-10 bg-gray-100 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <Search className="w-5 h-5 text-gray-400 absolute left-3 top-2.5" />
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button 
                onClick={handleAskQuestion}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                Ask Question
              </button>
              <div className="w-8 h-8 rounded-full bg-gray-200">
                {/* User avatar */}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex gap-8">
          {/* Sidebar */}
          <div className="w-64 flex-shrink-0">
            <nav className="space-y-1">
              <a href="#" className="flex items-center px-3 py-2 text-sm font-medium text-gray-900 bg-gray-100 rounded-lg">
                <Flame className="w-5 h-5 mr-3 text-gray-500" />
                Home
              </a>
              <a href="#" className="flex items-center px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 rounded-lg">
                <MessageSquareDot className="w-5 h-5 mr-3 text-gray-400" />
                Questions
              </a>
              <a href="#" className="flex items-center px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 rounded-lg">
                <Bookmark className="w-5 h-5 mr-3 text-gray-400" />
                Tags
              </a>
              <a href="#" className="flex items-center px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 rounded-lg">
                <Share className="w-5 h-5 mr-3 text-gray-400" />
                Users
              </a>
            </nav>
          </div>

          {/* Questions List */}
          <div className="flex-1">
            <div className="flex justify-between items-center mb-6">
              <h1 className="text-2xl font-bold text-gray-900">All Questions</h1>
              <div className="flex gap-2">
                <button
                  onClick={() => setActiveTab("newest")}
                  className={`px-3 py-1 text-sm rounded-lg ${
                    activeTab === "newest"
                      ? "bg-blue-100 text-blue-700"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  Newest
                </button>
                <button
                  onClick={() => setActiveTab("votes")}
                  className={`px-3 py-1 text-sm rounded-lg ${
                    activeTab === "votes"
                      ? "bg-blue-100 text-blue-700"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  Most Voted
                </button>
                <button
                  onClick={() => setActiveTab("unanswered")}
                  className={`px-3 py-1 text-sm rounded-lg ${
                    activeTab === "unanswered"
                      ? "bg-blue-100 text-blue-700"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  Unanswered
                </button>
              </div>
            </div>

            {/* Questions */}
            <div className="space-y-4">
              {questions.map((question) => (
                <div key={question.id} className="bg-white rounded-lg border border-gray-200 p-6">
                  <div className="flex gap-6">
                    {/* Stats */}
                    <div className="flex flex-col items-center gap-2 text-sm text-gray-500">
                      <button 
                        onClick={() => handleVote(question.id, 'up')}
                        className="p-1 hover:bg-gray-100 rounded"
                      >
                        <ArrowUp className="w-4 h-4" />
                      </button>
                      <span>{question.votes}</span>
                      <button 
                        onClick={() => handleVote(question.id, 'down')}
                        className="p-1 hover:bg-gray-100 rounded"
                      >
                        <ArrowDown className="w-4 h-4" />
                      </button>
                      <div className="flex items-center gap-1">
                        <MessageSquareDot className="w-4 h-4" />
                        <span>{question.answers.length}</span>
                      </div>
                      <div className="text-xs">{question.views} views</div>
                      <button 
                        onClick={() => handleBookmark(question.id)}
                        className={`p-1 hover:bg-gray-100 rounded ${
                          bookmarkedQuestions.includes(question.id) ? 'text-blue-500' : ''
                        }`}
                      >
                        <Bookmark className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleShare(question.id)}
                        className="p-1 hover:bg-gray-100 rounded"
                      >
                        <Share className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Question Content */}
                    <div className="flex-1">
                      <h2 className="text-lg font-medium text-blue-600 hover:text-blue-700 mb-2">
                        <Link href={`/forum/question/${question.id}`}>
                          {question.title}
                        </Link>
                      </h2>
                      <div className="flex flex-wrap gap-2 mb-3">
                        {question.tags.map(({ tag }) => (
                          <span
                            key={tag.name}
                            className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded"
                          >
                            {tag.name}
                          </span>
                        ))}
                      </div>
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <img
                            src={question.authorAvatar}
                            alt={question.authorName}
                            className="w-6 h-6 rounded-full"
                          />
                          <span className="text-sm text-gray-600">
                            {question.authorName}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <span>asked {new Date(question.createdAt).toLocaleDateString()}</span>
                          <button className="p-1 hover:bg-gray-100 rounded">
                            <Ellipsis className="w-5 h-5" /> 
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
} 