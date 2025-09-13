"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

/** small jwt parser */
function parseJwt(token: string | null) {
  if (!token) return null;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = parts[1];
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), "=");
    const json = atob(padded);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

type Option = {
  id: string;
  text: string;
  detail_text?: string;
  isOther?: boolean;
};

type ResultsOption = {
  optionId?: string;
  text?: string;
  detail_text?: string;
  count?: number;
  percentOfVoters?: number; // optional server-provided percentage
};

type ResultsShape = {
  options?: ResultsOption[]; // normalized list with count + optional percentOfVoters
  counts?: Record<string, number>;
  freeTexts?: { text: string; detail_text?: string }[]; // normalized
  totalUsers?: number;
  totalVoted?: number;
  raw?: any;
};

const backendBase = "http://localhost:4000";

export default function HomePage() {
  const router = useRouter();

  const [mounted, setMounted] = useState(false);
  const [options, setOptions] = useState<Option[]>([]);
  const [selected, setSelected] = useState<string>(""); // option id or 'other'
  const [freeTitle, setFreeTitle] = useState("");
  const [freeDetail, setFreeDetail] = useState("");
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [userName, setUserName] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // results modal state
  const [resultsModalOpen, setResultsModalOpen] = useState(false);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [results, setResults] = useState<ResultsShape | null>(null);

  // keep the parsed user object so we can read voteStatus easily
  const [userObj, setUserObj] = useState<any | null>(null);
  const [jwtPayload, setJwtPayload] = useState<any | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    // determine user from localStorage user or token
    const token = localStorage.getItem("token");
    const userRaw = localStorage.getItem("user");

    let parsedUser: any = null;
    if (userRaw) {
      try {
        parsedUser = JSON.parse(userRaw);
      } catch {
        parsedUser = null;
      }
    }

    const parsedJwt = parseJwt(token);

    const name =
      parsedUser?.name ??
      parsedUser?.fullname ??
      parsedJwt?.name ??
      parsedJwt?.fullname ??
      parsedUser?.email ??
      parsedJwt?.email ??
      null;

    const admin =
      parsedUser?.role === "admin" ||
      parsedUser?.isAdmin === true ||
      parsedJwt?.role === "admin" ||
      parsedJwt?.isAdmin === true;

    setUserName(name ?? "User");
    setIsAdmin(Boolean(admin));
    setUserObj(parsedUser);
    setJwtPayload(parsedJwt);

    void loadOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  // derive whether the user already voted from userObj or token payload
  const hasVoted = useMemo(() => {
    const val =
      userObj?.voteStatus ??
      userObj?.vote?.status ??
      jwtPayload?.voteStatus ??
      jwtPayload?.vote?.status ??
      jwtPayload?.vote;
    if (typeof val === "boolean") return val;
    if (typeof val === "number") return val !== 0;
    if (typeof val === "string") {
      const lower = val.toLowerCase();
      return lower === "true" || lower === "voted" || lower === "yes";
    }
    return false;
  }, [userObj, jwtPayload]);

  async function loadOptions() {
    setLoadingOptions(true);
    setMessage(null);
    try {
      const res = await fetch(`${backendBase}/api/votes/options/main`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token") ?? ""}`,
        },
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(
          errBody?.message ?? `Failed to load options (${res.status})`
        );
      }

      const data = await res.json();
      const list: any[] = Array.isArray(data)
        ? data
        : data.items ?? data.options ?? [];

      const normalized: Option[] = list.map((o: any) => ({
        id: String(o.optionId ?? o.id ?? o._id ?? Math.random()),
        text: o.text ?? o.title ?? o.name ?? o.option ?? "Option",
        detail_text: o.detail_text ?? o.detail ?? o.description ?? "",
        isOther: Boolean(o.isOther ?? o.other ?? false),
      }));

      // append other option if missing
      const hasOther = normalized.some((n) => n.id === "other" || n.isOther);
      if (!hasOther) {
        normalized.push({
          id: "other",
          text: "Other (write your own)",
          detail_text: "",
          isOther: true,
        });
      }

      setOptions(normalized);
      if (!selected && normalized.length > 0) setSelected(normalized[0].id);
    } catch (err: any) {
      setMessage(err?.message ?? "Failed to load options");
    } finally {
      setLoadingOptions(false);
    }
  }

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    setMessage(null);

    if (!selected) {
      setMessage("Please choose an option");
      return;
    }

    if (selected === "other" && !freeTitle.trim()) {
      setMessage("Please enter a title for your custom option");
      return;
    }

    setSubmitting(true);
    try {
      const url = `${backendBase}/api/votes/submit`;
      let body: any;
      if (selected === "other") {
        // use API shape: text + detail_text
        body = {
          customText: freeTitle.trim(),
          detailText: freeDetail.trim(),
        };
      } else {
        body = { optionId: selected };
      }

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token") ?? ""}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(
          errBody?.message ?? `Failed to submit vote (${res.status})`
        );
      }

      const resp = await res.json().catch(() => null);
      setMessage(
        resp?.message ??
          (selected === "other"
            ? `Submitted custom option: "${body.text}"`
            : `Submitted vote`)
      );
      // reload options in case server-side data changes
      void loadOptions();

      // mark locally as voted so UI hides form
      setUserObj((prev: any) => {
        try {
          const copy = { ...(prev ?? {}) };
          copy.voteStatus = true;
          return copy;
        } catch {
          return prev;
        }
      });
    } catch (err: any) {
      setMessage(err?.message ?? "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }

  // Show results: normalizes response into ResultsShape using server total fields when available
  async function handleShowResults() {
    setResultsModalOpen(true);
    setResults(null);
    setResultsLoading(true);
    try {
      const res = await fetch(`${backendBase}/api/votes/results`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token") ?? ""}`,
        },
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(
          errBody?.message ?? `Failed to fetch results (${res.status})`
        );
      }
      const data = await res.json();

      const resultShape: ResultsShape = { raw: data };

      // server may provide totalUsers / totalVoted
      if (typeof data.totalUsers === "number")
        resultShape.totalUsers = data.totalUsers;
      if (typeof data.totalVoted === "number")
        resultShape.totalVoted = data.totalVoted;

      // server might return options array with counts and percentOfVoters
      if (Array.isArray(data.options)) {
        resultShape.options = data.options.map((o: any) => ({
          optionId: String(o.optionId ?? o.id ?? o._id ?? ""),
          text: o.text ?? o.title ?? o.name ?? "",
          detail_text: o.detail_text ?? o.detail ?? o.description ?? "",
          // account for various field names
          count:
            typeof o.votes === "number"
              ? o.votes
              : typeof o.count === "number"
              ? o.count
              : Number(o.votes ?? o.count ?? 0),
          percentOfVoters:
            typeof o.percentOfVoters === "number"
              ? o.percentOfVoters
              : undefined,
        }));
      }

      // accept keyed votes object (data.votes or data.counts)
      if (
        !resultShape.options &&
        (data.votes || data.counts || typeof data === "object")
      ) {
        if (data.votes && typeof data.votes === "object") {
          resultShape.counts = data.votes;
        } else if (data.counts && typeof data.counts === "object") {
          resultShape.counts = data.counts;
        } else {
          const counts: Record<string, number> = {};
          for (const k of Object.keys(data)) {
            const v = (data as any)[k];
            if (typeof v === "number") counts[k] = v;
            else if (v && typeof v.votes === "number") counts[k] = v.votes;
            else if (v && typeof v.count === "number") counts[k] = v.count;
          }
          if (Object.keys(counts).length > 0) resultShape.counts = counts;
        }
      }

      // free text lists - accept multiple possible keys
      if (Array.isArray(data.freeTexts)) {
        resultShape.freeTexts = data.freeTexts.map((f: any) => ({
          text: f.text ?? f.customText ?? f.title ?? "",
          detail_text: f.detail_text ?? f.customDetail ?? f.detail ?? "",
        }));
      } else if (Array.isArray(data.free_texts)) {
        resultShape.freeTexts = data.free_texts.map((f: any) => ({
          text: f.text ?? f.customText ?? f.title ?? "",
          detail_text: f.detail_text ?? f.customDetail ?? f.detail ?? "",
        }));
      } else if (Array.isArray(data.freeText)) {
        resultShape.freeTexts = data.freeText.map((f: any) => ({
          text: f.text ?? f.customText ?? f.title ?? "",
          detail_text: f.detail_text ?? f.customDetail ?? f.detail ?? "",
        }));
      } else if (Array.isArray((data as any).customs)) {
        resultShape.freeTexts = (data as any).customs.map((f: any) => ({
          text: f.customText ?? f.text ?? "",
          detail_text: f.customDetail ?? f.customDetail ?? "",
        }));
      }

      setResults(resultShape);
    } catch (err: any) {
      setResults({ raw: { error: err?.message ?? "Failed to fetch results" } });
    } finally {
      setResultsLoading(false);
    }
  }

  // compute totals and helper values
  const totalVotes = useMemo(() => {
    if (!results) return 0;
    if (typeof results.totalVoted === "number") return results.totalVoted;

    if (results.options && results.options.length) {
      return results.options.reduce((s, o) => s + (o.count ?? 0), 0);
    }
    if (results.counts) {
      return Object.values(results.counts).reduce((s, n) => s + (n ?? 0), 0);
    }
    return 0;
  }, [results]);

  const totalUsers = useMemo(() => {
    if (!results) return undefined;
    return results.totalUsers;
  }, [results]);

  // helper to get option label from options list
  function optionLabelForId(id: string) {
    const found = options.find((o) => o.id === id);
    return found ? found.text : id;
  }

  if (!mounted) return null;

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <header className="mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 flex-shrink-0 rounded-full bg-blue-100 grid place-items-center text-blue-700 font-semibold">
              {userName ? userName.charAt(0).toUpperCase() : "U"}
            </div>
            <div>
              <div className="text-sm text-black">Signed in as</div>
              <div className="text-lg font-bold text-black">{userName}</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {isAdmin && (
              <>
                <button
                  onClick={handleShowResults}
                  className="rounded-md border px-3 py-2 text-sm text-black hover:bg-gray-100"
                >
                  Show Results
                </button>
                <button
                  onClick={() => router.push("/admin")}
                  className="rounded-md border px-3 py-2 text-sm text-black hover:bg-gray-100"
                >
                  Manage Users
                </button>
              </>
            )}
            <button
              onClick={() => {
                localStorage.removeItem("token");
                localStorage.removeItem("user");
                router.push("/");
              }}
              className="rounded-md border px-3 py-2 text-sm text-black hover:bg-gray-100"
            >
              Logout
            </button>
          </div>
        </header>

        {/* Voting Card */}
        <div className="rounded-2xl bg-white p-6 shadow">
          <h2 className="mb-4 text-lg font-bold text-black">Voting</h2>

          {message && (
            <div className="mb-4 rounded-md bg-yellow-50 p-3 text-sm text-black">
              {message}
            </div>
          )}

          {/* If user already voted -> show empty state */}
          {hasVoted ? (
            <div className="min-h-[200px] flex flex-col items-center justify-center border rounded-md p-6 text-center">
              <div className="text-lg font-semibold text-black mb-2">
                You already vote
              </div>
              <div className="text-sm text-gray-700 mb-4">
                Thank you for participating.
              </div>
            </div>
          ) : (
            /* else show voting form */
            <form onSubmit={handleSubmit} className="space-y-5">
              <fieldset>
                <legend className="mb-3 text-sm font-semibold text-black">
                  Choose one option
                </legend>

                <div className="space-y-3">
                  {loadingOptions ? (
                    <div className="text-sm text-black">Loading options...</div>
                  ) : (
                    options.map((opt) => (
                      <div key={opt.id} className="rounded-lg border">
                        <label className="flex items-start gap-3 p-3 w-full cursor-pointer">
                          <input
                            type="radio"
                            name="vote"
                            checked={selected === opt.id}
                            onChange={() => setSelected(opt.id)}
                            className="mt-1"
                          />
                          <div>
                            <div className="font-bold text-black">
                              {opt.text}
                            </div>
                            {opt.detail_text ? (
                              <div className="text-sm text-black">
                                {opt.detail_text}
                              </div>
                            ) : null}
                          </div>
                        </label>

                        {/* If this option is Other, show the free-text panel only when selected */}
                        {opt.isOther && (
                          <div
                            className={`transition-all duration-200 overflow-hidden px-3 ${
                              selected === opt.id ? "max-h-96 py-3" : "max-h-0"
                            }`}
                            aria-hidden={selected !== opt.id}
                          >
                            <div className="rounded-md border p-3 bg-gray-50">
                              <div className="mb-2 text-sm font-semibold text-black">
                                Other / Free text
                              </div>
                              <input
                                placeholder="Your option title"
                                value={freeTitle}
                                onChange={(e) => setFreeTitle(e.target.value)}
                                className="w-full rounded-md border border-gray-300 p-2 text-black mb-2"
                              />
                              <textarea
                                placeholder="Explain your idea (optional)"
                                value={freeDetail}
                                onChange={(e) => setFreeDetail(e.target.value)}
                                className="min-h-[80px] w-full resize-y rounded-md border border-gray-300 p-2 text-black"
                              />
                              <div className="mt-2 text-xs text-gray-600">
                                Note: free text will be submitted only when
                                selecting the <strong>Other</strong> option.
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </fieldset>

              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-60"
                  disabled={submitting}
                >
                  {submitting ? "Submitting..." : "Submit Vote"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSelected(options.length ? options[0].id : "");
                    setFreeTitle("");
                    setFreeDetail("");
                    setMessage(null);
                  }}
                  className="rounded-md border px-3 py-2 text-black hover:bg-gray-50"
                >
                  Reset
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Results Modal (pretty) */}
      {resultsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
          <div className="mx-4 w-full max-w-3xl rounded-lg bg-white p-6 shadow-lg text-black">
            <div className="flex items-start justify-between">
              <h3 className="text-lg font-semibold">Voting Results</h3>
              <button
                onClick={() => setResultsModalOpen(false)}
                className="text-sm text-black rounded border px-2 py-1 hover:bg-gray-100"
              >
                Close
              </button>
            </div>

            <div className="mt-4 space-y-4">
              {resultsLoading ? (
                <div>Loading results...</div>
              ) : results ? (
                <>
                  {/* Summary: voted / total users */}
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-black">
                      Voted: <strong>{results.totalVoted ?? totalVotes}</strong>
                      {typeof results.totalUsers === "number" ? (
                        <>
                          {" "}
                          of <strong>{results.totalUsers}</strong> users
                        </>
                      ) : null}
                    </div>
                    <div className="text-sm text-black">
                      {(() => {
                        const tv = results.totalVoted ?? totalVotes;
                        const tu =
                          typeof results.totalUsers === "number"
                            ? results.totalUsers
                            : undefined;
                        if (!tv) return null;
                        if (tu)
                          return `Turnout: ${Math.round((tv / tu) * 100)}%`;
                        return null;
                      })()}
                    </div>
                  </div>

                  {/* Options counts (if available) */}
                  <div>
                    <h4 className="font-medium mb-2">Option breakdown</h4>

                    {results.options && results.options.length ? (
                      <div className="space-y-3">
                        {results.options.map((o, i) => {
                          const count = o.count ?? 0;
                          // prefer server percentOfVoters if provided
                          const pct =
                            typeof o.percentOfVoters === "number"
                              ? Math.round(o.percentOfVoters)
                              : totalVotes > 0
                              ? Math.round((count / totalVotes) * 100)
                              : 0;
                          return (
                            <div
                              key={o.optionId ?? `${i}`}
                              className="space-y-1"
                            >
                              <div className="flex items-center justify-between text-sm">
                                <div>
                                  <div className="font-semibold text-black">
                                    {o.text || `Option ${i + 1}`}
                                  </div>
                                  {o.detail_text ? (
                                    <div className="text-xs text-black">
                                      {o.detail_text}
                                    </div>
                                  ) : null}
                                </div>
                                <div className="text-sm text-black">
                                  {count} ({pct}%)
                                </div>
                              </div>
                              <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                                <div
                                  style={{ width: `${pct}%` }}
                                  className="h-2 bg-blue-600"
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : results.counts ? (
                      <div className="space-y-3">
                        {Object.entries(results.counts).map(([k, v]) => {
                          const count = v ?? 0;
                          const pct =
                            totalVotes > 0
                              ? Math.round((count / totalVotes) * 100)
                              : 0;
                          const label = optionLabelForId(k) ?? k;
                          return (
                            <div key={k} className="space-y-1">
                              <div className="flex items-center justify-between text-sm">
                                <div className="font-semibold text-black">
                                  {label}
                                </div>
                                <div className="text-sm text-black">
                                  {count} ({pct}%)
                                </div>
                              </div>
                              <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                                <div
                                  style={{ width: `${pct}%` }}
                                  className="h-2 bg-blue-600"
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-sm text-black">
                        No option counts available.
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-sm text-black">No results yet.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
