"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { v4 as uuidv4 } from "uuid";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, KeyRound } from "lucide-react";
import { SearchBox } from "./SearchBox";
import { PhaseTracker } from "./PhaseTracker";
import { SynthesisCard } from "./SynthesisCard";
import { SourceCard } from "./SourceCard";
import { TableView } from "./TableView";
import { ApiKeysModal, getStoredApiKeys, hasAllApiKeys } from "./ApiKeysModal";
import type {
  SearchConfig,
  AISearchResponse,
  PastSearch,
} from "@/modules/ai-search/types";

type AppState = "idle" | "loading" | "results" | "error";
type Phase = "classify" | "search" | "crossref" | "synthesize" | "done";

const DEFAULT_CONFIG: SearchConfig = {
  exaMode: "agentic",
  tavilyMode: "search",
  sourceFilter: "all",
  searchMode: "standard",
};

function loadPastSearches(): PastSearch[] {
  if (typeof window === "undefined") return [];
  try {
    const saved = localStorage.getItem("sastram_past_searches");
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

export function SearchPage() {
  const [appState, setAppState] = useState<AppState>("idle");
  const [phase, setPhase] = useState<Phase>("classify");
  const [searchStartTime, setSearchStartTime] = useState(0);
  const [result, setResult] = useState<AISearchResponse | null>(null);
  const [lastConfig, setLastConfig] = useState<SearchConfig>(DEFAULT_CONFIG);
  const [errorMessage, setErrorMessage] = useState("");

  const [pastSearches, setPastSearches] =
    useState<PastSearch[]>(loadPastSearches);
  const [showApiKeys, setShowApiKeys] = useState(false);
  const [hasKeys, setHasKeys] = useState(() =>
    typeof window !== "undefined" ? hasAllApiKeys() : false,
  );

  // Sync hasKeys on mount (SSR-safe)
  useEffect(() => {
    setHasKeys(hasAllApiKeys());
  }, []);

  const addPastSearch = useCallback(
    (query: string, resultCount: number) => {
      const newSearch: PastSearch = {
        id: uuidv4(),
        query,
        timestamp: Date.now(),
        resultCount,
      };
      const updated = [
        newSearch,
        ...pastSearches.filter((s) => s.query !== query),
      ].slice(0, 10);
      setPastSearches(updated);
      try {
        localStorage.setItem("sastram_past_searches", JSON.stringify(updated));
      } catch {}
    },
    [pastSearches],
  );

  const handleSearch = useCallback(
    async (query: string, config: SearchConfig) => {
      // Validate query
      const trimmed = query.trim();
      if (!trimmed || trimmed.length < 3) {
        toast.error("Query too short", {
          description: "Please enter at least 3 characters.",
        });
        return;
      }
      if (trimmed.length > 500) {
        toast.error("Query too long", {
          description: "Please keep your query under 500 characters.",
        });
        return;
      }

      const keys = getStoredApiKeys();
      if (!keys.exa || !keys.tavily || !keys.gemini) {
        toast.error("Please configure your API keys first", {
          description: "Click the API Keys button to get started.",
        });
        setShowApiKeys(true);
        return;
      }

      setAppState("loading");
      setPhase("classify");
      setSearchStartTime(Date.now());
      setResult(null);
      setErrorMessage("");
      setLastConfig(config);

      // Simulate phase progression
      const phaseTimers = [
        setTimeout(() => setPhase("search"), 800),
        setTimeout(() => setPhase("crossref"), 3000),
        setTimeout(() => setPhase("synthesize"), 5000),
      ];

      // AbortController for client-side timeout
      const controller = new AbortController();
      const clientTimeout = setTimeout(() => controller.abort(), 28_000);

      try {
        const response = await fetch("/api/ai/forum-search", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-exa-key": keys.exa,
            "x-tavily-key": keys.tavily,
            "x-gemini-key": keys.gemini,
          },
          body: JSON.stringify({ query: trimmed, config }),
          signal: controller.signal,
        });

        phaseTimers.forEach(clearTimeout);
        clearTimeout(clientTimeout);

        if (response.status === 429) {
          const retryAfter = response.headers.get("Retry-After");
          toast.error("Rate limit exceeded", {
            description: retryAfter
              ? `Please wait ${retryAfter} seconds.`
              : "Please wait a moment before searching again.",
          });
          setAppState("idle");
          return;
        }

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          const msg =
            data.error ||
            `Search failed (${response.status}). Please try again.`;
          setErrorMessage(msg);
          setAppState("error");
          toast.error(msg);
          return;
        }

        const data: AISearchResponse = await response.json();

        // Validate response shape
        if (!data.synthesis || !Array.isArray(data.sources)) {
          setErrorMessage("Received unexpected response format.");
          setAppState("error");
          return;
        }

        setResult(data);
        setPhase("done");
        setAppState("results");
        addPastSearch(trimmed, data.sources.length);
      } catch (error) {
        phaseTimers.forEach(clearTimeout);
        clearTimeout(clientTimeout);

        if (error instanceof DOMException && error.name === "AbortError") {
          setErrorMessage(
            "Request timed out. Please try again with a simpler query.",
          );
        } else {
          setErrorMessage(
            "Network error. Please check your connection and try again.",
          );
        }
        setAppState("error");
        toast.error("Search failed");
      }
    },
    [addPastSearch],
  );

  const handleNewSearch = useCallback(() => {
    setAppState("idle");
    setResult(null);
    setPhase("classify");
    setErrorMessage("");
  }, []);

  const recentSearchPills = useMemo(
    () => pastSearches.slice(0, 5),
    [pastSearches],
  );

  return (
    <div className="space-y-10">
      {/* Header — matches Threads/Search page pattern */}
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs uppercase tracking-[0.2em] mb-2">
            <Sparkles size={14} />
            <span>AI-Powered</span>
          </div>
          <h1 className="text-4xl font-bold tracking-tight">AI Search</h1>
          <p className="text-zinc-500 max-w-md">
            Search across Reddit, Hacker News, ArchWiki, Stack Overflow & more —
            powered by Exa, Tavily, and Gemini.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {appState === "results" && (
            <button
              onClick={handleNewSearch}
              className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground bg-muted hover:bg-accent rounded-xl border border-border transition-colors"
            >
              New Search
            </button>
          )}
          <button
            onClick={() => setShowApiKeys(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground bg-muted hover:bg-accent rounded-xl border border-border transition-colors"
          >
            <KeyRound size={14} />
            API Keys
            {hasKeys && (
              <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
            )}
          </button>
        </div>
      </div>

      {/* Search area */}
      <AnimatePresence mode="wait">
        {appState === "idle" && (
          <motion.div
            key="idle"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col items-center pt-16 pb-8"
          >
            <div className="mb-8 text-center">
              <h2 className="text-2xl font-bold tracking-tight mb-2">
                What do you want to search?
              </h2>
              <p className="text-sm text-zinc-500">
                AI synthesizes answers from multiple sources with confidence
                scoring.
              </p>
            </div>

            <SearchBox
              onSearch={handleSearch}
              isLoading={false}
              compact={false}
            />

            {/* Recent searches as pills */}
            {recentSearchPills.length > 0 && (
              <div className="mt-6 flex flex-wrap gap-2 justify-center max-w-2xl">
                {recentSearchPills.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => handleSearch(s.query, lastConfig)}
                    className="px-3 py-1 text-xs text-muted-foreground hover:text-foreground bg-muted hover:bg-accent rounded-full border border-border transition-colors truncate max-w-[200px]"
                  >
                    {s.query}
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {(appState === "loading" || appState === "results") && (
          <motion.div
            key="active"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-6"
          >
            {/* Compact search box */}
            <SearchBox
              onSearch={handleSearch}
              isLoading={appState === "loading"}
              compact={true}
            />

            {/* Phase tracker */}
            <div className="flex justify-center">
              <PhaseTracker currentPhase={phase} startTime={searchStartTime} />
            </div>

            {/* Results */}
            {appState === "results" && result && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-3xl mx-auto space-y-4"
              >
                <SynthesisCard
                  content={result.synthesis.content}
                  conflictData={result.synthesis.conflictData}
                  confidence={result.synthesis.confidence}
                  sourceCount={result.synthesis.sourceCount}
                  queryType={result.synthesis.queryType}
                />

                {lastConfig.searchMode === "table" ? (
                  <TableView sources={result.sources} />
                ) : (
                  <div className="space-y-3">
                    <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">
                      Sources ({result.sources.length})
                    </h3>
                    <div className="grid gap-3">
                      {result.sources.map((source, i) => (
                        <SourceCard
                          key={source.id}
                          title={source.title}
                          url={source.url}
                          source={source.domain}
                          snippet={source.snippet}
                          confidence={source.confidence}
                          tier={source.tier}
                          publishedDate={source.publishedDate}
                          isOutdated={source.isOutdated}
                          provider={source.provider}
                          index={i}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {result.synthesis.cachedAt && (
                  <p className="text-center text-[11px] text-muted-foreground/60 pt-2">
                    Cached result from{" "}
                    {new Date(result.synthesis.cachedAt).toLocaleString()}
                  </p>
                )}
              </motion.div>
            )}

            {/* Loading skeleton */}
            {appState === "loading" && (
              <div className="max-w-3xl mx-auto space-y-4 animate-pulse">
                <div className="bg-muted rounded-2xl h-40" />
                <div className="bg-muted rounded-xl h-24" />
                <div className="bg-muted rounded-xl h-24" />
                <div className="bg-muted rounded-xl h-24 opacity-50" />
              </div>
            )}
          </motion.div>
        )}

        {appState === "error" && (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center pt-16 pb-8 text-center"
          >
            <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
              <span className="text-destructive text-xl">!</span>
            </div>
            <h2 className="text-lg font-semibold mb-2">Something went wrong</h2>
            <p className="text-sm text-muted-foreground max-w-md mb-6">
              {errorMessage}
            </p>
            <button
              onClick={handleNewSearch}
              className="px-4 py-2 text-sm font-medium bg-foreground text-background rounded-xl hover:opacity-90 transition-opacity"
            >
              Try Again
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* API Keys Modal */}
      <ApiKeysModal
        isOpen={showApiKeys}
        onClose={() => setShowApiKeys(false)}
        onKeysChange={setHasKeys}
      />
    </div>
  );
}
