"use client";

import { useId, useState } from "react";
import type { DeckValidationIssue } from "@/lib/deckValidation";

type ValidationIssueListProps = {
  messages: string[];
  issues: DeckValidationIssue[];
  initialLimit?: number;
};

export function ValidationIssueList({ messages, issues, initialLimit = 8 }: ValidationIssueListProps) {
  const listId = useId();
  const [showAll, setShowAll] = useState(false);
  const visibleIssues = showAll ? issues : issues.slice(0, initialLimit);
  const hiddenCount = Math.max(0, issues.length - visibleIssues.length);

  return (
    <>
      <ul className="validation-list" id={listId}>
        {messages.map((item) => (
          <li key={item}>{item}</li>
        ))}
        {visibleIssues.map((issue) => (
          <li key={`${issue.code}-${issue.cardName ?? issue.title}-${issue.detail}`} className={`validation-${issue.severity}`}>
            <strong>{issue.title}:</strong> {issue.detail}
          </li>
        ))}
      </ul>
      {issues.length > initialLimit ? (
        <button
          aria-controls={listId}
          aria-expanded={showAll}
          className="text-button validation-toggle"
          onClick={() => setShowAll((current) => !current)}
          type="button"
        >
          {showAll ? "Show fewer issues" : `Showing ${initialLimit} of ${issues.length} issues - Show all`}
        </button>
      ) : hiddenCount ? (
        <p className="muted-copy">Showing {visibleIssues.length} of {issues.length} issues.</p>
      ) : null}
    </>
  );
}
