export const STATUSES = ["todo", "in_progress", "blocked", "done"] as const;
export type Status = (typeof STATUSES)[number];
export type Priority = "low" | "medium" | "high" | "urgent";
export type Profile = {
  id: string;
  name: string;
  email?: string;
  color: string;
  avatar_url?: string | null;
};
export type Project = {
  id: string;
  name: string;
  description: string;
  code: string;
  color: string;
  owner_id: string;
  created_at: string;
};
export type Issue = {
  id: string;
  project_id: string;
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  assignee_id: string | null;
  created_by: string;
  label: string;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  number: number;
};
export type Member = { project_id: string; user_id: string };
export type WorkspaceData = {
  projects: Project[];
  issues: Issue[];
  profiles: Profile[];
  members: Member[];
};
export const statusLabels: Record<Status, string> = {
  todo: "To do",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
};
export const priorities: Priority[] = ["urgent", "high", "medium", "low"];
