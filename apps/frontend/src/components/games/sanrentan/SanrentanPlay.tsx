'use client';

// サンレンタン エントリポイント — ロール/状態を判定して適切な画面へルーティングする薄いルーター。
// 見た目・ロジックは shared.tsx + screens/ に分離済み。
// registry 契約(GamePlayProps の default export)は不変。

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { HostRevealState } from '@sanrentan-party/shared';
import type { GamePlayProps } from '@/lib/games/types';
import type { Row } from './shared';
import type { HostPresetItem } from './screens/HostScreen';
import JoinScreen from './screens/JoinScreen';
import HostScreen from './screens/HostScreen';
import PredictScreen, { WaitingScreen, AnnounceWaitingScreen } from './screens/PredictScreen';
import ResultScreen from './screens/ResultScreen';
import { useMyPresets } from '@/hooks/useMyPresets';

export default function SanrentanPlay({ view, act, join }: GamePlayProps) {
  const router = useRouter();
  const state = view.room.state as unknown as HostRevealState;
  const me = view.you;
  const hostSeat = state.hostSeat ?? 0;
  const isHost = !!me && me.seat === hostSeat;

  // ユーザースコープ プリセット (POST/GET/DELETE /api/presets)。
  // ホスト以外でも hook を呼ぶ（条件付き hook は禁止）。非ホスト時は UI に渡さない。
  const { presets: myPresets, createPreset, deletePreset } = useMyPresets();
  const round = state.round ?? null;
  const scores = state.scores ?? {};

  const hostName = view.players.find((p) => p.seat === hostSeat)?.name ?? 'ホスト';

  // ホストは進行専任（予想しない）ので競技者の累積順位には含めない。
  // RoomPlayer.color が無い既存プレイヤー（DB に NULL）は color: undefined で
  // Row 型は color を optional に保持し、描画側で fallbackPlayerColor(seat) にフォールバック。
  const rows: Row[] = view.players
    .filter((p) => p.seat !== hostSeat)
    .map((p) => ({ seat: p.seat, name: p.name ?? `席${p.seat}`, pts: scores[String(p.seat)] ?? 0, isMe: me?.seat === p.seat, isHost: false, color: p.color }))
    .sort((a, b) => b.pts - a.pts);

  // 2026-06-24: /rooms/<id> はホスト/着席プレイヤー専用ビューに分離。
  // 未着席 (!me) ユーザーは /join/<id> 招待 landing へ流す（cookie identity 化に伴い
  // signIn 経由の callbackUrl auto-join は廃止。/join landing で名前入力→直接 POST する）。
  const redirectedToJoin = useRef(false);
  useEffect(() => {
    if (typeof window === 'undefined' || me || redirectedToJoin.current) return;
    redirectedToJoin.current = true;
    router.replace(`/join/${view.room.id}`);
  }, [me, router, view.room.id]);

  // ---- 未着席：入室 (redirect 待ちの過渡的表示) ----
  // 通常は useEffect で /join/<id> に redirect されるため、ここの JoinScreen は
  // ほぼ見えない（first paint の 1 フレームだけ）。視覚を変えないよう従来通り
  // JoinScreen を render する。
  if (!me) {
    const playerCount = view.players.filter((p) => p.seat !== hostSeat).length;
    const historyLen = state.history?.length ?? 0;
    return (
      <JoinScreen
        hostName={hostName}
        playerCount={playerCount}
        join={join}
        roomCode={view.room.id}
        round={round}
        historyLen={historyLen}
        roomName={view.room.name}
        initialColor={view.you?.color}
        players={view.players}
        hostSeat={hostSeat}
      />
    );
  }

  // ---- ホスト：管理 ----
  if (isHost) {
    const historyLen = state.history?.length ?? 0;
    // 現在進行中ラウンドの番号 (1始まり)。
    // engine は reveal 時に round を history に push するため、revealed 状態では
    // historyLen が既に「公開済みラウンド数」になっており、それが現ラウンド番号と一致する。
    // open / null 状態では historyLen+1 が「現/次に出題する番号」となる。
    const hostRoundNo = round && round.status === 'revealed' ? historyLen : historyLen + 1;

    // builtin プリセット (backend SANRENTAN_SPEC.presets 固定値) + mine (ユーザースコープ) をマージ。
    // builtin は source='builtin'、mine は source='mine' で区別し、HostScreen が削除ボタンを出すかを判定する。
    const builtinItems: HostPresetItem[] = (view.presets ?? []).map((p) => ({
      prompt: p.prompt,
      choices: p.choices,
      source: 'builtin' as const,
    }));
    const mineItems: HostPresetItem[] = myPresets.map((p) => ({
      prompt: p.question,
      choices: p.choices,
      source: 'mine' as const,
      id: p.id,
      title: p.title,
    }));
    const mergedPresets: HostPresetItem[] = [...builtinItems, ...mineItems];

    /** プリセット保存ハンドラ: HostScreen → useMyPresets.createPreset に委譲。 */
    async function handleSavePreset(title: string, prompt: string, choices: string[]): Promise<void> {
      await createPreset({ title, question: prompt, choices });
    }

    /** プリセット削除ハンドラ: HostScreen → useMyPresets.deletePreset に委譲。 */
    async function handleDeletePreset(id: string): Promise<void> {
      await deletePreset(id);
    }

    return (
      <HostScreen
        roomId={view.room.id}
        round={round}
        presets={mergedPresets}
        rows={rows}
        roundNo={hostRoundNo}
        roomName={view.room.name}
        canSavePreset={isHost}
        onSavePreset={handleSavePreset}
        onDeletePreset={handleDeletePreset}
        act={act}
      />
    );
  }

  // ---- プレイヤー：出題待ち ----
  // 着席直後 (ホスト未出題) でも卓名を確認できるよう roomName を渡す (data-testid=sr-room-name-topbar)。
  if (!round) {
    return <WaitingScreen rows={rows} roomName={view.room.name} />;
  }

  // ---- プレイヤー：予想受付中 ----
  if (round.status === 'open') {
    const roundNo = (state.history?.length ?? 0) + 1;
    return <PredictScreen round={round} hostName={hostName} mySeat={me.seat} roundNo={roundNo} roomId={view.room.id} roomName={view.room.name} act={act} />;
  }

  // ---- プレイヤー：結果発表 ----
  // engine は reveal 時に round を history に push するため、revealed 状態では
  // history.length が「公開済みラウンド数」=「現ラウンド番号」になる。
  const revealRoundNo = state.history?.length ?? 1;

  // リビール演出 (B 案): announce.phase !== 'done' の間、プレイヤー手元には
  // 「大画面で発表中」待機 frame を出す。これは旧 WaitingScreen を流用する。
  // announce が undefined (旧データ / 後方互換) は done 扱い (= ResultScreen 即解禁)。
  const announcePhase = round.announce?.phase;
  if (announcePhase !== undefined && announcePhase !== 'done') {
    return <AnnounceWaitingScreen rows={rows} roomName={view.room.name} />;
  }
  return <ResultScreen round={round} mySeat={me.seat} rows={rows} roundNo={revealRoundNo} roomId={view.room.id} roomName={view.room.name} />;
}
