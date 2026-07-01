import type { Team, MatchStatus } from './constants.ts';

export type ClientMessage =
  | { type: 'createRoom' }
  | { type: 'joinRoom'; roomCode: string }
  | { type: 'command'; seq: number; unitIds: string[]; target: { x: number; y: number } };

export type ServerMessage =
  | {
      type: 'joined';
      playerId: string;
      team: Team;
      roomCode: string;
      mapSeed: number;
      unitIds: string[];        // which units this commander owns
    }
  | { type: 'error'; message: string }
  | { type: 'state'; snap: StateSnapshot };

export interface UnitSnapshot {
  id: string;
  team: Team;
  x: number;
  y: number;
  hp: number;
  alive: boolean;
  facing: number;               // radians, for direction-of-motion / attack
  attackAnimT: number;          // 0..1 during swing
  carrying: Team | null;
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
  units: UnitSnapshot[];
  flags: FlagSnapshot[];
  scores: { red: number; blue: number };
  status: MatchStatus;
  winner: Team | null;
  hits: HitEvent[];
  captures: CaptureEvent[];
  matchTime: number;
}
