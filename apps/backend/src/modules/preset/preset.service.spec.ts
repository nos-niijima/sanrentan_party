import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PresetService } from './preset.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * PresetService の CRUD 動作を固定する。
 *
 * 仕様:
 * - listMine: 呼び出し元ユーザーのプリセットのみを、作成日降順で返す。
 * - create: trim 済み入力と userId を使って prisma.preset.create を呼ぶ。
 * - delete: deleteMany が count=1 なら正常終了。count=0 なら NotFoundException (404)。
 */
describe('PresetService', () => {
  let service: PresetService;
  let prisma: {
    preset: {
      findMany: jest.Mock;
      create: jest.Mock;
      deleteMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      preset: {
        findMany: jest.fn(),
        create: jest.fn(),
        deleteMany: jest.fn(),
      },
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        PresetService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(PresetService);
  });

  // ---- listMine ----

  describe('listMine', () => {
    it('where: { userId } と orderBy: { createdAt: "desc" } でクエリを発行する', async () => {
      const fakePresets = [
        { id: 'p2', userId: 'u1', title: '新しい', question: 'Q2', choices: ['A', 'B', 'C'], createdAt: new Date() },
        { id: 'p1', userId: 'u1', title: '古い', question: 'Q1', choices: ['X', 'Y', 'Z'], createdAt: new Date(0) },
      ];
      prisma.preset.findMany.mockResolvedValueOnce(fakePresets);

      const result = await service.listMine('u1');

      expect(prisma.preset.findMany).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toBe(fakePresets);
    });

    it('他のユーザーのプリセットは返さない（where に userId が入っていることで保証）', async () => {
      prisma.preset.findMany.mockResolvedValueOnce([]);

      await service.listMine('u_other');

      expect(prisma.preset.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'u_other' } }),
      );
    });
  });

  // ---- create ----

  describe('create', () => {
    it('userId と trim 済み入力で prisma.preset.create を呼ぶ', async () => {
      const created = {
        id: 'p_new',
        userId: 'u1',
        title: '馬選手権',
        question: '1 着はどれ？',
        choices: ['A', 'B', 'C'],
        createdAt: new Date(),
      };
      prisma.preset.create.mockResolvedValueOnce(created);

      const input = { title: '馬選手権', question: '1 着はどれ？', choices: ['A', 'B', 'C'] };
      const result = await service.create('u1', input);

      expect(prisma.preset.create).toHaveBeenCalledWith({
        data: {
          userId: 'u1',
          title: '馬選手権',
          question: '1 着はどれ？',
          choices: ['A', 'B', 'C'],
        },
      });
      expect(result).toBe(created);
    });
  });

  // ---- delete ----

  describe('delete', () => {
    it('deleteMany が count=1 を返したら正常終了する', async () => {
      prisma.preset.deleteMany.mockResolvedValueOnce({ count: 1 });

      await expect(service.delete('u1', 'p1')).resolves.toBeUndefined();

      expect(prisma.preset.deleteMany).toHaveBeenCalledWith({
        where: { id: 'p1', userId: 'u1' },
      });
    });

    it('deleteMany が count=0 を返したら NotFoundException を投げる', async () => {
      prisma.preset.deleteMany.mockResolvedValueOnce({ count: 0 });

      await expect(service.delete('u1', 'p_nonexistent')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('別ユーザーのプリセットを削除しようとすると NotFoundException を投げる', async () => {
      // count=0 は「所有していない」or「存在しない」を区別しない（存在有無を漏らさない）
      prisma.preset.deleteMany.mockResolvedValueOnce({ count: 0 });

      await expect(service.delete('u_attacker', 'p_victim')).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.preset.deleteMany).toHaveBeenCalledWith({
        where: { id: 'p_victim', userId: 'u_attacker' },
      });
    });
  });
});
