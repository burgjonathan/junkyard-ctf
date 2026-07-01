import type { Team, MatchStatus } from './constants.ts';

export type ClientMessage =
  | { type: 'createRoom' }
  | { type: 'joinRoom'; roomCode: string }
  | {
      type: 'input';
      seq: number;
      moveX: number;      // -1..1
      moveY: number;      // -1..1
      aimAngle: number;   // radians
      attack: boolean;
    };

export type ServerMessage =
  | {
      type: 'joined';
      playerId: string;
      team: Team;
      roomCode: string;
      mapSeed: number;
    }
  | { type: 'error'; message: string }
  | { type: 'state'; snap: StateSnapshot };

export interface PlayerSnapshot {
  id: string;
  team: Team;
  x: number;
  y: number;
  hp: number;
  alive: boolean;
  aimAngle: number;
  attackAnimT: number;         // 0..1 while swinging
  carrying: Team | null;       // which team's flag they carry
  score: number;
  respawnIn?: number;
}

export interface FlagSnapshot {
  team: Team;
  x: number;
  y: number;
  atHome: boolean;
  carriedBy: string | null;
  droppedIn?: number;
}

export interface HitEvent {
  x: number;
  y: number;
  team: Team;
}

export interface CaptureEvent {
  team: Team;
  x: number;
  y: number;
}

export interface StateSnapshot {
  serverTime: number;
  players: PlayerSnapshot[];
  flags: FlagSnapshot[];
  scores: { red: number; blue: number };
  status: MatchStatus;
  winner: Team | null;
  hits: HitEvent[];
  captures: CaptureEvent[];
  matchTime: number;
}
