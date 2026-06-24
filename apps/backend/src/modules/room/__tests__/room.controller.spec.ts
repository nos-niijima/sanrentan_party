import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RoomController } from '../room.controller';
import { RoomService } from '../room.service';
import type { User } from '../../../generated/prisma/client';

/**
 * POST /api/rooms の手動 validation を固定する。
 *
 * 仕様:
 * - name 未指定 (undefined): 許容（DB には保存しない）
 * - name が string でない (number/array/object/null): 400
 * - name が trim 後空文字: 許容するが undefined に正規化（service には name を渡さない相当）
 * - name が 41 文字以上: 400
 * - name に <script> 等の HTML 文字が含まれていても length が範囲内なら通す
 *   （エスケープは表示側責務。controller では length/型のみ検査）
 * - body が null / 配列 / プリミティブ: 400
 *
 * サンレンタン Party では gameId は不要 (単一ゲーム前提)。body に gameId が来ても無視する。
 * 目的: 壊れた Room を DB に量産させない（共有画面の表示崩れ防止）。
 */
describe('RoomController.create validation', () => {
  let controller: RoomController;
  let roomService: { create: jest.Mock };

  const fakeUser = { id: 'u1' } as User;

  beforeEach(async () => {
    roomService = { create: jest.fn().mockResolvedValue({ id: 'r1' }) };
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [RoomController],
      providers: [{ provide: RoomService, useValue: roomService }],
    }).compile();

    controller = moduleRef.get(RoomController);
  });

  // ---- 正常系 ----

  it('valid body { name: "normal" } を通し service.create を呼ぶ', async () => {
    await controller.create(fakeUser, { name: '楽しい部屋' });
    expect(roomService.create).toHaveBeenCalledWith('u1', {
      name: '楽しい部屋',
      isPublic: undefined,
    });
  });

  it('name 未指定 (undefined) も通す', async () => {
    await controller.create(fakeUser, {});
    expect(roomService.create).toHaveBeenCalledWith('u1', {
      name: undefined,
      isPublic: undefined,
    });
  });

  it('name が trim 後空文字 (空白だけ) は undefined に正規化して通す', async () => {
    await controller.create(fakeUser, { name: '   ' });
    expect(roomService.create).toHaveBeenCalledWith('u1', {
      name: undefined,
      isPublic: undefined,
    });
  });

  it('name がちょうど 40 文字なら通す', async () => {
    const name40 = 'a'.repeat(40);
    await controller.create(fakeUser, { name: name40 });
    expect(roomService.create).toHaveBeenCalledWith('u1', {
      name: name40,
      isPublic: undefined,
    });
  });

  it('isPublic が boolean なら通す', async () => {
    await controller.create(fakeUser, { name: 'ok', isPublic: false });
    expect(roomService.create).toHaveBeenCalledWith('u1', {
      name: 'ok',
      isPublic: false,
    });
  });

  it('legacy body の gameId は無視して通す', async () => {
    // frontend 側で gameId が残っていても backend は単に無視する (silent ignore)。
    await controller.create(fakeUser, { gameId: 'legacy', name: 'x' } as unknown as Parameters<RoomController['create']>[1]);
    expect(roomService.create).toHaveBeenCalledWith('u1', {
      name: 'x',
      isPublic: undefined,
    });
  });

  // ---- 異常系: name ----

  it('name が空文字 ("") は undefined に正規化して通す（trim 後空のため）', async () => {
    // 空文字は「無名」と等価に倒す。400 ではなく許容するが service には name を渡さない。
    await controller.create(fakeUser, { name: '' });
    expect(roomService.create).toHaveBeenCalledWith('u1', {
      name: undefined,
      isPublic: undefined,
    });
  });

  it('name が 41 文字は 400', async () => {
    const name41 = 'a'.repeat(41);
    await expect(
      controller.create(fakeUser, { name: name41 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(roomService.create).not.toHaveBeenCalled();
  });

  it('name が 1000 文字は 400', async () => {
    const huge = 'x'.repeat(1000);
    await expect(
      controller.create(fakeUser, { name: huge }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(roomService.create).not.toHaveBeenCalled();
  });

  it('name が number は 400', async () => {
    await expect(
      controller.create(fakeUser, { name: 42 } as unknown as Parameters<RoomController['create']>[1]),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(roomService.create).not.toHaveBeenCalled();
  });

  it('name が null は 400 (typeof null === "object" だが string ではない)', async () => {
    await expect(
      controller.create(fakeUser, { name: null } as unknown as Parameters<RoomController['create']>[1]),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(roomService.create).not.toHaveBeenCalled();
  });

  it('name が object は 400', async () => {
    await expect(
      controller.create(fakeUser, { name: { evil: true } } as unknown as Parameters<RoomController['create']>[1]),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(roomService.create).not.toHaveBeenCalled();
  });

  it('name が array は 400', async () => {
    await expect(
      controller.create(fakeUser, { name: ['a'] } as unknown as Parameters<RoomController['create']>[1]),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(roomService.create).not.toHaveBeenCalled();
  });

  it('name に <script> を含むが 40 文字以内なら通す（エスケープは表示側責務）', async () => {
    const name = '<script>x</script>'; // 18 文字
    await controller.create(fakeUser, { name });
    expect(roomService.create).toHaveBeenCalledWith('u1', {
      name,
      isPublic: undefined,
    });
  });

  // ---- 異常系: body 全体 ----

  it('body が null は 400', async () => {
    await expect(
      controller.create(fakeUser, null as unknown as Parameters<RoomController['create']>[1]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('body が array は 400', async () => {
    await expect(
      controller.create(fakeUser, [] as unknown as Parameters<RoomController['create']>[1]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('body が string は 400', async () => {
    await expect(
      controller.create(fakeUser, 'oops' as unknown as Parameters<RoomController['create']>[1]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('isPublic が string は 400', async () => {
    await expect(
      controller.create(fakeUser, { isPublic: 'true' } as unknown as Parameters<RoomController['create']>[1]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
