import { Test, TestingModule } from '@nestjs/testing';
import { RoomService } from '../room.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { EngineService } from '../../engine/engine.service';

/**
 * RoomService.create の正常系を固定する。
 *
 * サンレンタン Party では Game/GameSpec モデルを持たないため、
 * spec は engine module 内の SANRENTAN_SPEC 定数を常に使用する。
 * create は (a) Room を作成し (b) ホストを seat 0 に着席させる、の 2 ステップ。
 */
describe('RoomService.create', () => {
  let service: RoomService;
  let prisma: {
    room: { create: jest.Mock };
    roomPlayer: { create: jest.Mock };
  };
  let engine: { initialState: jest.Mock; redactFor: jest.Mock; applyAction: jest.Mock };

  beforeEach(async () => {
    prisma = {
      room: { create: jest.fn() },
      roomPlayer: { create: jest.fn() },
    };
    engine = {
      initialState: jest.fn().mockReturnValue({}),
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

  it('room を作成しホストを seat 0 に着席させる (正規ケース)', async () => {
    const createdRoom = {
      id: 'r1',
      state: {},
      status: 'open',
      name: 'my room',
      isPublic: true,
    };
    prisma.room.create.mockResolvedValueOnce(createdRoom);
    prisma.roomPlayer.create.mockResolvedValueOnce({
      id: 'rp1',
      roomId: 'r1',
      userId: 'u_host',
      seat: 0,
    });

    const result = await service.create('u_host', { name: 'my room', isPublic: true });

    expect(result).toBe(createdRoom);
    expect(prisma.room.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'open',
        name: 'my room',
        isPublic: true,
      }),
    });
    expect(prisma.roomPlayer.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ roomId: 'r1', userId: 'u_host', seat: 0 }),
    });
  });
});
