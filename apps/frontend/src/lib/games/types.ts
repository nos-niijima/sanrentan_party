import type { RoomView, RoomActionDto } from '@sanrentan-party/shared';

/**
 * ゲーム固有 UI コンポーネントが受け取る props。
 * ポーリングは play ページ（useRoom）が所有し、view と操作をここへ渡す。
 * レイアウトは JSON ではなくこのコンポーネント（コード）が持つ。
 */
export interface GamePlayProps {
  view: RoomView;
  act: (dto: RoomActionDto) => Promise<void>;
  join: (opts?: { seat?: number; color?: string; name?: string }) => Promise<void>;
  error?: Error;
}
