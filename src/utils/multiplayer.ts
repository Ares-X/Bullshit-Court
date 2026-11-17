import Peer, { type DataConnection } from 'peerjs';
import { sanitizeCourtSession } from './caseShare';

export type RoomRole = 'host' | 'jury';
export type RoomStatus = 'idle' | 'connecting' | 'ready' | 'connected' | 'disconnected' | 'error';
export interface RoomState { roomId: string; isHost: boolean; status: RoomStatus; role: RoomRole; peers: { id: string; role: RoomRole }[]; error?: string }
export interface MultiplayerMessage {
  version: 1; id: string; roomId: string; type: 'SYNC_SESSION' | 'CAST_VOTE' | 'ROOM_STATE' | 'VOTE_STATE';
  payload: unknown; senderRole: RoomRole; senderPeerId?: string; timestamp: number;
}
export interface RoomVoteState { round: number; votes: { peerId: string; winner: 'plaintiff' | 'defendant' }[]; counts: { plaintiff: number; defendant: number } }
type WireMessage = MultiplayerMessage | { version: 1; type: 'WELCOME'; role: RoomRole; roomId: string; peers: RoomState['peers'] };
const uid = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const validRoom = (room: string) => /^\d{6}$/.test(room);
export class MultiplayerService {
  private peer: Peer | null = null;
  private connections = new Map<string, DataConnection>();
  private roles = new Map<string, RoomRole>();
  private seen = new Set<string>();
  private votes = new Map<string, 'plaintiff' | 'defendant'>();
  private voteSessionId = '';
  private voteOpen = false;
  private voteRound = 0;
  private remoteVoteCounts = { plaintiff: 0, defendant: 0 };
  private messages = new Set<(message: MultiplayerMessage) => void>();
  private statuses = new Set<(state: RoomState) => void>();
  private state: RoomState = { roomId: '', isHost: false, status: 'idle', role: 'jury', peers: [] };
  private latestSnapshot: MultiplayerMessage | null = null;
  private legacyCleanup: (() => void) | null = null;
  constructor(private createPeer: (id: string) => Peer = id => new Peer(id, { debug: 1 })) {}
  public getState(): RoomState { return { ...this.state, peers: this.state.peers.map(p => ({ ...p })) }; }
  public subscribe(listener: (message: MultiplayerMessage) => void) { this.messages.add(listener); return () => { this.messages.delete(listener); }; }
  public subscribeStatus(listener: (state: RoomState) => void) { this.statuses.add(listener); listener(this.getState()); return () => { this.statuses.delete(listener); }; }
  private update(patch: Partial<RoomState>) { this.state = { ...this.state, ...patch }; for (const fn of this.statuses) fn(this.getState()); }
  public init(roomId: string, isHost: boolean, onMessage?: (message: MultiplayerMessage) => void, onStatus?: (status: RoomStatus, error?: string) => void) {
    this.disconnect(); this.legacyCleanup?.(); this.legacyCleanup = null;
    if (onMessage) this.messages.add(onMessage);
    const statusListener = onStatus ? (state: RoomState) => onStatus(state.status, state.error) : undefined;
    if (statusListener) this.statuses.add(statusListener);
    this.legacyCleanup = () => { if (onMessage) this.messages.delete(onMessage); if (statusListener) this.statuses.delete(statusListener); };
    this.update({ roomId, isHost, status: 'connecting', role: isHost ? 'host' : 'jury', peers: [], error: undefined });
    if (!validRoom(roomId)) { this.update({ status: 'error', error: '房间号必须为 6 位数字' }); return; }
    const hostId = `icourt-room-${roomId}`;
    try {
      const peer = this.createPeer(isHost ? hostId : `icourt-guest-${uid()}`); this.peer = peer;
      peer.on('connection', conn => { if (this.peer !== peer) return; if (!isHost) { conn.close(); return; } this.attach(conn); });
      peer.on('open', () => { if (this.peer !== peer) return; if (isHost) this.update({ status: 'ready' }); else this.attach(peer.connect(hostId, { reliable: true })); });
      peer.on('error', error => { if (this.peer === peer) this.update({ status: 'error', error: error.type === 'peer-unavailable' ? '房间不存在或房主已离线' : error.message }); });
      peer.on('disconnected', () => { if (this.peer === peer) this.update({ status: 'disconnected', error: '信令服务断开，请重新连接房间' }); });
      peer.on('close', () => { if (this.peer === peer) this.update({ status: 'disconnected' }); });
    } catch (error) { this.update({ status: 'error', error: error instanceof Error ? error.message : 'WebRTC 初始化失败' }); }
  }
  private attach(conn: DataConnection) {
    const peer = this.peer;
    if (this.connections.has(conn.peer) || this.connections.size >= 32) { conn.close(); return; }
    this.connections.set(conn.peer, conn);
    conn.on('open', () => {
      if (peer !== this.peer) return;
      if (this.state.isHost) {
        const role: RoomRole = 'jury';
        this.roles.set(conn.peer, role); this.refreshPeers();
        conn.send({ version: 1, type: 'WELCOME', role, roomId: this.state.roomId, peers: this.state.peers } satisfies WireMessage);
        if (this.latestSnapshot) conn.send(this.latestSnapshot);
        this.broadcastVoteState(conn);
      }
    });
    conn.on('data', data => { if (peer === this.peer) this.receive(conn, data); });
    const closed = () => { if (peer !== this.peer || this.connections.get(conn.peer) !== conn) return; this.connections.delete(conn.peer); this.roles.delete(conn.peer); if (this.state.isHost) this.refreshPeers(); else this.update({ status: 'disconnected', peers: [] }); };
    conn.on('close', closed); conn.on('error', closed);
  }
  private refreshPeers() {
    this.update({ peers: [...this.roles].map(([id, role]) => ({ id, role })), status: this.roles.size ? 'connected' : 'ready' });
    this.send('ROOM_STATE', this.state.peers);
  }
  private receive(conn: DataConnection, raw: unknown) {
    if (!raw || typeof raw !== 'object') return;
    let serialized: string; try { serialized = JSON.stringify(raw); } catch { return; }
    if (serialized.length > 250_000) return;
    const msg = raw as WireMessage;
    if (msg.version !== 1 || msg.roomId !== this.state.roomId) return;
    if (msg.type === 'WELCOME') {
      if (this.state.isHost || msg.role !== 'jury' || !Array.isArray(msg.peers)) return;
      this.update({ role: msg.role, peers: msg.peers, status: 'connected' }); return;
    }
    if (!['SYNC_SESSION', 'CAST_VOTE', 'ROOM_STATE', 'VOTE_STATE'].includes(msg.type) || typeof msg.id !== 'string' || msg.id.length > 100 || !Number.isFinite(msg.timestamp) || this.seen.has(msg.id)) return;
    if (this.state.isHost) {
      if (msg.type !== 'CAST_VOTE' || !this.roles.has(conn.peer) || !this.voteOpen || this.votes.has(conn.peer)) return;
      // The host assigns the seat; a guest cannot claim the judge or another seat.
      msg.senderRole = this.roles.get(conn.peer)!; msg.senderPeerId = conn.peer;
      const ballot = msg.payload as { winner?: unknown; round?: unknown; sessionId?: unknown };
      const winner = ballot?.winner;
      if ((winner !== 'plaintiff' && winner !== 'defendant') || ballot.round !== this.voteRound || ballot.sessionId !== this.voteSessionId) return;
      this.votes.set(conn.peer, winner);
    } else if (msg.type === 'CAST_VOTE' || msg.senderRole !== 'host') return;
    if (msg.type === 'SYNC_SESSION') { try { msg.payload = sanitizeCourtSession(msg.payload); this.trackSession(msg.payload); } catch { return; } }
    if (msg.type === 'VOTE_STATE') {
      const value = msg.payload as { sessionId?: unknown; round?: unknown; counts?: { plaintiff?: unknown; defendant?: unknown }; votedCount?: unknown };
      if (!value || value.sessionId !== this.voteSessionId || !Number.isSafeInteger(value.round) || (value.round as number) < this.voteRound || !value.counts || !Number.isSafeInteger(value.counts.plaintiff) || !Number.isSafeInteger(value.counts.defendant) || (value.counts.plaintiff as number) < 0 || (value.counts.defendant as number) < 0 || (value.counts.plaintiff as number) + (value.counts.defendant as number) !== value.votedCount) return;
      this.voteRound = value.round as number;
      this.remoteVoteCounts = { plaintiff: value.counts.plaintiff as number, defendant: value.counts.defendant as number };
    }
    this.seen.add(msg.id); if (this.seen.size > 2000) this.seen.delete(this.seen.values().next().value!);
    if (msg.type === 'ROOM_STATE' && Array.isArray(msg.payload)) this.update({ peers: msg.payload as RoomState['peers'] });
    for (const fn of this.messages) fn(msg);
    if (this.state.isHost && msg.type === 'CAST_VOTE') this.broadcastVoteState();
  }
  private trackSession(value: unknown) {
    const session = sanitizeCourtSession(value);
    if (session.id !== this.voteSessionId) { this.votes.clear(); this.voteRound = 0; this.remoteVoteCounts = { plaintiff: 0, defendant: 0 }; this.voteSessionId = session.id; }
    this.voteOpen = session.status === 'awaiting-ruling' && !session.juryVote;
  }
  public getVotes() { return [...this.votes].map(([peerId, winner]) => ({ peerId, winner })); }
  public getVoteState(): RoomVoteState {
    const votes = this.getVotes();
    const counts = this.state.isHost ? { plaintiff: votes.filter(vote => vote.winner === 'plaintiff').length, defendant: votes.filter(vote => vote.winner === 'defendant').length } : { ...this.remoteVoteCounts };
    return { round: this.voteRound, votes, counts };
  }
  private broadcastVoteState(connection?: DataConnection) {
    const { round, counts } = this.getVoteState();
    const payload = { sessionId: this.voteSessionId, round, counts, votedCount: counts.plaintiff + counts.defendant };
    const msg: MultiplayerMessage = { version: 1, id: uid(), roomId: this.state.roomId, type: 'VOTE_STATE', payload, senderRole: 'host', timestamp: Date.now() };
    if (connection) { if (connection.open) connection.send(msg); return; }
    this.send('VOTE_STATE', payload);
    for (const fn of this.messages) fn(msg);
  }
  public restartVote(): boolean {
    if (!this.peer || !this.state.isHost || !this.voteOpen) return false;
    this.votes.clear(); this.voteRound++; this.broadcastVoteState(); return true;
  }
  public send(type: MultiplayerMessage['type'], payload: unknown): boolean {
    if (!this.peer || (!this.state.isHost && type !== 'CAST_VOTE') || (this.state.isHost && type === 'CAST_VOTE')) return false;
    if (type === 'CAST_VOTE') {
      const winner = (payload as { winner?: unknown })?.winner;
      if (!this.voteOpen || (winner !== 'plaintiff' && winner !== 'defendant')) return false;
      payload = { winner, round: this.voteRound, sessionId: this.voteSessionId };
    }
    if (type === 'SYNC_SESSION') { try { payload = sanitizeCourtSession(payload); this.trackSession(payload); } catch { return false; } }
    const msg: MultiplayerMessage = { version: 1, id: uid(), roomId: this.state.roomId, type, payload, senderRole: this.state.role, timestamp: Date.now() };
    try { if (JSON.stringify(msg).length > 250_000) return false; } catch { return false; }
    if (type === 'SYNC_SESSION') this.latestSnapshot = msg;
    let sent = false; for (const conn of this.connections.values()) if (conn.open) { conn.send(msg); sent = true; }
    if (type === 'SYNC_SESSION') this.broadcastVoteState();
    return sent;
  }
  public disconnect() {
    const peer = this.peer; this.peer = null;
    for (const conn of this.connections.values()) conn.close();
    this.connections.clear(); this.roles.clear(); this.seen.clear(); this.votes.clear(); this.voteOpen = false; this.voteSessionId = ''; this.voteRound = 0; this.remoteVoteCounts = { plaintiff: 0, defendant: 0 }; this.latestSnapshot = null;
    peer?.destroy(); this.update({ status: 'disconnected', peers: [] });
    this.legacyCleanup?.(); this.legacyCleanup = null;
  }
}
export const multiplayerService = new MultiplayerService();
