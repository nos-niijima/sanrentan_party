import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EngineService } from '../engine/engine.service';
import { SANRENTAN_SPEC } from '../engine/sanrentan-spec';
import type { Room, RoomPlayer } from '../../generated/prisma/client';
import type { GameSpecDocument, GameState, RoomActionDto, RoomView } from '@sanrentan-party/shared';

/**
 * ルーム (Room) = プレイセッション。サーバ権威の GameState を保持し、
 * プレイヤーのアクションをエンジンで適用して新 state を返す。
 *
 * state の解釈・遷移・秘匿化はすべて EngineService が責務を持つ。
 * RoomService は永続化と席（seat）管理、視点の調停のみを行う。
 *
 * サンレンタン Party では単一ゲーム前提のため Game/GameSpec モデルは持たない。
 * spec は engine モジュール内の SANRENTAN_SPEC 定数を使用する。
 */
@Injectable()
export class RoomService {
  private readonly logger = new Logger(RoomService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: EngineService,
  ) {}

  /**
   * サンレンタン の GameSpec ドキュメント (固定値) を返す。
   * 将来別パターンを足すなら ここで pattern を切り替える。
   */
  private loadSpec(): GameSpecDocument {
    return SANRENTAN_SPEC as unknown as GameSpecDocument;
  }

  /**
   * 新しいルームを作る。初期状態を生成して open 状態で保存し、
   * 作成者を seat 0（＝ホスト）として着席させる。
   */
  async create(
    hostUserId: string,
    opts?: { name?: string; isPublic?: boolean },
  ): Promise<Room> {
    const spec = this.loadSpec();
    const state = this.engine.initialState(spec, 0);
    const room = await this.prisma.room.create({
      data: {
        state: state as unknown as object,
        status: 'open',
        ...(opts?.name !== undefined ? { name: opts.name } : {}),
        ...(opts?.isPublic !== undefined ? { isPublic: opts.isPublic } : {}),
      },
    });
    // 作成者をホスト（seat 0）として着席させる。
    await this.prisma.roomPlayer.create({
      data: { roomId: room.id, userId: hostUserId, seat: 0, privateState: {} as object },
    });
    return room;
  }

  /**
   * 席に着く。希望席があればそれを、無ければ次の空き席（max(seat)+1, 0 始まり）に着く。
   * 既に埋まっている席を希望した場合は 409。
   *
   * 同 room 内で **別ユーザー** が同じ name で既に着席している場合は 409 (name_taken) を返す。
   * 同 userId での再 join は座席復帰のため、name 重複検査の対象外（自分自身は許可）。
   */
  async join(
    roomId: string,
    userId: string | undefined,
    seat?: number,
    color?: string,
    name?: string,
  ): Promise<RoomPlayer> {
    const room = await this.prisma.room.findUnique({ where: { id: roomId } });
    if (!room) {
      throw new NotFoundException('Room not found');
    }

    // 再参加は同じ席を返す（スコアは seat キーで累積するため席を変えない）。
    // 既参加でも color が指定されていれば更新する。
    if (userId) {
      const existing = await this.prisma.roomPlayer.findFirst({ where: { roomId, userId } });
      if (existing) {
        if (color !== undefined && existing.color !== color) {
          return this.prisma.roomPlayer.update({
            where: { id: existing.id },
            data: { color },
          });
        }
        return existing;
      }
    }

    // 別ユーザーが同じ表示名で先に着席している場合は 409 で拒否する。
    // （userId が undefined のケースは現状 RequireUserGuard で 401 になるため到達しないが、
    //   防御的に「同 name の他人席」を一律 reject する。）
    //
    // cookie identity 初期値の衝突回避: name が空白だけ / "ホスト" の場合は重複検査をスキップする。
    // （未命名 user が同時に複数 join したときに、初期表示名の偶然一致で全員が 409 になるのを避ける）
    const trimmedName = name?.trim() ?? '';
    const isReservedDefaultName = trimmedName === '' || trimmedName === 'ホスト';
    if (name && name.length > 0 && !isReservedDefaultName) {
      const dupe = await this.prisma.roomPlayer.findFirst({
        where: {
          roomId,
          user: { name },
          ...(userId ? { userId: { not: userId } } : {}),
        },
      });
      if (dupe) {
        throw new ConflictException('name_taken');
      }
    }

    const players = await this.prisma.roomPlayer.findMany({
      where: { roomId },
      orderBy: { seat: 'desc' },
    });

    const createAt = (s: number) =>
      this.prisma.roomPlayer.create({
        data: {
          roomId,
          userId,
          seat: s,
          privateState: {} as object,
          ...(color !== undefined ? { color } : {}),
        },
      });

    // 明示席: 埋まっていれば 409。@@unique([roomId, seat]) の競合も 409 に変換する。
    if (seat !== undefined) {
      if (players.some((p) => p.seat === seat)) {
        throw new ConflictException('Seat already taken');
      }
      try {
        return await createAt(seat);
      } catch (err) {
        if ((err as { code?: string }).code === 'P2002') {
          throw new ConflictException('Seat already taken');
        }
        throw err;
      }
    }

    // 自動席: 次の空き席（最大席 + 1、誰もいなければ 0）。
    // 同時 join の競合（P2002）は席を再計算してリトライする。
    let next = players.length > 0 ? players[0].seat + 1 : 0;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        return await createAt(next);
      } catch (err) {
        if ((err as { code?: string }).code !== 'P2002') throw err;
        const top = await this.prisma.roomPlayer.findFirst({
          where: { roomId },
          orderBy: { seat: 'desc' },
        });
        next = (top?.seat ?? -1) + 1;
      }
    }
    throw new ConflictException('Could not allocate a seat, please retry');
  }

  /**
   * 自分視点に絞り込んだルームビューを返す（ポーリング対象）。
   * 観戦者（プレイヤーでない）も閲覧できるため userId は undefined を許容する。
   * room.state は自分の seat（観戦者は null）に応じてエンジンが秘匿化する。
   */
  async getView(roomId: string, userId: string | undefined): Promise<RoomView> {
    const room = await this.prisma.room.findUnique({ where: { id: roomId } });
    if (!room) {
      throw new NotFoundException('Room not found');
    }

    const players = await this.prisma.roomPlayer.findMany({
      where: { roomId },
      orderBy: { seat: 'asc' },
      include: { user: { select: { name: true } } },
    });

    const you = userId ? players.find((p) => p.userId === userId) : undefined;

    const spec = this.loadSpec();
    const redacted = this.engine.redactFor(
      spec,
      room.state as unknown as GameState,
      you?.seat ?? null,
    );

    // ホスト席（host-reveal の hostSeat、無ければ 0）。presets はホストにだけ渡す。
    const hostSeat = (room.state as { hostSeat?: number } | null)?.hostSeat ?? 0;
    const specDoc = spec as { ui?: string; pattern?: string; presets?: { prompt: string; choices: string[] }[] };

    return {
      room: { ...(room as unknown as RoomView['room']), state: redacted },
      players: players.map((p) => ({
        id: p.id,
        seat: p.seat,
        userId: p.userId ?? undefined,
        name: p.user?.name ?? undefined,
        color: p.color ?? undefined,
      })),
      you: you as unknown as RoomView['you'],
      ui: specDoc.ui ?? specDoc.pattern,
      presets: you?.seat === hostSeat ? specDoc.presets : undefined,
    };
  }

  /**
   * アクションを適用する。要求者は着席済みプレイヤーでなければならない（さもなくば 403）。
   * spec + 現在 state をエンジンに渡して新 state を得て、status を playing にして保存する。
   */
  async act(roomId: string, userId: string | undefined, dto: RoomActionDto): Promise<RoomView> {
    // 楽観的並行制御: read→apply→write を updatedAt トークンで原子化する。
    // 同時 write は updateMany の where(updatedAt) で 1 つだけ成功し、敗者は再試行する。
    // これにより同時 reveal の二重採点・同時 predict のロストアップデートを防ぐ。
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const room = await this.prisma.room.findUnique({ where: { id: roomId } });
      if (!room) {
        throw new NotFoundException('Room not found');
      }

      const me = userId
        ? await this.prisma.roomPlayer.findFirst({ where: { roomId, userId } })
        : null;
      if (!me) {
        throw new ForbiddenException('Not a player in this room');
      }

      const spec = this.loadSpec();
      // engine が投げる 400/403/409 はここで伝播する（再試行しない）。
      const { state: nextState } = this.engine.applyAction(
        spec,
        room.state as unknown as GameState,
        dto,
        me.seat,
      );

      const res = await this.prisma.room.updateMany({
        where: { id: roomId, updatedAt: room.updatedAt },
        data: { state: nextState as unknown as object, status: 'playing' },
      });

      if (res.count === 1) {
        return this.getView(roomId, userId);
      }
      // count===0: 別リクエストが先に更新した。最新 state を読み直して再適用する。
      // （先に reveal 済みなら、再適用時に engine が 409 を投げる＝二重採点しない）
    }
    throw new ConflictException('ルームが同時に更新されました。もう一度お試しください');
  }
}
