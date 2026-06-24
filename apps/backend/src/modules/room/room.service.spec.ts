import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { RoomService } from './room.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EngineService } from '../engine/engine.service';

/**
 * RoomService.join の name 重複検査 (409 name_taken) を固定する。
 *
 * 仕様: 同 room 内で **別ユーザー** が同じ name で既に着席している場合 join を 409 で拒否する。
 * 同 userId の再 join は座席復帰として許可する (name 検査の対象外)。
 */
describe('RoomService.join name duplication', () => {
  let service: RoomService;
  let prisma: {
    room: { findUnique: jest.Mock };
    roomPlayer: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };
  let engine: { initialState: jest.Mock; redactFor: jest.Mock; applyAction: jest.Mock };

  beforeEach(async () => {
    prisma = {
      room: { findUnique: jest.fn() },
      roomPlayer: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    engine = {
      initialState: jest.fn(),
      redactFor: jest.fn(),
      applyAction: jest.fn(),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        RoomService,
        { provide: PrismaService, useValue: prisma },
        { provide: EngineService, useValue: engine },
      ],
    }).compile();

    service = moduleRef.get(RoomService);
  });

  it('join rejects duplicate name from different user with 409', async () => {
    prisma.room.findUnique.mockResolvedValueOnce({ id: 'r1' });
    // 自分は未参加 (rejoinSameSeat ルートに乗らない)
    prisma.roomPlayer.findFirst
      .mockResolvedValueOnce(null) // 再参加チェック (roomId+userId)
      // 別ユーザーが同 name で着席済み (user.name 検査)
      .mockResolvedValueOnce({ id: 'rp_other', roomId: 'r1', userId: 'u_other', seat: 1 });

    await expect(
      service.join('r1', 'u_me', undefined, undefined, 'アリス'),
    ).rejects.toBeInstanceOf(ConflictException);

    // name_taken の検査クエリが「同 room 内で user.name 一致かつ userId != currentUserId」を見ていること
    expect(prisma.roomPlayer.findFirst).toHaveBeenNthCalledWith(2, {
      where: {
        roomId: 'r1',
        user: { name: 'アリス' },
        userId: { not: 'u_me' },
      },
    });
    // 席作成には到達しない
    expect(prisma.roomPlayer.create).not.toHaveBeenCalled();
  });

  it('join allows rejoin (same userId) even if name appears taken (self)', async () => {
    prisma.room.findUnique.mockResolvedValueOnce({ id: 'r1' });
    // 自分が既に着席済み → 既存 RoomPlayer をそのまま返す (rejoinSameSeat)
    const mine = { id: 'rp_me', roomId: 'r1', userId: 'u_me', seat: 0, color: null };
    prisma.roomPlayer.findFirst.mockResolvedValueOnce(mine);

    const result = await service.join('r1', 'u_me', undefined, undefined, 'アリス');

    expect(result).toBe(mine);
    // 既参加経路では name 検査クエリは発行されない (rejoin は常に許可)
    expect(prisma.roomPlayer.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.roomPlayer.create).not.toHaveBeenCalled();
  });

  it('join skips name check when name is reserved default "ホスト"', async () => {
    prisma.room.findUnique.mockResolvedValueOnce({ id: 'r1' });
    prisma.roomPlayer.findFirst
      .mockResolvedValueOnce(null) // 再参加チェック: 未参加
      .mockResolvedValueOnce(null); // findMany 前の何か (今は呼ばれないはずなので呼ばれた場合は null)
    prisma.roomPlayer.findMany.mockResolvedValueOnce([]);
    const created = { id: 'rp_new', roomId: 'r1', userId: 'u_me', seat: 0 };
    prisma.roomPlayer.create.mockResolvedValueOnce(created);

    const result = await service.join('r1', 'u_me', undefined, undefined, 'ホスト');

    expect(result).toBe(created);
    // name 検査クエリは発行されない (rejoin チェックの 1 回のみ)
    expect(prisma.roomPlayer.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.roomPlayer.create).toHaveBeenCalledTimes(1);
  });

  it('join skips name check when name is whitespace-only', async () => {
    prisma.room.findUnique.mockResolvedValueOnce({ id: 'r1' });
    prisma.roomPlayer.findFirst.mockResolvedValueOnce(null); // 再参加チェック: 未参加
    prisma.roomPlayer.findMany.mockResolvedValueOnce([]);
    const created = { id: 'rp_new', roomId: 'r1', userId: 'u_me', seat: 0 };
    prisma.roomPlayer.create.mockResolvedValueOnce(created);

    const result = await service.join('r1', 'u_me', undefined, undefined, '   ');

    expect(result).toBe(created);
    // name 検査クエリは発行されない (rejoin チェックの 1 回のみ)
    expect(prisma.roomPlayer.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.roomPlayer.create).toHaveBeenCalledTimes(1);
  });

  it('join proceeds when name is unique in room', async () => {
    prisma.room.findUnique.mockResolvedValueOnce({ id: 'r1' });
    prisma.roomPlayer.findFirst
      .mockResolvedValueOnce(null) // 再参加チェック: 未参加
      .mockResolvedValueOnce(null); // name 検査: 重複なし
    prisma.roomPlayer.findMany.mockResolvedValueOnce([]); // 空席計算用
    const created = { id: 'rp_new', roomId: 'r1', userId: 'u_me', seat: 0 };
    prisma.roomPlayer.create.mockResolvedValueOnce(created);

    const result = await service.join('r1', 'u_me', undefined, undefined, 'ボブ');

    expect(result).toBe(created);
    expect(prisma.roomPlayer.create).toHaveBeenCalledTimes(1);
  });
});
