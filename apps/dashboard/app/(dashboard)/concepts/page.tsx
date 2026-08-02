"use client";

import { useCallback, useEffect, useState } from "react";

interface Concept {
  id: string;
  assetId: string;
  conceptType: string;
  headlines: string[];
  captions: string[];
  creativeDirection: string;
  suggestedTemplates: string[];
  animationStyle: string;
  state: string;
  createdAt: string;
  assetFilename: string;
  assetKind: string;
}

export default function ConceptsPage() {
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [filter, setFilter] = useState<string>("draft");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  useEffect(() => {
    fetchConcepts();
  }, [filter]);

  // Same fire-and-poll pattern as Posts page's Compose button and the Jobs
  // page's Run Now — the run endpoint only dispatches create_concepts and
  // returns immediately, so poll until it actually finishes before refetching.
  const runGenerateConcepts = async () => {
    setGenerating(true);
    setGenerateError(null);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: "create_concepts" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setGenerateError(data.detail || "Failed to start create_concepts");
        return;
      }
      const deadline = Date.now() + 120_000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 2000));
        const jobsRes = await fetch("/api/jobs");
        if (!jobsRes.ok) break;
        const data = await jobsRes.json();
        if (!Array.isArray(data)) break;
        const job = data.find((j: { id: string; last_run: { status: string } | null }) => j.id === "create_concepts");
        if (job?.last_run?.status && job.last_run.status !== "running") break;
      }
      await fetchConcepts();
    } catch {
      setGenerateError("Could not reach worker");
    } finally {
      setGenerating(false);
    }
  };

  const fetchConcepts = async () => {
    setLoading(true);
    try {
      const url = filter === "all" ? "/api/concepts" : `/api/concepts?state=${filter}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setConcepts(data);
      }
    } catch (error) {
      console.error("Failed to fetch concepts:", error);
    }
    setLoading(false);
  };

  const updateConceptState = async (id: string, newState: "approved" | "rejected") => {
    try {
      const res = await fetch(`/api/concepts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: newState }),
      });

      if (res.ok) {
        // Remove from list
        setConcepts((prev) => prev.filter((c) => c.id !== id));
      } else {
        alert("Failed to update concept");
      }
    } catch (error) {
      console.error("Failed to update concept:", error);
      alert("Network error");
    }
  };

  const typeColors: Record<string, string> = {
    "price-focused": "bg-green-100 text-green-700",
    "lifestyle": "bg-blue-100 text-blue-700",
    "quality": "bg-purple-100 text-purple-700",
    "exclusive": "bg-amber-100 text-amber-700",
    "comfort": "bg-pink-100 text-pink-700",
  };

  const stateColors: Record<string, string> = {
    draft: "bg-yellow-100 text-yellow-700",
    approved: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-700",
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-3xl text-primary">Creative Concepts</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={runGenerateConcepts}
            disabled={generating}
            className="flex items-center gap-1.5 rounded bg-primary px-3 py-1.5 font-body text-sm text-white hover:bg-primary/90 disabled:opacity-50"
          >
            {generating ? "Generating..." : "Generate Concepts"}
          </button>
          <button
            onClick={() => fetchConcepts()}
            className="flex items-center gap-1.5 rounded bg-dark/10 px-3 py-1.5 font-body text-sm text-dark hover:bg-dark/20"
          >
            Refresh
          </button>
        </div>
      </div>

      {generateError && (
        <div className="rounded bg-red-50 p-3 font-body text-sm text-red-700 border border-red-200">
          {generateError}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {["draft", "approved", "rejected", "all"].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-full px-3 py-1 text-sm font-medium capitalize transition-colors ${
              filter === s ? "bg-primary text-white" : "bg-dark/10 text-dark hover:bg-dark/20"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="font-body text-muted">Loading concepts...</p>
      ) : concepts.length === 0 ? (
        <p className="font-body text-muted">No concepts found. Run the create_concepts job first.</p>
      ) : (
        <div className="grid gap-4">
          {concepts.map((concept) => (
            <div
              key={concept.id}
              className="rounded-lg border border-dark/10 bg-light p-6"
            >
              <div className="mb-4 flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className={`rounded px-2 py-0.5 text-xs font-medium capitalize ${typeColors[concept.conceptType]}`}>
                    {concept.conceptType}
                  </span>
                  <span className={`rounded px-2 py-0.5 text-xs font-medium capitalize ${stateColors[concept.state]}`}>
                    {concept.state}
                  </span>
                  {concept.animationStyle && concept.animationStyle !== "none" && (
                    <span className="rounded bg-dark/10 px-2 py-0.5 text-xs font-medium text-dark">
                      {concept.animationStyle}
                    </span>
                  )}
                </div>
                <span className="font-body text-xs text-muted">
                  {new Date(concept.createdAt).toLocaleDateString()}
                </span>
              </div>

              <div className="mb-4">
                <h3 className="font-body text-sm font-medium text-dark mb-2">Headlines (5 options)</h3>
                <ul className="space-y-1">
                  {concept.headlines.map((headline, i) => (
                    <li key={i} className="font-body text-sm text-dark/80">
                      {i + 1}. {headline}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mb-4">
                <h3 className="font-body text-sm font-medium text-dark mb-2">Captions (3 options)</h3>
                <div className="space-y-2">
                  {concept.captions.map((caption, i) => (
                    <div key={i} className="rounded bg-dark/5 p-3 font-body text-sm text-dark/80">
                      <strong>Option {i + 1}:</strong> {caption}
                    </div>
                  ))}
                </div>
              </div>

              {concept.creativeDirection && (
                <div className="mb-4 rounded bg-blue-50 p-3">
                  <h3 className="font-body text-sm font-medium text-blue-900 mb-1">Creative Direction</h3>
                  <p className="font-body text-sm text-blue-800">{concept.creativeDirection}</p>
                </div>
              )}

              {concept.suggestedTemplates.length > 0 && (
                <div className="mb-4">
                  <h3 className="font-body text-sm font-medium text-dark mb-2">Suggested Templates</h3>
                  <div className="flex flex-wrap gap-1">
                    {concept.suggestedTemplates.map((template) => (
                      <span key={template} className="rounded bg-dark/10 px-2 py-1 font-body text-xs text-dark">
                        {template}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3 border-t border-dark/10 pt-4">
                <span className="font-body text-xs text-muted">
                  Asset: {concept.assetFilename || concept.assetKind}
                </span>
                <div className="ml-auto flex items-center gap-2">
                  {concept.state === "draft" && (
                    <>
                      <button
                        onClick={() => updateConceptState(concept.id, "rejected")}
                        className="rounded bg-red-600 px-3 py-1 font-body text-xs text-white hover:bg-red-700"
                      >
                        Reject
                      </button>
                      <button
                        onClick={() => updateConceptState(concept.id, "approved")}
                        className="rounded bg-green-600 px-3 py-1 font-body text-xs text-white hover:bg-green-700"
                      >
                        Approve
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}