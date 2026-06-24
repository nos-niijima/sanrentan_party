import { Test, TestingModule } from '@nestjs/testing';
import { UserService } from './user.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * 身元解決 (getOrCreateUserByIdentity) の 3 分岐 + 異常系を固定する。
 * これが唯一の認証境界なので退行は許さない。
 */
describe('UserService.getOrCreateUserByIdentity', () => {
  let service: UserService;
  let prisma: {
    user: {
      findUnique: jest.Mock;
      update: jest.Mock;
      create: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(UserService);
  });

  it('既存ユーザー（googleId 一致）を更新して返す', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({ id: 'u1', googleId: 'g1' }); // by googleId
    prisma.user.update.mockResolvedValueOnce({ id: 'u1', email: 'a@example.com' });

    const result = await service.getOrCreateUserByIdentity({
      email: 'A@Example.com',
      googleId: 'g1',
      name: 'A',
    });

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u1' } }),
    );
    expect(result).toEqual({ id: 'u1', email: 'a@example.com' });
  });

  it('email 一致のユーザーに googleId をバックフィルする', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce(null) // by googleId
      .mockResolvedValueOnce({ id: 'u2', email: 'b@example.com' }); // by email
    prisma.user.update.mockResolvedValueOnce({ id: 'u2', googleId: 'g2' });

    const result = await service.getOrCreateUserByIdentity({
      email: 'b@example.com',
      googleId: 'g2',
    });

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u2' }, data: expect.objectContaining({ googleId: 'g2' }) }),
    );
    expect(result.googleId).toBe('g2');
  });

  it('該当なしなら新規作成する', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValueOnce({ id: 'u3', email: 'c@example.com', name: 'c@example.com' });

    const result = await service.getOrCreateUserByIdentity({
      email: 'c@example.com',
      googleId: 'g3',
    });

    expect(prisma.user.create).toHaveBeenCalled();
    expect(result.id).toBe('u3');
  });

  it('googleId が無ければ例外', async () => {
    await expect(
      service.getOrCreateUserByIdentity({ email: 'd@example.com' }),
    ).rejects.toThrow('Google ID is required');
  });
});
