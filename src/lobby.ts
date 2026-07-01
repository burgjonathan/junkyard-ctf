import type { Net } from './net.ts';

export interface LobbyHooks {
  onCreate: () => void;
  onJoin: (roomCode: string) => void;
}

export function attachLobby(_net: Net, hooks: LobbyHooks): void {
  const btnCreate = document.getElementById('btn-create') as HTMLButtonElement;
  const btnJoin = document.getElementById('btn-join') as HTMLButtonElement;
  const inputCode = document.getElementById('input-code') as HTMLInputElement;
  const lobbyMsg = document.getElementById('lobby-msg') as HTMLElement;

  btnCreate.addEventListener('click', () => {
    setMsg('');
    hooks.onCreate();
  });

  btnJoin.addEventListener('click', () => {
    const code = inputCode.value.trim().toUpperCase();
    if (code.length !== 4) {
      setMsg('Room code must be 4 characters');
      return;
    }
    setMsg('');
    hooks.onJoin(code);
  });

  inputCode.addEventListener('input', () => {
    inputCode.value = inputCode.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    setMsg('');
  });

  inputCode.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') btnJoin.click();
  });

  function setMsg(m: string) {
    lobbyMsg.textContent = m;
  }
}

export function showLobbyError(message: string): void {
  const lobbyMsg = document.getElementById('lobby-msg') as HTMLElement;
  if (lobbyMsg) lobbyMsg.textContent = message;
}

export function showScreen(name: 'lobby' | 'waiting' | 'game' | 'disconnected' | 'ended'): void {
  const lobby = document.getElementById('lobby')!;
  const waiting = document.getElementById('waiting')!;
  const disconnected = document.getElementById('disconnected')!;
  const ended = document.getElementById('ended')!;
  lobby.classList.toggle('hidden', name !== 'lobby');
  waiting.classList.toggle('hidden', name !== 'waiting');
  disconnected.classList.toggle('hidden', name !== 'disconnected');
  ended.classList.toggle('hidden', name !== 'ended');
}

export function setRoomCodeDisplay(code: string): void {
  const el = document.getElementById('room-code');
  if (el) el.textContent = code;
}

export function setEndedText(title: string, detail: string): void {
  const t = document.getElementById('ended-title');
  const d = document.getElementById('ended-detail');
  if (t) t.textContent = title;
  if (d) d.textContent = detail;
}
