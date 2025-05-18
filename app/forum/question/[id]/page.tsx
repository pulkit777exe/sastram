"use client";

import { UserButton, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { 
  ArrowUpIcon,
  ArrowDownIcon,
  MessageCircleIcon,
  BookmarkIcon,
  ShareIcon,
  FlagIcon,
  EllipsisHorizontalIcon
} from "lucide-react";
import { useState } from "react";
import { toast } from "react-hot-toast";

// Mock data for a question
const mockQuestion = {
  id: 1,
  title: "How to implement authentication in Next.js 13?",
  content: `I'm trying to implement authentication in my Next.js 13 application using Clerk. I've followed the documentation but I'm having trouble with the middleware configuration.

Here's what I've done so far:

1. Installed the Clerk package
2. Added the environment variables
3. Wrapped my app with ClerkProvider

But I'm getting an error when trying to protect my routes. Can someone help me with the correct middleware setup?`,
  votes: 42,
  tags: ["nextjs", "authentication", "javascript"],
  author: {
    name: "John Doe",
    reputation: 1234,
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=John"
  },
  createdAt: "2 hours ago",
  answers: [
    {
      id: 1,
      content: `To implement authentication in Next.js 13 with Clerk, you need to create a middleware.ts file in your project root. Here's how:

\`\`\`typescript
import { authMiddleware } from "@clerk/nextjs";
 
export default authMiddleware({
  publicRoutes: ["/", "/sign-in", "/sign-up"]
});
 
export const config = {
  matcher: ['/((?!.+\\.[\\w]+$|_next).*)', '/', '/(api|trpc)(.*)'],
};
\`\`\`

This will protect all routes except the ones specified in publicRoutes. Make sure to add any public routes you want to exclude from authentication.`,
      votes: 15,
      author: {
        name: "Jane Smith",
        reputation: 2345,
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Jane"
      },
      createdAt: "1 hour ago",
      isAccepted: true
    },
    {
      id: 2,
      content: "You might also want to check if you've properly configured your environment variables in the .env.local file. Make sure you have NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY set correctly.",
      votes: 8,
      author: {
        name: "Mike Johnson",
        reputation: 987,
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Mike"
      },
      createdAt: "30 minutes ago",
      isAccepted: false
    }
  ]
};

export default function QuestionPage({ params }: { params: { id: string } }) {
  const { user } = useUser();
  const [question, setQuestion] = useState(mockQuestion);
  const [answerContent, setAnswerContent] = useState("");
  const [isBookmarked, setIsBookmarked] = useState(false);

  const handleVote = (type: 'question' | 'answer', id: number, direction: 'up' | 'down') => {
    if (!user) {
      toast.error("Please sign in to vote");
      return;
    }

    if (type === 'question') {
      setQuestion(prev => ({
        ...prev,
        votes: direction === 'up' ? prev.votes + 1 : prev.votes - 1
      }));
    } else {
      setQuestion(prev => ({
        ...prev,
        answers: prev.answers.map(answer => 
          answer.id === id 
            ? { ...answer, votes: direction === 'up' ? answer.votes + 1 : answer.votes - 1 }
            : answer
        )
      }));
    }
  };

  const handleBookmark = () => {
    if (!user) {
      toast.error("Please sign in to bookmark questions");
      return;
    }
    setIsBookmarked(!isBookmarked);
  };

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Link copied to clipboard!");
    } catch {
      toast.error("Failed to copy link");
    }
  };

  const handleFlag = () => {
    if (!user) {
      toast.error("Please sign in to flag content");
      return;
    }
    toast.success("Content has been flagged for review");
  };

  const handlePostAnswer = () => {
    if (!user) {
      toast.error("Please sign in to post an answer");
      return;
    }

    if (!answerContent.trim()) {
      toast.error("Please write an answer before posting");
      return;
    }

    const newAnswer = {
      id: question.answers.length + 1,
      content: answerContent,
      votes: 0,
      author: {
        name: user.fullName || "Anonymous",
        reputation: 0,
        avatar: user.imageUrl || "https://api.dicebear.com/7.x/avataaars/svg?seed=Anonymous"
      },
      createdAt: "Just now",
      isAccepted: false
    };

    setQuestion(prev => ({
      ...prev,
      answers: [...prev.answers, newAnswer]
    }));
    setAnswerContent("");
    toast.success("Answer posted successfully!");
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Link href="/forum" className="flex items-center">
                <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center text-white font-bold">
                  C
                </div>
                <span className="ml-2 text-xl font-semibold text-gray-900">Cortex Forum</span>
              </Link>
            </div>
            <div className="flex items-center gap-4">
              <button className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors">
                Ask Question
              </button>
              <div className="w-8 h-8">
                <UserButton />
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Question */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-8">
          <div className="flex gap-6">
            {/* Stats */}
            <div className="flex flex-col items-center gap-2 text-sm text-gray-500">
              <button 
                onClick={() => handleVote('question', question.id, 'up')}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <ArrowUpIcon className="w-6 h-6" />
              </button>
              <span className="font-medium">{question.votes}</span>
              <button 
                onClick={() => handleVote('question', question.id, 'down')}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <ArrowDownIcon className="w-6 h-6" />
              </button>
              <button 
                onClick={handleBookmark}
                className={`p-1 hover:bg-gray-100 rounded ${isBookmarked ? 'text-blue-500' : ''}`}
              >
                <BookmarkIcon className="w-6 h-6" />
              </button>
              <button 
                onClick={handleShare}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <ShareIcon className="w-6 h-6" />
              </button>
              <button 
                onClick={handleFlag}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <FlagIcon className="w-6 h-6" />
              </button>
            </div>

            {/* Question Content */}
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-gray-900 mb-4">
                {question.title}
              </h1>
              <div className="prose max-w-none mb-6">
                <pre className="bg-gray-50 p-4 rounded-lg overflow-x-auto">
                  <code>{question.content}</code>
                </pre>
              </div>
              <div className="flex flex-wrap gap-2 mb-4">
                {question.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <img
                    src={question.author.avatar}
                    alt={question.author.name}
                    className="w-8 h-8 rounded-full"
                  />
                  <div>
                    <div className="text-sm text-gray-600">
                      {question.author.name}
                    </div>
                    <div className="text-xs text-gray-500">
                      {question.author.reputation} reputation
                    </div>
                  </div>
                </div>
                <div className="text-sm text-gray-500">
                  asked {question.createdAt}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Answers */}
        <div className="mb-8">
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            {question.answers.length} Answers
          </h2>
          <div className="space-y-6">
            {question.answers.map((answer) => (
              <div key={answer.id} className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex gap-6">
                  {/* Stats */}
                  <div className="flex flex-col items-center gap-2 text-sm text-gray-500">
                    <button 
                      onClick={() => handleVote('answer', answer.id, 'up')}
                      className="p-1 hover:bg-gray-100 rounded"
                    >
                      <ArrowUpIcon className="w-6 h-6" />
                    </button>
                    <span className="font-medium">{answer.votes}</span>
                    <button 
                      onClick={() => handleVote('answer', answer.id, 'down')}
                      className="p-1 hover:bg-gray-100 rounded"
                    >
                      <ArrowDownIcon className="w-6 h-6" />
                    </button>
                    {answer.isAccepted && (
                      <div className="w-6 h-6 bg-green-500 text-white rounded-full flex items-center justify-center">
                        ✓
                      </div>
                    )}
                  </div>

                  {/* Answer Content */}
                  <div className="flex-1">
                    <div className="prose max-w-none mb-4">
                      <pre className="bg-gray-50 p-4 rounded-lg overflow-x-auto">
                        <code>{answer.content}</code>
                      </pre>
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <img
                          src={answer.author.avatar}
                          alt={answer.author.name}
                          className="w-8 h-8 rounded-full"
                        />
                        <div>
                          <div className="text-sm text-gray-600">
                            {answer.author.name}
                          </div>
                          <div className="text-xs text-gray-500">
                            {answer.author.reputation} reputation
                          </div>
                        </div>
                      </div>
                      <div className="text-sm text-gray-500">
                        answered {answer.createdAt}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Your Answer */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Your Answer
          </h3>
          <textarea
            value={answerContent}
            onChange={(e) => setAnswerContent(e.target.value)}
            className="w-full h-48 p-4 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Write your answer here..."
          />
          <div className="mt-4 flex justify-end">
            <button 
              onClick={handlePostAnswer}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              Post Answer
            </button>
          </div>
        </div>
      </main>
    </div>
  );
} 