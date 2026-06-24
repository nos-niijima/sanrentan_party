import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PresetController } from './preset.controller';
import { PresetService } from './preset.service';
import type { User } from '../../generated/prisma/client';

/**
 * PresetController のボディバリデーション + 各エンドポイントの基本動作を固定する。
 *
 * バリデーションルール（POST /api/presets）:
 * - title: string, trim 後 1 文字以上, 80 文字以内
 * - question: string, trim 後 1 文字以上, 200 文字以内
 * - choices: array, 3〜6 要素, 各 string かつ trim 後 1 文字以上, 60 文字以内
 * 違反は 400 (BadRequestException)。
 */
describe('PresetController', () => {
  let controller: PresetController;
  let presetService: {
    listMine: jest.Mock;
    create: jest.Mock;
    delete: jest.Mock;
  };

  const fakeUser = { id: 'u1', name: 'テストユーザー' } as User;

  const validBody = {
    title: '馬選手権',
    question: '1 着はどれ？',
    choices: ['ディープ', 'オルフェ', 'コントレイル'],
  };

  beforeEach(async () => {
    presetService = {
      listMine: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'p1', ...validBody, userId: 'u1', createdAt: new Date() }),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [PresetController],
      providers: [{ provide: PresetService, useValue: presetService }],
    }).compile();

    controller = moduleRef.get(PresetController);
  });

  // ---- GET (listMine) ----

  describe('GET /api/presets', () => {
    it('service.listMine を userId で呼ぶ', async () => {
      const result = await controller.listMine(fakeUser);
      expect(presetService.listMine).toHaveBeenCalledWith('u1');
      expect(result).toEqual([]);
    });
  });

  // ---- POST (create) — 正常系 ----

  describe('POST /api/presets — 正常系', () => {
    it('valid body を通して service.create を呼ぶ', async () => {
      await controller.create(fakeUser, validBody);
      expect(presetService.create).toHaveBeenCalledWith('u1', {
        title: '馬選手権',
        question: '1 着はどれ？',
        choices: ['ディープ', 'オルフェ', 'コントレイル'],
      });
    });

    it('title/question/choices の前後空白は trim して保存する', async () => {
      await controller.create(fakeUser, {
        title: '  タイトル  ',
        question: '  設問  ',
        choices: [' A ', ' B ', ' C '],
      });
      expect(presetService.create).toHaveBeenCalledWith('u1', {
        title: 'タイトル',
        question: '設問',
        choices: ['A', 'B', 'C'],
      });
    });

    it('choices が 6 要素（最大）でも通す', async () => {
      await controller.create(fakeUser, {
        title: 'T',
        question: 'Q',
        choices: ['A', 'B', 'C', 'D', 'E', 'F'],
      });
      expect(presetService.create).toHaveBeenCalled();
    });
  });

  // ---- POST (create) — バリデーション異常系: title ----

  describe('POST /api/presets — title バリデーション', () => {
    it('title が未指定 (undefined) は 400', async () => {
      const body = { question: 'Q', choices: ['A', 'B', 'C'] };
      await expect(
        controller.create(fakeUser, body as unknown as Parameters<PresetController['create']>[1]),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(presetService.create).not.toHaveBeenCalled();
    });

    it('title が空文字は 400', async () => {
      await expect(
        controller.create(fakeUser, { ...validBody, title: '' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(presetService.create).not.toHaveBeenCalled();
    });

    it('title が空白のみは 400', async () => {
      await expect(
        controller.create(fakeUser, { ...validBody, title: '   ' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(presetService.create).not.toHaveBeenCalled();
    });

    it('title がちょうど 80 文字は通す', async () => {
      await controller.create(fakeUser, { ...validBody, title: 'a'.repeat(80) });
      expect(presetService.create).toHaveBeenCalled();
    });

    it('title が 81 文字は 400', async () => {
      await expect(
        controller.create(fakeUser, { ...validBody, title: 'a'.repeat(81) }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(presetService.create).not.toHaveBeenCalled();
    });

    it('title が number は 400', async () => {
      await expect(
        controller.create(fakeUser, { ...validBody, title: 42 } as unknown as Parameters<PresetController['create']>[1]),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ---- POST (create) — バリデーション異常系: question ----

  describe('POST /api/presets — question バリデーション', () => {
    it('question が空文字は 400', async () => {
      await expect(
        controller.create(fakeUser, { ...validBody, question: '' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(presetService.create).not.toHaveBeenCalled();
    });

    it('question がちょうど 200 文字は通す', async () => {
      await controller.create(fakeUser, { ...validBody, question: 'q'.repeat(200) });
      expect(presetService.create).toHaveBeenCalled();
    });

    it('question が 201 文字は 400', async () => {
      await expect(
        controller.create(fakeUser, { ...validBody, question: 'q'.repeat(201) }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(presetService.create).not.toHaveBeenCalled();
    });
  });

  // ---- POST (create) — バリデーション異常系: choices ----

  describe('POST /api/presets — choices バリデーション', () => {
    it('choices が 2 要素（少なすぎ）は 400', async () => {
      await expect(
        controller.create(fakeUser, { ...validBody, choices: ['A', 'B'] }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(presetService.create).not.toHaveBeenCalled();
    });

    it('choices が 7 要素（多すぎ）は 400', async () => {
      await expect(
        controller.create(fakeUser, { ...validBody, choices: ['A', 'B', 'C', 'D', 'E', 'F', 'G'] }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(presetService.create).not.toHaveBeenCalled();
    });

    it('choices が配列でない（string）は 400', async () => {
      await expect(
        controller.create(fakeUser, { ...validBody, choices: 'ABC' } as unknown as Parameters<PresetController['create']>[1]),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(presetService.create).not.toHaveBeenCalled();
    });

    it('choices の要素が string でない（number）は 400', async () => {
      await expect(
        controller.create(fakeUser, { ...validBody, choices: [1, 2, 3] } as unknown as Parameters<PresetController['create']>[1]),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(presetService.create).not.toHaveBeenCalled();
    });

    it('choices の要素が空文字は 400', async () => {
      await expect(
        controller.create(fakeUser, { ...validBody, choices: ['', 'B', 'C'] }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(presetService.create).not.toHaveBeenCalled();
    });

    it('choices の要素が 60 文字は通す', async () => {
      await controller.create(fakeUser, { ...validBody, choices: ['c'.repeat(60), 'B', 'C'] });
      expect(presetService.create).toHaveBeenCalled();
    });

    it('choices の要素が 61 文字は 400', async () => {
      await expect(
        controller.create(fakeUser, { ...validBody, choices: ['c'.repeat(61), 'B', 'C'] }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(presetService.create).not.toHaveBeenCalled();
    });
  });

  // ---- POST (create) — ボディ全体の異常系 ----

  describe('POST /api/presets — body 全体のバリデーション', () => {
    it('body が null は 400', async () => {
      await expect(
        controller.create(fakeUser, null as unknown as Parameters<PresetController['create']>[1]),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('body が array は 400', async () => {
      await expect(
        controller.create(fakeUser, [] as unknown as Parameters<PresetController['create']>[1]),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('body が string は 400', async () => {
      await expect(
        controller.create(fakeUser, 'oops' as unknown as Parameters<PresetController['create']>[1]),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ---- DELETE (remove) ----

  describe('DELETE /api/presets/:id', () => {
    it('service.delete を userId と id で呼ぶ', async () => {
      const result = await controller.remove(fakeUser, 'p1');
      expect(presetService.delete).toHaveBeenCalledWith('u1', 'p1');
      expect(result).toEqual({ ok: true });
    });

    it('service.delete が NotFoundException を投げたらそのまま伝播する', async () => {
      presetService.delete.mockRejectedValueOnce(new NotFoundException('Preset not found'));
      await expect(controller.remove(fakeUser, 'p_nonexistent')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
