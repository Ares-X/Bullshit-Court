import type { CourtRole, CourtRuling, CourtSession, Evidence, ShoutType } from '../types';
import { sanitizeCourtSession } from './caseShare';
import { getCourtAgentRequest } from './courtRuntime';
export type CourtBridgeCommand =
  | { id: string; type: 'argument'; role: CourtRole; text: string; speakerName?: string; shout?: ShoutType; responseTo?: string[]; evidenceIds?: string[] }
  | { id: string; type: 'evidence'; role: 'plaintiff' | 'defendant'; evidence: Evidence }
  | { id: string; type: 'ruling'; role: 'judge'; ruling: CourtRuling; responseTo?: string[]; evidenceIds?: string[] };
export interface CourtBridgeHandle {
  connection: { sessionId: string; token: string; baseUrl: string };
  publish(session: CourtSession): Promise<void>;
  disconnect(): Promise<void>;
}
/** Credentials live only in this handle. Never place it inside a CourtSession. */
export async function connectCourtBridge(session: CourtSession, onCommand: (command: CourtBridgeCommand) => void | Promise<void>, onError?: (error: Error) => void): Promise<CourtBridgeHandle> {
  const baseUrl = `${window.location.origin}/api/court`;
  const request = async (path: string, options: RequestInit = {}, token?: string) => {
    const response = await fetch(`${baseUrl}${path}`, { ...options, headers: { 'content-type': 'application/json', ...(token ? { 'x-court-token': token } : {}) }, signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(5000)]) : AbortSignal.timeout(5000) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || `Court bridge HTTP ${response.status}`); return data;
  };
  const publicState = (value: CourtSession) => { const snapshot = sanitizeCourtSession(value); return { snapshot, agentRequest: snapshot.status === 'active' ? getCourtAgentRequest(snapshot) : null }; };
  const registered = await request('/sessions', { method: 'POST', body: JSON.stringify(publicState(session)) });
  const connection = { sessionId: String(registered.sessionId), token: String(registered.token), baseUrl };
  const path = `/sessions/${connection.sessionId}`;
  let stopped = false; let timer: ReturnType<typeof setTimeout> | undefined; let polling = new AbortController();
  const handled = new Map<string, { status: 'applied' | 'rejected'; error?: string }>();
  const poll = async () => {
    if (stopped) return;
    polling = new AbortController();
    try {
      const data = await request(`${path}/commands`, { signal: polling.signal }, connection.token);
      for (const command of data.commands as CourtBridgeCommand[]) {
        if (stopped) break;
        let result = handled.get(command.id);
        if (!result) {
          try { await onCommand(command); result = { status: 'applied' }; }
          catch (cause) { result = { status: 'rejected', error: cause instanceof Error ? cause.message : String(cause) }; }
          handled.set(command.id, result);
          if (handled.size > 300) handled.delete(handled.keys().next().value!);
        }
        await request(`${path}/commands/${command.id}`, { method: 'PUT', body: JSON.stringify(result) }, connection.token);
      }
    } catch (cause) { if (!stopped) onError?.(cause instanceof Error ? cause : new Error(String(cause))); }
    finally { if (!stopped) timer = setTimeout(() => { void poll(); }, 1000); }
  };
  void poll();
  return {
    connection,
    async publish(next) { if (!stopped) await request(`${path}/state`, { method: 'PUT', body: JSON.stringify(publicState(next)) }, connection.token); },
    async disconnect() { if (stopped) return; stopped = true; if (timer) clearTimeout(timer); polling.abort(); await request(path, { method: 'DELETE' }, connection.token); },
  };
}
