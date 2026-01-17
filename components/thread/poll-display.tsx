"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { voteOnPollAction, getUserVoteAction, getPollResultsAction } from "@/modules/polls/actions";
import { toast } from "sonner";
import { CheckCircle2, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface PollDisplayProps {
  poll: {
    id: string;
    threadId: string;
    question: string;
    options: string[];
    isActive: boolean;
    expiresAt: Date | null;
  };
}

export function PollDisplay({ poll }: PollDisplayProps) {
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isVoting, setIsVoting] = useState(false);

  useEffect(() => {
    loadPollData();
  }, [poll.id]);

  const loadPollData = async () => {
    setIsLoading(true);
    try {
      const [voteResult, resultsResult] = await Promise.all([
        getUserVoteAction(poll.id),
        getPollResultsAction(poll.id),
      ]);

      // Type guard for vote result
      if (
        voteResult &&
        typeof voteResult === "object" &&
        "success" in voteResult &&
        voteResult.success === true &&
        "data" in voteResult &&
        voteResult.data
      ) {
        setSelectedOption(voteResult.data.optionIndex);
        setHasVoted(true);
      }

      // Type guard for results
      if (
        resultsResult &&
        typeof resultsResult === "object" &&
        "success" in resultsResult &&
        resultsResult.success === true &&
        "data" in resultsResult &&
        resultsResult.data
      ) {
        setResults(resultsResult.data);
      }
    } catch (error) {
      console.error("Failed to load poll data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVote = async (optionIndex: number) => {
    if (hasVoted || isVoting) return;

    setIsVoting(true);
    try {
      const result = await voteOnPollAction(poll.id, optionIndex);
      if (result && typeof result === "object") {
        if ("error" in result && result.error) {
          toast.error(result.error);
        } else if ("message" in result && result.message) {
          toast.error(result.message);
        } else if ("success" in result && result.success) {
          setSelectedOption(optionIndex);
          setHasVoted(true);
          toast.success("Vote recorded!");
          await loadPollData();
        } else {
          toast.error("Failed to vote");
        }
      } else {
        toast.error("Failed to vote");
      }
    } catch (error) {
      toast.error("Something went wrong");
    } finally {
      setIsVoting(false);
    }
  };

  if (isLoading) {
    return <div className="text-muted-foreground">Loading poll...</div>;
  }

  const showResults = hasVoted || !poll.isActive;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-lg border bg-card p-6 space-y-4"
    >
      <div className="flex items-start justify-between">
        <h3 className="text-lg font-semibold text-foreground">{poll.question}</h3>
        {showResults && (
          <BarChart3 className="h-5 w-5 text-muted-foreground" />
        )}
      </div>

      <div className="space-y-2">
        {poll.options.map((option, index) => {
          const result = results?.results.find((r) => r.index === index);
          const percentage = result?.percentage || 0;
          const isSelected = selectedOption === index;

          return (
            <motion.div
              key={index}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              {showResults ? (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      {option}
                      {isSelected && (
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                      )}
                    </span>
                    <span className="text-muted-foreground">
                      {result?.votes || 0} votes ({percentage.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${percentage}%` }}
                      transition={{ duration: 0.5, delay: index * 0.1 }}
                      className={cn(
                        "h-full rounded-full",
                        isSelected ? "bg-primary" : "bg-muted-foreground/50"
                      )}
                    />
                  </div>
                </div>
              ) : (
                <Button
                  onClick={() => handleVote(index)}
                  disabled={isVoting}
                  variant={isSelected ? "default" : "outline"}
                  className="w-full justify-start"
                >
                  {option}
                </Button>
              )}
            </motion.div>
          );
        })}
      </div>

      {poll.expiresAt && (
        <p className="text-xs text-muted-foreground">
          Poll expires {new Date(poll.expiresAt).toLocaleDateString()}
        </p>
      )}
    </motion.div>
  );
}

