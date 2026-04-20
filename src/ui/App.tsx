import { useMemo, useState } from "react";
import { lookupNotionPage } from "./api";
import { emptyImage, loadingImage, logoImage } from "./assets";
import { exampleResult } from "./exampleData";
import type { Collaborator, LookupResponse } from "./types";

type LookupState = "idle" | "loading" | "ready" | "error";

interface StatusCopy {
  title: string;
  detail: string;
}

const exampleUrl = "https://www.notion.so/workspace/Page-Title-04f306fbf59a413fae15f42e2a1ab029";
const inspirationTweetUrl = "https://x.com/weezerOSINT/status/2045849358462222720";
const authorTwitterUrl = "https://x.com/gpt_alex";
const repoUrl = "https://github.com/alexanderSolod/notionpeek";
const avatarTones = ["tone-blue", "tone-violet", "tone-mint", "tone-peach", "tone-rose"] as const;

export function App() {
  const [url, setUrl] = useState("");
  const [checkedUrl, setCheckedUrl] = useState("");
  const [result, setResult] = useState<LookupResponse | null>(null);
  const [state, setState] = useState<LookupState>("idle");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [howOpen, setHowOpen] = useState(false);

  const collaborators = result?.collaborators ?? [];
  const summary = useMemo(() => summarize(collaborators), [collaborators]);
  const status = getStatusCopy(state, checkedUrl, result, error);
  const sourceLabel = useMemo(() => formatSourceLabel(checkedUrl), [checkedUrl]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      return;
    }

    setState("loading");
    setError("");
    setCheckedUrl(trimmedUrl);
    setResult(null);

    try {
      const payload = await lookupNotionPage(trimmedUrl);
      setResult(payload);
      setState("ready");
    } catch (lookupError) {
      setError(lookupError instanceof Error ? lookupError.message : "Lookup failed.");
      setState("error");
    }
  }

  function loadExample() {
    setUrl(exampleUrl);
    setCheckedUrl(exampleUrl);
    setResult(exampleResult);
    setError("");
    setState("ready");
  }

  async function copyCsv() {
    if (!result) {
      return;
    }

    await navigator.clipboard.writeText(toCsv(result.collaborators));
    showToast("CSV copied");
  }

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 1400);
  }

  function openHow() {
    setHowOpen(true);
  }

  return (
    <div className="page">
      <header className="topbar" aria-label="Top navigation">
        <div className="topbar-inner">
          <div className="brand">
            <img alt="" src={logoImage} />
            <span>NotionPeek</span>
          </div>
          <nav className="top-actions" aria-label="Page links">
            <a href="#results">Results</a>
            <a href="#agent-skill">Skill</a>
            <a href="#how-it-works" onClick={openHow}>How it works</a>
          </nav>
        </div>
      </header>

      <section className="hero" aria-labelledby="lookup-title">
        <div className="hero-inner">
          <h1 id="lookup-title">See who's behind any Notion page</h1>
          <p className="intro">
            Paste a public Notion link and get every collaborator's name, email, role, and
            company... with no login or API key required
          </p>

          <form className="form" onSubmit={handleSubmit}>
            <label htmlFor="notion-url">Notion page URL</label>
            <div className="input-row">
              <input
                id="notion-url"
                name="url"
                type="url"
                autoComplete="url"
                inputMode="url"
                placeholder="https://notion.so/company/hiring-page-a1b2c3..."
                value={url}
                required
                onChange={(event) => setUrl(event.target.value)}
              />
              <button className="primary" type="submit" disabled={state === "loading"}>
                {state === "loading" ? "Peeking" : "Peek"}
              </button>
            </div>
            <p className="hint">Works with any public notion.so or notion.site link</p>
          </form>

          <div className="sample">
            <span className="sample-label">Try</span>
            <button type="button" onClick={loadExample}>Example result</button>
          </div>
        </div>
      </section>

      <section id="results" className="results" aria-live="polite">
        <div className="results-inner">
          <div className="results-head">
            <div className="status">
              <span className={`status-dot ${state}`} aria-hidden="true" />
              <div>
                <p className="status-title">{status.title}</p>
                <p className="status-url">{sourceLabel || status.detail}</p>
              </div>
            </div>
            <button
              className="small-button"
              type="button"
              disabled={collaborators.length === 0}
              onClick={copyCsv}
            >
              Copy CSV
            </button>
          </div>

          {state === "ready" && collaborators.length > 0 ? (
            <div className="stats" aria-label="Lookup summary">
              <Stat value={summary.total} label="collaborators" />
              <Stat value={summary.workEmails} label="work emails" />
              <Stat value={summary.highPriority} label="high priority" />
              <Stat value={summary.companies} label="companies" />
            </div>
          ) : null}

          <div className="content">
            {state === "loading" ? <LoadingState /> : null}
            {state === "error" ? <ErrorState message={error} /> : null}
            {state === "idle" ? <EmptyState /> : null}
            {state === "ready" ? (
              <ResultsList collaborators={collaborators} onCopy={showToast} />
            ) : null}
          </div>
        </div>
      </section>

      <section id="agent-skill" className="skill-section">
        <div className="skill-inner">
          <div className="skill-copy">
            <h2 className="skill-title">Add this to your agent</h2>
            <p>
              Drop <code>skill.md</code> into Claude Code, Cursor, or any agent that reads markdown
              skills. It'll handle the lookup itself.
            </p>
          </div>
          <a className="download-button" href="/notion_peek.md" download="skill.md">
            <DownloadIcon />
            Download skill.md
          </a>
        </div>
      </section>

      <section id="how-it-works" className="how-section">
        <div className="how-inner">
          <button
            type="button"
            className="how-toggle"
            aria-expanded={howOpen}
            aria-controls="how-it-works-body"
            onClick={() => setHowOpen((open) => !open)}
          >
            <span className="how-label">How it works</span>
            <span className={`how-chevron ${howOpen ? "open" : ""}`} aria-hidden="true">
              <ChevronIcon />
            </span>
          </button>
          {howOpen ? (
            <div id="how-it-works-body" className="how-body">
              <ul>
                <li>NotionPeek reads the metadata Notion's own public page endpoint returns when a page loads.</li>
                <li>No login, browser extension, account, or API token needed.</li>
                <li>You see whatever Notion sends back: names, page roles, and emails when they're exposed.</li>
                <li>
                  The LinkedIn and Hiring buttons build a Google query from the person's name and
                  company (e.g. <code>"Sarah Chen" "Acme" site:linkedin.com/in/</code>) and open it
                  in a new tab. Copy CSV grabs the whole set.
                </li>
                <li>Private pages return nothing. The endpoint just doesn't include collaborator data for them.</li>
                <li>
                  Inspired by{" "}
                  <a href={inspirationTweetUrl} target="_blank" rel="noreferrer">
                    this tweet from @weezerOSINT
                  </a>
                  .
                </li>
              </ul>
            </div>
          ) : null}
        </div>
      </section>

      <footer className="footer">
        <div className="footer-inner">
          <a className="author" href={authorTwitterUrl} target="_blank" rel="noreferrer">
            Made by <strong>gpt.alex</strong>
            <ExternalIcon />
          </a>
          <a className="repo-link" href={repoUrl} target="_blank" rel="noreferrer">
            <GithubIcon />
            <span>Source on GitHub</span>
          </a>
        </div>
      </footer>

      <div className={`copied ${toast ? "visible" : ""}`} role="status">
        {toast || "Copied"}
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="empty">
      <div className="empty-card">
        <img alt="" src={emptyImage} />
        <h2>Paste a page to start.</h2>
        <p>Work emails come first, then stronger page roles.</p>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="loading-box">
      <div className="loading-card">
        <img alt="" src={loadingImage} />
        <h2>Checking the page.</h2>
        <p>Usually a few seconds. Pages with lots of collaborators take longer.</p>
      </div>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="error-box">
      <div className="error-card">
        <h2>{message}</h2>
        <p>Check that the page is public and that the URL is from notion.so or notion.site.</p>
      </div>
    </div>
  );
}

function ResultsList({ collaborators, onCopy }: { collaborators: Collaborator[]; onCopy: (message: string) => void }) {
  if (collaborators.length === 0) {
    return (
      <div className="empty">
        <div className="empty-card">
          <h2>No collaborators on this page.</h2>
          <p>The page loaded, but Notion didn't return any collaborators for it.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="collaborators">
      {collaborators.map((person, index) => (
        <PersonCard key={person.id} person={person} tone={avatarTones[index % avatarTones.length]} onCopy={onCopy} />
      ))}
    </div>
  );
}

function PersonCard({
  person,
  tone,
  onCopy
}: {
  person: Collaborator;
  tone: (typeof avatarTones)[number];
  onCopy: (message: string) => void;
}) {
  const displayName = person.name || person.email || person.id;
  const role = (person.role || "unknown").toLowerCase();
  const priority = person.jobSignals.contactPriority;
  const linkedinUrl = person.jobSignals.linkedinQuery ? googleSearchUrl(person.jobSignals.linkedinQuery) : null;
  const hiringUrl = person.jobSignals.hiringQuery ? googleSearchUrl(person.jobSignals.hiringQuery) : null;

  async function copyEmail() {
    await navigator.clipboard.writeText(person.email || "");
    onCopy("Email copied");
  }

  return (
    <article className="person-card">
      <div className={`avatar ${tone}`}>
        {person.profilePhoto ? <img src={person.profilePhoto} alt="" loading="lazy" /> : getInitials(displayName)}
      </div>
      <div className="person-main">
        <div className="person-line">
          <span className="name">{displayName}</span>
          <span className={`pill role-${role}`}>{role}</span>
          <span className={`pill priority-${priority}`}>{priority}</span>
        </div>
        <div className="meta">
          <span className="mono">{person.email || "No email found"}</span>
          <span className="tag">{person.isWorkEmail ? "work email" : "personal or hidden"}</span>
        </div>
      </div>
      <div className="person-actions">
        <span className="person-company">{person.company || "Company unknown"}</span>
        <div className="action-row">
          {linkedinUrl ? (
            <a href={linkedinUrl} target="_blank" rel="noreferrer">LinkedIn</a>
          ) : (
            <button type="button" disabled>LinkedIn</button>
          )}
          {hiringUrl ? (
            <a href={hiringUrl} target="_blank" rel="noreferrer">Hiring</a>
          ) : (
            <button type="button" disabled>Hiring</button>
          )}
          <button type="button" disabled={!person.email} onClick={copyEmail}>
            Copy
          </button>
        </div>
      </div>
    </article>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 2.5v8" />
      <path d="M4.5 7.5L8 11l3.5-3.5" />
      <path d="M3 13h10" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 3.5h-2.5v9h9v-2.5" />
      <path d="M9 3.5h3.5v3.5" />
      <path d="M7 9l5.5-5.5" />
    </svg>
  );
}

function GithubIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"/>
    </svg>
  );
}

function summarize(collaborators: Collaborator[]) {
  return {
    total: collaborators.length,
    workEmails: collaborators.filter((person) => person.isWorkEmail).length,
    highPriority: collaborators.filter((person) => person.jobSignals.contactPriority === "high").length,
    companies: new Set(collaborators.map((person) => person.company).filter(Boolean)).size
  };
}

function getStatusCopy(
  state: LookupState,
  checkedUrl: string,
  result: LookupResponse | null,
  error: string
): StatusCopy {
  if (state === "loading") {
    return { title: "Looking up collaborators", detail: checkedUrl };
  }

  if (state === "error") {
    return { title: "Lookup stopped", detail: error || checkedUrl || "No page checked." };
  }

  if (state === "ready" && result) {
    const count = result.collaborators.length;
    const source = result.cached ? " from cache" : "";
    return {
      title: `${count} collaborator${count === 1 ? "" : "s"} found${source}`,
      detail: ""
    };
  }

  return { title: "Waiting for a link", detail: "Results show up here." };
}

function formatSourceLabel(rawUrl: string) {
  if (!rawUrl) {
    return "";
  }

  try {
    const parsed = new URL(rawUrl);
    return `${parsed.host}${parsed.pathname}`.replace(/\/$/, "");
  } catch {
    return rawUrl;
  }
}

function googleSearchUrl(query: string) {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

function getInitials(value: string) {
  const initials = value
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return initials || "?";
}

function toCsv(collaborators: Collaborator[]) {
  const rows = [
    ["name", "email", "role", "company", "companyDomain", "priority", "linkedinQuery", "hiringQuery"],
    ...collaborators.map((person) => [
      person.name || "",
      person.email || "",
      person.role || "",
      person.company || "",
      person.companyDomain || "",
      person.jobSignals.contactPriority,
      person.jobSignals.linkedinQuery || "",
      person.jobSignals.hiringQuery || ""
    ])
  ];

  return rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
}
