// ============================================================================
// 共有型定義 — サンレンタン Party (sanrentan_party)
// backend (NestJS) と frontend (Next.js) の双方から import される単一の真実。
// Prisma モデルと整合させること（packages 側は永続化に依存しないプレーン型）。
// ============================================================================

// ---- 身元ヘッダ（BFF がサーバ側で付与する。クライアントから直接信用しない）----
// frontend の Route Handler が cookie identity (pb_uid) からこのキーで backend へ転送する。
export const HEADERS = {
  userEmail: 'x-user-email',
  userId: 'x-user-id', // = pb_uid (anonymous identity) もしくは将来の Google アカウント ID
  userName: 'x-user-name',
} as const;

// ---- ユーザー ----
export interface User {
  id: string;
  email: string;
  name: string;
  googleId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserDto {
  email: string;
  name: string;
  googleId: string;
}

export interface UpdateUserDto {
  name?: string;
}

/** x-user-* ヘッダから解決される身元。BFF 経由で付与される。 */
export interface UserIdentity {
  email: string;
  googleId?: string;
  name?: string;
}

// ---- ルーム（プレイセッション）----
export type RoomStatus = 'open' | 'playing' | 'closed';

/** サーバ権威の実行中状態。ポーリング対象。形は host-reveal パターンに依存する。 */
export interface GameState {
  /** 現在の手番（seat 番号）。 */
  turn?: number;
  /** 公開状態（全員が見てよい部分）。 */
  shared?: Record<string, unknown>;
  /** 進行ログ。 */
  log?: string[];
  [key: string]: unknown;
}

export interface Room {
  id: string;
  /** ルーム名（任意。ホストが設定する。 */
  name?: string;
  /** リンクを知っている人が参加できるか。 */
  isPublic: boolean;
  state: GameState;
  status: RoomStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface RoomPlayer {
  id: string;
  roomId: string;
  userId?: string;
  seat: number;
  /** 駒色 hex code or token（6-12文字程度）。 */
  color?: string;
  /** その席のプレイヤーにのみ見える非公開情報。 */
  privateState: Record<string, unknown>;
  createdAt: Date;
}

export interface CreateRoomDto {
  /** ルーム名（任意）。 */
  name?: string;
  /** リンクを知っている人が参加できるか（既定 true）。 */
  isPublic?: boolean;
}

export interface JoinRoomDto {
  /** 任意の希望席。未指定なら空き席に着く。 */
  seat?: number;
  /** 駒色（任意）。hex code か token 文字列。 */
  color?: string;
}

/** プレイヤーがサーバへ送るアクション。REST で適用され、新 state を返す。 */
export interface RoomActionDto {
  /** GameSpecAction.id に対応。 */
  action: string;
  /** アクション固有のペイロード。 */
  payload?: Record<string, unknown>;
}

/** ポーリング応答：自分視点に絞り込まれたルームビュー。 */
export interface RoomView {
  room: Room;
  players: Array<{ id: string; seat: number; userId?: string; name?: string; color?: string }>;
  /** 自分の席の非公開情報（あれば）。 */
  you?: RoomPlayer;
  /** このゲームの UI キー。サンレンタンでは 'sanrentan' 固定。 */
  ui?: string;
  /** ホストのみ: お題プリセット。 */
  presets?: { prompt: string; choices: string[] }[];
}

// ---- ユーザースコープ プリセット ----
export interface UserPreset {
  id: string;
  title: string;
  question: string;
  choices: string[];
  createdAt: string;
}

export interface CreatePresetInput {
  title: string;
  question: string;
  choices: string[];
}

// ---- 共通レスポンス ----
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasNext: boolean;
  hasPrev: boolean;
}

// ---- エラー ----
export interface AppError {
  code: string;
  message: string;
  details?: unknown;
}

export enum ErrorCodes {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
}

// ---- ユーティリティ型 ----
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type WithTimestamps<T> = T & {
  createdAt: Date;
  updatedAt: Date;
};

// ============================================================================
// Host-Reveal パターン（サンレンタン）
// ホスト出題 → プレイヤー回答 → ホスト公開＆採点。
// サンレンタン = このパターンの ruleset='ranked-triple' として実装される。
// ============================================================================

/** 回答の形。ranking=順位付き / set=順不同 / single=単一。 */
export interface HostRevealAnswerShape {
  kind: 'ranking' | 'set' | 'single';
  /** 選ぶ要素数（サンレンタンは 3）。 */
  size: number;
}

/** Host-Reveal ゲームの宣言的定義（engine モジュールに固定値が埋め込まれている）。 */
export interface HostRevealSpec {
  pattern: 'host-reveal';
  /** UI キー。frontend のレジストリのコンポーネントを参照する。 */
  ui?: string;
  /** 採点戦略 ID。engine の ruleset レジストリのキー。 */
  ruleset: string;
  /** ruleset 固有の任意パラメータ。 */
  config?: Record<string, unknown>;
  /** 1 ラウンドの構成。 */
  round: {
    promptLabel?: string; // 'お題'
    choiceLabel?: string; // '選択肢'
    choicesMin: number; // 3
    answer: HostRevealAnswerShape;
  };
  /** 役（点数→名称）の表示テーブル（任意）。 */
  hands?: { points: number; label: string }[];
  /** ホストがすぐ出題できるプリセット。 */
  presets?: { prompt: string; choices: string[] }[];
}

/**
 * 後方互換のため GameSpecDocument 型を維持する (engine が import している)。
 * サンレンタンでは実体は HostRevealSpec と同等。
 */
export type GameSpecDocument = HostRevealSpec & Record<string, unknown>;

export type HostRevealRoundStatus = 'open' | 'revealed';

export interface HostRevealPrediction {
  seat: number;
  answer: string[];
  /** 公開後の採点結果。 */
  hand?: string;
  points?: number;
  submittedAt: string;
}

/**
 * 設問単位の得点倍率（valid: 1/2/3/5/10）。
 * スコア計算時に base points × multiplier で適用される。未指定/不正は 1 として扱う。
 */
export type HostRevealMultiplier = 1 | 2 | 3 | 5 | 10;
export const HOST_REVEAL_MULTIPLIERS: readonly HostRevealMultiplier[] = [1, 2, 3, 5, 10] as const;

/**
 * リビール演出（B 案）のフェーズ。
 *
 * 状態機械:
 *   reveal アクション完了 → idle（announce 初期化）
 *   ホスト「結果発表をはじめる」(announceStart) → buildup（share 画面が timer 駆動で順次演出）
 *   share 演出完了（タイマー）→ reveal → scores（client side のみ。サーバは buildup のまま）
 *   ホスト「次のお題を出す」または share 側「終了」(announceFinish) → done
 *   ホスト「もう一度見る」(announceReplay) → done → buildup（再演出）
 *
 * 注: サーバは idle / buildup / done の三状態のみを遷移させる。
 * reveal / scores は share 画面側の演出進行用ローカル状態で、サーバ state には現れない。
 * （型の union は client での将来拡張余地として残す）
 */
export type HostRevealAnnouncePhase = 'idle' | 'buildup' | 'reveal' | 'scores' | 'done';

/**
 * リビール演出の進行状況。reveal アクション完了時に初期化される（idle）。
 * announce.phase !== 'done' の間は、プレイヤー (非ホスト) 視点では正解／採点を伏せる
 * （「大画面で発表中」待機状態。ホストおよびホスト席 = share 画面には常に全公開）。
 */
export interface HostRevealAnnounce {
  phase: HostRevealAnnouncePhase;
  /** 順次明らかにする予想の rank index（client 側演出用。サーバは現状参照しない）。 */
  reveal: number;
  /** 表示済みカード数（client 側演出用。サーバは現状参照しない）。 */
  cardsShown: number;
  /** buildup 開始時刻（ISO 8601）。 */
  startedAt?: string;
  /** done 遷移時刻（ISO 8601）。 */
  finishedAt?: string;
}

export interface HostRevealRound {
  roundId: string;
  prompt: string;
  choices: string[];
  status: HostRevealRoundStatus;
  /** status='revealed' のときのみ非 null（公開前は漏らさない）。 */
  answer?: string[];
  /** 席番号(文字列) → 予想。redact 後は自分の分のみ（公開前）。 */
  predictions: Record<string, HostRevealPrediction>;
  /** 回答済みの席番号（公開前でも「誰が回答したか」だけは見せる）。 */
  submittedSeats?: number[];
  /**
   * 得点倍率（1/2/3/5/10）。出題と同時にプレイヤーへ告知（公開、秘密ではない）。
   * 既定 1。reveal 時に base points と乗算してスコアへ加算する。
   * 毎ラウンド明示的に指定する（前ラウンドからの引継ぎなし）。
   */
  multiplier?: HostRevealMultiplier;
  /**
   * リビール演出（B 案）の進行状況。reveal アクション後に初期化される。
   * status='open' の間は undefined（公開前は演出も存在しない）。
   */
  announce?: HostRevealAnnounce;
  createdAt: string;
  revealedAt?: string;
}

/** Room.state に入る Host-Reveal の実行中状態（サーバ権威）。 */
export interface HostRevealState {
  pattern: 'host-reveal';
  /** 更新ごとに +1。クライアントの差分検知（ETag/version）に使える。 */
  version: number;
  /** 出題・公開できる席（既定 0 = ルーム作成者）。 */
  hostSeat: number;
  /** 席番号(文字列) → 累積スコア。 */
  scores: Record<string, number>;
  round: HostRevealRound | null;
  /** 公開済みラウンドの履歴。 */
  history: { roundId: string; prompt: string; answer: string[] }[];
}

/** 採点戦略の結果。 */
export interface ScoreResult {
  hand: string;
  points: number;
}

// Host-Reveal のアクション payload（RoomActionDto.payload に入れる）。
export interface PoseRoundPayload {
  prompt: string;
  choices: string[];
  /** 設問の得点倍率（1/2/3/5/10）。未指定/不正は 1。 */
  multiplier?: HostRevealMultiplier;
}
export interface PredictPayload {
  answer: string[];
}
export interface RevealPayload {
  answer: string[];
}
