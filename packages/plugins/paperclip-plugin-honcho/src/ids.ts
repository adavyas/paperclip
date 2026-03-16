import type { Issue } from "@paperclipai/plugin-sdk";

export function workspaceIdForCompany(companyId: string, workspacePrefix: string): string {
  return `${workspacePrefix}:${companyId}`;
}

export function peerIdForAgent(agentId: string): string {
  return `agent:${agentId}`;
}

export function peerIdForUser(userId: string): string {
  return `user:${userId}`;
}

export function sessionIdForIssue(issueId: string): string {
  return `issue:${issueId}`;
}

export function issueEntityUrl(issue: Pick<Issue, "id" | "identifier">): string {
  return `/issues/${issue.identifier ?? issue.id}`;
}
