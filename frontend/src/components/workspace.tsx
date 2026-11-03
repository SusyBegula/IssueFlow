"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  ArrowDown,
  ArrowDownWideNarrow,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleCheck,
  Clock3,
  Columns3,
  Ellipsis,
  Flag,
  Folder,
  FolderKanban,
  HelpCircle,
  LayoutDashboard,
  List,
  LoaderCircle,
  Menu,
  Plus,
  Search,
  Settings2,
  SlidersHorizontal,
  Trash2,
  UserRound,
  Users,
  X,
  Zap,
} from "lucide-react";
import { api, ApiError, type Session } from "@/lib/client";
import SignIn from "@/components/sign-in";
import { ThemeToggle } from "@/components/theme";
import { Avatar } from "@/components/avatar";
import ProfilePage, { type ProfileUpdate } from "@/components/profile-page";
import {
  STATUSES,
  priorities,
  statusLabels,
  type Issue,
  type Priority,
  type Profile,
  type Project,
  type Status,
  type WorkspaceData,
} from "@/lib/types";

type View = "board" | "dashboard" | "projects" | "mine" | "profile";
type Modal =
  | { kind: "issue"; issue?: Issue; status?: Status }
  | { kind: "project"; project?: Project }
  | { kind: "members" }
  | { kind: "help" }
  | null;
const empty: WorkspaceData = {
  projects: [],
  issues: [],
  profiles: [],
  members: [],
};
const colors = ["violet", "peach", "mint", "rose", "blue"];
const initials = (name: string) =>
  name
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
function StatusIcon({ status }: { status: Status }) {
  return status === "done" ? (
    <CircleCheck size={15} />
  ) : status === "in_progress" ? (
    <LoaderCircle size={15} />
  ) : status === "blocked" ? (
    <Circle size={15} strokeDasharray="3 3" />
  ) : (
    <Circle size={15} />
  );
}
function PriorityIcon({ priority }: { priority: Priority }) {
  return (
    <span
      className={`priority-icon ${priority}`}
      title={`${priority} priority`}
    >
      {priority === "urgent" ? (
        <Flag size={13} />
      ) : priority === "high" ? (
        <ArrowUp size={14} />
      ) : priority === "low" ? (
        <ArrowDown size={14} />
      ) : (
        <span>＝</span>
      )}
    </span>
  );
}
const date = (value: string) =>
  new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

export default function Workspace() {
  const [data, setData] = useState<WorkspaceData>(empty);
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View>("board");
  const [projectId, setProjectId] = useState("");
  const [layout, setLayout] = useState<"board" | "list">("board");
  const [query, setQuery] = useState("");
  const [priority, setPriority] = useState("all");
  const [assignee, setAssignee] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [filters, setFilters] = useState(false);
  const [sort, setSort] = useState("created");
  const [tab, setTab] = useState("all");
  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [error, setError] = useState("");
  const [formColor, setFormColor] = useState("violet");
  const searchRef = useRef<HTMLInputElement>(null);
  const activeUserRef = useRef<string | null>(null);
  const dragCleanupRef = useRef<() => void>(() => {});
  const suppressCardClick = useRef(false);
  const [dragPreview, setDragPreview] = useState<{
    id: string;
    title: string;
    x: number;
    y: number;
  } | null>(null);
  const userId = session?.user.id || "";
  const me = data.profiles.find((p) => p.id === userId);
  const project = data.projects.find((p) => p.id === projectId);
  const projectIssues = data.issues.filter((i) => i.project_id === projectId);
  const projectPeople = data.profiles.filter(
    (p) =>
      p.id === project?.owner_id ||
      data.members.some(
        (m) => m.project_id === projectId && m.user_id === p.id,
      ),
  );
  const canManage = !project || project.owner_id === userId;
  const activeFilters =
    Number(priority !== "all") +
    Number(assignee !== "all") +
    Number(statusFilter !== "all");

  function tell(message: string) {
    setToast(message);
  }
  async function loadLive(userId: string) {
    const loaded = await api<WorkspaceData>("/api/workspace");
    if (activeUserRef.current !== userId) return;
    setData(loaded);
    setProjectId((current) =>
      loaded.projects.some((p) => p.id === current)
        ? current
        : loaded.projects[0]?.id || "",
    );
  }
  function signedOut() {
    activeUserRef.current = null;
    setSession(null);
    setData(empty);
    setProjectId("");
    setModal(null);
    setReady(true);
  }
  async function signedIn(next: Session) {
    activeUserRef.current = next.user.id;
    setError("");
    try {
      await loadLive(next.user.id);
      if (activeUserRef.current === next.user.id) setSession(next);
    } catch (e) {
      activeUserRef.current = null;
      setSession(null);
      setData(empty);
      throw e instanceof ApiError && e.status === 401
        ? new Error(
            "Sign-in could not be completed. Allow cookies for this site and try again.",
          )
        : e;
    }
  }
  useEffect(() => {
    let active = true;
    const expired = () => {
      if (active) signedOut();
    };
    window.addEventListener("issueflow:unauthorized", expired);
    void api<Session>("/api/auth/me")
      .then((next) => {
        if (active) return signedIn(next);
      })
      .catch((e) => {
        if (active && !(e instanceof ApiError && e.status === 401))
          setError("Unable to reach the server.");
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
      window.removeEventListener("issueflow:unauthorized", expired);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4200);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    function handle(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setModal(null);
        setFilters(false);
        setMobile(false);
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (
        event.key.toLowerCase() === "c" &&
        !(event.target instanceof HTMLInputElement) &&
        !(event.target instanceof HTMLTextAreaElement) &&
        !(event.target instanceof HTMLSelectElement) &&
        !modal &&
        projectId
      )
        setModal({ kind: "issue" });
    }
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [modal, projectId]);
  useEffect(() => {
    setError("");
    if (modal?.kind === "project")
      setFormColor(modal.project?.color || "violet");
  }, [modal]);
  useEffect(() => () => dragCleanupRef.current(), []);
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement as HTMLElement | null;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    const focusables = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          "button:not([disabled]), input:not([disabled]), textarea, select, a[href]",
        ) || [],
      );
    (
      dialog?.querySelector<HTMLElement>("[autofocus], input") ||
      focusables()[0]
    )?.focus();
    function trap(event: KeyboardEvent) {
      if (event.key !== "Tab") return;
      const items = focusables();
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener("keydown", trap);
    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener("keydown", trap);
      previous?.focus();
    };
  }, [modal]);
  function navigate(next: View, id?: string) {
    setView(next);
    if (id) setProjectId(id);
    setQuery("");
    setMobile(false);
    setTab("all");
    setPriority("all");
    setAssignee("all");
    setStatusFilter("all");
  }
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Something went wrong.";
      setError(message);
      tell(message);
    } finally {
      setBusy(false);
    }
  }
  async function saveIssue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const editing = modal?.kind === "issue" ? modal.issue : undefined;
    const payload = {
      title: String(f.get("title")).trim(),
      description: String(f.get("description") || "").trim(),
      status: f.get("status") as Status,
      priority: f.get("priority") as Priority,
      assignee_id: String(f.get("assignee_id") || "") || null,
      label: String(f.get("label") || ""),
      due_date: String(f.get("due_date") || "") || null,
    };
    await run(async () => {
      if (!session) throw new Error("Sign in to continue.");
      await api(
        editing ? `/api/issues/${editing.id}` : "/api/issues",
        editing ? "PATCH" : "POST",
        editing ? payload : { ...payload, project_id: projectId },
      );
      await loadLive(session.user.id);
      setModal(null);
      tell(editing ? "Issue updated" : "New issue created");
    });
  }
  async function moveIssue(id: string, status: Status) {
    if (data.issues.find((i) => i.id === id)?.status === status) return;
    await run(async () => {
      if (!session) throw new Error("Sign in to continue.");
      await api(`/api/issues/${id}`, "PATCH", {
        status,
      });
      await loadLive(session.user.id);
      tell(`Moved to ${statusLabels[status].toLowerCase()}`);
    });
  }
  function beginDrag(event: ReactPointerEvent<HTMLElement>, issue: Issue) {
    if (busy || event.button !== 0 || event.pointerType !== "mouse") return;
    dragCleanupRef.current();
    suppressCardClick.current = false;
    const startX = event.clientX;
    const startY = event.clientY;
    let moved = false;
    const previousSelect = document.body.style.userSelect;
    function move(e: PointerEvent) {
      if (!moved && Math.hypot(e.clientX - startX, e.clientY - startY) < 6)
        return;
      moved = true;
      e.preventDefault();
      document.body.style.userSelect = "none";
      setDragPreview({
        id: issue.id,
        title: issue.title,
        x: e.clientX,
        y: e.clientY,
      });
    }
    function cleanup() {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", end);
      document.removeEventListener("pointercancel", cleanup);
      window.removeEventListener("blur", cleanup);
      document.body.style.userSelect = previousSelect;
      setDragPreview(null);
    }
    function end(e: PointerEvent) {
      if (moved) {
        suppressCardClick.current = true;
        window.setTimeout(() => {
          suppressCardClick.current = false;
        }, 0);
        const target = document
          .elementFromPoint(e.clientX, e.clientY)
          ?.closest<HTMLElement>("[data-status]")?.dataset.status as
          | Status
          | undefined;
        if (target && STATUSES.includes(target))
          void moveIssue(issue.id, target);
      }
      cleanup();
    }
    document.addEventListener("pointermove", move, { passive: false });
    document.addEventListener("pointerup", end);
    document.addEventListener("pointercancel", cleanup);
    window.addEventListener("blur", cleanup);
    dragCleanupRef.current = cleanup;
  }
  async function deleteIssue(issue: Issue) {
    if (!confirm(`Delete “${issue.title}”? This cannot be undone.`)) return;
    await run(async () => {
      if (!session) throw new Error("Sign in to continue.");
      await api(`/api/issues/${issue.id}`, "DELETE");
      await loadLive(session.user.id);
      setModal(null);
      tell("Issue deleted");
    });
  }
  async function saveProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const editing = modal?.kind === "project" ? modal.project : undefined;
    const payload = {
      name: String(f.get("name")).trim(),
      description: String(f.get("description") || "").trim(),
      code: String(f.get("code")).trim().toUpperCase(),
      color: formColor,
    };
    await run(async () => {
      let saved: Project;
      if (!session) throw new Error("Sign in to continue.");
      saved = await api<Project>(
        editing ? `/api/projects/${editing.id}` : "/api/projects",
        editing ? "PATCH" : "POST",
        payload,
      );
      await loadLive(session.user.id);
      setProjectId(saved.id);
      setView("board");
      setModal(null);
      tell(editing ? "Project updated" : "Project created");
    });
  }
  async function deleteProject(p: Project) {
    if (
      !confirm(`Delete “${p.name}” and all its issues? This cannot be undone.`)
    )
      return;
    await run(async () => {
      if (!session) throw new Error("Sign in to continue.");
      await api(`/api/projects/${p.id}`, "DELETE");
      await loadLive(session.user.id);
      setModal(null);
      setView("projects");
      tell("Project deleted");
    });
  }
  async function saveProfile(draft: ProfileUpdate): Promise<Profile> {
    const saved = await api<Profile>("/api/profile", "PATCH", {
      name: draft.name,
      color: draft.color,
      ...(draft.avatar_url !== (me?.avatar_url || null)
        ? { avatar_url: draft.avatar_url }
        : {}),
    });
    setData((current) => ({
      ...current,
      profiles: current.profiles.map((p) => (p.id === saved.id ? saved : p)),
    }));
    return saved;
  }
  async function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    await run(async () => {
      if (!session) throw new Error("Sign in to continue.");
      await api(`/api/projects/${projectId}/members`, "POST", {
        username: String(f.get("username")).trim(),
      });
      await loadLive(session.user.id);
      tell("Teammate added to the project");
    });
  }
  const sourceIssues =
    view === "mine"
      ? data.issues.filter((i) => i.assignee_id === userId)
      : projectIssues;
  const filtered = sourceIssues
    .filter(
      (i) =>
        `${i.title} ${i.label} ${data.projects.find((p) => p.id === i.project_id)?.code}-${i.number}`
          .toLowerCase()
          .includes(query.toLowerCase()) &&
        (priority === "all" || i.priority === priority) &&
        (assignee === "all" ||
          i.assignee_id === assignee ||
          (assignee === "unassigned" && !i.assignee_id)) &&
        (statusFilter === "all" || i.status === statusFilter) &&
        (tab !== "active" || i.status !== "done") &&
        (tab !== "mine" || i.assignee_id === userId),
    )
    .sort((a, b) =>
      sort === "priority"
        ? priorities.indexOf(a.priority) - priorities.indexOf(b.priority)
        : sort === "title"
          ? a.title.localeCompare(b.title)
          : b.created_at.localeCompare(a.created_at),
    );
  const completed = projectIssues.filter((i) => i.status === "done").length;
  const percent = projectIssues.length
    ? Math.round((completed / projectIssues.length) * 100)
    : 0;
  const editingIssue = modal?.kind === "issue" ? modal.issue : undefined;
  const editingProject = modal?.kind === "project" ? modal.project : undefined;

  function issueCard(issue: Issue) {
    const p = data.projects.find((p) => p.id === issue.project_id);
    const person = data.profiles.find((p) => p.id === issue.assignee_id);
    return (
      <article
        key={issue.id}
        className={`issue-card ${dragPreview?.id === issue.id ? "dragging" : ""}`}
        draggable={false}
        onPointerDown={(e) => beginDrag(e, issue)}
        onClickCapture={(e) => {
          if (suppressCardClick.current) {
            e.preventDefault();
            e.stopPropagation();
            suppressCardClick.current = false;
          }
        }}
      >
        <button
          className="card-main"
          draggable={false}
          onClick={() => setModal({ kind: "issue", issue })}
        >
          <span className="card-top">
            <span className="issue-code">
              {p?.code}-{String(issue.number).padStart(2, "0")}
            </span>
            <PriorityIcon priority={issue.priority} />
          </span>
          <h3>{issue.title}</h3>
          <span className={`label label-${issue.label.toLowerCase()}`}>
            {issue.label || "General"}
          </span>
        </button>
        <div className="card-footer">
          <span
            className={
              issue.due_date &&
              issue.due_date < new Date().toISOString().slice(0, 10) &&
              issue.status !== "done"
                ? "overdue"
                : ""
            }
          >
            {issue.due_date ? (
              <>
                <Clock3 size={12} />
                {date(issue.due_date)}
              </>
            ) : (
              <>
                <Folder size={12} />
                {p?.code}
              </>
            )}
          </span>
          <Avatar person={person} small />
        </div>
      </article>
    );
  }

  if (!ready && !session)
    return (
      <div className="sign-in-shell">
        <LoaderCircle size={22} className="spin" aria-label="Loading" />
      </div>
    );
  if (!session) return <SignIn onSignedIn={signedIn} initialError={error} />;

  return (
    <div className="app-shell">
      {mobile && (
        <div className="sidebar-scrim" onClick={() => setMobile(false)} />
      )}
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("board");
          }}
        >
          <span className="brand-icon">
            <Zap size={23} fill="currentColor" />
          </span>
          <span>
            issueflow<span className="brand-dot">.</span>
          </span>
        </a>
        <button
          className="workspace-picker"
          onClick={() => navigate("profile")}
        >
          <span className="workspace-initial">
            {initials(me?.name || session.user.username).slice(0, 1)}
          </span>
          <span>
            <strong>My workspace</strong>
          </span>
          <ChevronDown size={14} />
        </button>
        <button
          className="search-shortcut"
          onClick={() => {
            if (view !== "board" && view !== "mine") setView("mine");
            setTimeout(() => searchRef.current?.focus(), 0);
          }}
        >
          <Search size={16} />
          <span>Search</span>
          <kbd>⌘ K</kbd>
        </button>
        <div className="nav-label">WORKSPACE</div>
        <nav className="main-nav">
          <button
            className={`nav-overview ${view === "dashboard" ? "active" : ""}`}
            onClick={() => navigate("dashboard")}
          >
            <LayoutDashboard size={17} />
            Overview
          </button>
          <button
            className={`nav-my-issues ${view === "mine" ? "active" : ""}`}
            onClick={() => navigate("mine")}
          >
            <CheckCheck size={17} />
            My issues
            <span className="nav-count">
              {
                data.issues.filter(
                  (i) => i.assignee_id === userId && i.status !== "done",
                ).length
              }
            </span>
          </button>
          <button
            className={`nav-projects ${view === "projects" ? "active" : ""}`}
            onClick={() => navigate("projects")}
          >
            <FolderKanban size={17} />
            All projects
          </button>
        </nav>
        <div className="nav-label project-nav-title">
          <span>YOUR PROJECTS</span>
          <button
            className="icon-button"
            aria-label="Create project"
            onClick={() => setModal({ kind: "project" })}
          >
            <Plus size={14} />
          </button>
        </div>
        <nav className="project-nav">
          {data.projects.map((p) => (
            <button
              key={p.id}
              className={view === "board" && projectId === p.id ? "active" : ""}
              onClick={() => navigate("board", p.id)}
            >
              <span className={`project-mark ${p.color}`}>
                <FolderKanban size={13} />
              </span>
              <span>{p.name}</span>
              {view === "board" && projectId === p.id && (
                <span className="selected-dot" />
              )}
            </button>
          ))}
          <button
            className="add-project"
            onClick={() => setModal({ kind: "project" })}
          >
            <Plus size={15} />
            Create project
          </button>
        </nav>
        <div className="sidebar-bottom">
          <button
            className="help-link"
            onClick={() => setModal({ kind: "help" })}
          >
            <HelpCircle size={17} />
            Help & shortcuts
            <ArrowUpRight size={14} />
          </button>
          <button className="account" onClick={() => navigate("profile")}>
            <Avatar person={me} />
            <span>
              <strong>{me?.name || "Your account"}</strong>
              {me?.name !== session.user.username && (
                <small>{session.user.username}</small>
              )}
            </span>
            <Settings2 size={16} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobile(true)}
            >
              <Menu size={20} />
            </button>
            <span className="breadcrumb-icon">
              <FolderKanban size={15} />
            </span>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>
              {view === "board"
                ? project?.name || "Projects"
                : view === "dashboard"
                  ? "Overview"
                  : view === "mine"
                    ? "My issues"
                    : view === "profile"
                      ? "Profile"
                      : "All projects"}
            </strong>
          </div>
          <div className="topbar-right">
            <ThemeToggle />
            <span className="topbar-divider" />
            <button
              className="icon-button"
              aria-label="Help and shortcuts"
              onClick={() => setModal({ kind: "help" })}
            >
              <HelpCircle size={18} />
            </button>
            <button
              className="top-avatar"
              aria-label="Your account"
              onClick={() => navigate("profile")}
            >
              <Avatar person={me} small />
            </button>
          </div>
        </header>
        <main>
          {error && !modal && (
            <div className="error-message" role="alert">
              {error}
              {session && (
                <button
                  onClick={() => void run(() => loadLive(session.user.id))}
                >
                  Retry
                </button>
              )}
            </div>
          )}
          {!ready ? (
            <div className="loading-state">
              <LoaderCircle className="spin" />
              Loading…
            </div>
          ) : (
            <>
              <section className="page-heading">
                <div>
                  <h1>
                    {view === "board" ? (
                      <>
                        <span
                          className={`heading-mark ${project?.color || "violet"}`}
                        >
                          <FolderKanban size={23} />
                        </span>
                        {project?.name || "Projects"}
                      </>
                    ) : view === "dashboard" ? (
                      "Overview"
                    ) : view === "projects" ? (
                      "Projects"
                    ) : view === "profile" ? (
                      "Profile"
                    ) : (
                      "My issues"
                    )}
                  </h1>
                </div>
                <div className="heading-actions">
                  {view === "board" && project && (
                    <>
                      <div className="avatar-stack">
                        {projectPeople.slice(0, 3).map((p) => (
                          <Avatar key={p.id} person={p} small />
                        ))}
                      </div>
                      <button
                        className="button button-white invite-button"
                        onClick={() => setModal({ kind: "members" })}
                      >
                        <Users size={15} />
                        Members
                      </button>
                      <button
                        className="icon-button project-settings"
                        disabled={!canManage}
                        aria-label="Project settings"
                        onClick={() => setModal({ kind: "project", project })}
                      >
                        <Ellipsis size={18} />
                      </button>
                    </>
                  )}
                  {view === "projects" && (
                    <button
                      className="button primary"
                      onClick={() => setModal({ kind: "project" })}
                    >
                      <Plus size={16} />
                      New project
                    </button>
                  )}
                </div>
              </section>

              {view === "profile" && me && (
                <ProfilePage
                  person={me}
                  username={session.user.username}
                  summary={{
                    projects: data.projects.length,
                    assigned: data.issues.filter(
                      (i) => i.assignee_id === userId,
                    ).length,
                    completed: data.issues.filter(
                      (i) => i.assignee_id === userId && i.status === "done",
                    ).length,
                  }}
                  onSave={saveProfile}
                  onSignOut={async () => {
                    await api("/api/auth/logout", "POST");
                    signedOut();
                  }}
                />
              )}
              {view === "dashboard" && (
                <>
                  <div className="stats-grid">
                    {[
                      {
                        title: "Projects",
                        value: data.projects.length,
                        icon: FolderKanban,
                        color: "violet",
                      },
                      {
                        title: "In progress",
                        value: data.issues.filter(
                          (i) => i.status === "in_progress",
                        ).length,
                        icon: Zap,
                        color: "peach",
                      },
                      {
                        title: "Completed issues",
                        value: data.issues.filter((i) => i.status === "done")
                          .length,
                        icon: CircleCheck,
                        color: "mint",
                      },
                      {
                        title: "Assigned to you",
                        value: data.issues.filter(
                          (i) =>
                            i.assignee_id === userId && i.status !== "done",
                        ).length,
                        icon: UserRound,
                        color: "rose",
                      },
                    ].map((s) => (
                      <div className="stat-card" key={s.title}>
                        <div>
                          <span>{s.title}</span>
                          <span className={`stat-icon ${s.color}`}>
                            <s.icon size={18} />
                          </span>
                        </div>
                        <strong>{s.value}</strong>
                      </div>
                    ))}
                  </div>
                  <div className="section-heading">
                    <h2>Your projects</h2>
                    <button
                      className="text-button"
                      onClick={() => navigate("projects")}
                    >
                      View all projects
                      <ArrowRight size={14} />
                    </button>
                  </div>
                  {projectCards()}
                  <div className="section-heading">
                    <h2>My issues</h2>
                    <button
                      className="text-button"
                      onClick={() => navigate("mine")}
                    >
                      View my issues
                      <ArrowRight size={14} />
                    </button>
                  </div>
                  {issueTable(
                    data.issues
                      .filter(
                        (i) => i.assignee_id === userId && i.status !== "done",
                      )
                      .slice(0, 5),
                  )}
                </>
              )}
              {view === "projects" && projectCards()}
              {(view === "board" || view === "mine") && (
                <>
                  {view === "board" && project && (
                    <div className="project-overview">
                      <span>
                        <span
                          className="progress-ring"
                          style={{
                            background: `conic-gradient(var(--progress-fill, #676a70) ${percent}%, var(--progress-track, #e3e4e7) 0)`,
                          }}
                        >
                          <span>
                            <Check size={11} />
                          </span>
                        </span>
                        {completed} / {projectIssues.length} completed
                      </span>
                    </div>
                  )}
                  <div className="board-toolbar">
                    <div className="issue-tabs">
                      <button
                        className={tab === "all" ? "selected" : ""}
                        onClick={() => setTab("all")}
                      >
                        All issues<span>{sourceIssues.length}</span>
                      </button>
                      <button
                        className={tab === "active" ? "selected" : ""}
                        onClick={() => setTab("active")}
                      >
                        Active
                      </button>
                      {view === "board" && (
                        <button
                          className={tab === "mine" ? "selected" : ""}
                          onClick={() => setTab("mine")}
                        >
                          Assigned to me
                        </button>
                      )}
                    </div>
                    <div className="toolbar-actions">
                      <div className="view-toggle">
                        <button
                          title="Board view"
                          aria-label="Board view"
                          className={layout === "board" ? "selected" : ""}
                          onClick={() => setLayout("board")}
                        >
                          <Columns3 size={15} />
                        </button>
                        <button
                          title="List view"
                          aria-label="List view"
                          className={layout === "list" ? "selected" : ""}
                          onClick={() => setLayout("list")}
                        >
                          <List size={16} />
                        </button>
                      </div>
                      <button
                        className="button primary"
                        disabled={!project}
                        onClick={() => setModal({ kind: "issue" })}
                      >
                        <Plus size={15} />
                        New issue<kbd>C</kbd>
                      </button>
                    </div>
                  </div>
                  <div className="filter-toolbar">
                    <div className="inline-search">
                      <Search size={15} />
                      <input
                        ref={searchRef}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search issues..."
                        aria-label="Search issues"
                      />
                      {query && (
                        <button
                          className="icon-button"
                          aria-label="Clear search"
                          onClick={() => setQuery("")}
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>
                    <div className="filter-actions">
                      <button
                        className={`filter-button ${activeFilters ? "has-filters" : ""}`}
                        onClick={() => setFilters(!filters)}
                      >
                        <SlidersHorizontal size={14} />
                        Filter{activeFilters > 0 && <b>{activeFilters}</b>}
                        <ChevronDown size={12} />
                      </button>
                      <span className="filter-divider" />
                      <label className="sort-select">
                        <ArrowDownWideNarrow size={14} />
                        <select
                          aria-label="Sort issues"
                          value={sort}
                          onChange={(e) => setSort(e.target.value)}
                        >
                          <option value="created">Newest first</option>
                          <option value="priority">Priority</option>
                          <option value="title">Title A–Z</option>
                        </select>
                      </label>
                    </div>
                  </div>
                  {filters && (
                    <div className="filter-panel">
                      <label>
                        Priority
                        <select
                          value={priority}
                          onChange={(e) => setPriority(e.target.value)}
                        >
                          <option value="all">All priorities</option>
                          {priorities.map((p) => (
                            <option key={p} value={p}>
                              {p[0].toUpperCase() + p.slice(1)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Assignee
                        <select
                          value={assignee}
                          onChange={(e) => setAssignee(e.target.value)}
                        >
                          <option value="all">Everyone</option>
                          <option value="unassigned">Unassigned</option>
                          {data.profiles.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Status
                        <select
                          value={statusFilter}
                          onChange={(e) => setStatusFilter(e.target.value)}
                        >
                          <option value="all">All statuses</option>
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {statusLabels[s]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        className="text-button"
                        onClick={() => {
                          setPriority("all");
                          setAssignee("all");
                          setStatusFilter("all");
                          setQuery("");
                        }}
                      >
                        Reset filters
                      </button>
                    </div>
                  )}
                  {!project && view === "board" ? (
                    <div className="empty-state">
                      <span className="empty-icon violet">
                        <FolderKanban size={29} />
                      </span>
                      <h2>No projects</h2>
                      <button
                        className="button primary"
                        onClick={() => setModal({ kind: "project" })}
                      >
                        <Plus size={15} />
                        Create project
                      </button>
                    </div>
                  ) : layout === "list" ? (
                    issueTable(filtered)
                  ) : (
                    <div className="kanban-board">
                      {STATUSES.map((s) => (
                        <section
                          key={s}
                          className={`kanban-column column-${s}`}
                          data-status={s}
                        >
                          <div className="column-heading">
                            <span className={`status-icon ${s}`}>
                              <StatusIcon status={s} />
                            </span>
                            <h2>{statusLabels[s]}</h2>
                            <span className="column-count">
                              {filtered.filter((i) => i.status === s).length}
                            </span>
                            <button
                              className="icon-button"
                              aria-label={`Add issue to ${statusLabels[s]}`}
                              disabled={!project}
                              onClick={() =>
                                setModal({ kind: "issue", status: s })
                              }
                            >
                              <Plus size={16} />
                            </button>
                          </div>
                          <div className="column-cards">
                            {filtered
                              .filter((i) => i.status === s)
                              .map(issueCard)}
                            {!filtered.some((i) => i.status === s) && (
                              <div className="column-empty">
                                {query || activeFilters
                                  ? "No matching issues"
                                  : "No issues"}
                              </div>
                            )}
                          </div>
                          <button
                            className="add-issue"
                            disabled={!project}
                            onClick={() =>
                              setModal({ kind: "issue", status: s })
                            }
                          >
                            <Plus size={14} />
                            Add issue
                          </button>
                        </section>
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </main>
      </div>
      {dragPreview && (
        <div
          className="drag-preview"
          style={{ left: dragPreview.x + 14, top: dragPreview.y + 12 }}
        >
          <FolderKanban size={13} />
          {dragPreview.title}
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <CircleCheck size={16} />
          {toast}
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {modal && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !busy) setModal(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            className="modal"
          >
            <button
              className="modal-close icon-button"
              disabled={busy}
              aria-label="Close dialog"
              onClick={() => setModal(null)}
            >
              <X size={19} />
            </button>
            {modal.kind === "issue" && (
              <>
                <div className="modal-eyebrow">
                  <FolderKanban size={14} />
                  {
                    data.projects.find(
                      (p) => p.id === (editingIssue?.project_id || projectId),
                    )?.name
                  }
                </div>
                <h2 id="modal-title">
                  {editingIssue ? "Edit issue" : "New issue"}
                </h2>
                <form onSubmit={saveIssue}>
                  <label>
                    Issue title
                    <input
                      name="title"
                      autoFocus
                      required
                      maxLength={200}
                      placeholder="Issue title"
                      defaultValue={editingIssue?.title}
                    />
                  </label>
                  <label>
                    Description
                    <textarea
                      name="description"
                      rows={3}
                      maxLength={10000}
                      placeholder="Description"
                      defaultValue={editingIssue?.description}
                    />
                  </label>
                  <div className="form-grid">
                    <label>
                      Status
                      <select
                        name="status"
                        defaultValue={
                          editingIssue?.status || modal.status || "todo"
                        }
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {statusLabels[s]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Priority
                      <select
                        name="priority"
                        defaultValue={editingIssue?.priority || "medium"}
                      >
                        {priorities.map((p) => (
                          <option key={p} value={p}>
                            {p[0].toUpperCase() + p.slice(1)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Assignee
                      <select
                        name="assignee_id"
                        defaultValue={editingIssue?.assignee_id || ""}
                      >
                        <option value="">Unassigned</option>
                        {data.profiles
                          .filter(
                            (p) =>
                              p.id ===
                                data.projects.find(
                                  (x) =>
                                    x.id ===
                                    (editingIssue?.project_id || projectId),
                                )?.owner_id ||
                              data.members.some(
                                (m) =>
                                  m.project_id ===
                                    (editingIssue?.project_id || projectId) &&
                                  m.user_id === p.id,
                              ),
                          )
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label>
                      Label
                      <select
                        name="label"
                        defaultValue={editingIssue?.label || "Development"}
                      >
                        {[
                          "Design",
                          "Development",
                          "Research",
                          "Planning",
                          "Bug",
                          "General",
                        ].map((l) => (
                          <option key={l}>{l}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label>
                    Due date <span className="optional">optional</span>
                    <input
                      name="due_date"
                      type="date"
                      defaultValue={editingIssue?.due_date || ""}
                    />
                  </label>
                  <ErrorMessage />
                  <div className="modal-actions">
                    {editingIssue && (
                      <button
                        type="button"
                        className="button danger"
                        disabled={busy}
                        onClick={() => void deleteIssue(editingIssue)}
                      >
                        <Trash2 size={14} />
                        Delete
                      </button>
                    )}
                    <div className="action-spacer" />
                    <button
                      type="button"
                      className="button button-white"
                      disabled={busy}
                      onClick={() => setModal(null)}
                    >
                      Cancel
                    </button>
                    <button className="button primary" disabled={busy}>
                      {busy
                        ? "Saving…"
                        : editingIssue
                          ? "Save changes"
                          : "Create issue"}
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </form>
              </>
            )}
            {modal.kind === "project" && (
              <>
                <span className={`modal-symbol ${formColor}`}>
                  <FolderKanban size={25} />
                </span>
                <h2 id="modal-title">
                  {editingProject ? "Project settings" : "New project"}
                </h2>
                <form onSubmit={saveProject}>
                  <label>
                    Project name
                    <input
                      name="name"
                      autoFocus
                      required
                      maxLength={100}
                      placeholder="e.g. Website redesign"
                      defaultValue={editingProject?.name}
                    />
                  </label>
                  <label>
                    Project identifier
                    <input
                      name="code"
                      required
                      minLength={2}
                      maxLength={6}
                      pattern="[a-zA-Z0-9]{2,6}"
                      placeholder="e.g. WEB"
                      defaultValue={editingProject?.code}
                    />
                  </label>
                  <label>
                    Description
                    <textarea
                      name="description"
                      rows={3}
                      maxLength={2000}
                      placeholder="Project description"
                      defaultValue={editingProject?.description}
                    />
                  </label>
                  <label>Project color</label>
                  <div className="color-picker">
                    {colors.map((c) => (
                      <button
                        key={c}
                        type="button"
                        className={`color-swatch ${c} ${formColor === c ? "chosen" : ""}`}
                        aria-label={c}
                        onClick={() => setFormColor(c)}
                      >
                        {formColor === c && <Check size={16} />}
                      </button>
                    ))}
                  </div>
                  <ErrorMessage />
                  <div className="modal-actions">
                    {editingProject && (
                      <button
                        type="button"
                        className="button danger"
                        disabled={busy}
                        onClick={() => void deleteProject(editingProject)}
                      >
                        <Trash2 size={14} />
                        Delete
                      </button>
                    )}
                    <div className="action-spacer" />
                    <button
                      type="button"
                      className="button button-white"
                      disabled={busy}
                      onClick={() => setModal(null)}
                    >
                      Cancel
                    </button>
                    <button className="button primary" disabled={busy}>
                      {busy
                        ? "Saving…"
                        : editingProject
                          ? "Save project"
                          : "Create project"}
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </form>
              </>
            )}
            {modal.kind === "members" && (
              <>
                <span className="modal-symbol mint">
                  <Users size={24} />
                </span>
                <h2 id="modal-title">Members</h2>
                <div className="member-list">
                  {projectPeople.map((p) => (
                    <div key={p.id}>
                      <Avatar person={p} />
                      <span>{p.name}</span>
                      <small>
                        {project?.owner_id === p.id ? "Owner" : "Member"}
                      </small>
                    </div>
                  ))}
                </div>
                {canManage && (
                  <form onSubmit={addMember}>
                    <label>
                      Username
                      <input
                        required
                        name="username"
                        type="text"
                        placeholder="Username"
                        maxLength={100}
                      />
                    </label>

                    <ErrorMessage />
                    <button
                      className="button primary full-width"
                      disabled={busy}
                    >
                      {busy ? "Adding…" : "Add to project"}
                      <Plus size={15} />
                    </button>
                  </form>
                )}
              </>
            )}
            {modal.kind === "help" && (
              <>
                <span className="modal-symbol peach">
                  <HelpCircle size={24} />
                </span>
                <h2 id="modal-title">Keyboard shortcuts</h2>
                <div className="help-row">
                  <span>Search issues</span>
                  <kbd>⌘ / Ctrl + K</kbd>
                </div>
                <div className="help-row">
                  <span>Create an issue</span>
                  <kbd>C</kbd>
                </div>
                <div className="help-row">
                  <span>Close a dialog</span>
                  <kbd>Esc</kbd>
                </div>
                <div className="help-tip">
                  <Columns3 size={19} />
                  <p>
                    Drag an issue to change its status, or select it to edit.
                  </p>
                </div>
                <button
                  className="button primary full-width"
                  onClick={() => setModal(null)}
                >
                  Got it
                  <Check size={15} />
                </button>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );

  function ErrorMessage() {
    return error ? (
      <div className="error-message" role="alert">
        {error}
      </div>
    ) : null;
  }
  function projectCards() {
    return (
      <div className="projects-grid">
        {data.projects.map((p) => {
          const issues = data.issues.filter((i) => i.project_id === p.id);
          const done = issues.filter((i) => i.status === "done").length;
          const progress = issues.length
            ? Math.round((done / issues.length) * 100)
            : 0;
          return (
            <button
              className="project-card"
              key={p.id}
              onClick={() => navigate("board", p.id)}
            >
              <div className="project-card-top">
                <span className={`heading-mark ${p.color}`}>
                  <FolderKanban size={22} />
                </span>
                <ArrowUpRight size={17} />
              </div>
              <h2>{p.name}</h2>
              <div className="project-card-progress">
                <span>
                  {done} / {issues.length} issues complete
                </span>
                <strong>{progress}%</strong>
              </div>
              <div className="progress-track">
                <i style={{ width: `${progress}%` }} />
              </div>
              <div className="project-card-bottom">
                <span className={`project-code ${p.color}`}>{p.code}</span>
                <span>
                  Open project
                  <ArrowRight size={13} />
                </span>
              </div>
            </button>
          );
        })}
        <button
          className="new-project-card"
          onClick={() => setModal({ kind: "project" })}
        >
          <span>
            <Plus size={24} />
          </span>
          <strong>New project</strong>
        </button>
      </div>
    );
  }
  function issueTable(issues: Issue[]) {
    return (
      <div className="issue-table">
        {!issues.length ? (
          <div className="empty-state small-empty">
            <CircleCheck size={28} />
            <h2>No issues</h2>
            <p>
              {query || activeFilters ? "No issues match these filters." : ""}
            </p>
          </div>
        ) : (
          <>
            <div className="table-heading">
              <span>Issue</span>
              <span>Status</span>
              <span>Priority</span>
              <span>Assignee</span>
            </div>
            {issues.map((i) => (
              <button
                className="issue-row"
                key={i.id}
                onClick={() => setModal({ kind: "issue", issue: i })}
              >
                <span>
                  <small>
                    {data.projects.find((p) => p.id === i.project_id)?.code}-
                    {String(i.number).padStart(2, "0")}
                  </small>
                  <strong>{i.title}</strong>
                </span>
                <span className={`table-status ${i.status}`}>
                  <StatusIcon status={i.status} />
                  {statusLabels[i.status]}
                </span>
                <span className="table-priority">
                  <PriorityIcon priority={i.priority} />
                  {i.priority}
                </span>
                <span>
                  <Avatar
                    person={data.profiles.find((p) => p.id === i.assignee_id)}
                    small
                  />
                  <small>
                    {data.profiles
                      .find((p) => p.id === i.assignee_id)
                      ?.name.split(" ")[0] || "Unassigned"}
                  </small>
                </span>
              </button>
            ))}
          </>
        )}
      </div>
    );
  }
}
